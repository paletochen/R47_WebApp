// File browser for iOS persistent storage.
// Allows visualizing, uploading, and downloading files in /persist/.

const FileBrowser = {
  currentTab: 'PROGRAMS',
  selectedFiles: new Set(),
  operationMode: null,

  init() {

    this.createUI();
    this.bindEvents();
  },

  createUI() {
    const container = document.createElement('div');
    container.id = 'file-browser';
    container.innerHTML = `

      <div id="fb-header">
        <span>Manage Calculator Storage</span>
        <button id="fb-close">&times;</button>
      </div>
      <div id="fb-tabs">
        <button class="fb-tab active" data-tab="PROGRAMS">PROGRAMS</button>
        <button class="fb-tab" data-tab="SAVFILES">SAVFILES</button>
        <button class="fb-tab" data-tab="STATE">STATE</button>
      </div>

      <div id="fb-content">
        <div id="fb-file-list"></div>
      </div>
      <div id="fb-actions">
        <button id="fb-upload">Upload</button>
        <button id="fb-download">Download</button>
        <button id="fb-delete">Delete</button>
        <button id="fb-apply" style="display:none;">Load into Calc</button>
        <input type="file" id="fb-file-input" hidden>
      </div>

    `;
    document.body.appendChild(container);
  },

  bindEvents() {
    document.getElementById('fb-close').addEventListener('click', () => this.hide());
    
    const tabs = document.querySelectorAll('.fb-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.refreshList();
      });
    });

    document.getElementById('fb-upload').addEventListener('click', () => {
      document.getElementById('fb-file-input').click();
    });

    document.getElementById('fb-file-input').addEventListener('change', (e) => {
      this.handleUpload(e.target.files);
    });

    document.getElementById('fb-download').addEventListener('click', () => this.handleDownload());
    document.getElementById('fb-delete').addEventListener('click', () => this.handleDelete());
    document.getElementById('fb-apply').addEventListener('click', () => this.handleApply());
  },

  handleApply() {
    if (this.selectedFiles.size !== 1) {
        alert("Please select exactly one file.");
        return;
    }
    const selectedFile = Array.from(this.selectedFiles)[0];
    const filename = selectedFile;
    
    console.log("Applying file to engine:", filename, "for mode:", this.operationMode);
    
    if (this.operationMode === 'load-program') {
        Module.ccall('r47_load_program_named', null, ['string'], [filename], { async: true });
    } else if (this.operationMode === 'load-state') {
        Module.ccall('r47_load_state_named', null, ['string'], [filename], { async: true });
    } else if (this.operationMode === 'load-savfile') {
        Module.ccall('r47_load_savfile_named', null, ['string'], [filename], { async: true });
    }
    
    this.hide();
    this.operationMode = null; // Reset
  },


  show() {
    document.getElementById('file-browser').classList.add('show');
    
    const applyBtn = document.getElementById('fb-apply');
    if (this.operationMode) {
        applyBtn.style.display = 'inline-block';
        // Disable tabs to prevent switching when engine requested a specific type
        document.querySelectorAll('.fb-tab').forEach(t => t.style.pointerEvents = 'none');
        // Highlight requested tab
        document.querySelectorAll('.fb-tab').forEach(t => {
            t.classList.remove('active');
            if (t.dataset.tab === this.currentTab) t.classList.add('active');
        });
    } else {
        applyBtn.style.display = 'none';
        document.querySelectorAll('.fb-tab').forEach(t => t.style.pointerEvents = 'auto');
    }
    
    this.refreshList();
  },

  hide() {
    document.getElementById('file-browser').classList.remove('show');
  },


  refreshList() {
    const listEl = document.getElementById('fb-file-list');
    listEl.innerHTML = '';
    this.selectedFiles.clear();

    const path = `/persist/${this.currentTab}`;
    try {
      const files = Module.FS.readdir(path);
      files.forEach(file => {
        if (file === '.' || file === '..') return;
        
        const item = document.createElement('div');
        item.className = 'fb-file-item';
        item.textContent = file;
        item.addEventListener('click', () => this.toggleSelect(file, item));
        listEl.appendChild(item);
      });
    } catch (e) {
      listEl.textContent = 'Failed to read directory.';
    }
  },

  toggleSelect(file, element) {
    if (this.selectedFiles.has(file)) {
      this.selectedFiles.delete(file);
      element.classList.remove('selected');
    } else {
      this.selectedFiles.add(file);
      element.classList.add('selected');
    }
  },

  async handleUpload(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const path = `/persist/${this.currentTab}/${file.name}`;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      try {
        Module.FS.writeFile(path, data);
        Module.FS.syncfs(false, (err) => {
          if (err) console.error('Upload sync error:', err);
          this.refreshList();
        });
      } catch (err) {
        console.error('Upload failed:', err);
        alert('Upload failed');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  handleDownload() {
    if (this.selectedFiles.size === 0) {
      alert('Select a file to download.');
      return;
    }
    const file = Array.from(this.selectedFiles)[0]; // Support single for now
    const path = `/persist/${this.currentTab}/${file}`;

    try {
      const data = Module.FS.readFile(path);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download failed');
    }
  },

  handleDelete() {
    if (this.selectedFiles.size === 0) {
      alert('Select a file to delete.');
      return;
    }
    const file = Array.from(this.selectedFiles)[0]; // Support single for now
    const path = `/persist/${this.currentTab}/${file}`;

    if (confirm(`Are you sure you want to delete ${file}?`)) {
      try {
        Module.FS.unlink(path);
        Module.FS.syncfs(false, (err) => {
          if (err) console.error('Delete sync error:', err);
          this.refreshList();
        });
      } catch (err) {
        console.error('Delete failed:', err);
        alert('Delete failed');
      }
    }
  }
};

window.FileBrowser = FileBrowser;
FileBrowser.init();

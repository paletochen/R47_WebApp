console.log("R47 Calculator Web App initialized - v2");

function dbg(s) {
    console.log("[R47 app] " + s);
}


const canvas = document.getElementById('lcd');
const ctx = canvas.getContext('2d');

// Tone queue for sequential playback
window.toneQueue = [];
window.toneQueueProcessing = false;

window.processToneQueue = async () => {
    if (window.toneQueueProcessing) return;
    window.toneQueueProcessing = true;
    try {
        while (window.toneQueue.length > 0) {
            const item = window.toneQueue.shift();
            await playTone(item.freq, item.ms);
            await new Promise(resolve => setTimeout(resolve, 50)); // Gap between tones
        }
    } catch (e) {
        console.error("Error processing tone queue:", e);
    } finally {
        window.toneQueueProcessing = false;
    }
};

async function playTone(frequency, ms_delay) {
    try {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (window.audioCtx.state === 'suspended') {
            await window.audioCtx.resume();
        }
        const oscillator = window.audioCtx.createOscillator();
        const gainNode = window.audioCtx.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(frequency / 1000, window.audioCtx.currentTime);
        const volume = (window.beeperVolume || 50) / 100;

        gainNode.gain.setValueAtTime(volume, window.audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(window.audioCtx.destination);
        oscillator.start();
        await new Promise(resolve => setTimeout(resolve, ms_delay));
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
    } catch (e) {
        console.error("Error playing tone:", e);
    }
}



function initCalculator() {
    const width = 400;
    const height = 240;
    
    // Initialize buffers and core
    Module._init_lcd_buffers();
    
    Module._web_init();

}




// Helper to send key to calculator
function sendKey(keyId, isFn, isRelease) {
    Module.ccall('sendSimKeyNative', null, ['string', 'boolean', 'boolean'], [keyId, isFn, isRelease], { async: true });
}

async function handleSnap() {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'SNAP.bmp',
            types: [{
                description: 'BMP Image',
                accept: {'image/bmp': ['.bmp']},
            }],
        });
        
        const writable = await handle.createWritable();
        
        // Trigger screen dump in core to populate buffer
        // Module._triggerScreenDump(); // This function is not defined in hal_web.c or exported.
        console.warn("SNAP triggered from handleSnap, but _triggerScreenDump is not defined.");
        
        // Get buffer pointer and size from WASM
        const ptr = Module._getSnapBufferPtr();
        const size = Module._getSnapBufferSize();
        
        if (ptr === 0 || size === 0) {
            console.error('Failed to get SNAP data from WASM');
            return;
        }
        
        const data = new Uint8Array(Module.HEAPU8.buffer, ptr, size);
        await writable.write(data);
        await writable.close();
        console.log('SNAP file saved successfully via JS');
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Failed to handle SNAP:', e);
        }
    }
}




// Callback from C when a file is closed after writing
window.onFileSaved = async (path) => {
    console.log("window.onFileSaved called for path:", path);
    try {
        const data = Module.FS.readFile(path);
        const filename = path.split('/').pop();
        
        const workDir = window.workDirHandle;
        if (workDir) {
            try {
                let dirHandle = workDir;
                if (path.includes('/SAVFILES/')) {
                    dirHandle = await workDir.getDirectoryHandle('SAVFILES', { create: true });
                } else if (path.includes('/STATE/')) {
                    dirHandle = await workDir.getDirectoryHandle('STATE', { create: true });
                } else if (path.includes('/PROGRAMS/')) {
                    dirHandle = await workDir.getDirectoryHandle('PROGRAMS', { create: true });
                } else if (path.includes('/SCREENS/')) {
                    dirHandle = await workDir.getDirectoryHandle('SCREENS', { create: true });
                }
                
                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(data);
                await writable.close();
                console.log(`File ${filename} saved to workspace directory.`);
                return;
            } catch (e) {
                console.warn("Failed to save to workspace directory, falling back to download:", e);
            }
        }
        
        if (!('showSaveFilePicker' in window) && !filename.endsWith('.cfg')) {
            const blob = new Blob([data], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`File ${path} downloaded automatically.`);
        }

    } catch (e) {
        console.error(`Failed to handle file save for ${path}:`, e);
    }
};


// Add event listeners for physical buttons
function initKeyboard() {
    console.log("Initializing keyboard listeners");
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        if (!btn.getAttribute('data-orig-label')) {
            btn.setAttribute('data-orig-label', btn.innerText);
        }
        
        const container = btn.parentElement;
        const goldSpan = container.querySelector('.gold');
        const blueSpan = container.querySelector('.blue');
        
        if (goldSpan && !goldSpan.getAttribute('data-orig-label')) {
            goldSpan.setAttribute('data-orig-label', goldSpan.innerText);
        }
        if (blueSpan && !blueSpan.getAttribute('data-orig-label')) {
            blueSpan.setAttribute('data-orig-label', blueSpan.innerText);
        }
    });
    buttons.forEach(btn => {
        const keyId = btn.getAttribute('data-key');
        const isFn = btn.classList.contains('soft-btn');
        
        // Handle mouse down / touch start
        const onPress = async (e) => {
            if (!window.audioCtx) {
                window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (window.audioCtx.state === 'suspended') {
                await window.audioCtx.resume();
            }
            e.preventDefault();
            performHapticClick();


            console.log("Pressing key:", keyId, "isFn:", isFn);
            

            btn.isPressed = true;
            try {
                sendKey(keyId, isFn, false); // false = pressed
            } catch (err) {
                console.warn("sendKey (press) failed with error:", err);
            }
            btn.classList.add('pressed');
        };
        
        // Handle mouse up / touch end
        const onRelease = (e) => {
            e.preventDefault();
            if (!btn.isPressed) return;
            
            console.log("Releasing key:", keyId, "isFn:", isFn);
            btn.isPressed = false;
            try {
                sendKey(keyId, isFn, true); // true = released
            } catch (err) {
                console.warn("sendKey (release) failed with error:", err);
            }
            btn.classList.remove('pressed');
        };
        
        btn.addEventListener('mousedown', onPress);
        btn.addEventListener('mouseup', onRelease);
        btn.addEventListener('mouseleave', onRelease); // Ensure release if cursor leaves button
        
        // Touch support
        btn.addEventListener('touchstart', onPress);
        btn.addEventListener('touchend', onRelease);
        btn.addEventListener('touchcancel', onRelease);
    });
}

// Key mapping from computer keyboard to calculator keys
const keyMap = {
    '0': '33', '1': '28', '2': '29', '3': '30', '4': '23',
    '5': '24', '6': '25', '7': '18', '8': '19', '9': '20',
    '+': '36', '-': '31', '*': '26', '/': '21',
    'Enter': '12',
    'Backspace': '16',
    '.': '34',
    'e': '15', 'E': '15', // EEX
    'ArrowUp': '22',
    'ArrowDown': '27',
    'Escape': '32', // EXIT
    'f': '10',
    'g': '11',
    'r': '35', 'R': '35' // R/S
};

// Keyboard listener
window.addEventListener('keydown', (e) => {
    const calcKey = keyMap[e.key];
    if (calcKey) {
        e.preventDefault();
        console.log("Keyboard down:", e.key, "->", calcKey);
        // Determine if it's a soft function key (unlikely for mapped keys, but good for completeness)
        const isFn = calcKey.length === 1;
        sendKey(calcKey, isFn, false); // false = pressed
        
        // Visual feedback for mapped keys if they exist in DOM
        const btn = document.querySelector(`.btn[data-key="${calcKey}"]`);
        if (btn) btn.classList.add('pressed');
    }
});

window.addEventListener('keyup', (e) => {
    const calcKey = keyMap[e.key];
    if (calcKey) {
        e.preventDefault();
        console.log("Keyboard up:", e.key, "->", calcKey);
        const isFn = calcKey.length === 1;
        sendKey(calcKey, isFn, true); // true = released
        
        const btn = document.querySelector(`.btn[data-key="${calcKey}"]`);
        if (btn) btn.classList.remove('pressed');
    }
});

// File I/O helpers outside C core
window.uploadFileToFS = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.p47,.s47';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        // Determine target path based on extension
        let path = "/persistent/c47_other";
        if (file.name.endsWith('.p47')) path = "/persistent/c47_program.p47";
        if (file.name.endsWith('.s47')) path = "/persistent/c47_state.s47";
        
        Module.FS.writeFile(path, data);
        console.log(`File ${file.name} uploaded to ${path}`);
        alert(`File ${file.name} uploaded successfully. You can now use READP or LOADST in the calculator.`);
    };
    input.click();
};

window.downloadFileFromFS = (path, suggestedName) => {
    try {
        const data = Module.FS.readFile(path);
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
        console.log(`File ${path} downloaded as ${suggestedName}`);
    } catch (e) {
        console.error(`Failed to download file from ${path}:`, e);
        alert(`Failed to download file: ${path}`);
    }
};

// Settings Modal Handling
function initSettings() {
    const modal = document.getElementById('settings-modal');
    const display = document.getElementById('lcd');
    const closeBtn = document.getElementById('settings-close');


    // Open modal when display is clicked
    display.addEventListener('click', (e) => {
        const rect = display.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Scale coordinates to canvas size (400x240)
        const scaleX = 400 / rect.width;
        const scaleY = 240 / rect.height;
        const canvasX = x * scaleX;
        const canvasY = y * scaleY;
        
        console.log(`Clicked at canvas coords: ${canvasX}, ${canvasY}`);
        
        if (canvasY < 30) {
            // Top area (first 30px): Settings menu!
            modal.style.display = 'flex';
            loadSettings();
        } else {

            // Rest of the screen: Clipboard menu!
            const clipModal = document.getElementById('clipboard-modal');
            clipModal.style.display = 'block';
        }
    });

    // Close clipboard modal
    const closeClipBtn = document.getElementById('close-clipboard');
    const clipModal = document.getElementById('clipboard-modal');
    if (closeClipBtn && clipModal) {
        closeClipBtn.addEventListener('click', () => {
            clipModal.style.display = 'none';
        });
    }


    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('files-backdrop')) {
            modal.style.display = 'none';
            saveSettings();
        }
        if (clipModal && (e.target === clipModal || e.target.classList.contains('theme-backdrop'))) {
            clipModal.style.display = 'none';
        }
    });

    // Bottom close button
    const bottomCloseBtn = document.getElementById('settings-bottom-close');
    if (bottomCloseBtn) {
        bottomCloseBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            saveSettings();
        });
    }


    // File I/O actions
    const uploadBtn = document.getElementById('upload-file-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            window.uploadFileToFS();
        });
    }
    
    const downloadBtn = document.getElementById('download-file-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            window.downloadFileFromFS("/persistent/c47_program.p47", "program.p47");
        });
    }

    if (clipModal) {
        document.getElementById('copy-x-btn').addEventListener('click', async () => {
            clipModal.style.display = 'none';
            try {
                const xVal = Module.ccall('getXRegisterString', 'string', []);
                await navigator.clipboard.writeText(xVal);
                alert(`Copied X: ${xVal}`);
            } catch (err) {
                console.error('Failed to copy X register:', err);
            }
        });

        document.getElementById('paste-number-btn').addEventListener('click', async () => {
            clipModal.style.display = 'none';
            try {
                const text = await navigator.clipboard.readText();
                for (const char of text) {
                    const keyId = getKeyIdFromChar(char);
                    if (keyId) {
                        sendKey(keyId, false, false); // Pressed
                        await new Promise(resolve => setTimeout(resolve, 50));
                        sendKey(keyId, false, true); // Released
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
            } catch (err) {
                console.error('Failed to read clipboard:', err);
            }
        });
    }


    function getKeyIdFromChar(char) {
        switch (char.toLowerCase()) {
            case '0': return '33';
            case '1': return '28';
            case '2': return '29';
            case '3': return '30';
            case '4': return '23';
            case '5': return '24';
            case '6': return '25';
            case '7': return '18';
            case '8': return '19';
            case '9': return '20';
            case '.':
            case ',': return '34';
            case '-': return '35'; // CHS
            case 'e': return '15'; // EEX
            case '+': return '37'; // ENTER
            default: return null;
        }
    }

    const workDirBtn = document.getElementById('work-directory-btn');
    const workDirStatus = document.getElementById('work-directory-status');
    const factoryResetBtn = document.getElementById('factory-reset-btn');

    workDirBtn.addEventListener('click', async () => {
        try {
            dbg('workDirBtn clicked');
            let handle;
            if ('showDirectoryPicker' in window) {
                handle = await window.showDirectoryPicker();
                workDirStatus.innerText = handle.name;
                localStorage.setItem('work-directory-selected', 'true');
                await handleDirectorySelection(handle);
            } else {
                alert("Directory picking is not supported on this browser/iOS. Caching state will still work locally.");
            }
        } catch (err) {
            dbg('Directory picker failed: ' + err.message);
        }
    });

    async function handleDirectorySelection(handle) {
        dbg('Directory selected: ' + handle.name);
        window.workDirHandle = handle;
        await createSubfoldersInDirectory(handle);
        
        dbg('Auto-load scan started');
        try {
            const savFilesDir = await handle.getDirectoryHandle('SAVFILES', { create: false });
            const fileHandle = await savFilesDir.getFileHandle('R47.sav', { create: false });
            const file = await fileHandle.getFile();
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            
            const path = '/persist/SAVFILES/R47.sav';
            Module.FS.writeFile(path, data);
            dbg('Auto-loaded R47.sav from physical folder.');
        } catch (e) {

            dbg('No R47.sav found in physical folder or failed to read: ' + e.message);
        }
    }

    factoryResetBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to reset to factory defaults? All data will be lost!")) {
            localStorage.clear();
            
            // Unregister Service Workers and clear caches
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) {
                        registration.unregister();
                    }
                });
            }
            
            if ('caches' in window) {
                caches.keys().then(function(names) {
                    for (let name of names) caches.delete(name);
                });
            }

            // Delete IndexedDB databases to clear IDBFS data
            window.indexedDB.deleteDatabase("/persist");
            const DBDeleteRequest = window.indexedDB.deleteDatabase("r47-db");


            
            DBDeleteRequest.onerror = function(event) {
                console.error("Error deleting database r47-db:", event);
                location.reload();
            };
            
            DBDeleteRequest.onsuccess = function(event) {
                console.log("Database r47-db deleted successfully");
                location.reload();
            };
        }
    });


    async function createSubfoldersInDirectory(handle) {
        try {
            dbg('Subfolders creation started');
            await handle.getDirectoryHandle('STATE', { create: true });
            await handle.getDirectoryHandle('PROGRAMS', { create: true });
            await handle.getDirectoryHandle('SAVFILES', { create: true });
            await handle.getDirectoryHandle('SCREENS', { create: true });
            dbg("Subfolders created in Work Directory");
        } catch (e) {
            dbg("Failed to create subfolders in Work Directory: " + e.message);
        }
    }

    function checkWorkDirectory() {
        if (!('showDirectoryPicker' in window)) {
            return; // Don't show snackbar on unsupported browsers like iOS
        }
        const selected = localStorage.getItem('work-directory-selected') === 'true';
        if (!selected) {
            const snackbar = document.getElementById('snackbar');
            snackbar.classList.add('show');
            
            const actionBtn = document.getElementById('snackbar-action-btn');
            actionBtn.onclick = async () => {

                dbg('Snackbar action clicked');
                snackbar.classList.remove('show');
                try {
                    const handle = await window.showDirectoryPicker();
                    workDirStatus.innerText = handle.name;
                    localStorage.setItem('work-directory-selected', 'true');
                    await handleDirectorySelection(handle);
                } catch (err) {
                    dbg("Directory picker failed: " + err.message);
                }
            };
        }
    }

    // Close modal when close button is clicked
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        saveSettings();
    });

    // Close modal when clicking outside of it
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            saveSettings();
        }
    });

    function loadSettings() {
        document.getElementById('haptic-enabled').checked = localStorage.getItem('haptic-enabled') !== 'false';
        document.getElementById('haptic-hifi').checked = localStorage.getItem('haptic-hifi') !== 'false';
        document.getElementById('haptic-intensity').value = localStorage.getItem('haptic-intensity') || '180';
        document.getElementById('keep-screen-on').checked = localStorage.getItem('keep-screen-on') === 'true';
        document.getElementById('force-close-exit').checked = localStorage.getItem('force-close-exit') === 'true';
        document.getElementById('beeper-enabled').checked = localStorage.getItem('beeper-enabled') !== 'false';
        document.getElementById('beeper-volume').value = localStorage.getItem('beeper-volume') || '20';
    }

    async function saveSettings() {
        localStorage.setItem('haptic-enabled', document.getElementById('haptic-enabled').checked);
        localStorage.setItem('haptic-hifi', document.getElementById('haptic-hifi').checked);
        localStorage.setItem('haptic-intensity', document.getElementById('haptic-intensity').value);
        localStorage.setItem('keep-screen-on', document.getElementById('keep-screen-on').checked);
        localStorage.setItem('force-close-exit', document.getElementById('force-close-exit').checked);
        localStorage.setItem('beeper-enabled', document.getElementById('beeper-enabled').checked);
        localStorage.setItem('beeper-volume', document.getElementById('beeper-volume').value);
        
        // Apply settings immediately
        await applySettings();
    }

    async function applySettings() {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (window.audioCtx.state === 'suspended') {
            window.audioCtx.resume();
        }

        if (window.Module) {

            window.Module.beeperVolume = document.getElementById('beeper-volume').value;
            window.Module.isBeeperEnabled = document.getElementById('beeper-enabled').checked;
            window.Module.hapticEnabled = document.getElementById('haptic-enabled').checked;
            window.Module.hapticHifi = document.getElementById('haptic-hifi').checked;
            window.Module.hapticIntensity = document.getElementById('haptic-intensity').value;
        }





        
        const keepScreenOn = document.getElementById('keep-screen-on').checked;
        if (keepScreenOn) {
            try {
                if (!window.wakeLock) {
                    window.wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Wake Lock acquired');
                }
            } catch (err) {
                console.error(`Wake Lock failed: ${err.name}, ${err.message}`);
            }
        } else {
            if (window.wakeLock) {
                await window.wakeLock.release();
                window.wakeLock = null;
                console.log('Wake Lock released');
            }
        }
        
        // Re-acquire wake lock when page becomes visible again
        document.addEventListener('visibilitychange', async () => {
            if (window.wakeLock === null && document.visibilityState === 'visible') {
                const keepScreenOn = document.getElementById('keep-screen-on').checked;
                if (keepScreenOn) {
                    try {
                        window.wakeLock = await navigator.wakeLock.request('screen');
                        console.log('Wake Lock re-acquired');
                    } catch (err) {
                        console.warn(`Wake Lock re-acquisition failed: ${err.name}, ${err.message}`);
                    }
                }
            }
        });
    }

    
    // Initial apply
    loadSettings();
    applySettings();
    checkWorkDirectory();

    // Real-time updates for audio settings
    document.getElementById('beeper-enabled').addEventListener('change', saveSettings);
    document.getElementById('beeper-volume').addEventListener('input', saveSettings);
    document.getElementById('beeper-volume').addEventListener('change', saveSettings);
    document.getElementById('haptic-enabled').addEventListener('change', saveSettings);
    document.getElementById('haptic-hifi').addEventListener('change', saveSettings);
    document.getElementById('haptic-intensity').addEventListener('input', saveSettings);
    document.getElementById('haptic-intensity').addEventListener('change', saveSettings);


}


// Initialize if WASM is already loaded, otherwise wait for hook
if (window.wasmInitialized) {
    initCalculator();
    initKeyboard();
    initSettings();
} else {
    window.onWasmLoaded = () => {
        initCalculator();
        initKeyboard();
        initSettings();
    };
}

function performHapticClick() {
    const enabled = localStorage.getItem('haptic-enabled') !== 'false';
    if (!enabled || !navigator.vibrate) return;
    
    const intensity = parseInt(localStorage.getItem('haptic-intensity') || '180', 10);
    if (intensity <= 0) return;
    
    const hifi = localStorage.getItem('haptic-hifi') !== 'false';
    
    // Web API does not support intensity, so we scale duration!
    // Max intensity 255 -> ~30ms, default 180 -> ~20ms
    const duration = Math.max(1, Math.round(intensity / 255 * 30));
    
    if (hifi) {
        // Simulate waveform with a pattern!
        navigator.vibrate([0, duration, 10, Math.round(duration / 2)]);
    } else {
        navigator.vibrate(duration);
    }
}

window.r47RequestFile = async (kind) => {
    console.log("window.r47RequestFile called with kind:", kind);
    
    // If native file picker is supported, use it instead of the internal browser
    if ('showSaveFilePicker' in window) {
        console.log("Native file picker supported, using it for kind:", kind);
        
        if (kind === 'load-state' || kind === 'load-program') {
            try {
                const [handle] = await window.showOpenFilePicker({
                    id: kind, // Remember directory for this kind
                    types: [{
                        description: 'R47 Files',
                        accept: { 'application/octet-stream': ['.s47', '.p47'] }
                    }],
                    multiple: false
                });

                const file = await handle.getFile();
                const buffer = await file.arrayBuffer();
                const data = new Uint8Array(buffer);
                const path = `/persist/uploads/${file.name}`;
                
                try {
                    Module.FS.mkdir('/persist/uploads');
                } catch (e) { /* ignore if exists */ }
                
                Module.FS.writeFile(path, data);
                Module.ccall('r47_stage_upload', null, ['string'], [path]);
                
                if (kind === 'load-state') {
                    Module.ccall('r47_load_state_named', null, ['string'], [file.name], { async: true });
                } else {
                    Module.ccall('r47_load_program_named', null, ['string'], [file.name], { async: true });
                }
                return true;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Failed to pick file:', err);
                }
                return false;
            }
        }
        
        if (kind === 'save-state' || kind === 'save-program' || kind === 'export-rtf') {
            try {
                let defaultName = kind === 'save-state' ? 'R47.sav' : 'program.p47';
                if (kind === 'export-rtf') defaultName = 'program.rtf';
                
                if (kind === 'save-program' || kind === 'export-rtf') {
                    const currentPgmNum = Module.ccall('r47_current_program_number', 'number', [], []);
                    const name = Module.ccall('r47_program_label_at', 'string', ['number'], [currentPgmNum]);
                    if (name && name !== 'untitled') {
                        defaultName = `${name}.${kind === 'export-rtf' ? 'rtf' : 'p47'}`;
                    }
                }
                
                const handle = await window.showSaveFilePicker({
                    id: kind, // Remember directory for this kind
                    suggestedName: defaultName,
                    types: [{
                        description: kind === 'export-rtf' ? 'RTF Document' : 'R47 Files',
                        accept: kind === 'export-rtf' ? { 'application/rtf': ['.rtf'] } : { 'application/octet-stream': ['.s47', '.p47'] }
                    }],
                });
                
                const name = handle.name;
                Module.ccall('r47_set_save_name', null, ['string'], [name]);
                
                if (kind === 'save-state') {
                    await Module.ccall('r47_save_state', null, [], [], { async: true });
                } else if (kind === 'save-program') {
                    await Module.ccall('r47_save_program', null, [], [], { async: true });
                } else if (kind === 'export-rtf') {
                    await Module.ccall('r47_export_rtf_program_named', null, ['string'], [name], { async: true });
                }
                
                const tab = kind === 'save-state' ? 'STATE' : 'PROGRAMS';
                const path = `/persist/${tab}/${name}`;
                const data = Module.FS.readFile(path);
                
                const writable = await handle.createWritable();
                await writable.write(data);
                await writable.close();
                console.log('File saved successfully via JS');
                return true;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Failed to save file:', err);
                }
                return false;
            }
        }



        
        if (kind === 'snap-file') {
            try {
                const now = new Date();
                const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
                const filename = `SNAP_${timestamp}.bmp`;
                
                // Trigger screen dump in core to populate buffer
                Module.ccall('r47_snap_named', null, ['string'], [filename], { async: true });
                
                // Get buffer pointer and size from WASM
                const ptr = Module._getSnapBufferPtr();
                const size = Module._getSnapBufferSize();
                
                if (ptr === 0 || size === 0) {
                    console.error('Failed to get SNAP data from WASM');
                    return false;
                }
                
                const data = new Uint8Array(Module.HEAPU8.buffer, ptr, size);
                
                const handle = await window.showSaveFilePicker({
                    id: 'snap-file', // Remember directory for SNAP
                    suggestedName: filename,
                    types: [{
                        description: 'BMP Image',
                        accept: {'image/bmp': ['.bmp']},
                    }],
                });

                
                const writable = await handle.createWritable();
                await writable.write(data);
                await writable.close();
                console.log('SNAP file saved successfully via JS');
                return true;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Failed to save SNAP file:', err);
                }
                return false;
            }
        }
        
        return false;
    }

    
    if (kind === 'save-state' || kind === 'save-program' || kind === 'export-rtf') {
        let defaultName = kind === 'save-state' ? 'R47.sav' : 'program.p47';
        if (kind === 'export-rtf') defaultName = 'program.rtf';
        
        if (kind === 'save-program' || kind === 'export-rtf') {
            const currentPgmNum = Module.ccall('r47_current_program_number', 'number', [], []);
            const name = Module.ccall('r47_program_label_at', 'string', ['number'], [currentPgmNum]);
            if (name && name !== 'untitled') {
                defaultName = `${name}.${kind === 'export-rtf' ? 'rtf' : 'p47'}`;
            }
        }

        const name = prompt("Enter filename to save:", defaultName);
        if (name) {
            Module.ccall('r47_set_save_name', null, ['string'], [name]);
            if (kind === 'save-state') {
                Module.ccall('r47_save_state_named', null, ['string'], [name], { async: true });
            } else if (kind === 'save-program') {
                Module.ccall('r47_save_program_named', null, ['string'], [name], { async: true });
            } else if (kind === 'export-rtf') {
                Module.ccall('r47_export_rtf_program_named', null, ['string'], [name], { async: true });
            }

            return true;
        }
        return false;
    }

    
    if (kind === 'snap-file') {
        try {
            const now = new Date();
            const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
            const filename = `SNAP_${timestamp}.bmp`;
            
            // Trigger screen dump in core to populate buffer
            Module.ccall('r47_snap_named', null, ['string'], [filename], { async: true });
            
            // Get buffer pointer and size from WASM
            const ptr = Module._getSnapBufferPtr();
            const size = Module._getSnapBufferSize();
            
            if (ptr === 0 || size === 0) {
                console.error('Failed to get SNAP data from WASM');
                alert("Failed to get snapshot data.");
                return false;
            }
            
            const data = new Uint8Array(Module.HEAPU8.buffer, ptr, size);
            const blob = new Blob([data], { type: 'image/bmp' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            console.log('SNAP file downloaded successfully');
            return true;
        } catch (err) {
            console.error('Failed to handle SNAP file:', err);
            alert("Failed to save snapshot.");
            return false;
        }
    }
    
    let tab = 'PROGRAMS';
    if (kind === 'load-state') tab = 'STATE';
    if (kind === 'load-savfile') tab = 'SAVFILES';
    
    if (window.FileBrowser) {
        window.FileBrowser.currentTab = tab;
        window.FileBrowser.operationMode = kind;
        window.FileBrowser.show();
    } else {
        console.error("FileBrowser is not initialized!");
    }
};








function handleLongPress(keyId) {
    if (keyId === '10') { // f key
        console.log("Long press on f: Opening HOME menu");
        Module.ccall('openHomeMenu', null, []);
    } else if (keyId === '11') { // g key
        console.log("Long press on g: Opening MyMenu");
        Module.ccall('openMyMenu', null, []);
    }
}

dbg('app.js executed');

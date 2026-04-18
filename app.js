console.log("R47 Calculator Web App initialized - v2");

const canvas = document.getElementById('lcd');
const ctx = canvas.getContext('2d');

function initCalculator() {
    const width = 400;
    const height = 240;
    
    // Initialize buffers and core
    Module._init_lcd_buffers();
    
    Module._web_init();
    startRenderLoop(width, height);
}

function startRenderLoop(width, height) {
    const ptr = Module._getScreenDataPtr();
    console.log("Screen data pointer:", ptr);
    
    if (!ptr) {
        console.error("Failed to get screen data pointer");
        return;
    }
    
    // Render loop
    function render() {
        Module._tick();
        
        if (Module._isScreenDirty()) {
            const ptr = Module._getScreenDataPtr();
            const screenBuffer = new Uint8ClampedArray(Module.HEAPU8.buffer, ptr, width * height * 4);
            const imageData = new ImageData(screenBuffer, width, height);
            ctx.putImageData(imageData, 0, 0);
        }
        updateAlphaLabels();
        requestAnimationFrame(render);
    }
    
    requestAnimationFrame(render);
    console.log("Render loop started");
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

window.r47RequestFile = async (kind) => {
    console.log("window.r47RequestFile called with kind:", kind);
    if (kind === 'snap-file') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid black;z-index:1000;';
            modal.innerHTML = `
                <p>Save SNAP screenshot?</p>
                <button id="modal-save">Save</button>
                <button id="modal-cancel">Cancel</button>
            `;
            document.body.appendChild(modal);
            
            document.getElementById('modal-save').onclick = async () => {
                document.body.removeChild(modal);
                try {
                    const workDir = window.workDirHandle;
                    let startInDir = undefined;
                    if (workDir) {
                        try {
                            startInDir = await workDir.getDirectoryHandle('SCREENS');
                        } catch (e) {
                            console.warn("Failed to get directory handle for SCREENS:", e.message);
                        }
                    }
                    
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'SNAP.bmp',
                        types: [{
                            description: 'BMP Image',
                            accept: {'image/bmp': ['.bmp']},
                        }],
                        startIn: startInDir
                    });
                    
                    const writable = await handle.createWritable();
                    
                    // Call the named export to set the name and trigger dump
                    Module.ccall('r47_snap_named', null, ['string'], ['SNAP.bmp'], { async: true });
                    
                    // Get buffer pointer and size from WASM
                    const ptr = Module._getSnapBufferPtr();
                    const size = Module._getSnapBufferSize();
                    
                    if (ptr === 0 || size === 0) {
                        console.error('Failed to get SNAP data from WASM');
                        resolve(false);
                        return;
                    }
                    
                    const data = new Uint8Array(Module.HEAPU8.buffer, ptr, size);
                    await writable.write(data);
                    await writable.close();
                    console.log('SNAP file saved successfully via JS');
                    
                    resolve(true);
                } catch (e) {
                    console.error('Failed to pick file in modal:', e);
                    resolve(false);
                }
            };
            
            document.getElementById('modal-cancel').onclick = () => {
                document.body.removeChild(modal);
                resolve(false);
            };
        });
    }
    return false;
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
        const onPress = (e) => {
            e.preventDefault();
            performHapticClick();
            if (!window.audioCtx) {
                window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (window.audioCtx.state === 'suspended') {
                window.audioCtx.resume();
            }
            console.log("Pressing key:", keyId, "isFn:", isFn);
            

            btn.isPressed = true;
            sendKey(keyId, isFn, false); // false = pressed
            btn.classList.add('pressed');
        };
        
        // Handle mouse up / touch end
        const onRelease = (e) => {
            e.preventDefault();
            if (!btn.isPressed) return;
            console.log("Releasing key:", keyId, "isFn:", isFn);
            btn.isPressed = false;
            sendKey(keyId, isFn, true); // true = released
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
    const closeBtn = document.querySelector('.close-btn');

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
            modal.style.display = 'block';
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
    closeClipBtn.addEventListener('click', () => {
        clipModal.style.display = 'none';
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            saveSettings();
        }
        if (e.target === clipModal) {
            clipModal.style.display = 'none';
        }
    });

    // Clipboard actions
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
            const handle = await window.showDirectoryPicker();
            workDirStatus.innerText = handle.name;
            localStorage.setItem('work-directory-selected', 'true');
            window.workDirHandle = handle;
            await createSubfoldersInDirectory(handle);
        } catch (err) {
            console.error("Directory picker failed:", err);
        }
    });

    factoryResetBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to reset to factory defaults? All data will be lost!")) {
            localStorage.clear();
            Module.FS.unmount('/persistent');
            location.reload();
        }
    });

    async function createSubfoldersInDirectory(handle) {
        try {
            await handle.getDirectoryHandle('STATE', { create: true });
            await handle.getDirectoryHandle('PROGRAMS', { create: true });
            await handle.getDirectoryHandle('SAVFILES', { create: true });
            await handle.getDirectoryHandle('SCREENS', { create: true });
            console.log("Subfolders created in Work Directory");
        } catch (e) {
            console.error("Failed to create subfolders in Work Directory:", e.message);
        }
    }

    function checkWorkDirectory() {
        const selected = localStorage.getItem('work-directory-selected') === 'true';
        if (!selected) {
            const snackbar = document.getElementById('snackbar');
            snackbar.classList.add('show');
            
            const actionBtn = document.getElementById('snackbar-action-btn');
            actionBtn.onclick = async () => {
                snackbar.classList.remove('show');
                try {
                    const handle = await window.showDirectoryPicker();
                    workDirStatus.innerText = handle.name;
                    localStorage.setItem('work-directory-selected', 'true');
                    window.workDirHandle = handle;
                    await createSubfoldersInDirectory(handle);
                } catch (err) {
                    console.error("Directory picker failed:", err);
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
        window.beeperVolume = document.getElementById('beeper-volume').value;
        window.isBeeperEnabled = document.getElementById('beeper-enabled').checked;
        
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
    }
    
    // Initial apply
    loadSettings();
    applySettings();
    checkWorkDirectory();
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

function updateAlphaLabels() {
    const isAlpha = Module.ccall('isAlphaMode', 'boolean', []);
    const buttons = document.querySelectorAll('.btn');
    
    const alphaGoldMapping = {
        '00': 'a', '01': 'b', '02': 'c', '03': 'd', '04': 'e', '05': 'f',
        '06': 'g', '07': 'h', '08': 'i', '09': 'j',
        '12': 'X.EDIT', '13': 'k', '14': 'l', '15': 'm', '16': 'CLA',
        '17': 'ω', '18': 'n', '19': 'o', '20': 'p', '21': 'q',
        '22': 'CASE UP', '23': 'r', '24': 's', '25': 't', '26': 'u',
        '27': 'CASE DN', '28': 'v', '29': 'w', '30': 'x', '31': 'y',
        '32': '⏻', '33': 'z', '34': ';', '35': ':', '36': '[CAT]'
    };
    
    const alphaBlueMapping = {
        '00': 'i', '01': '√', '02': '!', '03': '^', '04': 'e', '05': '#',
        '06': '|', '07': 'Δ', '08': 'π', '09': 'j',
        '12': '↵', '13': '⇄', '14': '±', '15': '<E>', '16': 'CLA',
        '17': 'α', '18': '7', '19': '8', '20': '9', '21': '÷',
        '22': '↑', '23': '4', '24': '5', '25': '6', '26': '×',
        '27': '↓', '28': '1', '29': '2', '30': '3', '31': '-',
        '32': 'SNAP', '33': '0', '34': '.', '35': '/', '36': '+'
    };

    buttons.forEach(btn => {
        const keyId = btn.getAttribute('data-key');
        if (!keyId) return;
        
        const container = btn.parentElement;
        const alphaSpan = container.querySelector('.alpha');
        const goldSpan = container.querySelector('.gold');
        const blueSpan = container.querySelector('.blue');
        
        if (isAlpha) {
            if (alphaSpan) {
                btn.innerText = alphaSpan.innerText;
                alphaSpan.style.display = 'none'; // Hide small white label
            }
            
            // Read labels from C core
            const keyCode = parseInt(keyId, 10);
            let goldLbl = Module.ccall('getKeyLabelNative', 'string', ['number', 'number'], [keyCode, 1]);
            let blueLbl = Module.ccall('getKeyLabelNative', 'string', ['number', 'number'], [keyCode, 2]);
            
            // Fallback to hardcoded mapping if C returns empty
            if (!goldLbl && alphaGoldMapping[keyId]) {
                goldLbl = alphaGoldMapping[keyId];
            }
            if (!blueLbl && alphaBlueMapping[keyId]) {
                blueLbl = alphaBlueMapping[keyId];
            }
            
            if (goldSpan) {
                if (goldLbl) {
                    goldSpan.innerText = goldLbl;
                } else {
                    const origGold = goldSpan.getAttribute('data-orig-label');
                    if (origGold) goldSpan.innerText = origGold;
                }
            }
            if (blueSpan) {
                if (blueLbl) {
                    blueSpan.innerText = blueLbl;
                } else {
                    const origBlue = blueSpan.getAttribute('data-orig-label');
                    if (origBlue) blueSpan.innerText = origBlue;
                }
            }
        } else {
            const origLabel = btn.getAttribute('data-orig-label');
            if (origLabel) {
                btn.innerText = origLabel;
            }
            if (alphaSpan) {
                alphaSpan.style.display = 'inline'; // Show small white label
            }
            
            if (goldSpan) {
                const origGold = goldSpan.getAttribute('data-orig-label');
                if (origGold) goldSpan.innerText = origGold;
            }
            if (blueSpan) {
                const origBlue = blueSpan.getAttribute('data-orig-label');
                if (origBlue) blueSpan.innerText = origBlue;
            }
        }
    });
}

// Auto-save state every 5 seconds
setInterval(() => {
    if (Module && Module.ccall) {
        console.log("Auto-saving state...");
        Module.ccall('saveCalc', null, []);
    }
}, 5000);

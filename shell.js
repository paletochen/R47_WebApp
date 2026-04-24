// R47 Web shell - bootstraps WASM, lays out keys, drives render + input.
// Plain JS, no build step. Loaded from index.html after c47-web.js.

(() => {
'use strict';

// Single source of truth for the web release. assemble-web.sh stamps
// this into dist/sw.js (VERSION) and dist/index.html (softwareVersion).
const WEB_VERSION = '3.28';
































































































































let keysEl = null;
let ctx = null;
let mod = null;


// ---------- Layout constants (from src/c47/defines.h, R47 portrait) ------
const X_LEFT      = 45;    // reverted to uncropped defaults
const Y_TOP       = 376;   // reverted to uncropped defaults
const DELTA_X     = 78;    // column step
const DELTA_Y     = 74;    // row step
const KEY_W1      = 47;    // standard button width
const KEY_W2      = 56;    // wide nav button width (XEQ/↑/↓/EXIT)
const KEY_H       = 28;    // button height
const LK_GAP1     = 18;    // large-key spacing 1 (after nav col, row 5)
const LK_GAP2     = 17;    // large-key spacing 2 (rows 6-8)

// ROW_Y_SHIFT removed: shifting everything (f/g labels, letter labels,
// buttons) looked wrong. The visible dark-button body is now offset
// via CSS (.key::before uses --btn-y-offset) so only the painted
// rectangle and its primary label move down, while the f/g shift
// labels and letter labels stay at their GTK positions.

// ---------- Key table -----------------------------------------------------
// Each entry: [idx, x, y, w, h, label]
// idx is the engine's kbd_std_R47f_g table index (0..36 for main keys,
// or -(1..6) for the 6 F-keys which route through the softmenu handler).
//
// Layout derived from src/c47-gtk/gtkGui.c construction code.

// Labels for the 37 calculator keys (kbd_std_R47f_g[0..36] in assign.c:368).
// Each: [idx, main, letter, fShift, gShift]. Empty strings omit the label.
// Letter column mirrors src/c47/assign.c:368 kbd_std_R47f_g[].primaryAim
// (the AIM-mode primary character for each key). For ITM_SPACE the C47
// font has no glyph for U+0020, so gtkGui.c renders it as ·_· — we do
// the same. Buttons whose primaryAim is a function (ENTER/BACKSPACE/
// UP1/DOWN1/EXIT1) get no letter, matching the physical R47.
const KEY_META = [
  // idx   main       letter  fShift (orange)  gShift (cyan)
  [0,  'x\u00B2',   'A',   'i\u2133\u2192R', '\u2192REC'],
  [1,  '\u221Ax',   'B',   'i\u2133\u2192P', '\u2192POL'],
  [2,  '1/x',       'C',   'x!.ms',           '.ms'],
  [3,  'y\u02E3',   'D',   '\u221Ay.d',       '.d'],
  [4,  'LOG',       'E',   '10\u02E3\u2192I', 'R\u2134'],
  [5,  'LN',        'F',   'e\u02E3',         '#'],
  [6,  'STO',       'G',   '|x|',             'arg'],
  [7,  'RCL',       'H',   '%',               '\u0394%'],
  [8,  'R\u2193',   'I',   '\u03C0',          'R\u2191'],
  [9,  'DRG',       'J',   'USER',            'ASN'],
  [10, 'f',         '',    '',                ''],
  [11, 'g',         '',    '',                ''],
  [12, 'ENTER',     '',    'CPX',             'STK'],
  [13, 'x\u21C4y',  'K',   'LASTx',           'DISP'],
  [14, 'CHS',       'L',   'TRG',             'PFX'],
  [15, 'EEX',       'M',   'EXP',             'CLR'],
  [16, '\u2190',    '',    'UNDO',            ''],
  [17, 'XEQ',       '_',   'AIM',             'GTO'],
  [18, '7',         'N',   'sin',             'asin'],
  [19, '8',         'O',   'cos',             'acos'],
  [20, '9',         'P',   'tan',             'atan'],
  [21, '\u00F7',    'Q',   'STAT',            'PLOT'],
  [22, '\u2191',    '',    'BST',             'RBR'],
  [23, '4',         'R',   'BASE',            'BITS'],
  [24, '5',         'S',   'INTS',            'REAL'],
  [25, '6',         'T',   'MATX',            'FN'],
  [26, '\u00D7',    'U',   'EQN',             'ADV'],
  [27, '\u2193',    '',    'SST',             'FLGS'],
  [28, '1',         'V',   'PREF',            'KEYS'],
  [29, '2',         'W',   'CONV',            'CLK'],
  [30, '3',         'X',   'FLAG',            'FN'],
  [31, '\u2212',    'Y',   'PROB',            'FIN'],
  [32, 'EXIT',      '',    'OFF',             'INFO'],
  [33, '0',         'Z',   'VIEW',            'I/O'],
  [34, '.',         ',',   'SHOW',            'b/c'],
  [35, 'R/S',       '?',   'PR',              'PFN'],
  [36, '+',         '\u00B7_\u00B7', 'CAT',   'CNST'],
];

// ---------- Keyboard shortcuts --------------------------------------------
// Primary labels match the GTK R47-facing shortcut legend. We keep a few
// practical aliases that GTK also accepts (for example '^' for yˣ, Tab for
// x↔y, ',' for '.', and z for R/S on some layouts).
// Each binding is [KeyboardEvent.key, engineIdx, labelForTooltip].
const KEYBOARD_BINDINGS = [
  // digits
  ['0', 33, '0'], ['1', 28, '1'], ['2', 29, '2'], ['3', 30, '3'],
  ['4', 23, '4'], ['5', 24, '5'], ['6', 25, '6'],
  ['7', 18, '7'], ['8', 19, '8'], ['9', 20, '9'],
  // operators
  ['+', 36, '+'], ['-', 31, '-'], ['*', 26, '*'], ['/', 21, '/'],
  // core
  ['Enter', 12, 'Enter'],
  ['Backspace', 16, 'Backspace'],
  ['Delete', 16, 'Del'],
  ['.', 34, '.'],
  [',', 34, ','],
  ['Escape', 32, 'Esc'],
  ['ArrowUp', 22, 'Up'],
  ['ArrowDown', 27, 'Dn'],
  // GTK R47 row shortcuts
  ['Q', 0, 'Q'],
  ['q', 1, 'q'],
  ['v', 2, 'v'],
  ['Y', 3, 'Y'],
  ['^', 3, '^'],
  ['o', 4, 'o'],
  ['l', 5, 'l'],
  ['m', 6, 'm'],
  ['r', 7, 'r'],
  ['d', 8, 'd'],
  ['>', 9, '>'],
  ['w', 13, 'w'],
  ['Tab', 13, 'Tab'],
  ['n', 14, 'n'],
  ['e', 15, 'e'],
  ['x', 17, 'x'],
  ['\\', 35, '\\'],
  ['z', 35, 'z'],
];
const KEYBOARD_MAP = Object.create(null);
const IDX_TO_KEYS = new Map();
for (const [key, idx, label] of KEYBOARD_BINDINGS) {
  KEYBOARD_MAP[key] = idx;
  if (!IDX_TO_KEYS.has(idx)) IDX_TO_KEYS.set(idx, []);
  const labels = IDX_TO_KEYS.get(idx);
  if (!labels.includes(label)) labels.push(label);
}
// F-key shortcuts + Left/Right arrow for menu scroll (GTK desktop behavior).
const KEYBOARD_FN_MAP = { 'F1':1,'F2':2,'F3':3,'F4':4,'F5':5,'F6':6,'ArrowLeft':5,'ArrowRight':6 };

function buildKeyTable() {
  const T = [];

  // Row 1: six function keys F1..F6 at (45 + i*78, 376), w=47
  for (let i = 0; i < 6; i++) {
    T.push({ idx: -(i+1), x: X_LEFT + i*DELTA_X, y: Y_TOP,       w: KEY_W1, h: KEY_H, fn: true });
  }

  // Rows 2-3: six calc keys each, uniform x step.
  // Shift DOWN by ROW_Y_SHIFT so the button bottoms align with the
  // bottom of the letter labels beside each button.
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 6; c++) {
      T.push({ idx: r*6 + c,
               x: X_LEFT + c*DELTA_X,
               y: Y_TOP + (r+1)*DELTA_Y,
               w: KEY_W1, h: KEY_H, fn: false });
    }
  }

  // Row 4: ENTER(wide, 2 cols) + x↔y + CHS + EEX + ← (5 entries, idx 12..16)
  const y4 = Y_TOP + 3*DELTA_Y;
  const enterW = KEY_W1 + DELTA_X;
  T.push({ idx:12, x:X_LEFT,                       y:y4, w:enterW, h:KEY_H, fn:false });
  T.push({ idx:13, x:X_LEFT + 2*DELTA_X,           y:y4, w:KEY_W1, h:KEY_H, fn:false });
  T.push({ idx:14, x:X_LEFT + 3*DELTA_X,           y:y4, w:KEY_W1, h:KEY_H, fn:false });
  T.push({ idx:15, x:X_LEFT + 4*DELTA_X,           y:y4, w:KEY_W1, h:KEY_H, fn:false });
  T.push({ idx:16, x:X_LEFT + 5*DELTA_X,           y:y4, w:KEY_W1, h:KEY_H, fn:false });

  // Rows 5-8: five keys each (nav + 4 wider number/op keys).
  for (let r = 0; r < 4; r++) {
    const y = Y_TOP + (4+r)*DELTA_Y;
    const base = 17 + r*5;
    T.push({ idx: base+0, x:  45, y, w: KEY_W1, h: KEY_H, fn:false });
    T.push({ idx: base+1, x: 141, y, w: KEY_W2, h: KEY_H, fn:false });
    T.push({ idx: base+2, x: 236, y, w: KEY_W2, h: KEY_H, fn:false });
    T.push({ idx: base+3, x: 331, y, w: KEY_W2, h: KEY_H, fn:false });
    T.push({ idx: base+4, x: 426, y, w: KEY_W2, h: KEY_H, fn:false });
  }

  return T;
}

// ---------- Fit-to-viewport scaling ---------------------------------------
// Centers and scales the calculator to fit the actual visible area.
// On narrow portrait phones we bias toward a fuller-width fit, while
// still centering the device inside the safe-area box so the bezel, not
// the live controls, absorbs any notch/home-indicator overlap. On larger
// devices (notably iPad portrait), fit against the safe-area height first.
function getSafeAreaInset(prop) {
  // env(safe-area-inset-*) is a CSS value; resolve it via a dummy
  // element so we can read it as a number in JS.
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;top:0;left:0;padding-${prop}:env(safe-area-inset-${prop});visibility:hidden;`;
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).getPropertyValue('padding-' + prop)) || 0;
  probe.remove();
  return v;
}

// User-controlled zoom factor, set by the calculator explorer page via
// postMessage({ type: 'r47-set-scale', scale: N }). Multiplied into the
// viewport-fit scale so the calc grows/shrinks within its iframe.
let _userScale = 1.0;

function fitScale() {
  const W = 482, H = 930;
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  // Take the LARGER of layout vs. visual viewport for height so iOS
  // Safari's bottom URL bar doesn't hold back the calculator's scale.
  // The bar briefly overlaps the bottom row but disappears as soon as
  // the user scrolls / it minimizes.
  const vh = Math.max(window.innerHeight || 0, vv ? vv.height : 0);
  const safeLeft   = getSafeAreaInset('left');
  const safeRight  = getSafeAreaInset('right');
  const safeW = Math.max(1, vw - safeLeft - safeRight);
  const portrait = vh >= vw;
  const phoneLikePortrait = portrait && safeW <= 500;
  // "Fill screen" mode (user toggle in the theme picker): ignore both
  // top and bottom safe areas and center the calculator vertically.
  // This fills the full viewport width and splits the remaining vertical
  // slack evenly above and below — the notch covers a sliver of the LCD
  // frame at the top, and the home indicator overlaps the bottom keys
  // slightly, but both are minor and symmetric.
  // In "safe" mode (default) the LCD frame border bleeds behind the
  // notch but the LCD canvas stays below it.
  const rawSafeTop = getSafeAreaInset('top');
  let fillScreen = false;
  try { fillScreen = localStorage.getItem('r47-fill-screen') === '1'; } catch (_) {}
  const phoneFill = phoneLikePortrait && fillScreen;
  const safeTop    = phoneFill ? 0 : (phoneLikePortrait ? Math.max(0, rawSafeTop - 5 * (vw / W)) : rawSafeTop);
  const safeBottom = phoneFill ? 0 : getSafeAreaInset('bottom');
  const safeH = Math.max(1, vh - safeTop - safeBottom);

  const fitW = (phoneLikePortrait ? vw : safeW) / W;
  const fitH = safeH / H;
  const s = Math.min(fitW, fitH);

  // Fill screen: center vertically in the full viewport.
  // Safe mode: pin the top edge at safeTop.
  const centerX = phoneLikePortrait ? (vw / 2) : (safeLeft + safeW / 2);
  const topEdge = phoneFill ? Math.max(0, (vh - H * s) / 2 + 12) : safeTop;
  const centerY = topEdge + (H * s) / 2;

  document.documentElement.style.setProperty('--device-scale', s);
  document.documentElement.style.setProperty('--device-left', centerX + 'px');
  document.documentElement.style.setProperty('--device-top', centerY + 'px');
  document.documentElement.style.setProperty('--device-top-edge', topEdge + 'px');
  document.documentElement.dataset.fillWidth = '0';
}

// ---------- Main ----------------------------------------------------------
// Debug overlay - toggle by pressing D in the URL (?debug). Otherwise
// all engine output goes to console only.
const DEBUG = new URLSearchParams(location.search).has('debug');
function dbg(s) {
  console.log('[R47]', s);
  if (!DEBUG) return;
  let el = document.getElementById('r47dbg');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'r47dbg';
    el.style = 'position:fixed;left:2px;top:2px;color:#0f0;background:rgba(0,0,0,0.6);'
             + 'z-index:99;padding:4px;font:10px monospace;max-height:180px;'
             + 'max-width:50vw;overflow:auto;';
    document.body.appendChild(el);
  }
  el.textContent += s + '\n';
}

// ---------- Themes --------------------------------------------------------
// Shared theme catalog for the independent Keys and LCD selectors.
// The same IDs power:
//   1. Keys/body theme via CSS on <html data-keys-theme="...">
//   2. LCD theme via pixel remap colors + the --lcd-bg fallback
// This lets users mix and match while keeping the old single-theme
// setting as a migration fallback. hex -> [r,g,b] helper below.
const hex2rgb = (s) => {
  const n = parseInt(s.replace('#',''), 16);
  return [(n>>16)&0xff, (n>>8)&0xff, n&0xff];
};
const THEMES = [
  // id,             name,            kind,   swatches (for picker tiles), lcdBg, lcdFg
  ['c47',            'C47',           'dark', ['#1A1A1A','#222222','#E5AE5A','#7EB6BA'], '#C8D8A0','#1C3014'],
  ['hp-classic',     'HP Classic',    'dark', ['#2B2A29','#212121','#E5AE5A','#7EB6BA'], '#e0e0e0','#303030'],
  ['hp-clean',       'HP Clean',      'dark', ['#2B2A29','#2B2A29','#E5AE5A','#7EB6BA'], '#2A1B08','#FFBF4A'],
  ['hp-10b-clean',   'HP 10B Clean',  'dark', ['#182331','#182331','#6499D3','#5A8FCA'], '#061936','#91C8FF'],
  ['nord-dark',      'Nord Dark',     'dark', ['#2E3440','#3B4252','#EBCB8B','#88C0D0'], '#2B3340','#ECEFF4'],
  ['dracula',        'Nightfall',     'dark', ['#282A36','#44475A','#FFB86C','#8BE9FD'], '#1C2535','#F5F8FF'],
  ['monokai',        'Monokai',       'dark', ['#272822','#3E3D32','#FD971F','#66D9EF'], '#1F201B','#F8F8F2'],
  ['solarized-dark', 'Solarized Dark','dark', ['#002B36','#073642','#B58900','#2AA198'], '#00212B','#EEE8D5'],
  ['tokyo-night',    'Tokyo Night',   'dark', ['#1A1B26','#24283B','#E0AF68','#7DCFFF'], '#1F2335','#C0CAF5'],
  ['catppuccin-mocha','Catppuccin Mocha','dark',['#1E1E2E','#313244','#F9E2AF','#89B4FA'], '#1A2434','#D8E7FF'],
  ['twilight',       'Twilight',      'dark', ['#2A2826','#5A5E68','#F0B284','#E8A2A2'], '#EDE4CC','#261C10'],
  ['ti-89-classic',  'TI-89 Classic', 'dark', ['#2C3442','#6B87A6','#E1C54D','#315D38'], '#C6D7CF','#20303F'],
  ['hp-48g',         'HP 48G',        'dark', ['#374541','#E6EBE1','#A486C9','#4D9C7A'], '#C9D7A7','#183022'],
  ['irixium',        'Irixium',       'light',['#6F93A6','#C5BBB2','#C98572','#3E88A8'], '#C8D9E7','#25344F'],
  ['cde',            'CDE',           'light',['#3F8F87','#B7D3DD','#F0A45D','#78AFC8'], '#B8D6D0','#173946'],
  ['platinum',       'Platinum',      'light',['#C8CDD5','#45505D','#5F97EC','#5CA56F'], '#D6DCE4','#2E4053'],
  ['hp-10b',         'HP 10B',        'light',['#C8CED6','#1A1D22','#3C78BC','#22374F'], '#AFC7DB','#0D2032'],
  ['hp-silver',      'HP Silver',     'light',['#B8AE9C','#E8E1D0','#B57600','#0F66AA'], '#C9D5A9','#0F1A20'],
  ['blue-steel',     'Blue Steel',    'light',['#A8B5C2','#E1E7EE','#B77A14','#236EA8'], '#CBD8E6','#13253C'],
  ['blue-steel-clean','Blue Steel Clean','light',['#A8B5C2','#A8B5C2','#6A3A00','#004878'], '#102836','#86E8FF'],
  ['rose-quartz',    'Rose Quartz',   'light',['#D5C0C3','#F0E5E6','#B97C2F','#5A82A3'], '#E5CDD2','#4A2E35'],
  ['solarized-light','Solarized Light','light',['#FDF6E3','#EEE8D5','#B58900','#2AA198'], '#FDF6E3','#002B36'],
  ['nord-light',     'Nord Light',    'light',['#ECEFF4','#E5E9F0','#D08770','#5E81AC'], '#ECEFF4','#2E3440'],
  ['gruvbox-light',  'Gruvbox Light', 'light',['#FBF1C7','#EBDBB2','#B57614','#076678'], '#FBF1C7','#3C3836'],
  ['github-light',   'GitHub Light',  'light',['#F6F8FA','#FFFFFF','#DAFBE1','#DDF4FF'], '#FFFFFF','#24292F'],
];
const DEFAULT_THEME_ID = 'hp-classic';
const LEGACY_THEME_KEY = 'r47-theme';
const KEYS_THEME_KEY   = 'r47-keys-theme';
const LCD_THEME_KEY    = 'r47-lcd-theme';
const LCD_SMOOTH_KEY   = 'r47-lcd-smooth';
const LAYOUT_KEY       = 'r47-layout';
const THEME_ALIASES = {
  'hpb-clean': 'hp-10b-clean',
};

// When embedded in the docs page (iframe src="/?docs=1") we default to
// Blue Steel keys + HP Classic LCD, and intentionally do NOT persist
// theme changes — otherwise opening the docs would overwrite the
// user's standalone-calc theme.
const IS_DOCS = (() => {
  try { return new URLSearchParams(location.search).get('docs') === '1'; }
  catch (_) { return false; }
})();
const DOCS_DEFAULT_KEYS_THEME = 'blue-steel';
const DOCS_DEFAULT_LCD_THEME  = 'github-light';

// When embedded in the docs page as an iframe, wheel events over the
// calc body are normally "consumed" by the iframe (the iframe itself
// isn't scrollable, but the event doesn't auto-bubble to the parent
// document's scroll). Forward them explicitly so the parent page
// scrolls when the user rolls the wheel over the calculator — users
// expect "scroll wheel over anywhere on the page = scroll the page."
if (IS_DOCS) {
  window.addEventListener('wheel', (e) => {
    // Same-origin iframe — we can scroll the parent directly.
    try {
      window.parent.scrollBy({ top: e.deltaY, left: e.deltaX });
      e.preventDefault();
    } catch (_) { /* cross-origin or detached; ignore */ }
  }, { passive: false });
}

function getTheme(id) {
  const canonical = THEME_ALIASES[id] || id;
  return THEMES.find((t) => t[0] === canonical) || THEMES[0];
}

function getStoredTheme(key) {
  if (IS_DOCS) {
    return key === LCD_THEME_KEY ? DOCS_DEFAULT_LCD_THEME : DOCS_DEFAULT_KEYS_THEME;
  }
  try {
    return localStorage.getItem(key) || localStorage.getItem(LEGACY_THEME_KEY) || DEFAULT_THEME_ID;
  } catch (_) {
    return DEFAULT_THEME_ID;
  }
}

function getStoredLcdSmooth() {
  try {
    const v = localStorage.getItem(LCD_SMOOTH_KEY);
    return v == null ? true : v !== '0';
  } catch (_) {
    return true;
  }
}

function setBrowserThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
}

let currentKeysTheme = DEFAULT_THEME_ID;
let currentLcdTheme  = DEFAULT_THEME_ID;
let currentLcdSmooth = getStoredLcdSmooth();

// Mutable LCD-remap state, overwritten by applyLcdTheme(). The blit loop
// reads these to rescale engine pixel intensities into theme colors.
const LCD_REMAP = { bg: [224,224,224], fg: [48,48,48] };

let workDirHandle = null;

async function createSubfoldersInDirectory(handle) {
  try {
    await handle.getDirectoryHandle('STATE', { create: true });
    await handle.getDirectoryHandle('PROGRAMS', { create: true });
    await handle.getDirectoryHandle('SAVFILES', { create: true });
    await handle.getDirectoryHandle('SCREENS', { create: true });
    dbg("Subfolders created in Work Directory");
  } catch (e) {
    dbg("Failed to create subfolders in Work Directory: " + e.message);
  }
}

function idb_get(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('r47-db', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const getReq = store.get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function idb_set(storeName, key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('r47-db', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const putReq = store.put(value, key);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function handleDirectorySelection(handle) {
    dbg("Directory selected: " + handle.name);
    window.workDirHandle = handle;
    try {
        await idb_set('handles', 'workDir', handle);
        dbg("Saved directory handle to IndexedDB.");
    } catch (e) {
        dbg("Failed to save directory handle to IndexedDB: " + e.message);
    }
    await createSubfoldersInDirectory(handle);
    
    try {
        const savFilesHandle = await handle.getDirectoryHandle('SAVFILES');
        const savFileHandle = await savFilesHandle.getFileHandle('R47.sav');
        const file = await savFileHandle.getFile();
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        
        // Stage it into the virtual filesystem
        try { window.Module.FS.mkdir('/persist/SAVFILES'); } catch (e) {}
        window.Module.FS.writeFile('/persist/SAVFILES/R47.sav', bytes);
        dbg("Auto-loaded R47.sav to virtual FS. Use manual LOAD if not applied.");
    } catch (e) {
        dbg("No R47.sav found in Work Directory to auto-load: " + e.message);
    }


}

window.getSubfolderHandle = async function(subfolderName) {
  if (!window.workDirHandle) return null;
  try {
    return await window.workDirHandle.getDirectoryHandle(subfolderName);
  } catch (e) {
    console.error(`Failed to get subfolder handle for ${subfolderName}:`, e);
    return null;
  }
}

function applyKeysTheme(id) {
  const t = getTheme(id);
  currentKeysTheme = t[0];
  document.documentElement.dataset.keysTheme = t[0];
  setBrowserThemeColor(t[3][0]);
  if (!IS_DOCS) { try { localStorage.setItem(KEYS_THEME_KEY, t[0]); } catch (_) {} }
}

function applyLcdTheme(id) {
  const t = getTheme(id);
  currentLcdTheme = t[0];
  document.documentElement.dataset.lcdTheme = t[0];
  document.documentElement.style.setProperty('--lcd-bg', t[4]);
  LCD_REMAP.bg = hex2rgb(t[4]);
  LCD_REMAP.fg = hex2rgb(t[5]);
  if (!IS_DOCS) { try { localStorage.setItem(LCD_THEME_KEY, t[0]); } catch (_) {} }
}

// Apply saved themes as early as possible (before first paint).
try { applyKeysTheme(getStoredTheme(KEYS_THEME_KEY)); } catch (_) {}
try { applyLcdTheme(getStoredTheme(LCD_THEME_KEY)); } catch (_) {}

let r47 = null;

function applyLcdRenderMode() {
  const smooth = currentLcdSmooth;
  document.documentElement.dataset.lcdRender = smooth ? 'smooth' : 'pixelated';
  const lcd = document.getElementById('lcd');
  if (!lcd) return;
  const ctx = lcd.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = smooth;
  ctx.mozImageSmoothingEnabled = smooth;
  ctx.webkitImageSmoothingEnabled = smooth;
  ctx.msImageSmoothingEnabled = smooth;
}

async function boot() {
  dbg('boot start');
  dbg('Version: ' + WEB_VERSION);

  keysEl = document.getElementById('keys');
  const lcd    = document.getElementById('lcd');
  applyLcdRenderMode();

  // 1. Build and mount the key grid.
  // Each button's CSS --pad (default 10px) widens the clickable/tap
  // area so fingers don't need to be pixel-accurate. The VISUAL
  // button is painted inward by that pad via a CSS pseudo-element,
  // so the GTK-matching pixel layout is preserved. We set inline
  // left/top that are the VISUAL position (from buildKeyTable) minus
  // the pad, and width/height that are the VISUAL size plus 2*pad.
  const HIT_PAD = 12;
  const keys = buildKeyTable();
  const keyBtnByIdx = new Map();  // engineIdx → button element (for keyboard handler)
  keysEl.innerHTML = '';
  for (const k of keys) {
    const container = document.createElement('div');
    container.className = 'key-container';
    container.style.left   = (k.x - HIT_PAD) + 'px';
    container.style.top    = (k.y - HIT_PAD) + 'px';
    container.style.width  = (k.w + 2*HIT_PAD) + 'px';
    container.style.height = (k.h + 2*HIT_PAD) + 'px';
    container.dataset.idx  = k.idx;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'key';
    btn.dataset.idx  = k.idx;
    btn.dataset.fn   = k.fn ? '1' : '0';
    container.appendChild(btn);

    if (k.fn) {
      const fnNum = -k.idx;
      btn.setAttribute('aria-label', 'F' + fnNum);
      btn.classList.add('key-fn');
      const fnHints = ['F' + fnNum];
      if (fnNum === 5) fnHints.push('Left');
      if (fnNum === 6) fnHints.push('Right');
      btn.title = 'F' + fnNum + ' (softkey)  [' + fnHints.join(' / ') + ']';
    } else {
      const meta = KEY_META[k.idx] || [];
      const letter = meta[2] || '';

      const numericIdx = { 18:1, 19:1, 20:1, 23:1, 24:1, 25:1, 28:1, 29:1, 30:1, 33:1 };
      const operatorIdx = { 21:1, 26:1, 31:1, 36:1 };
      if (numericIdx[k.idx]) btn.classList.add('numeric');
      if (operatorIdx[k.idx]) btn.classList.add('operator');
      if (k.idx === 10) btn.classList.add('key-f');
      if (k.idx === 11) btn.classList.add('key-g');

      btn.innerHTML = `<span class="key-label" data-role="primary"></span>`;
      btn.setAttribute('aria-label', 'key-' + k.idx);

      {
        const [, main, , fsh, gsh] = meta;
        
        // Removed hardcoded labels to avoid double rows.

        const parts = [];
        if (main) parts.push(main);
        if (fsh)  parts.push('f\u2192 ' + fsh);
        if (gsh)  parts.push('g\u2192 ' + gsh);
        const sc = IDX_TO_KEYS.get(k.idx);
        if (sc && sc.length) parts.push('[' + sc.join(' / ') + ']');
        if (parts.length) btn.title = parts.join('  \u2022  ');
      }

      if (letter) {
        const lEl = document.createElement('span');
        lEl.className = 'alpha';
        lEl.textContent = letter;
        container.appendChild(lEl);
      }

      {
        const lblEl = document.createElement('div');
        lblEl.className = 'lbl';
        lblEl.dataset.idx = k.idx;
        lblEl.innerHTML =
          `<span class="shift-f gold"></span><span class="shift-g blue"></span>`;
        container.insertBefore(lblEl, btn);
      }
    }
    keyBtnByIdx.set(k.idx, btn);
    keysEl.appendChild(container);
  }

  // 2. Boot the WASM module. IDBFS is mounted at /persist in preRun so
  //    when the engine calls fopen("/persist/...") the reads/writes are
  //    backed by IndexedDB.
  dbg('R47Module loading...');

  // Filter: lines we consider "engine user output" vs internal debug spam.
  // The engine is chatty on stdout with refresh counters, freeList stats,
  // function-name traces, etc. We only surface things that don't match
  // those noise patterns.
  const NOISE_RE = [
    /^\s*refrsh\(/,
    /^--- /, /^-------/, /^#{3,}/,
    /^#\d+/,
    /^\s*frame #/,



    /^freeProgramBytes/,
    /^RestoreCalc$/,
    /^Cannot open file /,
    /^R47 Web:/,
    /^gmpMemInBytes/,
    /^error:gmpMemInBytes/,
    /^This happened after/,
    /^addItemToNim/,
    /^calcModel/,
    /^\[shim\]/,
    /^\s*$/,
  ];

  const isEngineUserOutput = (s) => {
    if (!s) return false;
    for (const re of NOISE_RE) if (re.test(s)) return false;
    return true;
  };

  // ---- Family-reload protocol (docsmd/firmwarekeys.md §5, §8) ---------
  // Register the reload hook BEFORE R47Module boots so the engine finds
  // it defined if any future early-boot path ever calls fnKeysManagement
  // with a cross-family layout. The hook body closes over `mod` and
  // `r47` (both declared below); calling it before those bindings
  // resolve would throw TDZ ReferenceError, but the current design
  // has nothing triggering the hook during r47_init.
  //
  // Overlay must block user input during the async save → syncfs →
  // reload window: without that, a keypress between saveCalc() and
  // reload() could mutate state after the flush, silently losing work.
  function r47_showSwitchOverlay(name) {
    const ov = document.createElement('div');
    ov.className = 'r47-switch-overlay';
    ov.innerHTML = `<div class="r47-switch-msg">Switching to <strong>${name}</strong>…</div>`;
    document.body.appendChild(ov);
    return ov;
  }
  function r47_freezeInput() {
    document.documentElement.setAttribute('data-switching', '1');
  }
  function r47_thawInput() {
    document.documentElement.removeAttribute('data-switching');
  }

  window.r47RequestFamilyReload = async function(targetModel) {
    // USER_R47f_g..USER_R47fg_g = 61..64; USER_C47 = 46; USER_DM42 = 45.
    const targetIsR47 = (targetModel >= 61 && targetModel <= 64);
    const displayName = targetIsR47
        ? 'R47'
        : (targetModel === 45 ? 'DM42' : 'C47');

    const ov = r47_showSwitchOverlay(displayName);
    r47_freezeInput();
    try {
      // 1. Flush the current binary's state to its backup.cfg. This is
      //    the file the inbound binary's restoreCalc() reads on boot.
      //    The engine's saveCalc() has a non-permanent-layout guard but
      //    config.c's fnKeysManagement intercept bails before calcModel
      //    mutates, so we're still in-family here.
      r47.save_calc();

      // 2. Persist IDBFS to IndexedDB so the flushed cfg survives reload.
      await new Promise((resolve, reject) =>
        mod.FS.syncfs(false, (err) => err ? reject(err) : resolve()));

      // 3. Stash the target so the post-reload boot picks the right
      //    binary and layout.
      localStorage.setItem('r47-target', JSON.stringify({
        binary: targetIsR47 ? 'r47' : 'c47',
        initialLayout: targetModel,
      }));

      // 4. Reload. An HTTP failure on the next page load surfaces in
      //    the boot-time recovery path (index.html's onerror handler).
      window.location.reload();
    } catch (err) {
      // Pre-reload failure — don't leave r47-target set or the user
      // will reload into the same broken state.
      try { localStorage.removeItem('r47-target'); } catch (_) {}
      ov.remove();
      r47_thawInput();
      console.error('Family reload failed:', err);
      alert('Could not switch calculator. See console for details.');
    }
  };
  // --------------------------------------------------------------------

  mod = await R47Module({
    print: (s) => {
      if (s.includes('Invalid UTF-8 leading byte')) return;
      if (isEngineUserOutput(s)) {
        dbg('wasm: ' + s);

        if (window.r47Printer) window.r47Printer.appendLine(s);
      }

      
      // Intercept SAVE completion
      if (s.includes('item=1586=SAVE')) {
        setTimeout(() => triggerSaveToPhysicalFolder(), 500);
      }
    },
    printErr: (s) => {
      if (s.includes('Invalid UTF-8 leading byte')) return;
      dbg('wasm!: ' + s);

      if (s.includes('This happened after SAVE')) {
        setTimeout(() => triggerSaveToPhysicalFolder(), 500);
      }
    },
    locateFile: (p) => 'wasm/' + p,
    noInitialRun: true,   // we'll call main() manually after IDBFS is mounted
  });
  dbg('R47Module loaded');
  window.Module = mod;
  window.wasmInitialized = true;
  if (typeof window.onWasmLoaded === 'function') {
      window.onWasmLoaded();
  }


  async function triggerSaveToPhysicalFolder() {
    if (!window.workDirHandle) {
      dbg('SAVE: No Work Directory selected. Skipping physical persistence.');
      return;
    }
    try {
      try {
        const persistFiles = mod.FS.readdir('/persist');
        dbg('SAVE: Files in /persist: ' + persistFiles.join(', '));
      } catch (e) { dbg('SAVE: readdir /persist failed: ' + e); }
      try {
        const rootFiles = mod.FS.readdir('/');
        dbg('SAVE: Files in /: ' + rootFiles.join(', '));
      } catch (e) { dbg('SAVE: readdir / failed: ' + e); }
      try {
        const savFiles = mod.FS.readdir('/persist/SAVFILES');
        dbg('SAVE: Files in /persist/SAVFILES: ' + savFiles.join(', '));
      } catch (e) { dbg('SAVE: readdir /persist/SAVFILES failed: ' + e); }
      try {
        const stateFiles = mod.FS.readdir('/persist/STATE');
        dbg('SAVE: Files in /persist/STATE: ' + stateFiles.join(', '));
      } catch (e) { dbg('SAVE: readdir /persist/STATE failed: ' + e); }

      // The engine writes to /persist/SAVFILES/R47.sav upon SAVE
      dbg('SAVE: Reading /persist/SAVFILES/R47.sav');
      const bytes = mod.FS.readFile('/persist/SAVFILES/R47.sav');
      
      const savFilesDir = await window.workDirHandle.getDirectoryHandle('SAVFILES', { create: true });
      const fileHandle = await savFilesDir.getFileHandle('R47.sav', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      dbg('SAVE: Persisted R47.sav to physical SAVFILES folder.');
    } catch (err) {
      console.error('SAVE: Failed to persist to physical folder:', err);
    }
  }

  // Mount IDBFS and hydrate from IndexedDB BEFORE we run main()/r47_init
  // (so the engine's auto-restore sees any persisted state).
  try {
    mod.FS.mkdir('/persist');
  } catch (e) { /* exists */ }
  mod.FS.mount(mod.IDBFS, {}, '/persist');
  window.idbfsMountedPromise = new Promise((resolve) => {
    mod.FS.syncfs(true, (err) => {
      if (err) dbg('IDBFS hydrate: ' + err);
      resolve();
    });
  });
  await window.idbfsMountedPromise;

  dbg('IDBFS mounted');
  
  // Ensure required directories exist in the virtual filesystem
  try { mod.FS.mkdir('/persist/SAVFILES'); } catch (e) {}
  try { mod.FS.mkdir('/persist/STATE'); } catch (e) {}
  try { mod.FS.mkdir('/persist/PROGRAMS'); } catch (e) {}
  try { mod.FS.mkdir('/persist/LIBRARY'); } catch (e) {}
  try { mod.FS.mkdir('/persist/uploads'); } catch (e) {}

function showSnackbar(message, actionText, actionCallback) {
  const snackbar = document.getElementById('snackbar');
  if (!snackbar) return;
  const span = snackbar.querySelector('span');
  if (span) span.textContent = message;
  const actionBtn = document.getElementById('snackbar-action-btn');
  if (actionBtn) {
    actionBtn.textContent = actionText;
    actionBtn.onclick = () => {
      snackbar.classList.remove('show');
      if (actionCallback) actionCallback();
    };
  }
  snackbar.classList.add('show');
}
window.showSnackbar = showSnackbar;

// Check if Work Directory was previously selected.
if ('showDirectoryPicker' in window) {
  (async () => {
    if (!window.workDirHandle) {
      try {
        const storedHandle = await idb_get('handles', 'workDir');
        if (storedHandle) {
          dbg("Retrieved stored directory handle: " + storedHandle.name);
          // Request permission again, as it is lost on refresh
          const permission = await storedHandle.requestPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            await handleDirectorySelection(storedHandle);
          } else {
            dbg("Permission not granted for stored directory handle.");
            // Show snackbar to request permission on user interaction
            showSnackbar('Please grant permission to access Work Directory!', 'GRANT', async () => {
              try {
                const perm = await storedHandle.requestPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                  await handleDirectorySelection(storedHandle);
                } else {
                  dbg("Permission still not granted.");
                }
              } catch (err) {
                dbg("Permission request failed: " + err.message);
              }
            });
          }
        } else {
          // No stored handle, show snackbar
          showSnackbar('Please select a Work Directory for organized storage!', 'SET', async () => {
            try {
              const handle = await window.showDirectoryPicker();
              await handleDirectorySelection(handle);
            } catch (err) {
              dbg("Directory picker failed: " + err.message);
            }
          });
        }
      } catch (e) {
        dbg("Failed to check stored handles: " + e.message);
        // Fallback to snackbar
        showSnackbar('Please select a Work Directory for organized storage!', 'SET', async () => {
          try {
            const handle = await window.showDirectoryPicker();
            await handleDirectorySelection(handle);
          } catch (err) {
            dbg("Directory picker failed: " + err.message);
          }
        });
      }
    }
  })();
}

  // main() is a no-op in the web entry; all real boot work is in r47_init.
  // (We set noInitialRun so the engine can't side-effect before IDBFS
  // is mounted.)

  r47 = {
    init:             mod.cwrap('r47_init',             null,     []),
    key:              mod.cwrap('r47_key',              null,     ['number','number'], { async: true }),
    fn_key:           mod.cwrap('r47_fn_key',           null,     ['number','number'], { async: true }),

    tick:             mod.cwrap('r47_tick',             null,     ['number'], { async: true }),
    key_label:        mod.cwrap('r47_key_label',        'string', ['number','number']),
    softkey_label:    mod.cwrap('r47_softkey_label',    'string', ['number']),
    menu_id:          mod.cwrap('r47_menu_id',          'number', []),
    softmenu_offset:  mod.cwrap('r47_softmenu_offset',  'number', []),
    screen_ptr:       mod.cwrap('r47_screen_ptr',       'number', []),
    screen_stride:    mod.cwrap('r47_screen_stride',    'number', []),
    force_refresh:    mod.cwrap('r47_force_refresh',    null,     []),
    get_calc_mode:    mod.cwrap('r47_get_calc_mode',    'number', []),
    get_scr_upd:      mod.cwrap('r47_get_scr_upd_mode', 'number', []),
    set_scr_upd:      mod.cwrap('r47_set_scr_upd_mode', null,     ['number']),
    load_program:     mod.cwrap('r47_load_program_named', null,       ['string']),
    save_program:     mod.cwrap('r47_save_program_named', null,       ['string']),
    export_rtf:       mod.cwrap('r47_export_rtf_program_named', null, ['string']),
    save_state:       mod.cwrap('r47_save_state_named',   null,       ['string']),
    load_state:       mod.cwrap('r47_load_state_named',   null,       ['string']),
    // Flush calc state to backup.cfg via the engine's saveCalc(). Called
    // before a cross-family reload so the outgoing binary's state survives
    // (see docsmd/firmwarekeys.md §6b, §8, §9).
    save_calc:        mod.cwrap('r47_save_calc',           null,       []),
    // Program-management exports added for the Explorer's Files /
    // Program tabs.  See docsmd/rejig_opus.md §7 for the rationale.
    delete_program_by_label: mod.cwrap('r47_delete_program_by_label', null, ['number']),
    // Delete the program whose first global label matches the given
    // name. Returns 1 if deleted, 0 if no match. Used by the Explorer's
    // Send flow to dedupe edit→send→run cycles (docsmd/program_dedup.md).
    delete_program_by_name:  mod.cwrap('r47_delete_program_by_name',  'number', ['string']),
    delete_all_programs:     mod.cwrap('r47_delete_all_programs',     null, []),
    number_of_programs:      mod.cwrap('r47_number_of_programs',      'number', []),
    current_program_number:  mod.cwrap('r47_current_program_number',  'number', []),
    set_current_program:     mod.cwrap('r47_set_current_program',     null, ['number']),
    program_label_at:        mod.cwrap('r47_program_label_at',        'string', ['number']),
    get_flag:                mod.cwrap('r47_get_flag',                'number', ['number']),
    user_mode:        mod.cwrap('r47_user_mode',          'number',   []),
    flag_browser_screen: mod.cwrap('r47_flag_browser_screen', 'number', []),
    calc_model:       mod.cwrap('r47_calc_model',         'number',   []),
    set_calc_model:   mod.cwrap('r47_set_calc_model',     null,       ['number']),
    key_shift_type:   mod.cwrap('r47_key_shift_type',     'number',   ['number']),
    is_r47_family:    mod.cwrap('r47_is_r47_family',      'number',   []),
    shift_state:      mod.cwrap('r47_shift_state',        'number',   []),
    build_date:       mod.cwrap('r47_build_date',         'string',   []),
  };

  async function handleInterceptedFile(path, name) {
    if (window.workDirHandle) {
      try {
        const subHandle = await getSubfolderHandle('SCREENS');
        const fileHandle = await window.showSaveFilePicker({
          startIn: subHandle,
          suggestedName: name,
          types: [{
            description: name.endsWith('.bmp') ? 'BMP Image' : 'TSV Data',
            accept: name.endsWith('.bmp') ? { 'image/bmp': ['.bmp'] } : { 'text/tab-separated-values': ['.TSV'] }
          }]
        });
        
        const bytes = mod.FS.readFile(path);
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        
        console.log(`Saved intercepted file ${name} to physical storage.`);
        mod.FS.unlink(path);
      } catch (e) {
        console.error("Failed to save intercepted file:", e);
      }
    } else {
      console.warn("No work directory bound, cannot save intercepted file physically.");
    }
  }

  console.log("Is mod.FS defined before init?", typeof mod.FS !== 'undefined');
  if (typeof mod.FS !== 'undefined') {
    mod.FS.trackingDelegate = mod.FS.trackingDelegate || {};
    mod.FS.trackingDelegate['onFileCreated'] = function(path) {
      console.log("File created in virtual FS:", path);
      const name = path.substring(path.lastIndexOf('/') + 1);
      if (name.startsWith('2026') && (name.endsWith('.bmp') || name.endsWith('.TSV'))) {
        console.log("Intercepted engine file creation:", name);
        // Call handleInterceptedFile directly, hoping it preserves user gesture
        handleInterceptedFile(path, name);
      }
    };
  }

  // Expose hooks for console debugging:
  //   window.r47test()     - runs 7 ENTER 3 +
  //   window.r47pixels()   - returns {ptr, zero, on, off, other}
  //   window.r47x()        - returns the X-register display string
  //   window.r47mod        - the raw Emscripten module (HEAPU8 etc.)
  window.r47mod  = mod;
  window.r47     = r47;
  window.r47test = () => { r47.key(18,2); r47.key(12,2); r47.key(30,2); r47.key(36,2); };
  window.r47x    = () => mod.cwrap('r47_x_display','string',[])();
  window.r47pixels = () => {
    const ptr = r47.screen_ptr();
    const src = new Uint32Array(mod.HEAPU8.buffer, ptr, 400*240);
    let on=0, off=0, zero=0, other=0;
    for (let i=0;i<400*240;i++){
      const v=src[i];
      if(v===0)zero++;
      else if(v===0x303030||v===0x00303030)on++;
      else if(v===0xe0e0e0||v===0x00e0e0e0)off++;
      else other++;
    }
    return { ptr, zero, on, off, other };
  };

  dbg('r47.init()...');
  await window.idbfsMountedPromise;
  r47.init();

  // dbg('screen ptr=' + r47.screen_ptr() + ' stride=' + r47.screen_stride());



  // Populate each key's primary / f-shift / g-shift labels from the
  // engine. Wrapped in refreshKeyLabels() so it can be re-run when USER
  // mode toggles (ASN-assigned functions need their text to update).
  window.refreshKeyLabels = function() {
    for (const btn of keysEl.querySelectorAll('.key:not(.key-fn)')) {
      const idx = Number(btn.dataset.idx);
      const span = btn.querySelector('[data-role="primary"]');
      const target = span || btn;
      const lbl = r47.key_label(idx, 0) || (KEY_META[idx] && KEY_META[idx][1]) || '';
      if (target.textContent !== lbl) target.textContent = lbl;
    }
    for (const row of keysEl.querySelectorAll('.lbl')) {
      const idx = Number(row.dataset.idx);
      const f = r47.key_label(idx, 1) || '';
      const g = r47.key_label(idx, 2) || '';
      const fEl = row.querySelector('.shift-f');
      const gEl = row.querySelector('.shift-g');
      if (fEl && fEl.textContent !== f) fEl.textContent = f;
      if (gEl) {
        if (gEl.textContent !== g) gEl.textContent = g;
        gEl.classList.toggle('keys-access', g === 'KEYS');
      }
    }
  }
  refreshKeyLabels();

  // ---------- Layout-switching support (g->KEYS) --------------------------
  // These functions make the web UI dynamic: when the user switches
  // between R47f_g, C47, and DM42 via the KEYS menu, button labels,
  // shift-key positions, nav styling, letter labels, tooltips,
  // keyboard shortcuts, and themes all update to match the new layout.

  // Norm_Key_00 position per layout — the "blank assignable" slot.
  // -1 means no Norm key (R47f_g).  Values from defines.h macros.
  const NORM_KEY_POS = { 61:-1, 62:10, 63:11, 64:-1, 46:0, 45:0 };

  // Returns 'R47' | 'C47' | 'DM42' for the active calcModel. Used to
  // prefix .s47 state-file defaults so R47 and C47 saves don't overwrite
  // each other under the same filename (their file headers diverge —
  // R47_save_file_00 vs C47_save_file_00 — so a wrong-family load would
  // error anyway). See docsmd/firmwarekeys.md §8b.
  window.calcFamilyName = function() {
    const m = r47.calc_model();
    if (m === 46) return 'C47';      // USER_C47
    if (m === 45) return 'DM42';     // USER_DM42
    return 'R47';                    // USER_R47f_g/bk_fg/fg_bk/fg_g (61..64)
  };


  // Layout → default [keysTheme, lcdTheme] pairing.
  // All four R47 shift variants get explicit entries so applyPairedTheme
  // doesn't silently fall back to LAYOUT_THEMES[61] — that implicit
  // fallback was functional but obscured per-variant theming intent.
  const LAYOUT_THEMES = {
    61: ['hp-classic',  'hp-classic'],       // R47f_g    (USER_R47f_g)
    62: ['hp-classic',  'hp-classic'],       // R47bk_fg  (USER_R47bk_fg)
    63: ['hp-classic',  'hp-classic'],       // R47fg_bk  (USER_R47fg_bk)
    64: ['hp-classic',  'hp-classic'],       // R47fg_g   (USER_R47fg_g)
    46: ['c47',         'c47'],              // C47       (USER_C47)
    45: ['hp-clean',    'twilight'],          // DM42      (USER_DM42)
  };
  // Docs-mode (explorer iframe) defaults — KEY models use github-light LCD
  // for readability; C47/DM42 keep their natural dark/light pairing.
  const DOCS_LAYOUT_THEMES = {
    61: ['blue-steel',  'github-light'],
    62: ['blue-steel',  'github-light'],
    63: ['blue-steel',  'github-light'],
    64: ['blue-steel',  'github-light'],
    46: ['c47',         'github-light'],
    45: ['hp-clean',    'github-light'],
  };
  const THEME_AUTO_KEY = 'r47-theme-auto-switch';

  function getThemeAutoSwitch() {
    try { return localStorage.getItem(THEME_AUTO_KEY) !== '0'; }
    catch (_) { return true; }
  }

  function getLayoutThemeOverride(model, domain) {
    try { return localStorage.getItem(`r47-${domain}-theme-${model}`); }
    catch (_) { return null; }
  }

  function saveLayoutThemeOverride(model, domain, themeId) {
    try { localStorage.setItem(`r47-${domain}-theme-${model}`, themeId); }
    catch (_) {}
  }

  // Reclassify which buttons are shift keys (shift-f, shift-g, shift-fg,
  // key-blank, key-assignable) based on the engine's current layout.
  // Also shows/hides the f/g shift-row labels above each button.
  function reclassifyShiftKeys() {
    const model = r47.calc_model();
    // DM42 (model 45) has one physical gold shift key: fShifted = gold labels,
    // gShifted = C47-only extensions with no physical legend. CSS hides the
    // gShifted labels, except KEYS (which lets the user switch back to another
    // layout). C47 and other KEY_fg layouts have both layers physically labeled
    // so they do NOT get this treatment.
    document.documentElement.dataset.singleShift = (model === 45) ? '1' : '0';
    const normPos = NORM_KEY_POS[model] ?? -1;
    for (const [idx, btn] of keyBtnByIdx) {
      if (idx < 0) continue;
      btn.classList.remove('shift-f', 'shift-g', 'shift-fg',
                           'key-blank', 'key-assignable');
      const st = r47.key_shift_type(idx);
      switch (st) {
        case 1: btn.classList.add('shift-f');  break;
        case 2: btn.classList.add('shift-g');  break;
        case 3: btn.classList.add('shift-fg'); break;
        case 4:
          btn.classList.add(idx === normPos ? 'key-assignable' : 'key-blank');
          break;
      }
      // Shift keys don't show f/g label rows above themselves.
      const row = keysEl.querySelector(`.key-shift-row[data-idx="${idx}"]`);
      if (row) row.style.display = (st >= 1 && st <= 3) ? 'none' : '';
    }
  }

  // Reclassify which buttons get the narrow "nav" styling.
  // Nav keys are identified by their primary function label.
  function reclassifyNavKeys() {
    const navLabels = new Set(['XEQ', 'EXIT', '\u2191', '\u2193']);
    for (const [idx, btn] of keyBtnByIdx) {
      if (idx < 0) continue;
      btn.classList.remove('nav');
      const lbl = r47.key_label(idx, 0) || '';
      if (navLabels.has(lbl)) btn.classList.add('nav');
    }
  }

  // Rebuild letter labels (A-Z, punctuation) from the engine's primaryAim.
  // These differ between layouts (e.g., C47 has K/L at idx 10/11 where
  // R47f_g has shift keys with no letters).
  function rebuildLetterLabels() {
    // Remove all existing letter spans.
    for (const el of keysEl.querySelectorAll('.key-letter')) el.remove();
    // Recreate from engine.  Filter: single-char AIM letters only.
    // Nav/function keys return multi-char names like "ENTER", "EXIT".
    const aimChars = new Set(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
      .split('').concat([',', '_', '?', ':', ';', '\u00B7_\u00B7'])
    );
    for (const k of keys) {
      if (k.fn || k.idx < 0) continue;
      const letter = r47.key_label(k.idx, 3) || '';
      // The engine returns ITM_SPACE as a space character — render as ·_·
      // matching the KEY_META convention.
      const display = (letter === ' ') ? '\u00B7_\u00B7' : letter;
      if (!display || (!aimChars.has(display) && display.length > 3)) continue;
      const lEl = document.createElement('span');
      lEl.className = 'key-letter';
      lEl.textContent = display;
      keysEl.appendChild(lEl);
    }
  }

  // Rebuild tooltip text on all buttons from the engine's live labels.
  function rebuildTooltips() {
    for (const [idx, btn] of keyBtnByIdx) {
      if (idx < 0) continue;
      const main = r47.key_label(idx, 0) || '';
      const fsh  = r47.key_label(idx, 1) || '';
      const gsh  = r47.key_label(idx, 2) || '';
      const parts = [];
      if (main) parts.push(main);
      if (fsh)  parts.push('f\u2192 ' + fsh);
      if (gsh)  parts.push('g\u2192 ' + gsh);
      const sc = IDX_TO_KEYS.get(idx);
      if (sc && sc.length) parts.push('[' + sc.join(' / ') + ']');
      btn.title = parts.length ? parts.join('  \u2022  ') : '';
    }
  }

  // Rebuild desktop keyboard shortcut bindings for the active layout.
  function rebuildKeyboardBindings() {
    for (const k in KEYBOARD_MAP) delete KEYBOARD_MAP[k];
    IDX_TO_KEYS.clear();
    // Universal bindings — digit/operator positions don't move between layouts.
    const base = [
      ['0',33,'0'], ['1',28,'1'], ['2',29,'2'], ['3',30,'3'],
      ['4',23,'4'], ['5',24,'5'], ['6',25,'6'],
      ['7',18,'7'], ['8',19,'8'], ['9',20,'9'],
      ['+',36,'+'], ['-',31,'-'], ['*',26,'*'], ['/',21,'/'],
      ['Enter',12,'Enter'], ['Backspace',16,'Backspace'],
      ['Delete',16,'Del'],
      ['.',34,'.'], [',',34,','], ['Escape',32,'Esc'],
    ];
    // Arrow key positions differ between R47 family and C47/DM42.
    if (r47.is_r47_family()) {
      base.push(['ArrowUp', 22, 'Up'], ['ArrowDown', 27, 'Dn']);
    } else {
      base.push(['ArrowUp', 17, 'Up'], ['ArrowDown', 22, 'Dn']);
    }
    for (const [key, idx, label] of base) {
      KEYBOARD_MAP[key] = idx;
      if (!IDX_TO_KEYS.has(idx)) IDX_TO_KEYS.set(idx, []);
      const labels = IDX_TO_KEYS.get(idx);
      if (!labels.includes(label)) labels.push(label);
    }
    // F-keys + Left/Right are universal.
    KEYBOARD_FN_MAP['F1']=1; KEYBOARD_FN_MAP['F2']=2; KEYBOARD_FN_MAP['F3']=3;
    KEYBOARD_FN_MAP['F4']=4; KEYBOARD_FN_MAP['F5']=5; KEYBOARD_FN_MAP['F6']=6;
    KEYBOARD_FN_MAP['ArrowLeft']=5; KEYBOARD_FN_MAP['ArrowRight']=6;
  }

  // Apply the paired theme for a layout (unless user has overridden or
  // auto-switch is disabled).
  function applyPairedTheme(model) {
    if (!getThemeAutoSwitch()) return;
    const defaults = LAYOUT_THEMES[model] || LAYOUT_THEMES[61];
    const keysOvr = getLayoutThemeOverride(model, 'keys');
    const lcdOvr  = getLayoutThemeOverride(model, 'lcd');
    applyKeysTheme(keysOvr || defaults[0]);
    applyLcdTheme(lcdOvr  || defaults[1]);
  }

  function applyDocsPairedTheme(model) {
    const defaults = DOCS_LAYOUT_THEMES[model] || DOCS_LAYOUT_THEMES[61];
    const keysOvr = getLayoutThemeOverride(model, 'keys');
    const lcdOvr  = getLayoutThemeOverride(model, 'lcd');
    applyKeysTheme(keysOvr || defaults[0]);
    applyLcdTheme(lcdOvr  || defaults[1]);
  }

  // Central handler for layout changes.  Called when the tick loop
  // detects that r47.calc_model() returned a new value.
  window.onModelChange = function(model) {
    reclassifyShiftKeys();
    reclassifyNavKeys();
    refreshKeyLabels();
    rebuildLetterLabels();
    rebuildTooltips();
    rebuildKeyboardBindings();
    if (IS_DOCS) {
      applyDocsPairedTheme(model);
    } else {
      applyPairedTheme(model);
      try { localStorage.setItem(LAYOUT_KEY, String(model)); } catch (_) {}
    }
  }

  // Run initial classification now that the engine is booted.
  reclassifyShiftKeys();
  reclassifyNavKeys();
  rebuildLetterLabels();
  rebuildTooltips();



  // 3. Wire input. pointerdown/pointerup map 1:1 to btnPressed/btnReleased.

  // Auto-close all popups (tape, theme picker, files, etc.) when the
  // user taps the calculator keys or LCD.
  function dismissPopups() {
    if (!printerEl.hidden) printerEl.hidden = true;
    if (!themeModal.hidden) themeModal.hidden = true;
    const fm = document.getElementById('files-modal');
    if (fm && !fm.hidden) fm.hidden = true;
    const pm = document.getElementById('preview-modal');
    if (pm && !pm.hidden) pm.hidden = true;
    const nm = document.getElementById('name-modal');
    if (nm && !nm.hidden) nm.hidden = true;
    const sm = document.getElementById('settings-modal');
    if (sm && !sm.hidden) sm.hidden = true;
  }

  // Dismiss popups or open settings on LCD tap.
  const lcdCanvas = document.getElementById('lcd');
  const lcdFrame  = document.getElementById('lcd-frame');
  
  function onLcdClick(e) {
    const rect = lcdCanvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const scaleY = 240 / rect.height;
    const canvasY = y * scaleY;
    if (canvasY < 30) {
      openSettingsModal();
    } else {
      dismissPopups();
    }
  }
  
  lcdCanvas.addEventListener('click', onLcdClick);
  if (lcdFrame) lcdFrame.addEventListener('click', onLcdClick);

  function shouldForceRefreshOnRelease(fn, idx) {
    // Skip forced LCD redraw for shift keys (their underline overlay
    // would blink). All other keys get the refresh.  Driven by the
    // engine so it works across layouts (C47 shift at idx 27, etc.).
    if (fn) return true;
    return r47.key_shift_type(idx) === 0;
  }

  // Long-press state for the currently held key.  iOS (and some Android
  // browsers) can fire pointercancel mid-hold when touch-action is not
  // "none", or when the OS takes over the touch for a system gesture.
  // To ensure the WASM engine sees the full hold duration needed for
  // long-press actions (e.g. EXIT → MyMenu), we keep the key pressed in
  // the engine until our JS timer confirms the threshold has been met.
  let _lpState = null;
  const LP_MS          = 650; // pointercancel recovery: keep key held until this ms

  function _releaseKey(state) {
    if (!state || state.released) return;
    state.released = true;
    clearTimeout(state.timer);
    state.btn.classList.remove('pressed');
    if (state.fn) { r47.fn_key(-state.idx, 1); } else { r47.key(state.idx, 1); }
    if (shouldForceRefreshOnRelease(state.fn, state.idx)) { r47.force_refresh(); }
    debouncedAutoSave();
  }

  function keyEvt(ev) {
    const btn = ev.target.closest('.key');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const fn  = btn.dataset.fn === '1';

    if (ev.type === 'pointerdown') {
      // Release any stale held state (safety: should not happen normally)
      if (_lpState && !_lpState.released) _releaseKey(_lpState);
      _lpState = null;

      dismissPopups();
      btn.classList.add('pressed');
      btn.setPointerCapture?.(ev.pointerId);
      const hapticEnabled = (window.Module && window.Module.hapticEnabled !== undefined) ? window.Module.hapticEnabled : true;
      const hapticHifi = (window.Module && window.Module.hapticHifi !== undefined) ? window.Module.hapticHifi : true;
      const intensity = (window.Module && window.Module.hapticIntensity !== undefined) ? Number(window.Module.hapticIntensity) : 180;
      const duration = Math.round(intensity / 255 * 20); 
      
      if (hapticEnabled) {
        try {
          if (navigator.vibrate) {
            if (hapticHifi) {
              navigator.vibrate([duration, 10, duration]);
            } else {
              navigator.vibrate(duration);
            }
          }
        } catch (e) { /* ignore */ }
      }

      // idx is -1..-6 for fn keys (F1..F6); r47_fn_key expects 1..6.
      if (fn) { r47.fn_key(-idx, 0); } else { r47.key(idx, 0); }

      const state = { idx, fn, btn, t0: Date.now(), released: false, timer: null };
      _lpState = state;

    } else if (ev.type === 'pointerup') {
      _releaseKey(_lpState);
      _lpState = null;

    } else if (ev.type === 'pointercancel') {
      // Don't release immediately — keep the key held in the engine until
      // LP_MS has elapsed from pointerdown so the engine can register a
      // long-press if that's what the user intended.
      if (!_lpState || _lpState.released) return;
      const held = Date.now() - _lpState.t0;
      if (held >= LP_MS) {
        // Threshold already met — release now.
        _releaseKey(_lpState);
        _lpState = null;
      } else {
        // Remove visual 'pressed' state but keep key held in engine.
        btn.classList.remove('pressed');
        const state = _lpState;
        state.timer = setTimeout(() => {
          _releaseKey(state);
          if (_lpState === state) _lpState = null;
        }, LP_MS - held);
      }
    }
  }
  keysEl.addEventListener('pointerdown', keyEvt);
  keysEl.addEventListener('pointerup',   keyEvt);
  keysEl.addEventListener('pointercancel', keyEvt);
  keysEl.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard shortcuts: mirror pointer events so desktop users can type.
  // Suppress when ANY modal/panel is visible OR focus is in a text input
  // so the user's typing goes to the form field instead of the calculator.
  function kbdActive() {
    const filesModal   = document.getElementById('files-modal');
    const nameModal    = document.getElementById('name-modal');
    const previewModal = document.getElementById('preview-modal');
    const themeModal   = document.getElementById('theme-modal');
    const printerEl    = document.getElementById('printer');
    const settingsModal = document.getElementById('settings-modal');
    if (themeModal   && !themeModal.hidden)   return false;
    if (printerEl    && !printerEl.hidden)    return false;
    if (filesModal   && !filesModal.hidden)   return false;
    if (nameModal    && !nameModal.hidden)    return false;
    if (previewModal && !previewModal.hidden) return false;
    if (settingsModal && !settingsModal.hidden) return false;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return false;
    return true;
  }
  document.addEventListener('keydown', (ev) => {
    if (!kbdActive()) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (window.audioCtx.state === 'suspended') {
        window.audioCtx.resume();
    }

    let btn = null, isFn = false, idx;
    const fnNum = KEYBOARD_FN_MAP[ev.key];
    if (fnNum !== undefined) {
      btn = keyBtnByIdx.get(-fnNum); isFn = true;
    } else if (KEYBOARD_MAP[ev.key] !== undefined) {
      idx = KEYBOARD_MAP[ev.key];
      btn = keyBtnByIdx.get(idx);
    }
    if (!btn) return;
    ev.preventDefault();
    btn.classList.add('pressed');
    if (!r47) return;
    if (isFn) { r47.fn_key(fnNum, 0); } else { r47.key(idx, 0); }
  });
  document.addEventListener('keyup', (ev) => {
    if (!kbdActive() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    let btn = null, isFn = false, idx;
    const fnNum = KEYBOARD_FN_MAP[ev.key];
    if (fnNum !== undefined) {
      btn = keyBtnByIdx.get(-fnNum); isFn = true;
    } else if (KEYBOARD_MAP[ev.key] !== undefined) {
      idx = KEYBOARD_MAP[ev.key];
      btn = keyBtnByIdx.get(idx);
    }
    if (!btn) return;
    ev.preventDefault();
    btn.classList.remove('pressed');
    if (!r47) return;
    if (isFn) { r47.fn_key(fnNum, 1); } else { r47.key(idx, 1); }
    if (shouldForceRefreshOnRelease(isFn, idx)) {
      r47.force_refresh();
    }
    debouncedAutoSave();
  });
}

  // 4. rAF render loop. r47_tick pumps internal timers; then we blit the
  //    400×240 screen buffer from wasm memory into the canvas.
  //    Layout from src/c47-gtk/hal/lcd.c:LCD_write_line - the buffer is
  //    drawn BOTTOM-UP and each scanline is written MSB-last (x is
  //    mirrored). We undo both transforms here.
  const lcd = document.getElementById('lcd');
  ctx = lcd.getContext('2d', { alpha: false });
  const imgData = ctx.createImageData(400, 240);
  let lastSampleTag = '';
  let frameCount = 0;
  let lastUserMode = -1;        // sentinel to force refresh on first frame
  let lastCalcModel = -1;       // sentinel to detect layout changes
  let lastShiftState = -1;      // sentinel for shift-button glow
  let lastLabelRefreshMs = 0;
  let lastSoftkeyRefreshMs = 0;
  let tickInProgress = false;

  function drawScreen(nowMs) {
    // Detect layout change (g->KEYS menu or state restore).
    const cm = r47.calc_model();
    if (cm !== lastCalcModel) {
      lastCalcModel = cm;
      if (window.onModelChange) window.onModelChange(cm);
    }

    // CM_ASSIGN visual feedback: pulse all assignable keys while the engine
    // waits for a key press to complete an assignment (CM_ASSIGN = 4).
    const am = r47.get_calc_mode() === 4 ? '1' : '';
    if (document.documentElement.dataset.assignMode !== am)
      document.documentElement.dataset.assignMode = am;

    // Shift-state visual feedback: light up the active shift button.
    const ss = r47.shift_state();
    if (ss !== lastShiftState) {
      lastShiftState = ss;
      document.documentElement.dataset.shiftState =
        ss === 1 ? 'f' : ss === 2 ? 'g' : '';
    }

    // Refresh button labels when USER mode flips (cheap getter check
    // every frame), and as a safety net every 500 ms in case an ASN
    // edit happened while in USER mode (so the assignment text shows
    // even though FLAG_USER itself didn't toggle).
    const um = r47.user_mode();
    if (um !== lastUserMode || (nowMs - lastLabelRefreshMs) > 500) {
      lastUserMode = um;
      lastLabelRefreshMs = nowMs;
      if (window.refreshKeyLabels) window.refreshKeyLabels();
    }

    // Publish softkey labels + current menu ID as data attributes on the
    // keys container every ~200 ms. The docs-page observer (calc.js) reads
    // these to keep its navigation panel in sync with the actual calc state
    // without needing any shared global.
    if ((nowMs - lastSoftkeyRefreshMs) > 200) {
      lastSoftkeyRefreshMs = nowMs;
      // Only write when a value actually changed — redundant writes
      // still fire MutationObservers on the docs side, which would
      // re-render the panel every 200 ms and make hover flicker.
      const menuId     = String(r47.menu_id());
      const menuOffset = String(r47.softmenu_offset());
      if (keysEl.dataset.menuId     !== menuId)     keysEl.dataset.menuId     = menuId;
      if (keysEl.dataset.menuOffset !== menuOffset) keysEl.dataset.menuOffset = menuOffset;
      for (let f = 1; f <= 6; f++) {
        const key = 'fkey' + f;
        const lbl = r47.softkey_label(f) || '';
        if (keysEl.dataset[key] !== lbl) keysEl.dataset[key] = lbl;
      }
    }

    const ptr    = r47.screen_ptr();
    const stride = r47.screen_stride();
    if (ptr && stride) {
      // Re-fetch the typed-array views each frame in case WASM memory grew.
      const src32 = new Uint32Array(window.Module.HEAPU8.buffer, ptr, 400*240);
      const dst   = imgData.data;
      // screenData is laid out top-down, left-to-right already - the
      // quirky LCD_write_line offset arithmetic in hal/lcd.c cancels out.
      // Each pixel is RGB24 in a uint32: 0x00RRGGBB (A byte is 0).  The
      // engine produces grayscale (R=G=B) ranging from 0x30 (ON, dark)
      // to 0xe0 (OFF, light); we linearly remap this span onto the
      // active theme's LCD fg/bg colors so the display matches the
      // surrounding skin.
      const lb = LCD_REMAP.bg, lf = LCD_REMAP.fg;
      const ON = 0x30, OFF = 0xe0, SPAN = OFF - ON;
      for (let i = 0, j = 0; i < 400*240; i++, j += 4) {
        const g = (src32[i] >> 8) & 0xff;
        const tt = g <= ON ? 0 : g >= OFF ? 1 : (g - ON) / SPAN;
        dst[j  ] = (lf[0] + (lb[0] - lf[0]) * tt) | 0;
        dst[j+1] = (lf[1] + (lb[1] - lf[1]) * tt) | 0;
        dst[j+2] = (lf[2] + (lb[2] - lf[2]) * tt) | 0;
        dst[j+3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      if (lastSampleTag !== 'sampled') {
        const s1 = src32[10 * stride + 200];
        const s2 = src32[120 * stride + 200];
        if (s1 !== 0 || s2 !== 0) {
          lastSampleTag = 'sampled';
          // dbg('pixel@(200,10)=0x' + s1.toString(16)
          //      + '  (200,120)=0x' + s2.toString(16));

        }
      }
    }
  }

  function frame(nowMs) {
    frameCount++;
    // if (DEBUG && frameCount % 60 === 0) dbg('frame #' + frameCount);

    
    if (!tickInProgress) {
      tickInProgress = true;
      if (!r47) {
        tickInProgress = false;
        requestAnimationFrame(frame);
        return;
      }
      let tickResult = r47.tick(nowMs);
      if (tickResult && tickResult.then) {
        tickResult.then(() => {
          tickInProgress = false;
        });
      } else {
        tickInProgress = false;
      }
    }
    
    drawScreen(nowMs);
    
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 5. Viewport scaling.
  fitScale();
  applyLcdRenderMode();
  window.addEventListener('resize',  fitScale);
  window.addEventListener('orientationchange', fitScale);
  // iPhone PWA standalone mode resizes the visible area when the
  // keyboard hides / rotation changes — hook that too.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitScale);
  }
  // Allow the calculator explorer parent frame to set the device scale
  // directly. The parent resizes the iframe element and computes the
  // correct CSS values itself (mirroring fitScale logic), then sends them
  // here so we apply them without depending on stale visualViewport state.
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.type === 'r47-apply-scale') {
      const d = ev.data;
      document.documentElement.style.setProperty('--device-scale',    d.deviceScale);
      document.documentElement.style.setProperty('--device-left',     d.deviceLeft  + 'px');
      document.documentElement.style.setProperty('--device-top',      d.deviceTop   + 'px');
      document.documentElement.style.setProperty('--device-top-edge', '0px');
      document.documentElement.dataset.fillWidth = '0';
    }
  });

  // 6. Toolbar wiring (printer tape + backup).  Phase 4/5 implementations
  //    are light stubs; we'll flesh them out with IDBFS.
  const printerEl = document.getElementById('printer');
  const tapeEl    = document.getElementById('printer-tape');
  window.r47Printer = {
    appendLine(s) {
      if (!tapeEl) return;
      tapeEl.textContent += (s || '') + '\n';
      tapeEl.scrollTop = tapeEl.scrollHeight;
    },
    // Raw write (no trailing newline). Used by the engine's
    // export_append_line() on WASM builds to tee CSV output into the tape.
    write(s) {
      if (!tapeEl) return;
      tapeEl.textContent += (s || '');
      tapeEl.scrollTop = tapeEl.scrollHeight;
    },
    clear()  { if (tapeEl) tapeEl.textContent = ''; },
    text()   { return tapeEl ? tapeEl.textContent : ''; },
  };
  // Route engine show_warning() calls (src/c47-web/hal/io.c:show_warning)
  // into the tape so the user actually sees them instead of them getting
  // lost in the browser console.
  window.r47Warn = (s) => {
    if (!s) return;
    window.r47Printer.appendLine('\u26A0 ' + s.replace(/\n+$/, ''));
    console.warn('[R47]', s);
  };
  const tbPrinter = document.getElementById('tb-printer');
  if (tbPrinter) tbPrinter.addEventListener('click', () => {
    const printerEl = document.getElementById('printer');
    if (printerEl) printerEl.hidden = !printerEl.hidden;
  });

  // Theme picker: reused for both the calculator body and the LCD.
  const themeModal = document.getElementById('theme-modal');
  const themeTitle = document.getElementById('theme-title');
  const themeControls = document.getElementById('theme-controls');
  const themeControlsKeys = document.getElementById('theme-controls-keys');
  const themeGrid  = document.getElementById('theme-grid');
  const lcdSmoothInput = document.getElementById('theme-lcd-smooth');
  if (lcdSmoothInput) lcdSmoothInput.checked = currentLcdSmooth;
  if (lcdSmoothInput) lcdSmoothInput.addEventListener('change', () => {
    currentLcdSmooth = lcdSmoothInput.checked;
    try { localStorage.setItem(LCD_SMOOTH_KEY, currentLcdSmooth ? '1' : '0'); } catch (_) {}
    applyLcdRenderMode();
  });
  const FILL_SCREEN_KEY = 'r47-fill-screen';
  const fillScreenInput = document.getElementById('theme-fill-screen');
  let fillScreen = false;
  try { fillScreen = localStorage.getItem(FILL_SCREEN_KEY) === '1'; } catch (_) {}
  if (fillScreenInput) fillScreenInput.checked = fillScreen;
  if (fillScreenInput) fillScreenInput.addEventListener('change', () => {
    fillScreen = fillScreenInput.checked;
    try { localStorage.setItem(FILL_SCREEN_KEY, fillScreen ? '1' : '0'); } catch (_) {}
    fitScale();
  });
  const HAPTIC_KEY = 'r47-haptic';
  const hapticInput = document.getElementById('theme-haptic');
  const hapticSupported = typeof navigator.vibrate === 'function';
  let hapticEnabled = true;
  if (hapticSupported && hapticInput) {
    try {
      const stored = localStorage.getItem(HAPTIC_KEY);
      if (stored !== null) hapticEnabled = stored === '1';
    } catch (_) {}
    hapticInput.checked = hapticEnabled;
    hapticInput.addEventListener('change', () => {
      hapticEnabled = hapticInput.checked;
      try { localStorage.setItem(HAPTIC_KEY, hapticEnabled ? '1' : '0'); } catch (_) {}
    });
  } else {
    hapticEnabled = false;
    if (hapticInput) hapticInput.closest('label')?.setAttribute('hidden', '');
  }
  function buildThemeGrid(target) {
    const current = target === 'lcd' ? currentLcdTheme : currentKeysTheme;
    themeTitle.textContent = target === 'lcd' ? 'Choose an LCD theme' : 'Choose a keys theme';
    themeControls.hidden = target !== 'lcd';
    themeControlsKeys.hidden = target !== 'keys' || !hapticSupported;
    lcdSmoothInput.checked = currentLcdSmooth;
    themeGrid.innerHTML = '';
    for (const t of THEMES) {
      const [id, name, kind, sw] = t;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'theme-tile' + (id === current ? ' selected' : '');
      tile.dataset.id = id;
      tile.innerHTML =
        '<span class="theme-swatch">' +
          '<span style="background:' + sw[0] + '"></span>' +
          '<span style="background:' + sw[1] + '"></span>' +
          '<span style="background:' + sw[2] + '"></span>' +
          '<span style="background:' + sw[3] + '"></span>' +
        '</span>' +
        '<span><span class="theme-name">' + name + '</span>' +
        '<br><span class="theme-kind">' + kind + '</span></span>';
      tile.addEventListener('click', () => {
        if (target === 'lcd') applyLcdTheme(id);
        else applyKeysTheme(id);
        // Save per-layout override so switching back to this layout
        // restores the user's manual choice.
        if (getThemeAutoSwitch()) {
          const model = r47.calc_model();
          saveLayoutThemeOverride(model, target, id);
        }
        // Update selected indicator without closing — let the user
        // preview themes live and close when done.
        themeGrid.querySelector('.theme-tile.selected')
                 ?.classList.remove('selected');
        tile.classList.add('selected');
      });
      themeGrid.appendChild(tile);
    }
  }
  // Removed listeners for removed toolbar buttons to prevent crashes.
  document.getElementById('theme-close').addEventListener('click', () => {
    themeModal.hidden = true;
  });
  themeModal.querySelector('.theme-backdrop').addEventListener('click', () => {
    themeModal.hidden = true;
  });
  document.getElementById('printer-close').addEventListener('click', () => {
    printerEl.hidden = true;
  });
  document.getElementById('printer-clear').addEventListener('click', () => window.r47Printer.clear());
  document.getElementById('printer-dl-txt').addEventListener('click', () => {
    downloadBlob(new Blob([window.r47Printer.text()], { type: 'text/plain' }), 'r47-tape.txt');
  });
  document.getElementById('printer-dl-rtf').addEventListener('click', () => {
    const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Courier New;}}\\f0 ' +
                window.r47Printer.text().replace(/\\/g,'\\\\').replace(/\n/g,'\\par ') + '}';
    downloadBlob(new Blob([rtf], { type: 'application/rtf' }), 'r47-tape.rtf');
  });

  // Minimal ZIP encoder (STORE method only - no compression). Good enough
  // for the few-KB state/program files and avoids a deps dependency.
  function makeZip(entries) {
    // entries: [{name, bytes}]
    const te = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    // CRC-32 lookup.
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    const crc32 = (buf) => {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };

    for (const e of entries) {
      const nameB = te.encode(e.name);
      const data  = e.bytes;
      const crc   = crc32(data);
      const size  = data.length;
      // Local file header
      const lh = new Uint8Array(30 + nameB.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);  // sig
      dv.setUint16(4, 20, true);           // version
      dv.setUint16(6, 0, true);            // flags
      dv.setUint16(8, 0, true);            // method=STORE
      dv.setUint16(10, 0, true);           // time
      dv.setUint16(12, 0, true);           // date
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);        // csize
      dv.setUint32(22, size, true);        // usize
      dv.setUint16(26, nameB.length, true);
      dv.setUint16(28, 0, true);           // extra
      lh.set(nameB, 30);
      chunks.push(lh, data);
      // Central dir entry
      const cd = new Uint8Array(46 + nameB.length);
      const dv2 = new DataView(cd.buffer);
      dv2.setUint32(0, 0x02014b50, true);
      dv2.setUint16(4, 20, true);   // version made
      dv2.setUint16(6, 20, true);   // version needed
      dv2.setUint16(8, 0, true);    // flags
      dv2.setUint16(10, 0, true);   // method
      dv2.setUint16(12, 0, true);   // time
      dv2.setUint16(14, 0, true);   // date
      dv2.setUint32(16, crc, true);
      dv2.setUint32(20, size, true);
      dv2.setUint32(24, size, true);
      dv2.setUint16(28, nameB.length, true);
      dv2.setUint16(30, 0, true);   // extra
      dv2.setUint16(32, 0, true);   // comment len
      dv2.setUint16(34, 0, true);   // disk num
      dv2.setUint16(36, 0, true);   // int attrs
      dv2.setUint32(38, 0, true);   // ext attrs
      dv2.setUint32(42, offset, true);
      cd.set(nameB, 46);
      central.push(cd);
      offset += lh.length + data.length;
    }
    const cdStart = offset;
    let cdSize = 0;
    for (const c of central) { chunks.push(c); cdSize += c.length; }
    // End of central directory
    const eocd = new Uint8Array(22);
    const dv3 = new DataView(eocd.buffer);
    dv3.setUint32(0, 0x06054b50, true);
    dv3.setUint16(4, 0, true);
    dv3.setUint16(6, 0, true);
    dv3.setUint16(8, entries.length, true);
    dv3.setUint16(10, entries.length, true);
    dv3.setUint32(12, cdSize, true);
    dv3.setUint32(16, cdStart, true);
    dv3.setUint16(20, 0, true);
    chunks.push(eocd);
    return new Blob(chunks, { type: 'application/zip' });
  }

  function walkPersist() {
    const out = [];
    function walk(dir, prefix) {
      const entries = mod.FS.readdir(dir).filter(n => n !== '.' && n !== '..');
      for (const name of entries) {
        const full = dir + '/' + name;
        const stat = mod.FS.stat(full);
        if (mod.FS.isFile(stat.mode)) {
          const bytes = mod.FS.readFile(full);
          out.push({ name: (prefix ? prefix + '/' : '') + name, bytes });
        } else if (mod.FS.isDir(stat.mode)) {
          walk(full, prefix ? prefix + '/' + name : name);
        }
      }
    }
    try { walk('/persist', ''); } catch (e) { dbg('walkPersist: ' + e); }
    return out;
  }

  // ---------- Files modal (Programs / States) -----------------------------
  // Browse, load, save, download, delete files in /persist/PROGRAMS/ and
  // /persist/STATE/. Satisfies the engine's filename-prompt flow for the
  // commands that can't use a fixed path (READP, WRITEP, EXPORTP, SAVEST,
  // LOADST).
  const FILES = {
    // loadExts: only files with these extensions are loadable by the engine
    //   and therefore shown in the list. .txt listings and .rtf exports
    //   sit alongside in IDBFS but aren't engine-loadable, so they're
    //   hidden from the picker (still accessible via the bulk Backup ZIP).
    programs: { dir: '/persist/PROGRAMS', ext: '.p47', loadExts: ['.p47'], recursive: false, emptyHint: 'No programs saved. Click "+ Save current" to write the current program, or "Upload" to add a .p47 file from your device.' },
    states:   { dir: '/persist/STATE',    ext: '.s47', loadExts: ['.s47'], recursive: false, emptyHint: 'No state files saved. Click "+ Save current" to snapshot now, or "Upload" to add a .s47 file from your device.' },
    // Exports tab: text dumps written by PRX / PRSTK / PRREG / PRALPHA etc.
    // (via export_append_line in c47Extensions/graphText.c). They land at
    // /persist/ root with timestamped names like 20260414-160000.REGS.TSV.
    // Click a row to preview in-app; ↓ downloads; × deletes.
    exports:  { dir: '/persist',          loadExts: ['.tsv','.csv','.log','.txt'], recursive: false, rootOnly: true, emptyHint: 'No exports yet. Use PRX / PRSTK / PRREG from the PRINT menu (g+0 → ↓ → F6) to dump registers to .TSV files.' },
  };
  let filesTab = 'programs';

  const toolbarVersionEl = document.getElementById('toolbar-version');
  if (toolbarVersionEl) toolbarVersionEl.textContent = WEB_VERSION;

  function listFiles(kind) {
    const cfg = FILES[kind];
    try { mod.FS.mkdir(cfg.dir); } catch (e) { /* exists */ }
    let names = [];
    try { names = mod.FS.readdir(cfg.dir).filter(n => n !== '.' && n !== '..'); }
    catch (e) { return []; }
    const out = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (!cfg.loadExts.some(e => lower.endsWith(e))) continue;  // hide non-loadable
      try {
        const st = mod.FS.stat(cfg.dir + '/' + name);
        if (!mod.FS.isFile(st.mode)) continue;
        out.push({ name, size: st.size });
      } catch (e) { /* skip */ }
    }
    // Exports: newest first so a fresh dump is at the top.
    if (kind === 'exports') out.sort((a, b) => b.name.localeCompare(a.name));
    else                    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function humanBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
    return (n/1024/1024).toFixed(1) + ' MB';
  }



  // ---------- Preview modal (Exports tab: view .tsv/.csv/.log inline) ----
  function previewFileFromPersist(path, filename) {
    let bytes;
    try { bytes = mod.FS.readFile(path); }
    catch (e) { alert('Cannot read file: ' + e.message); return; }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    document.getElementById('preview-title').textContent = filename;
    document.getElementById('preview-body').textContent  = text;
    document.getElementById('preview-modal').hidden = false;
    document.getElementById('preview-download').onclick = () => {
      downloadBlob(bytes, filename);
    };
  }
  document.getElementById('preview-close').addEventListener('click', () => {
    document.getElementById('preview-modal').hidden = true;
  });
  document.querySelector('#preview-modal .files-backdrop').addEventListener('click', () => {
    document.getElementById('preview-modal').hidden = true;
  });

  // Peek the header of a .s47 state file (at /persist/STATE/<name>) and
  // return 'R47' | 'C47' | null (unknown/unreadable). The header line
  // written by doSave() at saveRestoreCalcState.c:1748-1751 is either
  // 'R47_save_file_00' or 'C47_save_file_00' starting from byte 20
  // (after the preceding SAVE_FILE_REVISION line); we just scan the
  // first 64 bytes for either marker, which is cheap and robust to
  // minor header-format drift.
  function peekStateFamily(name) {
    try {
      const bytes = mod.FS.readFile('/persist/STATE/' + name);
      const head  = new TextDecoder('utf-8', { fatal: false })
                      .decode(bytes.subarray(0, Math.min(bytes.length, 128)));
      if (head.indexOf('R47_save_file_') !== -1) return 'R47';
      if (head.indexOf('C47_save_file_') !== -1) return 'C47';
      return null;
    } catch (_) {
      return null;
    }
  }

  function loadSelectedFile(name) {
    if (filesTab === 'programs') {
      r47.load_program(name);
      document.getElementById('files-modal').hidden = true;
      return;
    }
    // States: catch cross-family mismatches before the engine tries to
    // parse the file and surfaces an opaque "bad save format" error.
    // See docsmd/firmwarekeys.md §8d.
    const fileFam = peekStateFamily(name);
    const liveFam = calcFamilyName();
    // DM42 shares the C47 save format (C47 binary writes both), so
    // collapse DM42 to C47 for the comparison.
    const liveFamForSave = (liveFam === 'DM42') ? 'C47' : liveFam;
    if (fileFam && fileFam !== liveFamForSave) {
      const msg =
        'This state file was saved from ' + fileFam + '. '
      + 'You are currently in ' + liveFam + '.\n\n'
      + 'State files are not cross-family compatible. Switch to ' + fileFam
      + ' first via the KEYS menu (reload may be required) and try again, '
      + 'or pick a ' + liveFamForSave + ' state file.';
      alert(msg);
      return;
    }
    r47.load_state(name);
    document.getElementById('files-modal').hidden = true;
  }

  function downloadFileFromPersist(path, filename) {
    let bytes;
    try { bytes = mod.FS.readFile(path); }
    catch (e) { alert('Cannot read file: ' + e.message); return; }
    downloadBlob(bytes, filename);
  }



  function openSettingsModal() {
    const sm = document.getElementById('settings-modal');
    if (sm) {
      sm.hidden = false;
      // Populate status
      const status = document.getElementById('work-directory-status');
      if (status) {
        status.textContent = window.workDirHandle ? window.workDirHandle.name : 'Not selected';
      }
    }
  }
  // Removed listener for removed toolbar button to prevent crashes.
  document.getElementById('files-close').addEventListener('click', () => {
    document.getElementById('files-modal').hidden = true;
  });
  document.querySelector('#files-modal .files-backdrop').addEventListener('click', () => {
    document.getElementById('files-modal').hidden = true;
  });

  document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('settings-modal').hidden = true;
  });
  document.querySelector('#settings-modal .files-backdrop').addEventListener('click', () => {
    document.getElementById('settings-modal').hidden = true;
  });
  document.getElementById('work-directory-btn').addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker();
      localStorage.setItem('work-directory-selected', 'true');
      document.getElementById('work-directory-status').textContent = handle.name;
      await handleDirectorySelection(handle);
    } catch (err) {
      dbg("Directory picker failed: " + err.message);
    }
  });


  function downloadFileFromFS(path, suggestedName) {
    try {
      const data = mod.FS.readFile(path);
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
  }  // Append the correct extension if the user didn't type one.
  function ensureExt(name, ext) {
    if (!name) return name;
    const lower = name.toLowerCase();
    if (lower.endsWith(ext.toLowerCase())) return name;
    // Accept .rtf for programs too (EXPORTP writes RTF).
    if (ext === '.p47' && lower.endsWith('.rtf')) return name;
    return name + ext;
  }



  // ---------- HAL -> UI bridge --------------------------------------------
  // Called synchronously from src/c47-web/hal/io.c (_request_file_from_ui)
  // when the user presses a keypad command that needs a filename (READP,
  // WRITEP, LOADST, SAVEST, EXPORTP) but no name has been staged. We open
  // the appropriate picker/prompt modal; on confirm, we re-invoke the
  // operation via the r47_*_named() exports — those set the save-name and
  // re-enter the engine, which now resolves the path successfully.
  window.r47RequestFile = async (kind) => {
    switch (kind) {
      case 'load-program': {
        if (window.workDirHandle) {
          try {
            const subHandle = await getSubfolderHandle('PROGRAMS');
            const [fileHandle] = await window.showOpenFilePicker({
              startIn: subHandle,
              types: [{
                description: 'R47 Program',
                accept: { 'application/octet-stream': ['.p47', '.rtf'] }
              }]
            });
            const file = await fileHandle.getFile();
            const bytes = new Uint8Array(await file.arrayBuffer());
            mod.FS.writeFile('/persist/PROGRAMS/' + file.name, bytes);
            await new Promise(resolve => mod.FS.syncfs(false, resolve));
            r47.load_program(file.name);
            return;
          } catch (e) {
            console.error("File picker failed:", e);
            // Fallback to modal if canceled or error
          }
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.p47';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const buffer = await file.arrayBuffer();
          const data = new Uint8Array(buffer);
          mod.FS.writeFile('/persist/PROGRAMS/' + file.name, data);
          await new Promise(resolve => mod.FS.syncfs(false, resolve));
          r47.load_program(file.name);
        };
        input.click();
        break;
      }
      case 'load-state': {
        if (window.workDirHandle) {
          try {
            const subHandle = await getSubfolderHandle('STATE');
            const [fileHandle] = await window.showOpenFilePicker({
              startIn: subHandle,
              types: [{
                description: 'R47 State',
                accept: { 'application/octet-stream': ['.s47'] }
              }]
            });
            const file = await fileHandle.getFile();
            const bytes = new Uint8Array(await file.arrayBuffer());
            mod.FS.writeFile('/persist/STATE/' + file.name, bytes);
            await new Promise(resolve => mod.FS.syncfs(false, resolve));
            r47.load_state(file.name);
            return;
          } catch (e) {
            console.error("File picker failed:", e);
            // Fallback to modal
          }
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.s47';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const buffer = await file.arrayBuffer();
          const data = new Uint8Array(buffer);
          mod.FS.writeFile('/persist/STATE/' + file.name, data);
          await new Promise(resolve => mod.FS.syncfs(false, resolve));
          r47.load_state(file.name);
        };
        input.click();
        break;
      }
      case 'save-program': {
        let name = 'mypgm.p47';
        try {
          const currentProgNum = r47.current_program_number();
          const progLabel = r47.program_label_at(currentProgNum);
          if (progLabel && progLabel.trim() !== '') {
            name = progLabel.trim() + '.p47';
          }
        } catch (e) {
          console.warn("Failed to get program name from engine:", e);
        }
        if (window.workDirHandle) {
          try {
            const subHandle = await getSubfolderHandle('PROGRAMS');
            const fileHandle = await window.showSaveFilePicker({
              startIn: subHandle,
              suggestedName: name,
              types: [{
                description: 'R47 Program',
                accept: { 'application/octet-stream': ['.p47'] }
              }]
            });
            name = fileHandle.name;
            r47.save_program(name);
            await new Promise(resolve => mod.FS.syncfs(false, resolve));
            const bytes = mod.FS.readFile('/persist/PROGRAMS/' + name);
            const writable = await fileHandle.createWritable();
            await writable.write(bytes);
            await writable.close();
            return;
          } catch (e) {
            console.error("File picker failed:", e);
            // Fallback to prompt if canceled or error
          }
        }
        name = window.prompt('Save program as:', name);
        if (!name) return;
        name = ensureExt(name, '.p47');
        r47.save_program(name);
        await new Promise(resolve => mod.FS.syncfs(false, resolve));
        downloadFileFromFS('/persist/PROGRAMS/' + name, name);
        break;
      }
      case 'save-state': {
        let name = 'mystate-' + window.calcFamilyName() + '.s47';
        if (window.workDirHandle) {

          try {
            const subHandle = await getSubfolderHandle('STATE');
            const fileHandle = await window.showSaveFilePicker({
              startIn: subHandle,
              suggestedName: name,
              types: [{
                description: 'R47 State',
                accept: { 'application/octet-stream': ['.s47'] }
              }]
            });
            name = fileHandle.name;
            r47.save_state(name);
            await new Promise(resolve => mod.FS.syncfs(false, resolve));
            const bytes = mod.FS.readFile('/persist/STATE/' + name);
            const writable = await fileHandle.createWritable();
            await writable.write(bytes);
            await writable.close();
            return;
          } catch (e) {
            console.error("File picker failed:", e);
            // Fallback
          }
        }
        name = window.prompt('Save state as:', name);
        if (!name) return;
        name = ensureExt(name, '.s47');
        r47.save_state(name);
        await new Promise(resolve => mod.FS.syncfs(false, resolve));
        downloadFileFromFS('/persist/STATE/' + name, name);
        break;
      }
      case 'export-rtf': {
        let name = 'mypgm.rtf';
        try {
          const currentProgNum = r47.current_program_number();
          const progLabel = r47.program_label_at(currentProgNum);
          if (progLabel && progLabel.trim() !== '') {
            name = progLabel.trim() + '.rtf';
          }
        } catch (e) {
          console.warn("Failed to get program name from engine:", e);
        }
        if (window.workDirHandle) {
          try {
            const subHandle = await getSubfolderHandle('PROGRAMS');
            const fileHandle = await window.showSaveFilePicker({
              startIn: subHandle,
              suggestedName: name,
              types: [{
                description: 'RTF File',
                accept: { 'text/rtf': ['.rtf'] }
              }]
            });
            name = fileHandle.name;
            r47.export_rtf(name);
            await new Promise(resolve => mod.FS.syncfs(false, resolve));
            const bytes = mod.FS.readFile('/persist/PROGRAMS/' + name);
            const writable = await fileHandle.createWritable();
            await writable.write(bytes);
            await writable.close();
            return;
          } catch (e) {
            console.error("File picker failed:", e);
            // Fallback
          }
        }
        name = window.prompt('Export program as RTF:', name);
        if (!name) return;
        const n = name.toLowerCase().endsWith('.rtf') ? name : name + '.rtf';
        r47.export_rtf(n);
        await new Promise(resolve => mod.FS.syncfs(false, resolve));
        downloadFileFromFS('/persist/PROGRAMS/' + n, n);
        break;
      }
      case 'snap-file': {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        let name = `SNAP_${timestamp}.bmp`;
        if (window.workDirHandle) {
          try {
            const subHandle = await getSubfolderHandle('SCREENS');
            const fileHandle = await window.showSaveFilePicker({
              startIn: subHandle,
              suggestedName: name,
              types: [{
                description: 'BMP Image',
                accept: { 'image/bmp': ['.bmp'] }
              }]
            });
            
            // Trigger screen dump in core to populate buffer
            mod.ccall('r47_snap_named', null, ['string'], ['SNAP.bmp'], { async: true });
            
            const ptr = mod._getSnapBufferPtr();
            const size = mod._getSnapBufferSize();
            
            if (ptr === 0 || size === 0) {
              console.error('Failed to get SNAP data from WASM');
              return;
            }
            
            const data = new Uint8Array(mod.HEAPU8.buffer, ptr, size);
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            console.log('SNAP file saved successfully via JS');
            return;
          } catch (e) {
            console.error("File picker failed:", e);
            // Fallback
          }
        }
        // Fallback: just tell engine to save to default name
        mod.ccall('r47_snap_named', null, ['string'], [name], { async: true });
        mod.FS.syncfs(false, () => {});
        break;
      }
    }
  };

  async function harvestScreenshots() {
    if (!window.workDirHandle) {
      alert('Please bind a work directory first.');
      return;
    }
    try {
      const subHandle = await getSubfolderHandle('SCREENS');
      let harvestedCount = 0;
      
      const dirsToScan = ['/', '/persist/'];
      console.log("Engine CWD:", mod.FS.cwd());
      
      for (const dir of dirsToScan) {
        try {
          const files = mod.FS.readdir(dir);
          console.log(`Files in ${dir}:`, files);
          for (const name of files) {
            if (name.startsWith('2026') && (name.endsWith('.bmp') || name.endsWith('.TSV'))) {
              const fullPath = dir + (dir.endsWith('/') ? '' : '/') + name;
              const bytes = mod.FS.readFile(fullPath);
              const fileHandle = await subHandle.getFileHandle(name, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(bytes);
              await writable.close();
              
              // Delete from virtual FS to avoid duplicates next time
              mod.FS.unlink(fullPath);
              harvestedCount++;
              console.log(`Harvested ${name} from ${dir} to physical storage.`);
            }
          }
        } catch (e) {
          // Directory might not exist or other read error
          console.warn(`Failed to scan directory ${dir}:`, e);
        }
      }
      
      if (harvestedCount > 0) {
        alert(`Successfully synced ${harvestedCount} files to SCREENS folder.`);
      } else {
        alert('No new screenshots or dumps found in engine memory.');
      }
    } catch (e) {
      console.error('Failed to harvest screenshots:', e);
      alert('Error harvesting screenshots. See console for details.');
    }
  }

  // ---------- Files modal: Upload / Download / Restore (per-tab + bulk) ----
  // The single hidden <input type=file> is reused for both per-tab single-
  // file imports and the Backup tab's ZIP import. We track which mode the
  // user clicked via importMode, then dispatch in the change handler.
  let importMode = 'single';   // 'single' or 'zip'

  function importSingleFileToPersist(file) {
    return file.arrayBuffer().then(ab => {
      const bytes = new Uint8Array(ab);
      const lower = file.name.toLowerCase();
      let dest;
      if      (lower.endsWith('.p47'))                                 dest = '/persist/PROGRAMS/' + file.name;
      else if (lower.endsWith('.s47'))                                 dest = '/persist/STATE/'    + file.name;
      else if (lower.endsWith('.rtf') || lower.endsWith('.txt'))       dest = '/persist/PROGRAMS/' + file.name;
      else if (lower.endsWith('.sav'))                                 dest = '/persist/SAVFILES/' + file.name;
      else { alert('Unrecognized extension. Use .p47, .s47, .rtf, .txt, .sav, or .zip.'); return null; }
      // Make sure parent dir exists.
      const parent = dest.substring(0, dest.lastIndexOf('/'));
      try { mod.FS.mkdir(parent); } catch (e) { /* exists */ }
      mod.FS.writeFile(dest, bytes);
      return dest;
    });
  }

  // iOS Safari's Files app picker filters by UTI, not by filename extension.
  // .p47 / .s47 have no registered UTI → they appear grayed out. To let
  // users pick them, we drop the accept= filter on iOS and validate the
  // extension in JS after the user confirms.
  const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);

  document.getElementById('files-import').addEventListener('click', () => {
    importMode = 'single';
    const inp = document.getElementById('files-import-input');
    if (IS_IOS) {
      inp.removeAttribute('accept');      // let iOS show everything
    } else {
      inp.accept = (filesTab === 'states') ? '.s47,.sav,.zip' : '.p47,.rtf,.txt,.zip';
    }
    inp.click();
  });

  document.getElementById('files-sync-screenshots').addEventListener('click', () => {
    document.getElementById('files-modal').hidden = true;
    harvestScreenshots();
  });

  document.getElementById('files-backup-dl').addEventListener('click', async () => {
    await new Promise(r => mod.FS.syncfs(false, r));
    const files = walkPersist();
    if (!files.length) { alert('Nothing to back up yet.'); return; }
    const zip = makeZip(files);
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    downloadBlob(zip, `r47-backup-${stamp}.zip`);
  });

  document.getElementById('files-backup-import').addEventListener('click', () => {
    importMode = 'zip';
    const inp = document.getElementById('files-import-input');
    if (IS_IOS) {
      inp.removeAttribute('accept');
    } else {
      inp.accept = '.zip';
    }
    inp.click();
  });

  document.getElementById('files-import-input').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    ev.target.value = '';
    if (/\.zip$/i.test(f.name)) {
      // ZIP regardless of importMode — always treated as backup restore.
      const ab = await f.arrayBuffer();
      let skipped = 0;
      try { skipped = await extractZipToPersist(new Uint8Array(ab)); }
      catch (err) { alert('Restore failed: ' + err.message); return; }
      const msg = skipped
        ? `Backup restored (${skipped} compressed entr${skipped === 1 ? 'y' : 'ies'} skipped — re-save as uncompressed ZIP to include them).\n\nReload now to activate?`
        : 'Backup restored.\n\nReload now to activate?';
      if (confirm(msg)) location.reload();

    } else {
      const dest = await importSingleFileToPersist(f);
      if (!dest) return;
      await new Promise(r => mod.FS.syncfs(false, r));

    }
  });

  // Returns the number of skipped (compressed) entries; throws on malformed ZIP.
  async function extractZipToPersist(bytes) {
    // Parse EOCD.
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65557; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid ZIP file');
    const nEntries = dv.getUint16(eocd + 10, true);
    let cd = dv.getUint32(eocd + 16, true);
    let skipped = 0;
    for (let n = 0; n < nEntries; n++) {
      if (dv.getUint32(cd, true) !== 0x02014b50) break;
      const method   = dv.getUint16(cd + 10, true);
      const csize    = dv.getUint32(cd + 20, true);
      const nameLen  = dv.getUint16(cd + 28, true);
      const extLen   = dv.getUint16(cd + 30, true);
      const cmtLen   = dv.getUint16(cd + 32, true);
      const lhOff    = dv.getUint32(cd + 42, true);
      const name     = new TextDecoder().decode(bytes.subarray(cd + 46, cd + 46 + nameLen));
      cd += 46 + nameLen + extLen + cmtLen;

      if (name.endsWith('/')) continue;
      if (method !== 0) { dbg('ZIP: "' + name + '" is compressed (method ' + method + '), skipping'); skipped++; continue; }

      const lhNameLen = dv.getUint16(lhOff + 26, true);
      const lhExtLen  = dv.getUint16(lhOff + 28, true);
      const dataStart = lhOff + 30 + lhNameLen + lhExtLen;
      const data = bytes.subarray(dataStart, dataStart + csize);

      const full = '/persist/' + name;
      const parts = full.split('/').filter(Boolean);
      let cur = '';
      for (let i = 0; i < parts.length - 1; i++) {
        cur += '/' + parts[i];
        try { mod.FS.mkdir(cur); } catch (e) { /* exists */ }
      }
      mod.FS.writeFile(full, data);
      dbg('restored: ' + full + ' (' + data.length + ' bytes)');
    }
    await new Promise(r => mod.FS.syncfs(false, r));
    return skipped;
  }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Service worker registration (offline / installable-PWA support).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e =>
      console.warn('SW register failed:', e));
  });
}

// Install-to-home-screen banner + browser-chrome hiding logic.
// On mobile browsers, installing as a PWA gives a full-screen
// no-address-bar experience because manifest.webmanifest specifies
// "display": "standalone". Show a one-time banner explaining how
// unless the user is already running as a PWA.
(function promoteInstall() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;     // iOS legacy flag

  // Add platform classes so CSS shows the right hint text.
  if (isIOS)     document.documentElement.classList.add('is-ios');
  if (isAndroid) document.documentElement.classList.add('is-android');

  if (isStandalone) return;                                    // already full-screen
  if (localStorage.getItem('r47.installDismissed') === '1') return;
  if (!isIOS && !isAndroid) return;                            // skip desktop

  const banner = document.getElementById('install-banner');
  const btn    = document.getElementById('install-btn');
  const close  = document.getElementById('install-dismiss');
  if (!banner) return;

  banner.hidden = false;

  close.addEventListener('click', () => {
    banner.hidden = true;
    localStorage.setItem('r47.installDismissed', '1');
  });

  // Chrome/Brave/Android fire beforeinstallprompt with a promise
  // we can call .prompt() on. iOS Safari does not.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.hidden = true;
  });

  // Hide-on-install.
  window.addEventListener('appinstalled', () => { banner.hidden = true; });
})();

// No scrollTo nudge needed; body is position:fixed which disables
// scrolling entirely. Browsers will still show the URL bar in
// non-standalone mode - the only way to hide it fully is Add to
// Home Screen (see #install-banner).

function autoSave() {
  dbg('Auto-saving state...');
  try {
    window.Module.ccall('saveCalc', null, []);
    window.Module.FS.syncfs(false, (err) => {
      if (err) console.error('Auto-save syncfs failed:', err);
    });
  } catch (e) {
    console.error('Auto-save failed:', e);
  }
}

let autoSaveTimeout = null;
function debouncedAutoSave() {
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    autoSave();
  }, 2000); // Save 2 seconds after last interaction
}

window.addEventListener('beforeunload', autoSave);
window.addEventListener('pagehide', autoSave);

boot().catch(e => {
  console.error('R47 boot failed:', e);
  document.body.insertAdjacentHTML('beforeend',
    '<pre style="color:red;padding:16px;">R47 boot failed: ' + (e && e.message || e) + '</pre>');
});

})();

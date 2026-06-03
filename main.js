const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

// ── Win32 FFI (Windows only) ────────────────────────────────────────────────
let keybd_event, VkKeyScanA;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
    VkKeyScanA = user32.func('int16_t __stdcall VkKeyScanA(int ch)');
  } catch (e) {
    console.warn('koffi not available – macro sending disabled', e.message);
  }
}

// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay;
let overlayReady = false;
let spawnQueued = false;

const VK_CONTROL = 0x11;
const VK_RETURN  = 0x0D;
const VK_C       = 0x43;
const VK_MENU    = 0x12; // Alt
const VK_TAB     = 0x09;
const KEYUP      = 0x0002;

function refocusPreviousApp() {
  const delayMs = 80;
  const run = () => {
    if (process.platform === 'win32') {
      if (!keybd_event) return;
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_TAB, 0, 0, 0);
      keybd_event(VK_TAB, 0, KEYUP, 0);
      keybd_event(VK_MENU, 0, KEYUP, 0);
    } else if (process.platform === 'darwin') {
      const script = [
        'tell application "System Events"',
        '  key down command',
        '  key code 48',
        '  key up command',
        'end tell',
      ].join('\n');
      execFile('osascript', ['-e', script], err => {
        if (err) console.warn('refocus previous app failed:', err.message);
      });
    }
  };
  setTimeout(run, delayMs);
}

function buildDbzTrayIcon() {
  const src = path.join(__dirname, 'icon', 'dbz-source.png');
  if (!fs.existsSync(src)) return null;
  const img = nativeImage.createFromPath(src);
  if (img.isEmpty()) return null;
  const { width: W, height: H } = img.getSize();
  const bmp = img.toBitmap(); // BGRA
  const isLogo = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 235 && mn > 210) return false;
    if (mx - mn < 30 && mx > 170) return false;
    const lum = 0.299*r + 0.587*g + 0.114*b;
    if (lum > 210 && (mx - mn) < 70) return false;
    return true;
  };

  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const b = bmp[i], g = bmp[i+1], r = bmp[i+2];
      if (isLogo(r, g, b)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad);
  maxY = Math.min(H - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y + minY) * W + (x + minX)) * 4;
      const di = (y * cw + x) * 4;
      const bb = bmp[si], gg = bmp[si+1], rr = bmp[si+2];
      if (isLogo(rr, gg, bb)) {
        out[di]     = bb;
        out[di + 1] = gg;
        out[di + 2] = rr;
        out[di + 3] = 255;
      } else {
        out[di] = out[di+1] = out[di+2] = out[di+3] = 0;
      }
    }
  }
  const cropped = nativeImage.createFromBitmap(out, { width: cw, height: ch });
  const targetH = 30;
  const targetW = Math.round(cw * (targetH / ch));
  const at1 = cropped.resize({ width: targetW, height: targetH, quality: 'best' });
  const at2 = cropped.resize({ width: targetW * 2, height: targetH * 2, quality: 'best' });
  at1.addRepresentation({ scaleFactor: 2, buffer: at2.toPNG() });
  return at1;
}

function createTrayIconFallback() {
  const p = path.join(__dirname, 'icon', 'Template.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      if (process.platform === 'darwin') img.setTemplateImage(true);
      return img;
    }
  }
  console.warn('kameha: icon/Template.png missing or invalid');
  return nativeImage.createEmpty();
}

async function tryIcnsTrayImage(icnsPath) {
  const size = { width: 64, height: 64 };
  const thumb = await nativeImage.createThumbnailFromPath(icnsPath, size);
  if (!thumb.isEmpty()) return thumb;
  return null;
}

async function getTrayIcon() {
  const iconDir = path.join(__dirname, 'icon');
  if (process.platform === 'win32') {
    const file = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    }
    return createTrayIconFallback();
  }
  if (process.platform === 'darwin') {
    const dbz = buildDbzTrayIcon();
    if (dbz) return dbz;
    const file = path.join(iconDir, 'AppIcon.icns');
    if (fs.existsSync(file)) {
      const fromPath = nativeImage.createFromPath(file);
      if (!fromPath.isEmpty()) return fromPath;
      try {
        const t = await tryIcnsTrayImage(file);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns thumbnail failed:', e?.message || e);
      }
      const tmp = path.join(os.tmpdir(), 'kameha-tray.icns');
      try {
        fs.copyFileSync(file, tmp);
        const t = await tryIcnsTrayImage(tmp);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns temp copy failed:', e?.message || e);
      }
    }
    return createTrayIconFallback();
  }
  return createTrayIconFallback();
}

// ── Overlay window ──────────────────────────────────────────────────────────
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  overlay.setAlwaysOnTop(true, 'floating');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlayReady = false;
  overlay.webContents.on('dom-ready', () => {
    overlayReady = true;
    if (spawnQueued && overlay && overlay.isVisible()) {
      spawnQueued = false;
      overlay.webContents.send('spawn-whip');
      refocusPreviousApp();
    }
  });
  overlay.webContents.on('console-message', (_e, level, message) => {
    console.log(`[overlay] ${message}`);
  });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
    spawnQueued = false;
  });
}

function toggleOverlay() {
  if (overlay && overlay.isVisible()) {
    overlay.webContents.send('drop-whip');
    return;
  }
  if (!overlay) createOverlay();
  overlay.show();
  if (overlayReady) {
    overlay.webContents.send('spawn-whip');
    refocusPreviousApp();
  } else {
    spawnQueued = true;
  }
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('show-notification', (_e, text) => {
  if (process.platform !== 'darwin') return;
  const phrase = (typeof text === 'string' ? text : '').replace(/[\\"]/g, '\\$&');
  if (!phrase) return;
  const script = `display notification "${phrase}" with title "Goku" sound name "Hero"`;
  execFile('osascript', ['-e', script], err => {
    if (err) console.warn('notification failed:', err.message);
  });
});

ipcMain.on('hide-overlay', () => {
  if (!overlay) return;
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.hide();
});

ipcMain.on('set-click-through', (_e, clickThrough) => {
  if (!overlay) return;
  if (clickThrough) overlay.setIgnoreMouseEvents(true, { forward: true });
  else overlay.setIgnoreMouseEvents(false);
});

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  tray = new Tray(await getTrayIcon());
  tray.setToolTip('Kameha — click to summon Goku');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }]));
  tray.on('click', toggleOverlay);

  globalShortcut.register('Escape', () => {
    if (overlay && overlay.isVisible()) overlay.hide();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', e => e.preventDefault());

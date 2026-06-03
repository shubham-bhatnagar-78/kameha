#!/usr/bin/env node
//
// kameha — launch the desktop Goku overlay
//
// Usage:
//   kameha           Launch the menu-bar app
//   kameha --help    Show this help
//
const path = require('path');
const { spawn } = require('child_process');

function log(msg) { process.stdout.write(`kameha: ${msg}\n`); }

const args = process.argv.slice(2);

if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
  process.stdout.write(`kameha — Goku lives on your desktop.

Usage:
  kameha           Launch the menu-bar app
  kameha --help    Show this help

Controls (once Goku is on screen):
  Click            Fire a kamehameha beam
  Hold             Charge up, release to fire full blast
  Double-click     Instant Transmission (Goku vanishes)
  Escape           Hide Goku
`);
  process.exit(0);
}

let electronBinary;
try {
  electronBinary = require('electron');
} catch (e) {
  log('Could not load Electron. Try: npm install -g kameha');
  process.exit(1);
}

const appPath = path.resolve(__dirname, '..');
const child = spawn(electronBinary, [appPath], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.on('error', err => { log(`Failed to launch: ${err.message}`); process.exit(1); });
child.unref();
log('Goku is in your menu bar. Click the icon to summon him.');

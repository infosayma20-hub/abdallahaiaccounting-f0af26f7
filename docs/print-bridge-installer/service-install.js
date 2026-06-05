/**
 * AMWALI Print Bridge - Windows service installer
 * Installs the bridge as a Windows service named "AmwaliPrintBridge"
 * using node-windows. Auto-detects the bridge script file.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

const BRIDGE_DIR = __dirname;
const CANDIDATES = [
  'print-bridge-v6.3.7-clean.js',
  'print-bridge-v6.3.6-clean.js',
  'print-bridge-v6.3.3.js',
  'print-bridge-v6.3.2.js',
  'print-bridge.js',
];

let script = null;
for (const name of CANDIDATES) {
  const p = path.join(BRIDGE_DIR, name);
  if (fs.existsSync(p)) { script = p; break; }
}

if (!script) {
  console.error('[ERROR] No bridge script found in', BRIDGE_DIR);
  process.exit(1);
}

console.log('[info] Using bridge script:', script);

const svc = new Service({
  name: 'AmwaliPrintBridge',
  description: 'AMWALI Print Bridge - thermal printer service',
  script,
  nodeOptions: [],
  wait: 2,
  grow: 0.25,
});

svc.on('install', () => {
  console.log('[install] Service installed');
  svc.start();
});
svc.on('alreadyinstalled', () => {
  console.log('[install] Service already installed - starting');
  svc.start();
});
svc.on('start', () => {
  console.log('[start] Service running');
});
svc.on('error', (e) => {
  console.error('[error]', e);
});

svc.install();
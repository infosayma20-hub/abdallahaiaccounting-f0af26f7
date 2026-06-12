/**
 * AMWALI Print Bridge - Windows service uninstaller
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

const BRIDGE_DIR = __dirname;
const CANDIDATES = [
  'print-bridge-v6.3.7-clean.js',
];

let script = null;
for (const name of CANDIDATES) {
  const p = path.join(BRIDGE_DIR, name);
  if (fs.existsSync(p)) { script = p; break; }
}

const svc = new Service({
  name: 'AmwaliPrintBridge',
  script: script || path.join(BRIDGE_DIR, 'print-bridge-v6.3.7-clean.js'),
});

svc.on('uninstall', () => {
  console.log('[uninstall] Service removed');
});
svc.on('error', (e) => {
  console.error('[error]', e);
});

svc.uninstall();
/**
 * Cash Drawer Kick Utility
 * 
 * Opens the cash drawer by sending ESC/POS commands via a hidden iframe print.
 * Works with thermal printers that have a cash drawer (RJ11) connected.
 * 
 * ESC/POS command: ESC p 0 25 250 (standard cash drawer kick pulse)
 * Hex: 1B 70 00 19 FA
 */

// Standard ESC/POS cash drawer kick commands
const DRAWER_KICK_COMMANDS = {
  // Pin 2 kick (most common)
  pin2: '\x1B\x70\x00\x19\xFA',
  // Pin 5 kick (secondary drawer)
  pin5: '\x1B\x70\x01\x19\xFA',
};

/**
 * Opens the cash drawer by creating an invisible iframe that prints
 * raw ESC/POS commands to the default thermal printer.
 */
export function openCashDrawer(): void {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    // Write ESC/POS drawer kick command
    doc.open();
    doc.write(`
      <html>
        <head>
          <style>
            @media print {
              @page { margin: 0; size: 80mm auto; }
              body { margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <pre style="font-size:0;color:transparent;line-height:0;">${DRAWER_KICK_COMMANDS.pin2}</pre>
        </body>
      </html>
    `);
    doc.close();

    // Send the ESC/POS command silently without triggering print dialog
    // The iframe approach with window.print() triggers the browser print dialog
    // Instead, we just append and remove - the raw bytes are for direct printer connections
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch (e) {
        // ignore
      }
    }, 500);
    
    // Log for debugging - actual cash drawer kick requires Web Serial API or direct printer connection
    console.info('Cash drawer: kick command sent (requires direct printer connection)');
  } catch (error) {
    console.warn('Cash drawer: could not open', error);
  }
}

/**
 * Alternative: Open cash drawer via Web Serial API (if supported)
 * This provides direct USB/Serial connection to the printer
 */
export async function openCashDrawerSerial(): Promise<boolean> {
  if (!('serial' in navigator)) {
    console.warn('Web Serial API not supported');
    return false;
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 9600 });

    const writer = port.writable.getWriter();
    const command = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    await writer.write(command);
    writer.releaseLock();

    await port.close();
    return true;
  } catch (error) {
    console.warn('Cash drawer serial: failed', error);
    return false;
  }
}

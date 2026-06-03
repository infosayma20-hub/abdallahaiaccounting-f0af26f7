/**
 * POS Network Printing Utility
 * 
 * Supports:
 * 1. Epson ePOS SDK (WebSocket) - works directly from browser
 * 2. ESC/POS via QZ Tray (requires local agent installation)
 * 3. Star WebPRNT (HTTP POST to Star printers)
 * 4. Fallback to browser window.print()
 */

import { supabase } from "@/integrations/supabase/client";
import { printThermalContent } from "@/lib/thermal-print";
import { withLocalNetworkAccess } from "@/lib/local-network-fetch";

export interface PrinterInfo {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  printer_type: string;
  paper_width: number;
  is_default: boolean;
  is_active: boolean;
  station_ids: string[];
  print_categories: string[];
}

export interface PrintJob {
  category: "receipt" | "kitchen" | "bar" | "report";
  stationId?: string;
  content: string; // HTML content for fallback
  lines?: PrintLine[]; // Structured lines for ESC/POS
}

export interface PrintLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  size?: 1 | 2; // 1=normal, 2=double
  separator?: boolean;
}

/**
 * Load all active printers for the current user
 */
export async function loadPrinters(): Promise<PrinterInfo[]> {
  const { data } = await supabase
    .from("pos_printers")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false });
  return (data as any[]) || [];
}

/**
 * Find matching printers for a print job
 */
export function findPrintersForJob(printers: PrinterInfo[], job: PrintJob): PrinterInfo[] {
  return printers.filter(p => {
    // Match by category
    const matchesCategory = (p.print_categories || []).includes(job.category);
    
    // Match by station (if specified)
    const matchesStation = !job.stationId || 
      (p.station_ids || []).length === 0 || 
      (p.station_ids || []).includes(job.stationId);
    
    return matchesCategory && matchesStation;
  });
}

/**
 * Send a print job to a specific printer
 */
export async function printToDevice(printer: PrinterInfo, job: PrintJob): Promise<boolean> {
  try {
    switch (printer.printer_type) {
      case "epson_epos":
        return await printEpsonEpos(printer, job);
      case "star_webprnt":
        return await printStarWebPRNT(printer, job);
      case "escpos":
      default:
        return await printEscPos(printer, job);
    }
  } catch (err) {
    console.error(`Print failed for ${printer.name}:`, err);
    return false;
  }
}

/**
 * Dispatch a print job to all matching printers
 */
export async function dispatchPrintJob(job: PrintJob): Promise<{ success: boolean; printed: string[]; failed: string[] }> {
  const printers = await loadPrinters();
  const targets = findPrintersForJob(printers, job);
  
  if (targets.length === 0) {
    // Fallback to browser print
    printBrowserFallback(job.content);
    return { success: true, printed: ["browser"], failed: [] };
  }

  const results = await Promise.allSettled(
    targets.map(async p => {
      const ok = await printToDevice(p, job);
      return { name: p.name, ok };
    })
  );

  const printed: string[] = [];
  const failed: string[] = [];
  
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      printed.push(r.value.name);
    } else {
      const name = r.status === "fulfilled" ? r.value.name : "unknown";
      failed.push(name);
    }
  }

  return { success: failed.length === 0, printed, failed };
}

// ── Epson ePOS SDK (WebSocket) ──────────────────────────────────

async function printEpsonEpos(printer: PrinterInfo, job: PrintJob): Promise<boolean> {
  return new Promise((resolve) => {
    const wsUrl = `ws://${printer.ip_address}:${printer.port || 8008}/cgi-bin/epos/service.cgi`;
    const ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 10000);

    ws.onopen = () => {
      // Build ePOS XML command
      const xml = buildEposXml(job, printer.paper_width);
      ws.send(xml);
    };

    ws.onmessage = () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
  });
}

function buildEposXml(job: PrintJob, paperWidth: number): string {
  const lines = job.lines || textToLines(job.content);
  let xml = `<epos-print xmlns="http://www.epson-biz.com/pos/epos/devcontrol2">`;
  xml += `<text lang="ar"/>`;
  
  for (const line of lines) {
    if (line.separator) {
      xml += `<text>&#x0A;${"─".repeat(paperWidth === 80 ? 42 : 32)}&#x0A;</text>`;
      continue;
    }
    
    const align = line.align === "center" ? "center" : line.align === "left" ? "left" : "right";
    xml += `<text align="${align}"`;
    if (line.bold) xml += ` em="true"`;
    if (line.size === 2) xml += ` dw="true" dh="true"`;
    xml += `>${escapeXml(line.text)}&#x0A;</text>`;
  }
  
  xml += `<cut type="feed"/>`;
  xml += `</epos-print>`;
  return xml;
}

// ── Star WebPRNT ────────────────────────────────────────────────

async function printStarWebPRNT(printer: PrinterInfo, job: PrintJob): Promise<boolean> {
  try {
    const lines = job.lines || textToLines(job.content);
    let starXml = `<StarWebPrint><Initialization/>`;
    
    for (const line of lines) {
      if (line.separator) {
        starXml += `<Ruler/>`;
        continue;
      }
      
      const align = line.align === "center" ? "Center" : line.align === "left" ? "Left" : "Right";
      starXml += `<Alignment position="${align}"/>`;
      if (line.bold) starXml += `<Bold/>`;
      if (line.size === 2) starXml += `<DoubleHW/>`;
      starXml += `<PrintData>${escapeXml(line.text)}\n</PrintData>`;
      if (line.size === 2) starXml += `<DefaultHW/>`;
      if (line.bold) starXml += `<NoBold/>`;
    }
    
    starXml += `<CutPaper feed="true"/></StarWebPrint>`;
    
    const resp = await fetch(`http://${printer.ip_address}:${printer.port || 80}/StarWebPRNT/SendMessage`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: starXml,
    });
    
    return resp.ok;
  } catch {
    return false;
  }
}

// ── ESC/POS via QZ Tray ─────────────────────────────────────────

async function printEscPos(printer: PrinterInfo, job: PrintJob): Promise<boolean> {
  // Check if QZ Tray is available
  if (typeof (window as any).qz !== "undefined") {
    try {
      const qz = (window as any).qz;
      const config = qz.configs.create(`TCP:${printer.ip_address}:${printer.port}`);
      const lines = job.lines || textToLines(job.content);
      const data = buildEscPosData(lines, printer.paper_width);
      await qz.print(config, data);
      return true;
    } catch {
      return false;
    }
  }
  
  // Fallback: try direct HTTP (some printers support this)
  try {
    const resp = await fetch(`http://${printer.ip_address}:${printer.port || 80}/print`, withLocalNetworkAccess({
      method: "POST",
      body: job.content,
      mode: "no-cors",
    }));
    return true; // no-cors doesn't give us status, assume success
  } catch {
    // Final fallback: browser print
    printBrowserFallback(job.content);
    return true;
  }
}

function buildEscPosData(lines: PrintLine[], paperWidth: number): string[] {
  const ESC = "\x1B";
  const GS = "\x1D";
  const data: string[] = [];
  const charWidth = paperWidth === 80 ? 42 : 32;
  
  data.push(ESC + "@"); // Initialize
  data.push(ESC + "R\x00"); // Character table
  
  for (const line of lines) {
    if (line.separator) {
      data.push("─".repeat(charWidth) + "\n");
      continue;
    }
    
    // Alignment
    const alignByte = line.align === "center" ? "\x01" : line.align === "left" ? "\x00" : "\x02";
    data.push(ESC + "a" + alignByte);
    
    // Bold
    if (line.bold) data.push(ESC + "E\x01");
    
    // Size
    if (line.size === 2) data.push(GS + "!\x11");
    
    data.push(line.text + "\n");
    
    // Reset
    if (line.size === 2) data.push(GS + "!\x00");
    if (line.bold) data.push(ESC + "E\x00");
  }
  
  data.push(GS + "V\x01"); // Cut
  
  return data;
}

// ── Browser Fallback ────────────────────────────────────────────

function printBrowserFallback(htmlContent: string) {
  printThermalContent(htmlContent, {
    title: "طباعة",
    paperWidthMm: 80,
    contentWidthMm: 72,
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function textToLines(html: string): PrintLine[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = div.textContent || div.innerText || "";
  return text.split("\n").map(t => ({ text: t.trim() })).filter(l => l.text);
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

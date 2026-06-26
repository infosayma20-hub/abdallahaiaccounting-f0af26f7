import type jsPDF from "jspdf";

import amiriRegularAsset from "@/assets/fonts/amiri-regular.ttf.asset.json";
import amiriBoldAsset from "@/assets/fonts/amiri-bold.ttf.asset.json";

const fontCache = new Map<string, string>();

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const loadFontBase64 = async (url: string): Promise<string> => {
  const cached = fontCache.get(url);
  if (cached) return cached;

  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load PDF font: ${response.status}`);
  }

  const base64 = arrayBufferToBase64(await response.arrayBuffer());
  fontCache.set(url, base64);
  return base64;
};

export const registerAmiriFont = async (doc: jsPDF): Promise<void> => {
  const [regular, bold] = await Promise.all([
    loadFontBase64(amiriRegularAsset.url),
    loadFontBase64(amiriBoldAsset.url),
  ]);

  doc.addFileToVFS("Amiri-Regular.ttf", regular);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", bold);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
  doc.setFont("Amiri", "normal");
};
/**
 * Excel export/import of English item names (products.name_en only).
 * Import matches by the exported ID column, falling back to barcode.
 * No other column is ever written — prices/stock are untouched.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

async function loadAll(ownerId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, name_en, barcode")
      .eq("user_id", ownerId)
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function exportEnglishNames(ownerId: string) {
  const rows = await loadAll(ownerId);
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({ ID: r.id, Barcode: r.barcode || "", "Arabic name": r.name, "English name": r.name_en || "" })),
  );
  ws["!cols"] = [{ wch: 38 }, { wch: 16 }, { wch: 36 }, { wch: 36 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Items");
  XLSX.writeFile(wb, "item-english-names.xlsx");
  return rows.length;
}

export async function importEnglishNames(file: File, ownerId: string) {
  const wb = XLSX.read(await file.arrayBuffer());
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
  const existing = await loadAll(ownerId);
  const byId = new Map(existing.map((r) => [r.id, r]));
  const byBarcode = new Map(existing.filter((r) => r.barcode).map((r) => [String(r.barcode).trim(), r]));
  const updates: { id: string; name_en: string | null }[] = [];
  let notFound = 0;
  for (const row of data) {
    const en = String(row["English name"] ?? row["name_en"] ?? "").trim();
    const target = byId.get(String(row["ID"] ?? "").trim()) || byBarcode.get(String(row["Barcode"] ?? "").trim());
    if (!target) { notFound++; continue; }
    const next = en || null;
    if ((target.name_en || null) !== next) updates.push({ id: target.id, name_en: next });
  }
  let done = 0;
  for (let i = 0; i < updates.length; i += 20) {
    const chunk = updates.slice(i, i + 20);
    const res = await Promise.all(
      chunk.map((u) => supabase.from("products").update({ name_en: u.name_en } as any).eq("id", u.id).eq("user_id", ownerId)),
    );
    done += res.filter((r) => !r.error).length;
  }
  return { updated: done, failed: updates.length - done, notFound };
}

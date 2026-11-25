import JSZip from "jszip";

// exceljs 4.4 can't write a worksheet's <ignoredErrors>, so Excel shows a
// green "inconsistent formula" triangle on cells whose formula differs from
// their neighbours on purpose (the Payroll Hours "Day total" rows: SUM of
// the job rows above vs. the per-row pay formula). Sheet builders register
// those ranges with markIgnoredFormulaErrors(); downloadWorkbook() runs
// applyIgnoredErrors() on the written file before saving it.

type Entry = { sheetName: string; sqref: string };
const KEY = "__orbitworksIgnoredFormulaErrors";

export function markIgnoredFormulaErrors(workbook: object, sheetName: string, sqref: string): void {
  const wb = workbook as Record<string, Entry[] | undefined>;
  (wb[KEY] ??= []).push({ sheetName, sqref });
}

export function ignoredFormulaErrorsOf(workbook: object): Entry[] {
  return (workbook as Record<string, Entry[] | undefined>)[KEY] ?? [];
}

// Child elements that must come AFTER <ignoredErrors> in a worksheet
// (ECMA-376 CT_Worksheet order).
const AFTER_IGNORED_ERRORS = [
  "<smartTags",
  "<drawing",
  "<legacyDrawing",
  "<legacyDrawingHF",
  "<drawingHF",
  "<picture",
  "<oleObjects",
  "<controls",
  "<webPublishItems",
  "<tableParts",
  "<extLst",
  "</worksheet>",
];

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export async function applyIgnoredErrors(buffer: ArrayBuffer | Uint8Array, entries: Entry[]): Promise<Uint8Array | ArrayBuffer> {
  if (entries.length === 0) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) return buffer;

  const bySheet = new Map<string, string[]>();
  for (const e of entries) bySheet.set(e.sheetName, [...(bySheet.get(e.sheetName) ?? []), e.sqref]);

  for (const [sheetName, refs] of bySheet) {
    const sheetTag = new RegExp(`<sheet [^>]*name="${escapeAttr(sheetName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`).exec(workbookXml);
    const rid = sheetTag ? /r:id="([^"]+)"/.exec(sheetTag[0])?.[1] : undefined;
    const rel = rid ? new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*/>`).exec(relsXml) : null;
    const target = rel ? /Target="([^"]+)"/.exec(rel[0])?.[1] : undefined;
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async("string");
    if (xml.includes("<ignoredErrors")) continue;
    const element =
      `<ignoredErrors><ignoredError sqref="${escapeAttr(refs.join(" "))}" formula="1" formulaRange="1"/></ignoredErrors>`;
    let at = -1;
    for (const tag of AFTER_IGNORED_ERRORS) {
      const i = xml.indexOf(tag);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    if (at === -1) continue;
    xml = xml.slice(0, at) + element + xml.slice(at);
    zip.file(path, xml);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const HEADER_FILL = "FF3B6FE0";
const HEADER_FONT_COLOR = "FFFFFFFF";

export function parseMaybeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDatePart(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTimePart(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatHoursMinutes(hours: number | null | undefined): string {
  if (hours == null) return "-";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function formatDateRangeLabel(startDate: string, endDate: string): string {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end) return `${startDate} to ${endDate}`;
  return `${formatDatePart(start)} - ${formatDatePart(end)}`;
}

// ---- Company grouping helpers, shared by every sheet builder ----

// A row's company label is its own subcontractor name if it has one,
// otherwise the real main company name (never the generic word "Main
// company" - the caller always passes the actual company name).
export function companyLabelFor(
  subcontractorName: string | null | undefined,
  mainCompanyName: string
): string {
  return subcontractorName && subcontractorName.trim() ? subcontractorName : mainCompanyName;
}

// Sorts so the main company's rows come first, then each subcontractor's
// rows grouped together (alphabetically by company), with a caller-supplied
// secondary sort applied within each group.
export function sortByCompanyThen<T>(
  items: T[],
  getCompany: (item: T) => string,
  mainCompanyName: string,
  secondary: (a: T, b: T) => number
): T[] {
  return items.slice().sort((a, b) => {
    const ca = getCompany(a);
    const cb = getCompany(b);
    if (ca !== cb) {
      if (ca === mainCompanyName) return -1;
      if (cb === mainCompanyName) return 1;
      return ca.localeCompare(cb);
    }
    return secondary(a, b);
  });
}

export function addTitleRow(sheet: any, text: string, columnCount: number) {
  sheet.mergeCells(1, 1, 1, columnCount);
  const cell = sheet.getCell(1, 1);
  cell.value = text;
  cell.font = { bold: true, size: 13, color: { argb: "FF111827" } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 26;
}

export async function getExcelJS() {
  const mod = await import("exceljs/dist/exceljs.min.js");
  return (mod as any).default ?? mod;
}

export async function fetchImageAsBuffer(
  url: string
): Promise<{ buffer: ArrayBuffer; extension: "jpeg" | "png" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const extension = contentType.includes("png") ? "png" : "jpeg";
    const buffer = await res.arrayBuffer();
    return { buffer, extension };
  } catch (err) {
    console.error("Photo fetch error (embedding will show 'No photo' instead):", err);
    return null;
  }
}

export function styleHeaderRow(row: any) {
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  row.height = 20;
}

export function styleDataRows(worksheet: any, headerRowNumber = 1) {
  worksheet.eachRow((row: any, rowNumber: number) => {
    if (rowNumber <= headerRowNumber) return;
    row.eachCell((cell: any) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFF3F4F6" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });
}

export async function downloadWorkbook(workbook: any, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

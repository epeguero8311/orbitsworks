import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
  ShiftNote,
} from "@/lib/types";
import {
  parseMaybeDate,
  formatDatePart,
  formatTimePart,
  formatHoursMinutes,
  formatDateRangeLabel,
  companyLabelFor,
  sortByCompanyThen,
  addTitleRow,
  fetchImageAsBuffer,
  styleHeaderRow,
  styleDataRows,
} from "@/lib/excelHelpers";

// ---- Reusable sheet builders, each adds one (or more) sheets to a given workbook ----

export function addDetailSheet(
  workbook: any,
  sessions: SessionRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const detailSheet = workbook.addWorksheet("Detail");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  detailSheet.columns = [
    { key: "employeeName", width: 24 },
    { key: "siteName", width: 22 },
    { key: "company", width: 22 },
    { key: "date", width: 14 },
    { key: "clockInTime", width: 14 },
    { key: "clockOutTime", width: 18 },
    { key: "hoursDisplay", width: 12 },
    { key: "breakDisplay", width: 12 },
  ];

  addTitleRow(detailSheet, `Detail: ${rangeLabel}`, 8);

  const headerRow = detailSheet.getRow(2);
  ["Employee", "Job Site", "Company", "Date", "Clock In", "Clock Out", "Hours", "Break"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  const sorted = sortByCompanyThen(
    sessions,
    (s) => companyLabelFor(s.subcontractorName, companyName),
    companyName,
    (a, b) => (a.clockIn < b.clockIn ? -1 : 1)
  );

  let r = 3;
  sorted.forEach((s) => {
    const clockInDate = parseMaybeDate(s.clockIn);
    const clockOutDate = parseMaybeDate(s.clockOut);

    const dateLabel = clockInDate ? formatDatePart(clockInDate) : "-";
    const clockInLabel = clockInDate ? formatTimePart(clockInDate) : "-";

    let clockOutLabel = "Missing clock-out";
    if (clockOutDate) {
      clockOutLabel = formatTimePart(clockOutDate);
      if (
        clockInDate &&
        clockOutDate.toDateString() !== clockInDate.toDateString()
      ) {
        clockOutLabel += " (+1 day)";
      }
    }

    const row = detailSheet.getRow(r);
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = s.siteName;
    row.getCell(3).value = companyLabelFor(s.subcontractorName, companyName);
    row.getCell(4).value = dateLabel;
    row.getCell(5).value = clockInLabel;
    row.getCell(6).value = clockOutLabel;
    row.getCell(7).value = formatHoursMinutes(s.hours);
    row.getCell(8).value = formatHoursMinutes(s.breakHours);
    r += 1;
  });

  styleDataRows(detailSheet, 2);
  detailSheet.views = [{ state: "frozen", ySplit: 2 }];
}

export function addNotesSheet(
  workbook: any,
  shiftNotes: ShiftNote[],
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Notes");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { key: "date", width: 18 },
    { key: "siteName", width: 20 },
    { key: "note", width: 50 },
    { key: "createdByName", width: 22 },
  ];

  addTitleRow(sheet, `Notes: ${rangeLabel}`, 4);

  const headerRow = sheet.getRow(2);
  ["Date", "Site", "Note", "Written By"].forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  let r = 3;
  shiftNotes.forEach((n) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = n.timestamp ? n.timestamp.toDate().toLocaleString() : "-";
    row.getCell(2).value = n.siteName;
    row.getCell(3).value = n.note;
    row.getCell(4).value = n.createdByName;
    row.getCell(3).alignment = { wrapText: true, vertical: "middle" };
    r += 1;
  });

  styleDataRows(sheet, 2);
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

export function addSummarySheet(
  workbook: any,
  summaries: EmployeeSummary[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const summarySheet = workbook.addWorksheet("Summary");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  summarySheet.columns = [
    { key: "employeeName", width: 26 },
    { key: "totalHours", width: 16 },
    { key: "totalBreakHours", width: 16 },
    { key: "company", width: 22 },
  ];

  const groups = new Map<string, EmployeeSummary[]>();
  summaries.forEach((s) => {
    const label = companyLabelFor(s.subcontractorName, companyName);
    const list = groups.get(label) ?? [];
    list.push(s);
    groups.set(label, list);
  });

  const orderedLabels = Array.from(groups.keys()).sort((a, b) => {
    if (a === companyName) return -1;
    if (b === companyName) return 1;
    return a.localeCompare(b);
  });

  let r = 1;
  orderedLabels.forEach((label) => {
    const groupSummaries = groups
      .get(label)!
      .slice()
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    summarySheet.mergeCells(r, 1, r, 4);
    const titleCell = summarySheet.getCell(r, 1);
    titleCell.value = `${label}: ${rangeLabel}`;
    titleCell.font = { bold: true, size: 13, color: { argb: "FF111827" } };
    titleCell.alignment = { vertical: "middle" };
    summarySheet.getRow(r).height = 26;
    r += 1;

    const headerRow = summarySheet.getRow(r);
    headerRow.getCell(1).value = "Employee";
    headerRow.getCell(2).value = "Total Hours";
    headerRow.getCell(3).value = "Total Break Hrs";
    headerRow.getCell(4).value = "Company";
    styleHeaderRow(headerRow);
    r += 1;

    groupSummaries.forEach((s) => {
      const row = summarySheet.getRow(r);
      row.getCell(1).value = s.employeeName;
      row.getCell(2).value = formatHoursMinutes(s.totalHours);
      row.getCell(3).value = formatHoursMinutes(s.totalBreakHours);
      row.getCell(4).value = label;
      row.eachCell((cell: any) => {
        cell.border = { bottom: { style: "thin", color: { argb: "FFF3F4F6" } } };
        cell.alignment = { vertical: "middle" };
      });
      r += 1;
    });

    r += 1; // spacer row between company blocks
  });
}

export async function addPhotosSheet(
  workbook: any,
  sessions: SessionRecord[],
  startDate: string,
  endDate: string
) {
  const photosSheet = workbook.addWorksheet("Photos");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);
  const THUMB_SIZE = 90;

  photosSheet.columns = [
    { key: "employeeName", width: 22 },
    { key: "date", width: 14 },
    { key: "clockInPhoto", width: 20 },
    { key: "clockOutPhoto", width: 20 },
  ];

  addTitleRow(photosSheet, `Photos: ${rangeLabel}`, 4);

  const headerRow = photosSheet.getRow(2);
  ["Employee", "Date", "Clock In", "Clock Out"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const rowNumber = i + 3;
    const clockInDate = parseMaybeDate(s.clockIn);
    const dateLabel = clockInDate ? formatDatePart(clockInDate) : "-";

    const row = photosSheet.getRow(rowNumber);
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = dateLabel;
    row.height = THUMB_SIZE * 0.78;
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(2).alignment = { vertical: "middle" };

    if (s.clockInPhotoUrl) {
      const img = await fetchImageAsBuffer(s.clockInPhotoUrl);
      if (img) {
        const imageId = workbook.addImage({
          buffer: img.buffer,
          extension: img.extension,
        });
        photosSheet.addImage(imageId, {
          tl: { col: 2, row: rowNumber - 1 },
          ext: { width: THUMB_SIZE, height: THUMB_SIZE },
        });
      } else {
        row.getCell(3).value = "No photo";
      }
    } else {
      row.getCell(3).value = "No photo";
    }

    if (s.clockOutPhotoUrl) {
      const img = await fetchImageAsBuffer(s.clockOutPhotoUrl);
      if (img) {
        const imageId = workbook.addImage({
          buffer: img.buffer,
          extension: img.extension,
        });
        photosSheet.addImage(imageId, {
          tl: { col: 3, row: rowNumber - 1 },
          ext: { width: THUMB_SIZE, height: THUMB_SIZE },
        });
      } else {
        row.getCell(4).value = "No photo";
      }
    } else {
      row.getCell(4).value = "No photo";
    }
  }

  photosSheet.views = [{ state: "frozen", ySplit: 2 }];
}

export function addEmployeesSheet(
  workbook: any,
  employeeRecords: EmployeeExportRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Employees");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { key: "name", width: 24 },
    { key: "jobTitle", width: 20 },
    { key: "hourlyRate", width: 14 },
    { key: "phone", width: 16 },
    { key: "siteNames", width: 26 },
    { key: "company", width: 22 },
    { key: "status", width: 12 },
  ];

  addTitleRow(sheet, `Employees: ${rangeLabel}`, 7);

  const headerRow = sheet.getRow(2);
  ["Name", "Job Title", "Hourly Rate", "Phone", "Job Sites", "Company", "Status"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  const sorted = sortByCompanyThen(
    employeeRecords,
    (e) => companyLabelFor(e.subcontractorName, companyName),
    companyName,
    (a, b) => a.name.localeCompare(b.name)
  );

  let r = 3;
  sorted.forEach((e) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = e.name;
    row.getCell(2).value = e.jobTitle || "-";
    row.getCell(3).value = e.hourlyRate ?? null;
    row.getCell(4).value = e.phone || "-";
    row.getCell(5).value = e.siteNames || "-";
    row.getCell(6).value = companyLabelFor(e.subcontractorName, companyName);
    row.getCell(7).value = e.active ? "Active" : "Inactive";
    r += 1;
  });

  styleDataRows(sheet, 2);
  sheet.getColumn(3).numFmt = '"$"#,##0.00';
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

export function addAttendanceSheet(
  workbook: any,
  attendanceRecords: AttendanceRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Attendance");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { key: "employeeName", width: 24 },
    { key: "date", width: 14 },
    { key: "arrivalTime", width: 14 },
    { key: "departureTime", width: 14 },
    { key: "breakDisplay", width: 12 },
    { key: "status", width: 12 },
    { key: "company", width: 22 },
  ];

  addTitleRow(sheet, `Attendance: ${rangeLabel}`, 7);

  const headerRow = sheet.getRow(2);
  ["Employee", "Date", "Arrival", "Departure", "Break", "Status", "Company"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  const sorted = sortByCompanyThen(
    attendanceRecords,
    (a) => companyLabelFor(a.subcontractorName, companyName),
    companyName,
    (a, b) => (a.date < b.date ? -1 : 1)
  );

  let r = 3;
  sorted.forEach((a) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = a.employeeName;
    row.getCell(2).value = a.date;
    row.getCell(3).value = a.arrivalTime ?? "-";
    row.getCell(4).value = a.departureTime ?? "-";
    row.getCell(5).value = formatHoursMinutes(a.breakHours);
    row.getCell(6).value = a.status;
    row.getCell(7).value = companyLabelFor(a.subcontractorName, companyName);
    r += 1;
  });

  styleDataRows(sheet, 2);
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

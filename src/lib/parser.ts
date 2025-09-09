// src/lib/parser.ts
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { Entry, Mode } from './types';

dayjs.extend(customParseFormat);

const CLASS_HEADER_RE = /^(Jan|Mar|Aug|Oct)(\d{2})(FT|PT)$/i;
const DATE_FORMATS = ['YYYY/MM/DD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'D/M/YYYY', 'DD-MMM-YYYY', 'D-MMM-YYYY'];

const norm = (v: unknown) => String(v ?? '').trim();

function parseClassId(classId: string) {
  const m = CLASS_HEADER_RE.exec(classId);
  if (!m) return null;
  return {
    intake: (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as 'Jan' | 'Mar' | 'Aug' | 'Oct',
    year: parseInt(m[2], 10),
    mode: m[3].toUpperCase() as Mode
  };
}

// accepts "12. PME" or "12 PME"
function parseCell(v: unknown) {
  const s = norm(v);
  if (!s) return null;
  const m = s.match(/^(\d+)[\.\s]+\s*([A-Za-z0-9]+)$/);
  if (!m) return null;
  return { courseWeek: parseInt(m[1], 10), courseCode: m[2].toUpperCase() };
}

function toYMD(val: unknown, date1904 = false): string {
  if (val instanceof Date && !isNaN(+val)) return dayjs(val).format('YYYY-MM-DD');
  if (typeof val === 'number' && isFinite(val)) {
    const o = XLSX.SSF.parse_date_code(val, date1904);
    if (o) return dayjs(new Date(o.y, o.m - 1, o.d)).format('YYYY-MM-DD');
  }
  const s = norm(val);
  for (const f of DATE_FORMATS) {
    const d = dayjs(s, f, true);
    if (d.isValid()) return d.format('YYYY-MM-DD');
  }
  const d = dayjs(s);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

/** ---- The single core parser (shared by both entry points) ---- */
function parseWorkbookToEntries(wb: XLSX.WorkBook): Entry[] {
  if (!wb.SheetNames.length) throw new Error('No sheets found.');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const date1904 = !!(wb.Workbook && (wb.Workbook as any).WBProps?.date1904);

  // @ts-ignore: allow cellDates option
const rowsAoa: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1, blankrows: false, defval: '', raw: true, cellDates: true
  }) as any[][];
  if (!rowsAoa.length) throw new Error('Sheet appears to be empty.');

  // auto-detect header row (contains Week Start & Calendar Week)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(100, rowsAoa.length); i++) {
    const row = rowsAoa[i].map(norm);
    const hasWS = row.some(c => /^week\s*start$/i.test(c));
    const hasCW = row.some(c => /^calendar\s*week$/i.test(c));
    if (hasWS && hasCW) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    const sample = rowsAoa.slice(0, 10).map(r => r.map(norm).join(' | ')).join('\n');
    throw new Error(`Could not locate header row with "Week Start" and "Calendar Week". Sample rows:\n${sample}`);
  }

  const header = rowsAoa[headerIdx].map(norm);
  const dataRows = rowsAoa.slice(headerIdx + 1);
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => (colIndex[h] = i));

  const weekStartKey = header.find(h => /^week\s*start$/i.test(h)) ?? header.find(h => /^start$/i.test(h)) ?? '';
  const calWeekKey = header.find(h => /^calendar\s*week$/i.test(h)) ?? header.find(h => /^week$/i.test(h)) ?? '';
  if (!weekStartKey || !calWeekKey) {
    throw new Error(`Required headers not found on row ${headerIdx + 1}. Found: ${header.join(', ')}`);
  }

  const classKeys = header.filter(h => CLASS_HEADER_RE.test(h));
  if (!classKeys.length) {
    throw new Error(`No class columns matched /(Jan|Mar|Aug|Oct)\\d{2}(FT|PT)/ on row ${headerIdx + 1}. Found: ${header.join(', ')}`);
  }

  const prelim: Omit<Entry, 'isStart' | 'isAssessment'>[] = [];

  for (const row of dataRows) {
    if (!row || !row.length) continue;

    const weekStartVal = row[colIndex[weekStartKey]];
    if (weekStartVal === '' || weekStartVal == null) continue;

    const ymd = toYMD(weekStartVal, date1904);
    if (!ymd) continue;

    const calWRaw = row[colIndex[calWeekKey]];
    const calendarWeek = parseInt(String(calWRaw ?? '').replace(/\D+/g, ''), 10) || NaN;

    for (const classKey of classKeys) {
      const cell = row[colIndex[classKey]];
      const parsed = parseCell(cell);
      if (!parsed) continue;

      const parsedClass = parseClassId(classKey);
      if (!parsedClass) continue;

      prelim.push({
        date: ymd,
        calendarWeek,
        classId: classKey,
        intake: parsedClass.intake,
        year: parsedClass.year,
        mode: parsedClass.mode,
        courseCode: parsed.courseCode,
        courseWeek: parsed.courseWeek
      });
    }
  }

  // group by class+course → mark start/end
  const byKey = new Map<string, Omit<Entry, 'isStart' | 'isAssessment'>[]>();
  for (const e of prelim) {
    const k = `${e.classId}|${e.courseCode}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }

  const result: Entry[] = [];
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    arr.forEach((e, i) =>
      result.push({ ...e, isStart: i === 0, isAssessment: i === arr.length - 1 })
    );
  }

  result.sort((a, b) => a.classId.localeCompare(b.classId) || a.date.localeCompare(b.date));
  return result;
}

/** ---- Public APIs ---- */

// used by the Upload component (no change needed)
export async function parseExcelToEntries(file: File): Promise<Entry[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return parseWorkbookToEntries(wb);
}

// used by onMount to load a default file from /public
export async function parseExcelFromArrayBuffer(buf: ArrayBuffer): Promise<Entry[]> {
  const wb = XLSX.read(buf, { type: 'array' });
  return parseWorkbookToEntries(wb);
}

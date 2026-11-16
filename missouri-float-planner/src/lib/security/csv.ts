// src/lib/security/csv.ts
// CSV output that is safe to open in a spreadsheet.
//
// Exports contain text typed by the public (feedback messages, names). A cell
// that begins with = + - or @ is evaluated as a formula by Excel, Sheets and
// Numbers, so a message of `=HYPERLINK(...)` runs on the admin's machine when
// they open the file. Text cells that start with one of those characters (or
// a tab / carriage return, which spreadsheets strip before looking) are
// prefixed with an apostrophe, which every major spreadsheet treats as "this
// is text". Real numbers are left alone so -91.5 stays a number.

const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number.isFinite(Number(value)) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (FORMULA_LEAD.test(text)) text = `'${text}`;
  // Quote on every character that can end or split a field, \r included.
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

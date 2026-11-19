/** The study's committed hourly series: one row an hour, one column a gauge, blank where there is no value. */
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

export interface Table { start: string; sites: string[]; values: Record<string, (number | null)[]> }

export function encodeTable(table: Table): Uint8Array {
  const hours = table.values[table.sites[0]].length, origin = Date.parse(table.start), lines = [`hour_start_utc,${table.sites.join(',')}`];
  for (let hour = 0; hour < hours; hour++) {
    lines.push(`${new Date(origin + hour * 3_600_000).toISOString().slice(0, 13)},${table.sites.map(site => table.values[site][hour] ?? '').join(',')}`);
  }
  // A fixed header time keeps the bytes the same from run to run.
  const packed = gzipSync(`${lines.join('\n')}\n`, { level: 9 });
  packed.fill(0, 4, 8);
  return packed;
}

export function readTable(path: string): Table {
  const lines = gunzipSync(readFileSync(path)).toString('utf8').trimEnd().split('\n'), sites = lines[0].split(',').slice(1);
  const values: Record<string, (number | null)[]> = Object.fromEntries(sites.map(site => [site, []]));
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = line.split(',');
    if (cells.length !== sites.length + 1) throw new Error(`Row ${index + 2} of ${path} is malformed`);
    sites.forEach((site, i) => values[site].push(cells[i + 1] === '' ? null : Number(cells[i + 1])));
  }
  return { start: `${lines[1].split(',')[0]}:00:00Z`, sites, values };
}

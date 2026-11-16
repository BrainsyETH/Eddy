import { gunzipSync, inflateSync } from 'node:zlib';
import { hash, MAX_BYTES, type Tile } from './research-contract';

/**
 * NOAA's gauge-corrected rainfall (MRMS multi-sensor QPE, pass 2).
 *
 * The hosted image service the collector reads carries only the radar-only
 * product, which read about 1.9 times the rain gauges in the recorded check
 * (docs/validation/rainfall/2026-11-16-units). Pass 2 is the same radar field
 * after NOAA corrects it with gauges. It is published as GRIB2 on NOAA's open
 * archive about 57 minutes after each hour and is what public amounts use.
 *
 * Each file is one field on NOAA's 0.01 degree grid, PNG-packed at 16 bits, or
 * at 8 bits in an hour when no cell needs more. This reads
 * exactly that encoding and refuses anything else, then takes the source cell
 * under each centre of the collector's existing tile: the same nearest-cell
 * step NOAA's hosted service applies to the radar-only product, so the
 * prepared basin weights and the map shading apply unchanged.
 */
export const CORRECTED_ORIGIN = 'https://noaa-mrms-pds.s3.amazonaws.com';
/** Parameter numbers are NOAA's MRMS GRIB2 table, discipline 209, category 6. */
export const CORRECTED_PRODUCTS = {
  1: { key: 'MultiSensor_QPE_01H_Pass2', parameter: 37 },
  24: { key: 'MultiSensor_QPE_24H_Pass2', parameter: 41 },
  72: { key: 'MultiSensor_QPE_72H_Pass2', parameter: 43 },
} as const;
export type CorrectedHours = keyof typeof CORRECTED_PRODUCTS;
export const CORRECTED_HOURS: Record<string, CorrectedHours> = Object.fromEntries(
  Object.entries(CORRECTED_PRODUCTS).map(([hours, product]) => [product.key, Number(hours) as CorrectedHours]));

const HOUR = 3_600_000;
export function correctedUrl(hours: CorrectedHours, end: string): string {
  const at = Date.parse(end);
  if (!Number.isFinite(at) || at % HOUR !== 0) throw new Error('Corrected rainfall is published on the hour');
  const stamp = new Date(at).toISOString(), day = stamp.slice(0, 10).replaceAll('-', '');
  const name = `${CORRECTED_PRODUCTS[hours].key}_00.00`;
  return `${CORRECTED_ORIGIN}/CONUS/${name}/${day}/MRMS_${name}_${day}-${stamp.slice(11, 19).replaceAll(':', '')}.grib2.gz`;
}

/** GRIB2 stores negative integers as sign and magnitude, not two's complement. */
const signed = (value: number, bits: number) => value & 2 ** (bits - 1) ? -(value & (2 ** (bits - 1) - 1)) : value;

interface Field {
  parameter: number; referenceTime: string;
  columns: number; rows: number; firstLatitude: number; firstLongitude: number; dLatitude: number; dLongitude: number;
  reference: number; binaryScale: number; decimalScale: number; bits: 8 | 16; png: Uint8Array;
}
/** One message, one field, the layout NOAA publishes. Anything else is refused. */
function readField(grib: Uint8Array): Field {
  const view = new DataView(grib.buffer, grib.byteOffset, grib.byteLength);
  const text = (at: number) => String.fromCharCode(...grib.subarray(at, at + 4));
  if (grib.length < 200 || text(0) !== 'GRIB' || grib[7] !== 2 || grib[6] !== 209) throw new Error('Not an MRMS GRIB2 file');
  if (view.getUint32(8) !== 0 || view.getUint32(12) !== grib.length || text(grib.length - 4) !== '7777') throw new Error('GRIB2 file is not one whole message');
  const sections = new Map<number, number>();
  for (let at = 16; at < grib.length - 4;) {
    const length = view.getUint32(at), number = grib[at + 4];
    if (length < 5 || at + length > grib.length - 4 || sections.has(number)) throw new Error('Unexpected GRIB2 sections');
    sections.set(number, at); at += length;
  }
  const [identity, grid, product, packing, bitmap, data] = [1, 3, 4, 5, 6, 7].map(number => sections.get(number));
  if (identity == null || grid == null || product == null || packing == null || bitmap == null || data == null) throw new Error('Unexpected GRIB2 sections');
  // Significance 3 is observation time, which for these totals is the end of the window.
  if (grib[identity + 11] !== 3) throw new Error('Unexpected GRIB2 reference time');
  const referenceTime = new Date(Date.UTC(view.getUint16(identity + 12), grib[identity + 14] - 1, grib[identity + 15],
    grib[identity + 16], grib[identity + 17], grib[identity + 18])).toISOString();
  const basic = view.getUint32(grid + 38), subdivisions = view.getUint32(grid + 42);
  const degrees = (basic === 0 || basic === 0xffffffff ? 1 : basic) / (subdivisions === 0 || subdivisions === 0xffffffff ? 1e6 : subdivisions);
  // Template 3.0, rows north to south and columns west to east.
  if (view.getUint16(grid + 12) !== 0 || grib[grid + 71] !== 0) throw new Error('Unexpected GRIB2 grid');
  const columns = view.getUint32(grid + 30), rows = view.getUint32(grid + 34);
  if (view.getUint16(product + 7) !== 0 || grib[product + 9] !== 6) throw new Error('Unexpected GRIB2 product');
  // Template 5.41: PNG-packed integers. No bitmap; gaps are negative values.
  const bits = grib[packing + 19];
  if (view.getUint16(packing + 9) !== 41 || (bits !== 8 && bits !== 16) || view.getUint32(packing + 5) !== columns * rows
    || grib[bitmap + 5] !== 255 || columns < 1 || rows < 1 || columns * rows > 40_000_000) throw new Error('Unexpected GRIB2 packing');
  return { parameter: grib[product + 10], referenceTime, columns, rows,
    firstLatitude: signed(view.getUint32(grid + 46), 32) * degrees, firstLongitude: view.getUint32(grid + 50) * degrees,
    dLongitude: view.getUint32(grid + 63) * degrees, dLatitude: view.getUint32(grid + 67) * degrees,
    reference: view.getFloat32(packing + 11), binaryScale: signed(view.getUint16(packing + 15), 16), decimalScale: signed(view.getUint16(packing + 17), 16), bits,
    png: grib.subarray(data + 5, data + view.getUint32(data)) };
}

/** Undo PNG row filters in place for the first `needed` rows of a greyscale image of `size` bytes a cell. */
function grey(png: Uint8Array, columns: number, rows: number, needed: number, size: 1 | 2): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (png.length < 57 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) throw new Error('Rain field is not PNG-packed');
  const parts: Uint8Array[] = [];
  let header = false;
  for (let at = 8; at + 12 <= png.length;) {
    const length = view.getUint32(at), type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (at + 12 + length > png.length) throw new Error('Truncated rain field');
    if (type === 'IHDR') {
      // Greyscale at the depth the GRIB2 header states, not interlaced.
      if (view.getUint32(at + 8) !== columns || view.getUint32(at + 12) !== rows || png[at + 16] !== size * 8 || png[at + 17] !== 0
        || png[at + 18] !== 0 || png[at + 19] !== 0 || png[at + 20] !== 0) throw new Error('Unexpected rain field image');
      header = true;
    } else if (type === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length));
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header || !parts.length) throw new Error('Unexpected rain field image');
  const stride = columns * size + 1, raw = inflateSync(Buffer.concat(parts), { maxOutputLength: stride * rows });
  if (raw.length !== stride * rows) throw new Error('Truncated rain field');
  for (let y = 0; y < needed; y++) {
    const row = y * stride + 1, above = row - stride, filter = raw[row - 1];
    if (filter === 0) continue;
    if (filter > 4) throw new Error('Unexpected rain field filter');
    for (let i = 0; i < stride - 1; i++) {
      const left = i >= size ? raw[row + i - size] : 0, up = y ? raw[above + i] : 0;
      if (filter === 1) raw[row + i] += left;
      else if (filter === 2) raw[row + i] += up;
      else if (filter === 3) raw[row + i] += (left + up) >> 1;
      else {
        const corner = y && i >= size ? raw[above + i - size] : 0, estimate = left + up - corner;
        const a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - corner);
        raw[row + i] += a <= b && a <= c ? left : b <= c ? up : corner;
      }
    }
  }
  return raw;
}

/** The gauge-corrected product for one window, on the collector's tile. A file for another product or hour is refused. */
export function correctedTile(download: Uint8Array, hours: CorrectedHours, end: string, tile: Tile) {
  const result = mrmsTile(download, tile);
  if (result.source.parameter !== CORRECTED_PRODUCTS[hours].parameter) throw new Error('File is not the requested rainfall product');
  if (result.source.referenceTime !== new Date(end).toISOString()) throw new Error('File is not the requested hour');
  return result;
}

/**
 * Read any one MRMS rainfall file onto a tile, in millimetres, whatever product
 * it is. The collector uses correctedTile; this is exported for evidence that
 * compares products. A cell NOAA marks as missing or outside coverage is NaN,
 * never zero.
 */
export function mrmsTile(download: Uint8Array, tile: Tile) {
  if (download.length > MAX_BYTES) throw new Error('Rainfall file exceeds size limit');
  const field = readField(gunzipSync(download, { maxOutputLength: 4 * MAX_BYTES }));
  if (!(field.dLatitude > 0) || !(field.dLongitude > 0)) throw new Error('Unexpected GRIB2 grid');
  const radius = 6378137, degree = 180 / Math.PI;
  const north = field.firstLatitude + field.dLatitude / 2, west = field.firstLongitude - field.dLongitude / 2;
  const rows = Array.from({ length: tile.height }, (_, y) => {
    const latitude = (2 * Math.atan(Math.exp((tile.ymax - (y + 0.5) * tile.dy) / radius)) - Math.PI / 2) * degree;
    return Math.floor((north - latitude) / field.dLatitude);
  });
  const columns = Array.from({ length: tile.width }, (_, x) => {
    const longitude = (tile.xmin + (x + 0.5) * tile.dx) / radius * degree;
    return Math.floor(((longitude % 360 + 360) % 360 - west) / field.dLongitude);
  });
  if (rows[0] < 0 || rows.at(-1)! >= field.rows || columns[0] < 0 || columns.at(-1)! >= field.columns) throw new Error('Tile is outside the rainfall grid');
  const size = field.bits === 8 ? 1 : 2, stride = field.columns * size + 1, raw = grey(field.png, field.columns, field.rows, rows.at(-1)! + 1, size);
  const scale = 2 ** field.binaryScale, divisor = 10 ** field.decimalScale;
  const values = new Float32Array(tile.width * tile.height);
  let missing = 0;
  for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
    const at = rows[y] * stride + 1 + columns[x] * size, packed = size === 1 ? raw[at] : (raw[at] << 8) | raw[at + 1];
    const millimetres = (field.reference + packed * scale) / divisor;
    if (millimetres < 0) missing++;
    values[y * tile.width + x] = millimetres < 0 ? NaN : millimetres;
  }
  return { values, missing, source: { sha256: hash(download), bytes: download.length, bits: field.bits, parameter: field.parameter, referenceTime: field.referenceTime,
    columns: field.columns, rows: field.rows, firstLatitude: field.firstLatitude, firstLongitude: field.firstLongitude,
    dLatitude: field.dLatitude, dLongitude: field.dLongitude } };
}

/**
 * The tile as the same native GeoTIFF the hosted captures use (uncompressed
 * single-band F32, EPSG:3857), so one reader and one set of weights serve both.
 */
export function tileTiff(values: Float32Array, tile: Tile): Uint8Array {
  if (values.length !== tile.width * tile.height) throw new Error('Rain tile size mismatch');
  const doubles = [tile.dx, tile.dy, 0, 0, 0, 0, tile.xmin, tile.ymax, 0];
  const keys = [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3857];
  const entries = 14, extra = 8 + 2 + entries * 12 + 4, pixels = extra + doubles.length * 8 + keys.length * 2;
  const bytes = new Uint8Array(pixels + values.length * 4), view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  view.setUint16(8, entries, true);
  let at = 10;
  const tag = (id: number, type: number, count: number, value: number) => {
    view.setUint16(at, id, true); view.setUint16(at + 2, type, true); view.setUint32(at + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(at + 8, value, true); else view.setUint32(at + 8, value, true);
    at += 12;
  };
  tag(256, 4, 1, tile.width); tag(257, 4, 1, tile.height); tag(258, 3, 1, 32); tag(259, 3, 1, 1); tag(262, 3, 1, 1);
  tag(273, 4, 1, pixels); tag(277, 3, 1, 1); tag(278, 4, 1, tile.height); tag(279, 4, 1, values.length * 4); tag(339, 3, 1, 3);
  tag(33550, 12, 3, extra); tag(33922, 12, 6, extra + 24); tag(34735, 3, keys.length, extra + 72);
  // GDAL's nodata tag, the four characters "nan\0" held inline.
  tag(42113, 2, 4, 0x006e616e);
  doubles.forEach((value, i) => view.setFloat64(extra + i * 8, value, true));
  keys.forEach((value, i) => view.setUint16(extra + 72 + i * 2, value, true));
  values.forEach((value, i) => view.setFloat32(pixels + i * 4, value, true));
  return bytes;
}

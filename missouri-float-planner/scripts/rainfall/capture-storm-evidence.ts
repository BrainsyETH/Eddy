/**
 * Read-only capture for the coverage release gate: what the public rain view
 * would have shown for chosen stations over one past 24 hours. No Supabase
 * writes, nothing written outside --out.
 *
 * For the window ending at --end it saves NOAA's gauge-corrected 24-hour total
 * and the radar-only total on the collector's tile, the USGS rain gauges under
 * them, and each station's prepared weights. From those it records, per basin:
 * how much of the basin the weights cover, the basin amount from each product,
 * the 24 hourly files added up, and a check that does not use the tile or the
 * weights at all (NOAA's cells sampled every fifth of a tile cell inside the
 * outline). src/lib/rainfall/storm-evidence.test.ts replays the saved files.
 *
 * node --import tsx scripts/rainfall/capture-storm-evidence.ts --tile CAPTURE_JSON --sites ID,ID --end ISO_HOUR --out NEW_DIR
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { bbox, booleanPointInPolygon, point, toMercator } from '@turf/turf';
import { getScriptClient } from '../lib/db';
import { CORRECTED_ORIGIN, correctedTile, correctedUrl, mrmsTile, tileTiff } from '../../src/lib/rainfall/corrected-source';
import { basinWeights, weightedRain } from '../../src/lib/rainfall/native-grid';
import { hash, type Basin, type Tile } from '../../src/lib/rainfall/research-contract';
import { compareUnits } from '../../src/lib/rainfall/units-evidence';
import { bytes, gaugeReadings } from './evidence-fetch';

const HOUR = 3_600_000, pixels = (values: Float32Array) => Array.from(values, value => Number.isNaN(value) ? null : value);
async function main() {
  const args = process.argv.slice(2), value = (flag: string) => args[args.indexOf(flag) + 1];
  const sites = value('--sites')?.split(',') ?? [], end = new Date(value('--end') ?? '').getTime(), out = value('--out');
  if (args.length !== 8 || ['--tile', '--sites', '--end', '--out'].some(flag => !args.includes(flag)) || !out || !sites.length || sites.length > 6
    || !sites.every(site => /^\d{8,15}$/.test(site)) || !Number.isFinite(end) || end % HOUR !== 0 || end > Date.now()) {
    throw new Error('Usage: capture-storm-evidence.ts --tile CAPTURE_JSON --sites ID,ID --end ISO_HOUR --out NEW_DIR');
  }
  const { tile } = JSON.parse(await readFile(value('--tile'), 'utf8')) as { tile: Tile };
  const window = { start: new Date(end - 24 * HOUR).toISOString(), end: new Date(end).toISOString() };
  const db = getScriptClient({ script: 'capture-rain-storm-evidence', write: false });
  const { data, error } = await db.from('rainfall_research_basins').select('id,usgs_site_id,geometry,review_status')
    .eq('enabled', true).in('usgs_site_id', sites).order('usgs_site_id');
  if (error) throw error;
  const basins = data as (Basin & { review_status: string })[];
  if (basins.length !== sites.length) throw new Error('A requested station has no enabled basin');

  const correctedUrl24 = correctedUrl(24, window.end), radarUrl = correctedUrl24.replaceAll('MultiSensor_QPE_24H_Pass2', 'RadarOnly_QPE_24H');
  if (!radarUrl.startsWith(CORRECTED_ORIGIN) || radarUrl === correctedUrl24) throw new Error('Unexpected archive address');
  const correctedFile = await bytes(correctedUrl24), radarFile = await bytes(radarUrl);
  const corrected = correctedTile(correctedFile, 24, window.end, tile), radar = mrmsTile(radarFile, tile);
  if (radar.source.referenceTime !== window.end || radar.source.parameter === corrected.source.parameter) throw new Error('Radar-only file is not the requested window');
  const hourly: Float32Array[] = [];
  for (let hour = 23; hour >= 0; hour--) {
    const at = new Date(end - hour * HOUR).toISOString();
    hourly.push(correctedTile(await bytes(correctedUrl(1, at)), 1, at, tile).values);
  }

  const mercator = toMercator, fine = { dx: tile.dx / 5, dy: tile.dy / 5 };
  const weights: Record<string, ReturnType<typeof basinWeights>> = {};
  const results = basins.map(basin => {
    const weight = weights[basin.usgs_site_id] = basinWeights(basin.geometry, tile, Date.now() + 120_000);
    const amount = (values: Float32Array) => weightedRain(pixels(values), weight);
    const hours = hourly.map(amount);
    // Independent of the tile and the weights: NOAA's own cells, sampled densely inside the outline.
    const projected = mercator(basin.geometry), box = bbox(projected);
    const dense: Tile = { xmin: box[0], ymax: box[3], dx: fine.dx, dy: fine.dy, width: Math.ceil((box[2] - box[0]) / fine.dx), height: Math.ceil((box[3] - box[1]) / fine.dy), xmax: 0, ymin: 0 };
    dense.xmax = dense.xmin + dense.width * dense.dx; dense.ymin = dense.ymax - dense.height * dense.dy;
    const sampled = mrmsTile(correctedFile, dense).values;
    let sum = 0, count = 0;
    for (let y = 0; y < dense.height; y++) for (let x = 0; x < dense.width; x++) {
      const millimetres = sampled[y * dense.width + x];
      if (Number.isNaN(millimetres) || !booleanPointInPolygon(point([dense.xmin + (x + 0.5) * dense.dx, dense.ymax - (y + 0.5) * dense.dy]), projected)) continue;
      sum += millimetres; count++;
    }
    return { site: basin.usgs_site_id, basinId: basin.id, reviewStatus: basin.review_status, cells: weight.cells.length,
      weightedAreaFraction: weight.cells.reduce((total, cell) => total + cell.area, 0) / weight.totalArea,
      corrected: amount(corrected.values), radarOnly: amount(radar.values),
      hourlySumInches: hours.every(hour => hour.inches !== null) ? hours.reduce((total, hour) => total + hour.inches!, 0) : null,
      hourlyMinimumCoverage: Math.min(...hours.map(hour => hour.coverage)),
      denseSampleInches: count ? sum / count / 25.4 : null, denseSamples: count };
  });

  // USGS rain gauges under the tile. Only the fields the comparison reads are kept.
  const degrees = (x: number, y: number) => [x / 6378137 * 180 / Math.PI, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI];
  const [west, south] = degrees(tile.xmin, tile.ymin), [east, north] = degrees(tile.xmax, tile.ymax);
  const gauges = await gaugeReadings([west, south, east, north], window.start, window.end);
  const kept = { type: 'FeatureCollection', features: (gauges.document.features as { properties: Record<string, unknown>; geometry: unknown }[]).map(feature => ({
    properties: { monitoring_location_id: feature.properties.monitoring_location_id, time_series_id: feature.properties.time_series_id,
      time: feature.properties.time, value: feature.properties.value }, geometry: feature.geometry })) };
  const correctedTiff = tileTiff(corrected.values, tile), radarTiff = tileTiff(radar.values, tile);
  const summary = (tiff: Uint8Array) => {
    const comparison = compareUnits(tiff, tile, kept, window);
    return { gaugesInWindow: comparison.gaugesInWindow, gaugesCompared: comparison.sites.length, medianRatio: comparison.medianRatio, middleHalf: comparison.middleHalf };
  };

  const directory = resolve(out), usgs = Buffer.from(JSON.stringify(kept)), weightBytes = Buffer.from(JSON.stringify(weights));
  // Never overwrite earlier evidence.
  await mkdir(directory, { recursive: false });
  await writeFile(join(directory, 'corrected-24h.tiff.gz'), gzipSync(correctedTiff));
  await writeFile(join(directory, 'radar-only-24h.tiff.gz'), gzipSync(radarTiff));
  await writeFile(join(directory, 'usgs-precipitation.json.gz'), gzipSync(usgs));
  await writeFile(join(directory, 'weights.json.gz'), gzipSync(weightBytes));
  await writeFile(join(directory, 'capture.json'), JSON.stringify({ capturedAt: new Date().toISOString(), window, tile,
    sources: { corrected: { url: correctedUrl24, ...corrected.source }, radarOnly: { url: radarUrl, ...radar.source }, usgs: { url: gauges.url, pages: gauges.pages } },
    sha256: { correctedTiff: hash(correctedTiff), radarOnlyTiff: hash(radarTiff), usgs: hash(usgs), weights: hash(weightBytes) },
    basins: results, gauges: { corrected: summary(correctedTiff), radarOnly: summary(radarTiff) } }, null, 2) + '\n');
  console.log(JSON.stringify({ window, basins: results.map(basin => ({ site: basin.site, corrected: basin.corrected.inches, radarOnly: basin.radarOnly.inches,
    hourlySum: basin.hourlySumInches, dense: basin.denseSampleInches, covered: basin.weightedAreaFraction })),
    gauges: { corrected: summary(correctedTiff), radarOnly: summary(radarTiff) } }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

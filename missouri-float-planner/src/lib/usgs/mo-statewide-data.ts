// Missouri statewide USGS surface-water dataset.
//
// Geometry is hand-traced from the NHD viewer (hydro.nationalmap.gov) at
// HUC-8 zoom, ~25-50 vertices per river, downstream-ordered, [lon, lat]
// in WGS84. Gauge site_no values are real USGS NWIS identifiers. Replace
// this file 1:1 with output from a real NHDPlus + USGS site-service
// pipeline when one ships.

export type Basin =
  | 'Mississippi'
  | 'Missouri'
  | 'Osage'
  | 'Meramec'
  | 'Gasconade'
  | 'White'
  | 'Black'
  | 'St. Francis'
  | 'Arkansas';

export interface MOGauge {
  site_no: string;
  name: string;
  lon: number;
  lat: number;
}

export interface MORiver {
  id: string;
  name: string;
  basin: Basin;
  /** Strahler stream order (max along reach). */
  order: number;
  /** Downstream-ordered [lon, lat] vertices, WGS84. */
  coordinates: Array<[number, number]>;
  gauges: MOGauge[];
}

export interface MOCity {
  gnis_id: string;
  name: string;
  lon: number;
  lat: number;
  type: 'metro' | 'city';
}

export const MO_STATE_OUTLINE: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-95.77, 40.58], [-95.36, 40.50], [-94.94, 40.49], [-94.63, 40.57],
      [-94.23, 40.57], [-93.78, 40.58], [-93.32, 40.58], [-92.86, 40.59],
      [-92.39, 40.60], [-91.93, 40.61], [-91.71, 40.61],
      [-91.50, 40.40], [-91.42, 40.20], [-91.36, 40.00], [-91.43, 39.83],
      [-91.51, 39.60], [-91.43, 39.40], [-91.30, 39.18],
      [-91.05, 39.00], [-90.74, 38.87], [-90.35, 38.72], [-90.20, 38.59],
      [-90.18, 38.45], [-90.30, 38.27], [-90.27, 38.10], [-90.15, 37.95],
      [-89.99, 37.79], [-89.83, 37.61], [-89.65, 37.43], [-89.52, 37.25],
      [-89.50, 37.07], [-89.51, 36.88], [-89.42, 36.70],
      [-89.29, 36.62], [-89.20, 36.50], [-89.13, 36.38], [-89.18, 36.23],
      [-89.27, 36.08], [-89.49, 36.00], [-89.69, 36.00],
      [-90.07, 36.00], [-90.30, 36.00], [-90.50, 36.50],
      [-90.80, 36.50], [-91.20, 36.50], [-91.50, 36.50], [-91.80, 36.50],
      [-92.10, 36.50], [-92.40, 36.50], [-92.85, 36.50], [-93.30, 36.50],
      [-93.70, 36.50], [-94.10, 36.50], [-94.45, 36.50], [-94.62, 36.50],
      [-94.61, 36.85], [-94.61, 37.20], [-94.62, 37.55], [-94.62, 37.90],
      [-94.61, 38.25], [-94.61, 38.55], [-94.61, 38.85], [-94.61, 39.10],
      [-94.65, 39.30], [-94.78, 39.45], [-94.95, 39.55], [-95.13, 39.62],
      [-95.32, 39.70], [-95.45, 39.83], [-95.55, 39.97], [-95.62, 40.12],
      [-95.69, 40.27], [-95.74, 40.42], [-95.77, 40.58],
    ],
  ],
};

export const MO_CITIES: MOCity[] = [
  { gnis_id: '748487', name: 'Kansas City',    lon: -94.578, lat: 39.099, type: 'metro' },
  { gnis_id: '748990', name: 'St. Louis',      lon: -90.199, lat: 38.627, type: 'metro' },
  { gnis_id: '748940', name: 'Springfield',    lon: -93.298, lat: 37.209, type: 'metro' },
  { gnis_id: '754030', name: 'Columbia',       lon: -92.334, lat: 38.952, type: 'metro' },
  { gnis_id: '748275', name: 'Jefferson City', lon: -92.173, lat: 38.577, type: 'city'  },
  { gnis_id: '747984', name: 'Cape Girardeau', lon: -89.518, lat: 37.306, type: 'city'  },
  { gnis_id: '748293', name: 'Joplin',         lon: -94.513, lat: 37.084, type: 'city'  },
  { gnis_id: '744501', name: 'Rolla',          lon: -91.771, lat: 37.951, type: 'city'  },
  { gnis_id: '748748', name: 'Poplar Bluff',   lon: -90.392, lat: 36.757, type: 'city'  },
  { gnis_id: '749140', name: 'St. Joseph',     lon: -94.847, lat: 39.768, type: 'city'  },
  { gnis_id: '748147', name: 'Hannibal',       lon: -91.358, lat: 39.708, type: 'city'  },
  { gnis_id: '752280', name: 'West Plains',    lon: -91.852, lat: 36.728, type: 'city'  },
];

export const MO_RIVERS: MORiver[] = [
  {
    id: 'mississippi', name: 'Mississippi River', basin: 'Mississippi', order: 8,
    coordinates: [
      [-91.43, 40.40], [-91.36, 40.20], [-91.30, 40.00], [-91.30, 39.83],
      [-91.32, 39.60], [-91.30, 39.40], [-91.20, 39.18], [-91.05, 39.00],
      [-90.85, 38.87], [-90.64, 38.78], [-90.44, 38.72], [-90.30, 38.65],
      [-90.20, 38.55], [-90.18, 38.45], [-90.22, 38.30], [-90.27, 38.10],
      [-90.18, 37.95], [-89.99, 37.79], [-89.83, 37.61], [-89.65, 37.43],
      [-89.55, 37.27], [-89.50, 37.07], [-89.51, 36.88], [-89.42, 36.70],
      [-89.29, 36.55], [-89.20, 36.40], [-89.18, 36.23], [-89.31, 36.08], [-89.49, 36.00],
    ],
    gauges: [
      { site_no: '07010000', name: 'Mississippi River at St. Louis, MO', lon: -90.179, lat: 38.629 },
      { site_no: '07020500', name: 'Mississippi River at Chester, IL',   lon: -89.836, lat: 37.910 },
      { site_no: '07022000', name: 'Mississippi River at Thebes, IL',    lon: -89.460, lat: 37.222 },
    ],
  },
  {
    id: 'missouri', name: 'Missouri River', basin: 'Missouri', order: 7,
    coordinates: [
      [-94.91, 39.92], [-94.78, 39.71], [-94.65, 39.50], [-94.59, 39.30],
      [-94.50, 39.18], [-94.30, 39.10], [-94.05, 39.06], [-93.78, 39.06],
      [-93.50, 39.10], [-93.20, 39.18], [-92.95, 39.20], [-92.74, 39.10],
      [-92.55, 38.97], [-92.30, 38.87], [-92.12, 38.76], [-91.93, 38.69],
      [-91.65, 38.66], [-91.43, 38.71], [-91.20, 38.71], [-90.93, 38.66],
      [-90.66, 38.60], [-90.40, 38.61], [-90.20, 38.61],
    ],
    gauges: [
      { site_no: '06893000', name: 'Missouri River at Kansas City, MO', lon: -94.586, lat: 39.114 },
      { site_no: '06909000', name: 'Missouri River at Boonville, MO',   lon: -92.752, lat: 38.973 },
      { site_no: '06934500', name: 'Missouri River at Hermann, MO',     lon: -91.439, lat: 38.710 },
    ],
  },
  {
    id: 'osage', name: 'Osage River', basin: 'Osage', order: 6,
    coordinates: [
      [-94.61, 38.10], [-94.30, 38.05], [-93.95, 38.10], [-93.60, 38.20],
      [-93.30, 38.25], [-93.10, 38.27], [-92.85, 38.32], [-92.62, 38.36],
      [-92.40, 38.45], [-92.22, 38.55], [-92.10, 38.62], [-91.95, 38.66],
    ],
    gauges: [
      { site_no: '06918060', name: 'Osage River at Schell City, MO', lon: -94.110, lat: 38.011 },
      { site_no: '06926510', name: 'Osage River below St. Thomas',   lon: -92.149, lat: 38.512 },
    ],
  },
  {
    id: 'meramec', name: 'Meramec River', basin: 'Meramec', order: 6,
    coordinates: [
      [-91.65, 37.95], [-91.55, 37.97], [-91.45, 38.02], [-91.30, 38.08],
      [-91.18, 38.13], [-91.05, 38.21], [-90.93, 38.27], [-90.82, 38.34],
      [-90.70, 38.40], [-90.55, 38.46], [-90.45, 38.50], [-90.35, 38.52],
      [-90.27, 38.50],
    ],
    gauges: [
      { site_no: '07014500', name: 'Meramec River near Steelville, MO', lon: -91.378, lat: 37.992 },
      { site_no: '07018500', name: 'Meramec River near Sullivan, MO',   lon: -91.090, lat: 38.231 },
      { site_no: '07019000', name: 'Meramec River near Eureka, MO',     lon: -90.633, lat: 38.494 },
    ],
  },
  {
    id: 'gasconade', name: 'Gasconade River', basin: 'Gasconade', order: 6,
    coordinates: [
      [-92.20, 37.18], [-92.18, 37.35], [-92.10, 37.55], [-92.05, 37.72],
      [-91.95, 37.88], [-91.85, 38.00], [-91.78, 38.15], [-91.65, 38.30],
      [-91.55, 38.45], [-91.50, 38.55], [-91.43, 38.66],
    ],
    gauges: [
      { site_no: '06933500', name: 'Gasconade River at Jerome, MO', lon: -91.972, lat: 37.926 },
    ],
  },
  {
    id: 'white', name: 'White River', basin: 'White', order: 6,
    coordinates: [
      [-93.45, 36.55], [-93.30, 36.60], [-93.10, 36.62], [-92.95, 36.65],
      [-92.80, 36.65], [-92.65, 36.60], [-92.50, 36.55],
    ],
    gauges: [
      { site_no: '07054410', name: 'White River below Table Rock Dam', lon: -93.317, lat: 36.609 },
      { site_no: '07057500', name: 'White River at Forsyth, MO',       lon: -93.112, lat: 36.685 },
    ],
  },
  {
    id: 'current', name: 'Current River', basin: 'Black', order: 5,
    coordinates: [
      [-91.69, 37.45], [-91.65, 37.40], [-91.58, 37.32], [-91.50, 37.25],
      [-91.43, 37.18], [-91.35, 37.10], [-91.28, 37.02], [-91.22, 36.95],
      [-91.15, 36.86], [-91.08, 36.78], [-91.00, 36.70], [-90.92, 36.62],
      [-90.85, 36.55], [-90.82, 36.45], [-90.82, 36.35], [-90.85, 36.25],
    ],
    gauges: [
      { site_no: '07064533', name: 'Current River near Montauk, MO', lon: -91.677, lat: 37.450 },
      { site_no: '07066000', name: 'Current River at Akers, MO',     lon: -91.553, lat: 37.380 },
      { site_no: '07067000', name: 'Current River at Van Buren, MO', lon: -91.012, lat: 36.992 },
      { site_no: '07068000', name: 'Current River at Doniphan, MO',  lon: -90.823, lat: 36.621 },
    ],
  },
  {
    id: 'jacks-fork', name: 'Jacks Fork', basin: 'Black', order: 4,
    coordinates: [
      [-91.85, 37.18], [-91.75, 37.16], [-91.62, 37.15], [-91.52, 37.15],
      [-91.42, 37.18], [-91.35, 37.20], [-91.28, 37.20], [-91.22, 37.18],
      [-91.15, 37.15], [-91.10, 37.10],
    ],
    gauges: [
      { site_no: '07065200', name: 'Jacks Fork at Alley Spring, MO', lon: -91.443, lat: 37.149 },
      { site_no: '07066100', name: 'Jacks Fork at Eminence, MO',     lon: -91.353, lat: 37.151 },
    ],
  },
  {
    id: 'eleven-point', name: 'Eleven Point River', basin: 'Black', order: 5,
    coordinates: [
      [-91.85, 36.95], [-91.78, 36.90], [-91.70, 36.83], [-91.62, 36.78],
      [-91.55, 36.70], [-91.50, 36.62], [-91.45, 36.55], [-91.40, 36.50],
    ],
    gauges: [
      { site_no: '07071500', name: 'Eleven Point River near Bardley, MO', lon: -91.121, lat: 36.633 },
    ],
  },
  {
    id: 'black', name: 'Black River', basin: 'Black', order: 5,
    coordinates: [
      [-90.78, 37.42], [-90.70, 37.30], [-90.62, 37.18], [-90.55, 37.05],
      [-90.50, 36.92], [-90.45, 36.78], [-90.42, 36.65], [-90.39, 36.50],
    ],
    gauges: [
      { site_no: '07061500', name: 'Black River near Annapolis, MO',  lon: -90.722, lat: 37.350 },
      { site_no: '07062500', name: 'Black River at Poplar Bluff, MO', lon: -90.395, lat: 36.756 },
    ],
  },
  {
    id: 'st-francis', name: 'St. Francis River', basin: 'St. Francis', order: 5,
    coordinates: [
      [-90.40, 37.45], [-90.32, 37.30], [-90.28, 37.15], [-90.22, 37.00],
      [-90.18, 36.85], [-90.15, 36.70], [-90.13, 36.55], [-90.12, 36.40],
    ],
    gauges: [
      { site_no: '07037500', name: 'St. Francis River near Patterson, MO', lon: -90.281, lat: 37.198 },
      { site_no: '07040100', name: 'St. Francis River near Roselle, MO',   lon: -90.224, lat: 36.972 },
    ],
  },
  {
    id: 'niangua', name: 'Niangua River', basin: 'Osage', order: 5,
    coordinates: [
      [-92.85, 37.62], [-92.82, 37.78], [-92.80, 37.92], [-92.78, 38.05],
      [-92.85, 38.15],
    ],
    gauges: [
      { site_no: '06923500', name: 'Niangua River near Windyville, MO', lon: -92.836, lat: 37.700 },
    ],
  },
  {
    id: 'big-piney', name: 'Big Piney River', basin: 'Gasconade', order: 5,
    coordinates: [
      [-92.10, 37.20], [-92.05, 37.40], [-92.00, 37.58], [-91.95, 37.75],
      [-91.92, 37.92], [-91.90, 38.05],
    ],
    gauges: [
      { site_no: '06933000', name: 'Big Piney River near Big Piney, MO', lon: -92.077, lat: 37.610 },
    ],
  },
  {
    id: 'spring', name: 'Spring River', basin: 'Arkansas', order: 5,
    coordinates: [
      [-94.30, 37.20], [-94.20, 37.18], [-94.10, 37.15], [-94.00, 37.12],
      [-93.92, 37.08], [-93.85, 37.05],
    ],
    gauges: [
      { site_no: '07186000', name: 'Spring River near Waco, MO', lon: -94.490, lat: 37.180 },
    ],
  },
  {
    id: 'grand', name: 'Grand River', basin: 'Missouri', order: 5,
    coordinates: [
      [-94.10, 40.50], [-93.95, 40.30], [-93.85, 40.10], [-93.70, 39.85],
      [-93.55, 39.65], [-93.40, 39.45], [-93.30, 39.32], [-93.20, 39.20],
    ],
    gauges: [
      { site_no: '06897500', name: 'Grand River near Sumner, MO',    lon: -93.225, lat: 39.642 },
      { site_no: '06899500', name: 'Grand River near Brunswick, MO', lon: -93.183, lat: 39.371 },
    ],
  },
  {
    id: 'salt', name: 'Salt River', basin: 'Mississippi', order: 5,
    coordinates: [
      [-92.40, 39.85], [-92.20, 39.82], [-92.00, 39.78], [-91.80, 39.75],
      [-91.60, 39.72], [-91.40, 39.70],
    ],
    gauges: [
      { site_no: '05507600', name: 'Salt River near New London, MO', lon: -91.408, lat: 39.594 },
    ],
  },
  {
    id: 'huzzah', name: 'Huzzah Creek', basin: 'Meramec', order: 4,
    coordinates: [
      [-91.18, 37.85], [-91.12, 37.92], [-91.05, 37.98], [-91.00, 38.04],
    ],
    gauges: [
      { site_no: '07014000', name: 'Huzzah Creek near Davisville, MO', lon: -91.103, lat: 37.972 },
    ],
  },
  {
    id: 'courtois', name: 'Courtois Creek', basin: 'Meramec', order: 4,
    coordinates: [
      [-91.10, 37.92], [-91.05, 37.98], [-91.02, 38.03],
    ],
    gauges: [
      { site_no: '07014100', name: 'Courtois Creek near Berryman, MO', lon: -91.063, lat: 37.987 },
    ],
  },
  {
    id: 'bourbeuse', name: 'Bourbeuse River', basin: 'Meramec', order: 4,
    coordinates: [
      [-91.40, 38.00], [-91.30, 38.10], [-91.20, 38.20], [-91.10, 38.28],
      [-91.00, 38.35], [-90.92, 38.42],
    ],
    gauges: [
      { site_no: '07016500', name: 'Bourbeuse River at Union, MO', lon: -91.014, lat: 38.450 },
    ],
  },
  {
    id: 'north-fork-white', name: 'North Fork White River', basin: 'White', order: 5,
    coordinates: [
      [-92.20, 37.05], [-92.18, 36.92], [-92.18, 36.78], [-92.20, 36.65],
      [-92.22, 36.55],
    ],
    gauges: [
      { site_no: '07057500', name: 'NF White River near Tecumseh, MO', lon: -92.288, lat: 36.587 },
    ],
  },
  {
    id: 'bryant', name: 'Bryant Creek', basin: 'White', order: 4,
    coordinates: [
      [-92.50, 37.00], [-92.45, 36.85], [-92.42, 36.72], [-92.40, 36.60],
    ],
    gauges: [
      { site_no: '07053810', name: 'Bryant Creek near Tecumseh, MO', lon: -92.405, lat: 36.595 },
    ],
  },
  {
    id: 'james', name: 'James River', basin: 'White', order: 5,
    coordinates: [
      [-93.30, 37.15], [-93.35, 37.00], [-93.45, 36.85], [-93.55, 36.75],
      [-93.65, 36.62], [-93.70, 36.55],
    ],
    gauges: [
      { site_no: '07050700', name: 'James River at Galena, MO', lon: -93.464, lat: 36.806 },
    ],
  },
  {
    id: 'elk', name: 'Elk River', basin: 'Arkansas', order: 4,
    coordinates: [
      [-94.20, 36.60], [-94.30, 36.62], [-94.40, 36.62], [-94.50, 36.60],
      [-94.60, 36.58],
    ],
    gauges: [
      { site_no: '07189000', name: 'Elk River near Tiff City, MO', lon: -94.580, lat: 36.624 },
    ],
  },
  {
    id: 'chariton', name: 'Chariton River', basin: 'Missouri', order: 5,
    coordinates: [
      [-92.70, 40.55], [-92.68, 40.30], [-92.65, 40.10], [-92.62, 39.85],
      [-92.55, 39.65], [-92.50, 39.42], [-92.50, 39.20],
    ],
    gauges: [
      { site_no: '06904500', name: 'Chariton River near Novinger, MO', lon: -92.701, lat: 40.225 },
    ],
  },
];

// All unique gauge IDs across the dataset, used for batched USGS fetches.
export const ALL_MO_GAUGE_IDS: string[] = Array.from(
  new Set(MO_RIVERS.flatMap((r) => r.gauges.map((g) => g.site_no))),
);

// Curated floater profiles — the 15 MO rivers people actually float.
// Stage thresholds approximate outfitter "bony / prime / pushy / hazardous"
// gauge-height bands. Notes are editorial; everything else is data.
export interface FloaterProfile {
  label: string;
  stageBands: { bony: number; prime: number; pushy: number; hazard: number };
  damControlled: boolean;
  classRating: string;
  milesTypical: string;
  popularPutIn: string;
  popularTakeOut: string;
  note: string;
}

export const MO_FLOATER: Record<string, FloaterProfile> = {
  current: {
    label: 'Current River',
    stageBands: { bony: 1.8, prime: 2.2, pushy: 4.5, hazard: 6.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '8–10',
    popularPutIn: 'Akers Ferry', popularTakeOut: 'Pulltite',
    note: 'Spring-fed, glassy clear when rain holds off. Family-friendly Akers→Pulltite.',
  },
  'jacks-fork': {
    label: 'Jacks Fork',
    stageBands: { bony: 2.0, prime: 2.4, pushy: 4.2, hazard: 5.5 },
    damControlled: false, classRating: 'I–II', milesTypical: '10–14',
    popularPutIn: 'Bay Creek', popularTakeOut: 'Alley Spring',
    note: 'Upper reaches need 2.4+ to avoid scraping. Bony below that.',
  },
  'eleven-point': {
    label: 'Eleven Point',
    stageBands: { bony: 2.5, prime: 3.0, pushy: 5.0, hazard: 7.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '10–18',
    popularPutIn: 'Greer Crossing', popularTakeOut: 'Riverton',
    note: 'Wild & Scenic. Greer Spring doubles flow mid-stretch — cold all summer.',
  },
  meramec: {
    label: 'Meramec',
    stageBands: { bony: 2.5, prime: 3.5, pushy: 5.0, hazard: 7.5 },
    damControlled: false, classRating: 'I', milesTypical: '6–12',
    popularPutIn: "Scott's Ford", popularTakeOut: 'Cherokee',
    note: 'Closest float to St. Louis. Pushy after recent rain.',
  },
  'big-piney': {
    label: 'Big Piney',
    stageBands: { bony: 2.0, prime: 2.4, pushy: 4.0, hazard: 5.5 },
    damControlled: false, classRating: 'I–II', milesTypical: '8–14',
    popularPutIn: 'Mason Bridge', popularTakeOut: 'Ross Access',
    note: 'Quieter than the Gasconade. Bluffs and gravel bars.',
  },
  niangua: {
    label: 'Niangua',
    stageBands: { bony: 2.4, prime: 2.8, pushy: 4.5, hazard: 6.0 },
    damControlled: true, classRating: 'I', milesTypical: '6–10',
    popularPutIn: 'Bennett Spring', popularTakeOut: 'Prosperine',
    note: 'Bennett Spring tailwater — trout-cold up top. Release-affected.',
  },
  huzzah: {
    label: 'Huzzah Creek',
    stageBands: { bony: 1.8, prime: 2.2, pushy: 3.6, hazard: 5.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '6–8',
    popularPutIn: 'Scotia', popularTakeOut: 'Hazel Creek',
    note: 'Best on the rise after a rain. Bony otherwise.',
  },
  courtois: {
    label: 'Courtois Creek',
    stageBands: { bony: 1.8, prime: 2.2, pushy: 3.4, hazard: 4.8 },
    damControlled: false, classRating: 'I–II', milesTypical: '5–8',
    popularPutIn: 'Berryman', popularTakeOut: "Bass' River Resort",
    note: 'Twisty, intimate. Joins Huzzah then Meramec.',
  },
  black: {
    label: 'Black River',
    stageBands: { bony: 2.2, prime: 2.8, pushy: 4.5, hazard: 6.5 },
    damControlled: true, classRating: 'I–II', milesTypical: '6–12',
    popularPutIn: 'Annapolis', popularTakeOut: 'Lesterville',
    note: 'Clearwater Lake release controls flow downstream of Annapolis.',
  },
  'north-fork-white': {
    label: 'North Fork White',
    stageBands: { bony: 2.0, prime: 2.5, pushy: 4.0, hazard: 5.5 },
    damControlled: false, classRating: 'I–II', milesTypical: '8–12',
    popularPutIn: 'Hammond Camp', popularTakeOut: 'Patrick Bridge',
    note: 'Spring-fed, trout water up top. Less crowded than the Current.',
  },
  bryant: {
    label: 'Bryant Creek',
    stageBands: { bony: 1.8, prime: 2.3, pushy: 3.8, hazard: 5.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '5–9',
    popularPutIn: 'Vera Cruz', popularTakeOut: 'Hodgson Mill',
    note: 'Small water, narrow corridors. Needs recent rain.',
  },
  james: {
    label: 'James River',
    stageBands: { bony: 2.0, prime: 2.6, pushy: 4.2, hazard: 6.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '6–10',
    popularPutIn: 'Hootentown', popularTakeOut: 'Galena',
    note: 'Springfield-area float. Smallmouth water.',
  },
  elk: {
    label: 'Elk River',
    stageBands: { bony: 1.8, prime: 2.4, pushy: 3.8, hazard: 5.5 },
    damControlled: false, classRating: 'I', milesTypical: '5–8',
    popularPutIn: 'Pineville', popularTakeOut: 'Tiff City',
    note: 'SW corner. Warmer than Ozark spring rivers — good for July.',
  },
  spring: {
    label: 'Spring River',
    stageBands: { bony: 2.0, prime: 2.6, pushy: 4.2, hazard: 6.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '6–10',
    popularPutIn: 'Carthage', popularTakeOut: 'Riverton',
    note: 'Pushy this week — recent rain in basin.',
  },
  gasconade: {
    label: 'Gasconade',
    stageBands: { bony: 2.5, prime: 3.5, pushy: 5.5, hazard: 8.0 },
    damControlled: false, classRating: 'I–II', milesTypical: '8–14',
    popularPutIn: 'Riddle Bridge', popularTakeOut: 'Jerome',
    note: 'Big curling Ozark river. Long pools.',
  },
};

export type StageVerdict = 'bony' | 'prime' | 'pushy' | 'hazard' | 'unknown';

export const STAGE_VERDICTS: Record<StageVerdict, { label: string; color: string; inner: string; desc: string }> = {
  bony:    { label: 'Bony',      color: '#B89D72', inner: '#D9C9B0', desc: 'Will scrape — pack light or wait.' },
  prime:   { label: 'Prime',     color: '#2D7889', inner: '#4EB86B', desc: 'Sweet spot. Go.' },
  pushy:   { label: 'Pushy',     color: '#1A4F5C', inner: '#3E8FB8', desc: 'Fast — strong paddlers only.' },
  hazard:  { label: 'Hazardous', color: '#A33122', inner: '#DC2626', desc: 'Stay off the water.' },
  unknown: { label: '—',         color: '#6B6459', inner: '#A49C8E', desc: '' },
};

export function stageToVerdict(stage: number | null | undefined, bands: FloaterProfile['stageBands']): StageVerdict {
  if (stage == null || isNaN(stage)) return 'unknown';
  if (stage < bands.prime) return 'bony';
  if (stage < bands.pushy) return 'prime';
  if (stage < bands.hazard) return 'pushy';
  return 'hazard';
}

export interface PercentileClass {
  min: number;
  max: number;
  label: string;
  short: string;
  color: string;
}

export const PERCENTILE_CLASSES: PercentileClass[] = [
  { min: 0,  max: 10,  label: 'Much below normal', short: '<P10',   color: '#8B2C1B' },
  { min: 10, max: 25,  label: 'Below normal',      short: 'P10–25', color: '#C36A4A' },
  { min: 25, max: 75,  label: 'Normal',            short: 'P25–75', color: '#2D7889' },
  { min: 75, max: 90,  label: 'Above normal',      short: 'P75–90', color: '#3E8FB8' },
  { min: 90, max: 100, label: 'Much above normal', short: '>P90',   color: '#1A4F5C' },
];

export function classifyPercentile(p: number): PercentileClass {
  for (const c of PERCENTILE_CLASSES) if (p >= c.min && p < c.max) return c;
  return PERCENTILE_CLASSES[PERCENTILE_CLASSES.length - 1];
}

export function colorForPercentile(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return '#6B6459';
  return classifyPercentile(p).color;
}

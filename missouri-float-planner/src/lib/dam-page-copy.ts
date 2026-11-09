// src/lib/dam-page-copy.ts
// Search titles, descriptions, the short "About" text and the structured data
// for each dam page.
//
// One template for every dam made every title read "<Dam> Generation
// Schedule, Lake Level & Releases": three keyword phrases stacked, identical
// apart from the name. Each title now names the dam first and leads with what
// the page uniquely provides there: the hourly generation schedule, the
// generation forecast, or the release where no schedule exists. Lake level
// follows as the second item rather than leading; Search Console shows
// lake-level queries with impressions but few clicks, and release-schedule
// queries (Fort Gibson's among them) with real traction. One qualifier
// distinguishes a title where the name alone is ambiguous ("Beaver Dam" is
// also a Wisconsin city).
//
// Copy must describe what the page actually renders. dam-page-copy.test.ts
// holds every claim to a declared capability: "schedule" to an SWPA project,
// "forecast" to a declared generation-forecast series, "level" to a declared
// pool source, "water temperature" to a declared tailwater series. It also
// fails for a dam added to the registry without copy here.

import type { UsaceDam } from '@/lib/flow-providers/usace-registry';
import { hasPowerhouse } from '@/lib/flow-providers/usace-registry';

export const SITE_URL = 'https://eddy.guide';

export interface DamPageCopy {
  /** The root layout's template appends the brand; see TITLE_TEMPLATE. */
  title: string;
  /** The search snippet: ~100–160 characters, specific to this dam. */
  description: string;
  /** The water a release flows into, named as people search for it. */
  belowDam: string;
  /**
   * Who operates the project, written out per dam rather than assumed. The
   * test cross-checks it against the registry's CWMS office and Ameren feed.
   * Absent only on the generated fallback for a dam without written copy.
   */
  operator?: string;
}

export const DAM_PAGE_COPY: Record<string, DamPageCopy> = {
  'swl-clearwater-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Clearwater Dam Release to the Black River & Lake Level',
    description: 'Current release from Clearwater Dam into the Black River near Piedmont, Missouri, and Clearwater Lake level, from the U.S. Army Corps of Engineers.',
    belowDam: 'the Black River',
  },
  'swl-table-rock-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Table Rock Dam Generation Schedule & Lake Level',
    description: 'Hourly SWPA generation schedule for Table Rock Dam, the current release into Lake Taneycomo, and Table Rock Lake level near Branson, Missouri.',
    belowDam: 'Lake Taneycomo',
  },
  'swl-bull-shoals-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Bull Shoals Dam Generation Schedule & White River Flows',
    description: 'Hourly generation schedule and current release from Bull Shoals Dam into the White River trout tailwater, plus Bull Shoals Lake level in north Arkansas.',
    belowDam: 'the White River',
  },
  'swl-beaver-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Beaver Dam, Arkansas: Generation Schedule & Lake Level',
    description: 'Hourly generation schedule for Beaver Dam on the White River near Eureka Springs, with the current release, water temperature and Beaver Lake level.',
    belowDam: 'the White River',
  },
  'swl-norfork-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Norfork Dam Generation Schedule & North Fork River Release',
    description: 'Hourly generation schedule and current release from Norfork Dam into the North Fork River trout tailwater, with water temperature and Norfork Lake level.',
    belowDam: 'the North Fork River',
  },
  'swl-greers-ferry-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Greers Ferry Dam Generation Schedule: Little Red River',
    description: 'Hourly generation schedule and release from Greers Ferry Dam to the Little Red River at Heber Springs, plus water temperature and Greers Ferry Lake level.',
    belowDam: 'the Little Red River',
  },
  'mvs-wappapello': {
    operator: 'the U.S. Army Corps of Engineers, St. Louis District',
    title: 'Wappapello Dam Release & Lake Level: St. Francis River',
    description: 'Daily average release from Wappapello Dam into the St. Francis River and Wappapello Lake level in southeast Missouri, from the Corps of Engineers.',
    belowDam: 'the St. Francis River',
  },
  'mvs-mark-twain': {
    operator: 'the U.S. Army Corps of Engineers, St. Louis District',
    title: 'Clarence Cannon Dam Schedule & Mark Twain Lake Level',
    description: 'Hourly SWPA generation schedule for Clarence Cannon Dam, the daily release into the Salt River, and Mark Twain Lake level in northeast Missouri.',
    belowDam: 'the Salt River',
  },
  'nwk-stockton-dam': {
    operator: 'the U.S. Army Corps of Engineers, Kansas City District',
    title: 'Stockton Dam Generation Schedule: Stockton Lake, MO',
    description: 'Hourly SWPA generation schedule for Stockton Dam, showing when its turbine is planned to run on the Sac River below Stockton Lake in southwest Missouri.',
    belowDam: 'the Sac River',
  },
  'nwk-truman-dam': {
    operator: 'the U.S. Army Corps of Engineers, Kansas City District',
    title: 'Truman Dam Generation Schedule & Truman Lake Level',
    description: 'Hourly SWPA generation schedule for Harry S. Truman Dam, with Truman Lake level and the daily outflow into Lake of the Ozarks near Warsaw, Missouri.',
    belowDam: 'Lake of the Ozarks',
  },
  'swt-tenkiller-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Tenkiller Dam Generation Schedule & Lower Illinois River',
    description: 'Hourly generation schedule for Tenkiller Ferry Dam and its release into the Lower Illinois River trout tailwater, plus Tenkiller Lake level in Oklahoma.',
    belowDam: 'the Lower Illinois River',
  },
  'swt-fort-gibson-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Fort Gibson Dam Generation Schedule & Lake Level',
    description: 'Hourly SWPA generation schedule and turbine water release for Fort Gibson Dam on the Grand (Neosho) River, plus Fort Gibson Lake level in Oklahoma.',
    belowDam: 'the Grand (Neosho) River',
  },
  'swt-broken-bow-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Broken Bow Dam Generation Schedule & Mountain Fork Flows',
    description: 'Hourly generation schedule and turbine release from Broken Bow Dam into the Lower Mountain Fork River trout stream, plus Broken Bow Lake level.',
    belowDam: 'the Lower Mountain Fork River',
  },
  'swt-eufaula-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Eufaula Dam Generation Schedule & Lake Eufaula Level',
    description: 'Hourly SWPA generation schedule and turbine release for Eufaula Dam on the Canadian River, plus Lake Eufaula level in eastern Oklahoma.',
    belowDam: 'the Canadian River',
  },
  'swt-keystone-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Keystone Dam Generation Schedule & Keystone Lake Level',
    description: 'Hourly SWPA generation schedule, turbine release into the Arkansas River, and Keystone Lake level for Keystone Dam, upstream of Tulsa, Oklahoma.',
    belowDam: 'the Arkansas River',
  },
  'swt-denison-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Denison Dam Generation Schedule & Lake Texoma Level',
    description: 'Hourly SWPA generation schedule and turbine release into the Red River for Denison Dam, plus Lake Texoma level on the Texas–Oklahoma line.',
    belowDam: 'the Red River',
  },
  'swt-robert-s-kerr-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Robert S. Kerr Lock & Dam Generation Schedule',
    description: 'Hourly SWPA generation schedule, release and pool level for Robert S. Kerr Lock and Dam on the Arkansas River navigation channel in eastern Oklahoma.',
    belowDam: 'the Arkansas River',
  },
  'swt-webbers-falls-dam': {
    operator: 'the U.S. Army Corps of Engineers, Tulsa District',
    title: 'Webbers Falls Lock & Dam Generation Schedule',
    description: 'Hourly SWPA generation schedule, release and pool level for Webbers Falls Lock and Dam on the Arkansas River near Webbers Falls, Oklahoma.',
    belowDam: 'the Arkansas River',
  },
  'swl-ozark-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Ozark Lock & Dam Generation Schedule: Arkansas River',
    description: 'Hourly SWPA generation schedule, release and Ozark Lake pool level for Ozark Lock and Dam on the Arkansas River near Ozark, Arkansas.',
    belowDam: 'the Arkansas River',
  },
  'swl-dardanelle-dam': {
    operator: 'the U.S. Army Corps of Engineers, Little Rock District',
    title: 'Dardanelle Lock & Dam Generation Schedule & Lake Level',
    description: 'Hourly SWPA generation schedule, release and Lake Dardanelle level for Dardanelle Lock and Dam on the Arkansas River at Russellville, Arkansas.',
    belowDam: 'the Arkansas River',
  },
  'lrn-wolf-creek-dam': {
    operator: 'the U.S. Army Corps of Engineers, Nashville District',
    title: 'Wolf Creek Dam Generation Forecast & Lake Cumberland Level',
    description: 'Corps generation forecast and release from Wolf Creek Dam into the Cumberland River trout tailwater, plus Lake Cumberland level in Kentucky.',
    belowDam: 'the Cumberland River',
  },
  'lrn-center-hill-dam': {
    operator: 'the U.S. Army Corps of Engineers, Nashville District',
    title: 'Center Hill Dam Generation Forecast & Caney Fork Release',
    description: 'Generation forecast and release from Center Hill Dam into the Caney Fork River trout tailwater, with water temperature and Center Hill Lake level.',
    belowDam: 'the Caney Fork River',
  },
  'lrn-dale-hollow-dam': {
    operator: 'the U.S. Army Corps of Engineers, Nashville District',
    title: 'Dale Hollow Dam Generation Forecast & Obey River Release',
    description: 'Generation forecast and release from Dale Hollow Dam into the Obey River trout tailwater near Celina, Tennessee, with Dale Hollow Lake level.',
    belowDam: 'the Obey River',
  },
  'ameren-bagnell-dam': {
    operator: 'Ameren Missouri',
    title: 'Bagnell Dam Release & Lake of the Ozarks Level',
    description: 'Current Lake of the Ozarks level and Bagnell Dam’s release into the Osage River at Lake Ozark, Missouri, from Ameren Missouri’s hourly readings.',
    belowDam: 'the Osage River',
  },
};

const STATE_NAMES: Record<UsaceDam['state'], string> = {
  MO: 'Missouri', AR: 'Arkansas', OK: 'Oklahoma', TX: 'Texas', KY: 'Kentucky', TN: 'Tennessee',
};

/** The Corps district each CWMS office belongs to. */
export const USACE_DISTRICT_OPERATORS: Record<NonNullable<UsaceDam['office']>, string> = {
  SWL: 'the U.S. Army Corps of Engineers, Little Rock District',
  MVS: 'the U.S. Army Corps of Engineers, St. Louis District',
  SWT: 'the U.S. Army Corps of Engineers, Tulsa District',
  LRN: 'the U.S. Army Corps of Engineers, Nashville District',
};

export function damStateName(dam: Pick<UsaceDam, 'state'>): string {
  return STATE_NAMES[dam.state];
}

/** The project publishes an hourly SWPA schedule that the page draws. */
export function damHasPostedSchedule(dam: UsaceDam): boolean {
  return Boolean(dam.swpaCode) && dam.amerenMetrics !== 'osage';
}

/**
 * Hand-written copy, or a capability-honest fallback so a dam added to the
 * registry before its copy still ships sensible metadata. The test fails until
 * the copy is written.
 */
export function damPageCopy(dam: UsaceDam): DamPageCopy {
  const written = DAM_PAGE_COPY[dam.id];
  if (written) return written;
  const scheduled = damHasPostedSchedule(dam);
  return {
    title: scheduled ? `${dam.name} Generation Schedule` : `${dam.name} Release`,
    description: `${scheduled ? 'Hourly generation schedule and current' : 'Current'} release for ${dam.name} in ${damStateName(dam)}, with readings from the dam and the water below it.`,
    belowDam: 'the river below the dam',
    operator: dam.office ? USACE_DISTRICT_OPERATORS[dam.office] : undefined,
  };
}

/**
 * Two or three plain sentences built only from declared facts: unique text
 * per dam that agrees with the readings above it. A registry name can be a
 * lake's name (Wappapello Lake), so nothing here infers what kind of
 * structure a name describes.
 */
export function damAboutSentences(dam: UsaceDam): string[] {
  const copy = damPageCopy(dam);
  const state = damStateName(dam);
  const operated = copy.operator ? ` is operated by ${copy.operator}` : '';
  const sentences: string[] = [];
  if (dam.lakeName && dam.lakeName !== dam.name) {
    sentences.push(copy.operator
      ? `${dam.name}, in ${state}, forms ${dam.lakeName} and${operated}.`
      : `${dam.name}, in ${state}, forms ${dam.lakeName}.`);
  } else {
    const subject = dam.lakeName ? `The dam at ${dam.lakeName}` : dam.name;
    sentences.push(copy.operator ? `${subject}, in ${state},${operated}.` : `${subject} is in ${state}.`);
  }
  if (!hasPowerhouse(dam)) {
    sentences.push('It has no powerhouse, so water leaves through its gates rather than turbines.');
  } else {
    const plant = dam.nameplate
      ? `Its powerhouse has ${dam.nameplate.units} generating ${dam.nameplate.units === 1 ? 'unit' : 'units'} rated at ${dam.nameplate.megawatts} MW`
      : 'Its powerhouse generates hydroelectric power';
    sentences.push(damHasPostedSchedule(dam)
      ? `${plant}, and the Southwestern Power Administration posts its hourly generation schedule.`
      : `${plant}.`);
  }
  sentences.push(`Water released here flows into ${copy.belowDam}${dam.tailwaterFishery === 'trout' ? ', a cold-water trout fishery' : ''}.`);
  return sentences;
}

/**
 * BreadcrumbList (a Google-supported rich result that mirrors the page's
 * "All lakes & dams" navigation) plus the structure itself as a schema.org
 * CivicStructure. schema.org has no Dam type; CivicStructure is the Place
 * subtype for fixed public structures (its siblings include Bridge), and it
 * accepts geo, containedInPlace, name and url. Google shows no rich result for
 * it. It is here only to state the structure's identity and location
 * accurately. Types and properties were checked against the schema.org
 * vocabulary on 2026-11-09, and the test keeps the output inside that set.
 */
export function damStructuredData(dam: UsaceDam) {
  const url = `${SITE_URL}/dams/${dam.id}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Lakes & Dams', item: `${SITE_URL}/dams` },
          { '@type': 'ListItem', position: 3, name: dam.name, item: url },
        ],
      },
      {
        '@type': 'CivicStructure',
        '@id': `${url}#structure`,
        name: dam.name,
        url,
        geo: { '@type': 'GeoCoordinates', latitude: dam.lat, longitude: dam.lon },
        containedInPlace: { '@type': 'State', name: damStateName(dam) },
      },
    ],
  };
}

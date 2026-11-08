// src/lib/dam-page-copy.ts
// Search titles, descriptions and the short "About" text for each dam page.
//
// One template for every dam made every title read "<Dam> Generation
// Schedule, Lake Level & Releases": three keyword phrases stacked, and
// identical apart from the name. Searchers look for one thing per query:
// trout anglers want a tailwater's generation schedule, and boaters want a
// reservoir's lake level. So each title leads with the one thing people search
// that dam for, and adds one qualifier: the river below the dam, the lake, or
// the state where the name alone is ambiguous ("Beaver Dam" is also a
// Wisconsin city). Descriptions name the water below the dam and a nearby town.
//
// Copy must describe what the page actually renders. dam-page-copy.test.ts
// holds each title to the dam's real capabilities. A title says "Generation
// Schedule" only for an SWPA-scheduled project and "Level" only where a pool
// reading exists (Stockton publishes none), and it fails for a dam added to
// the registry without copy here.

import type { UsaceDam } from '@/lib/flow-providers/usace-registry';
import { hasPowerhouse } from '@/lib/flow-providers/usace-registry';

export interface DamPageCopy {
  /** Under ~60 characters; the root layout appends " | Eddy". */
  title: string;
  /** The search snippet: ~110–160 characters, specific to this dam. */
  description: string;
  /** The water a release flows into, named as people search for it. */
  belowDam: string;
}

export const DAM_PAGE_COPY: Record<string, DamPageCopy> = {
  'swl-clearwater-dam': {
    title: 'Clearwater Lake Level & Dam Release to the Black River',
    description: 'Clearwater Lake level and the current release from Clearwater Dam into the Black River near Piedmont, Missouri, from the U.S. Army Corps of Engineers.',
    belowDam: 'the Black River',
  },
  'swl-table-rock-dam': {
    title: 'Table Rock Dam Generation Schedule & Lake Level',
    description: 'Hourly SWPA generation schedule for Table Rock Dam, the current release into Lake Taneycomo, and today’s Table Rock Lake level near Branson, Missouri.',
    belowDam: 'Lake Taneycomo',
  },
  'swl-bull-shoals-dam': {
    title: 'Bull Shoals Dam Generation Schedule & White River Flows',
    description: 'Hourly generation schedule and current release from Bull Shoals Dam into the White River trout tailwater, plus Bull Shoals Lake level in north Arkansas.',
    belowDam: 'the White River',
  },
  'swl-beaver-dam': {
    title: 'Beaver Dam, Arkansas: Generation Schedule & Lake Level',
    description: 'Hourly generation schedule for Beaver Dam on the White River near Eureka Springs, with the current release, water temperature and Beaver Lake level.',
    belowDam: 'the White River',
  },
  'swl-norfork-dam': {
    title: 'Norfork Dam Generation Schedule & North Fork River Release',
    description: 'Hourly generation schedule and current release from Norfork Dam into the North Fork River trout tailwater, with water temperature and Norfork Lake level.',
    belowDam: 'the North Fork River',
  },
  'swl-greers-ferry-dam': {
    title: 'Greers Ferry Dam Generation Schedule: Little Red River',
    description: 'Hourly generation schedule and release from Greers Ferry Dam to the Little Red River at Heber Springs, plus water temperature and Greers Ferry Lake level.',
    belowDam: 'the Little Red River',
  },
  'mvs-wappapello': {
    title: 'Wappapello Lake Level & St. Francis River Release',
    description: 'Wappapello Lake level and the daily average release from Wappapello Dam into the St. Francis River in southeast Missouri, from the Corps of Engineers.',
    belowDam: 'the St. Francis River',
  },
  'mvs-mark-twain': {
    title: 'Mark Twain Lake Level & Clarence Cannon Dam Schedule',
    description: 'Mark Twain Lake level, the daily release into the Salt River, and the hourly SWPA generation schedule for Clarence Cannon Dam in northeast Missouri.',
    belowDam: 'the Salt River',
  },
  'nwk-stockton-dam': {
    title: 'Stockton Dam Generation Schedule: Stockton Lake, MO',
    description: 'Hourly SWPA generation schedule for Stockton Dam, showing when its turbine is planned to run on the Sac River below Stockton Lake in southwest Missouri.',
    belowDam: 'the Sac River',
  },
  'nwk-truman-dam': {
    title: 'Truman Dam Generation Schedule & Truman Lake Level',
    description: 'Hourly SWPA generation schedule for Harry S. Truman Dam, with Truman Lake level and the daily outflow into Lake of the Ozarks near Warsaw, Missouri.',
    belowDam: 'Lake of the Ozarks',
  },
  'swt-tenkiller-dam': {
    title: 'Tenkiller Dam Generation Schedule & Lower Illinois River',
    description: 'Hourly generation schedule for Tenkiller Ferry Dam and its release into the Lower Illinois River trout tailwater, plus Tenkiller Lake level in Oklahoma.',
    belowDam: 'the Lower Illinois River',
  },
  'swt-fort-gibson-dam': {
    title: 'Fort Gibson Lake Level & Dam Generation Schedule',
    description: 'Fort Gibson Lake level, turbine release and the hourly SWPA generation schedule for Fort Gibson Dam on the Grand (Neosho) River in northeast Oklahoma.',
    belowDam: 'the Grand (Neosho) River',
  },
  'swt-broken-bow-dam': {
    title: 'Broken Bow Dam Generation Schedule & Mountain Fork Flows',
    description: 'Hourly generation schedule and turbine release from Broken Bow Dam into the Lower Mountain Fork River trout stream, plus Broken Bow Lake level.',
    belowDam: 'the Lower Mountain Fork River',
  },
  'swt-eufaula-dam': {
    title: 'Lake Eufaula Level & Eufaula Dam Generation Schedule',
    description: 'Lake Eufaula level, turbine release and the hourly SWPA generation schedule for Eufaula Dam on the Canadian River in eastern Oklahoma.',
    belowDam: 'the Canadian River',
  },
  'swt-keystone-dam': {
    title: 'Keystone Dam Generation Schedule & Keystone Lake Level',
    description: 'Hourly SWPA generation schedule, turbine release into the Arkansas River, and Keystone Lake level for Keystone Dam, upstream of Tulsa, Oklahoma.',
    belowDam: 'the Arkansas River',
  },
  'swt-denison-dam': {
    title: 'Lake Texoma Level & Denison Dam Generation Schedule',
    description: 'Lake Texoma level, turbine release into the Red River, and the hourly SWPA generation schedule for Denison Dam on the Texas–Oklahoma line.',
    belowDam: 'the Red River',
  },
  'swt-robert-s-kerr-dam': {
    title: 'Robert S. Kerr Lock & Dam Generation Schedule',
    description: 'Hourly SWPA generation schedule, release and pool level for Robert S. Kerr Lock and Dam on the Arkansas River navigation channel in eastern Oklahoma.',
    belowDam: 'the Arkansas River',
  },
  'swt-webbers-falls-dam': {
    title: 'Webbers Falls Lock & Dam Generation Schedule',
    description: 'Hourly SWPA generation schedule, release and pool level for Webbers Falls Lock and Dam on the Arkansas River near Webbers Falls, Oklahoma.',
    belowDam: 'the Arkansas River',
  },
  'swl-ozark-dam': {
    title: 'Ozark Lock & Dam Generation Schedule: Arkansas River',
    description: 'Hourly SWPA generation schedule, release and Ozark Lake pool level for Ozark Lock and Dam on the Arkansas River near Ozark, Arkansas.',
    belowDam: 'the Arkansas River',
  },
  'swl-dardanelle-dam': {
    title: 'Dardanelle Lock & Dam Generation Schedule & Lake Level',
    description: 'Hourly SWPA generation schedule, release and Lake Dardanelle level for Dardanelle Lock and Dam on the Arkansas River at Russellville, Arkansas.',
    belowDam: 'the Arkansas River',
  },
  'lrn-wolf-creek-dam': {
    title: 'Lake Cumberland Level & Wolf Creek Dam Generation Forecast',
    description: 'Lake Cumberland level, the release into the Cumberland River trout tailwater, and the Corps’ generation forecast for Wolf Creek Dam in Kentucky.',
    belowDam: 'the Cumberland River',
  },
  'lrn-center-hill-dam': {
    title: 'Center Hill Dam Generation Forecast & Caney Fork Release',
    description: 'Generation forecast and release from Center Hill Dam into the Caney Fork River trout tailwater, with water temperature and Center Hill Lake level.',
    belowDam: 'the Caney Fork River',
  },
  'lrn-dale-hollow-dam': {
    title: 'Dale Hollow Dam Generation Forecast & Obey River Release',
    description: 'Generation forecast and release from Dale Hollow Dam into the Obey River trout tailwater near Celina, Tennessee, with Dale Hollow Lake level.',
    belowDam: 'the Obey River',
  },
  'ameren-bagnell-dam': {
    title: 'Bagnell Dam Release & Lake of the Ozarks Level',
    description: 'Current Lake of the Ozarks level and Bagnell Dam’s release into the Osage River at Lake Ozark, Missouri, from Ameren Missouri’s hourly readings.',
    belowDam: 'the Osage River',
  },
};

const STATE_NAMES: Record<UsaceDam['state'], string> = {
  MO: 'Missouri', AR: 'Arkansas', OK: 'Oklahoma', TX: 'Texas', KY: 'Kentucky', TN: 'Tennessee',
};

export function damStateName(dam: Pick<UsaceDam, 'state'>): string {
  return STATE_NAMES[dam.state];
}

/**
 * Hand-written copy, or a capability-honest fallback so a dam added to the
 * registry before its copy still ships sensible metadata. The test fails until
 * the copy is written.
 */
export function damPageCopy(dam: UsaceDam): DamPageCopy {
  const written = DAM_PAGE_COPY[dam.id];
  if (written) return written;
  const scheduled = Boolean(dam.swpaCode) && dam.amerenMetrics !== 'osage';
  const where = dam.lakeName && dam.lakeName !== dam.name ? ` on ${dam.lakeName}` : '';
  return {
    title: scheduled ? `${dam.name} Generation Schedule` : `${dam.name} Release & Lake Level`,
    description: `${scheduled ? 'Hourly generation schedule and current' : 'Current'} release for ${dam.name}${where} in ${damStateName(dam)}, with conditions below the dam.`,
    belowDam: 'the river below the dam',
  };
}

/**
 * Two or three plain sentences built only from registry facts: unique text
 * per dam that agrees with the readings above it.
 */
export function damAboutSentences(dam: UsaceDam): string[] {
  const copy = damPageCopy(dam);
  const state = damStateName(dam);
  const sentences: string[] = [];
  const operator = dam.amerenMetrics === 'osage' ? 'Ameren Missouri' : 'the U.S. Army Corps of Engineers';
  sentences.push(dam.lakeName && dam.lakeName !== dam.name
    ? `${dam.name} impounds ${dam.lakeName} in ${state} and is operated by ${operator}.`
    : `${dam.name} is a reservoir in ${state} operated by ${operator}.`);
  if (!hasPowerhouse(dam)) {
    sentences.push('It has no powerhouse, so water leaves through its gates rather than turbines.');
  } else {
    const plant = dam.nameplate
      ? `Its powerhouse has ${dam.nameplate.units} generating ${dam.nameplate.units === 1 ? 'unit' : 'units'} rated at ${dam.nameplate.megawatts} MW`
      : 'Its powerhouse generates hydroelectric power';
    sentences.push(dam.swpaCode && dam.amerenMetrics !== 'osage'
      ? `${plant}, and the Southwestern Power Administration posts its hourly generation schedule.`
      : `${plant}.`);
  }
  sentences.push(`Water released here flows into ${copy.belowDam}${dam.tailwaterFishery === 'trout' ? ', a cold-water trout fishery' : ''}.`);
  return sentences;
}

// src/data/seasonal-data.ts
// Seasonal guidance and crowd calendar data per river

export interface SeasonalInfo {
  riverSlug: string;
  bestMonths: string;
  peakCrowdMonths: string;
  quietMonths: string;
  waterNotes: string;
  crowdTips: string[];
  seasonalNotes: SeasonalNote[];
}

export interface SeasonalNote {
  months: string;
  label: string;
  description: string;
  crowdLevel: 'low' | 'moderate' | 'high';
}

export const SEASONAL_DATA: Record<string, SeasonalInfo> = {
  current: {
    riverSlug: 'current',
    bestMonths: 'May - September',
    peakCrowdMonths: 'June - August',
    quietMonths: 'April, September - October',
    waterNotes: 'Spring-fed, so the Current maintains decent levels even in dry periods. The upper section above Akers is more level-dependent.',
    crowdTips: [
      'Avoid the Akers-to-Pulltite and Cedar Grove-to-Akers sections on Saturdays between Memorial Day and Labor Day',
      'Weekdays are dramatically less crowded — even in peak summer',
      'The sections below Round Spring see fewer people year-round',
      'Early morning launches (before 9 AM) help you stay ahead of the crowd',
    ],
    seasonalNotes: [
      { months: 'Mar - Apr', label: 'Early Season', description: 'Water is cold but levels are usually great. Wildflowers blooming. Few crowds.', crowdLevel: 'low' },
      { months: 'May - Jun', label: 'Prime Season', description: 'Ideal water temps and levels. Crowds build toward Memorial Day.', crowdLevel: 'moderate' },
      { months: 'Jul - Aug', label: 'Peak Season', description: 'Warmest water, biggest crowds. Weekend sections can be packed.', crowdLevel: 'high' },
      { months: 'Sep - Oct', label: 'Fall Float', description: 'Fall colors, comfortable temps, minimal crowds. An underrated time to float.', crowdLevel: 'low' },
    ],
  },
  'eleven-point': {
    riverSlug: 'eleven-point',
    bestMonths: 'April - October',
    peakCrowdMonths: 'June - July',
    quietMonths: 'All months — this river rarely gets crowded',
    waterNotes: 'Fed by Greer Spring (2nd largest in MO), so levels stay reliable. The Eleven Point is one of only three federally protected scenic rivers in Missouri.',
    crowdTips: [
      'This river rarely gets crowded even on weekends',
      'If you want solitude, this is your river — even in peak summer',
      'The Greer Spring to Turners Mill section is the most remote',
    ],
    seasonalNotes: [
      { months: 'Apr - May', label: 'Spring', description: 'Beautiful spring conditions. Water is cold but fishable. Very few people.', crowdLevel: 'low' },
      { months: 'Jun - Aug', label: 'Summer', description: 'Warm and comfortable. Even summer weekends stay manageable.', crowdLevel: 'moderate' },
      { months: 'Sep - Oct', label: 'Fall', description: 'Fall foliage along the river corridor. Arguably the best time to float.', crowdLevel: 'low' },
    ],
  },
  'jacks-fork': {
    riverSlug: 'jacks-fork',
    bestMonths: 'May - August',
    peakCrowdMonths: 'June - July',
    quietMonths: 'September - October',
    waterNotes: 'The Jacks Fork is more level-dependent than the Current. Needs more water to float comfortably. Check gauges before going — it can get too low for tubing by late summer.',
    crowdTips: [
      'The Alley Spring to Eminence section is the busiest — avoid Saturday launches',
      'Above Alley Spring is quieter but needs higher water',
      'Weekday floats are significantly quieter',
    ],
    seasonalNotes: [
      { months: 'Apr - May', label: 'Spring', description: 'Best water levels. Spring rains keep the Jacks Fork flowing well.', crowdLevel: 'low' },
      { months: 'Jun - Jul', label: 'Peak', description: 'Popular section can be busy on weekends. Water levels start to drop.', crowdLevel: 'high' },
      { months: 'Aug - Sep', label: 'Late Summer', description: 'Levels can get low — check gauges. Fewer people.', crowdLevel: 'moderate' },
    ],
  },
  meramec: {
    riverSlug: 'meramec',
    bestMonths: 'May - September',
    peakCrowdMonths: 'June - August',
    quietMonths: 'April, October',
    waterNotes: 'The Meramec is the largest river in this list and maintains floatable levels most of the year. The upper section has some Class I-II rapids. The lower section is wide and calm.',
    crowdTips: [
      'Closest Ozark river to St. Louis — expect weekend crowds in summer',
      'The upper Meramec above the state park is less crowded',
      'Fall floats (September-October) are surprisingly nice and empty',
    ],
    seasonalNotes: [
      { months: 'Apr - May', label: 'Spring', description: 'Good levels, some rapids running. Park amenities opening up.', crowdLevel: 'moderate' },
      { months: 'Jun - Aug', label: 'Summer', description: 'St. Louis crowds on weekends. Very busy around the state park.', crowdLevel: 'high' },
      { months: 'Sep - Oct', label: 'Fall', description: 'Beautiful fall colors. Much quieter. Water still warm enough.', crowdLevel: 'low' },
    ],
  },
  huzzah: {
    riverSlug: 'huzzah',
    bestMonths: 'April - June',
    peakCrowdMonths: 'May - June',
    quietMonths: 'Most times — this is a small creek',
    waterNotes: 'Huzzah Creek is level-dependent and needs decent water to float. Best after spring rains. Can be too low by mid-summer.',
    crowdTips: [
      'A small creek, so you won\'t encounter large crowds',
      'Best during or after wet periods when levels are up',
    ],
    seasonalNotes: [
      { months: 'Apr - Jun', label: 'Prime', description: 'Best levels after spring rain. Crystal-clear water.', crowdLevel: 'low' },
      { months: 'Jul - Sep', label: 'Summer', description: 'Often too low to float. Check gauges carefully.', crowdLevel: 'low' },
    ],
  },
  courtois: {
    riverSlug: 'courtois',
    bestMonths: 'April - June',
    peakCrowdMonths: 'May - June',
    quietMonths: 'Year-round — very few people',
    waterNotes: 'Like Huzzah, Courtois Creek (pronounced "coat-away") needs rain to be floatable. Best in spring.',
    crowdTips: [
      'One of the least-crowded floatable creeks in the Ozarks',
      'Pairs well with Huzzah Creek for a multi-day adventure',
    ],
    seasonalNotes: [
      { months: 'Apr - Jun', label: 'Prime', description: 'Spring rains fill the creek. Clear, beautiful water.', crowdLevel: 'low' },
      { months: 'Jul - Sep', label: 'Late Season', description: 'Usually too low. Occasional wet years are an exception.', crowdLevel: 'low' },
    ],
  },
  niangua: {
    riverSlug: 'niangua',
    bestMonths: 'May - September',
    peakCrowdMonths: 'June - July',
    quietMonths: 'April, September',
    waterNotes: 'The Niangua is dam-controlled (Bennett Spring), which keeps flows more consistent than rain-dependent streams.',
    crowdTips: [
      'Less well-known than the Current or Jacks Fork — generally quieter',
      'Bennett Spring State Park area sees the most visitors',
    ],
    seasonalNotes: [
      { months: 'May - Jun', label: 'Early Summer', description: 'Great conditions, moderate crowds near Bennett Spring.', crowdLevel: 'moderate' },
      { months: 'Jul - Aug', label: 'Peak', description: 'Warm water, good levels. Crowds mostly near the state park.', crowdLevel: 'moderate' },
    ],
  },
  'big-piney': {
    riverSlug: 'big-piney',
    bestMonths: 'April - June',
    peakCrowdMonths: 'May - June',
    quietMonths: 'Most times',
    waterNotes: 'Big Piney is level-dependent and best floated in spring or after rain. Can get low in summer.',
    crowdTips: [
      'Off the beaten path — rarely crowded',
      'A true hidden gem for kayakers and canoeists',
    ],
    seasonalNotes: [
      { months: 'Apr - Jun', label: 'Prime', description: 'Best levels and beautiful spring scenery. Very few people.', crowdLevel: 'low' },
      { months: 'Jul - Sep', label: 'Summer', description: 'Levels drop. May be too low for comfortable floating.', crowdLevel: 'low' },
    ],
  },
};

export function getSeasonalData(riverSlug: string): SeasonalInfo | undefined {
  return SEASONAL_DATA[riverSlug];
}

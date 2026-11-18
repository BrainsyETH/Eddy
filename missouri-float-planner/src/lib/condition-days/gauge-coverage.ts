// Companion gauges on the ten study rivers. Their live pages remain available
// even when this edition has no reviewed discharge archive for the pairing.
export const gaugeCoverage = [
  { slug: 'current', site: '07064440', label: 'Montauk State Park', reason: 'stage' },
  { slug: 'current', site: '07066510', label: 'Powder Mill', reason: 'stage' },
  { slug: 'current', site: '07067000', label: 'Van Buren', reason: 'review' },
  { slug: 'current', site: '07068000', label: 'Doniphan', reason: 'review' },
  { slug: 'black', site: '07063000', label: 'Poplar Bluff', reason: 'review' },
  { slug: 'black', site: 'swl-clearwater-dam', label: 'Clearwater Dam release', reason: 'release' },
  { slug: 'bourbeuse', site: '07015720', label: 'High Gate', reason: 'incomplete' },
  { slug: 'buffalo', site: '07055680', label: 'Pruitt', reason: 'archive' },
  { slug: 'meramec', site: '07010350', label: 'Cook Station', reason: 'stage' },
  { slug: 'meramec', site: '07014500', label: 'Sullivan', reason: 'stage' },
  { slug: 'meramec', site: '07019000', label: 'Eureka', reason: 'stage' },
  { slug: 'niangua', site: '06923950', label: 'Tunnel Dam near Macks Creek', reason: 'archive' },
] as const;

export const coverageReasons = {
  stage: 'Eddy rates this gauge by water height in feet. The seasonal study uses daily flow in cubic feet per second.',
  review: 'The historical flow ranges here need review before Eddy can count Good or Flowing days.',
  incomplete: 'This gauge has a partial set of flow ranges. The seasonal study needs all six levels.',
  release: 'This station measures dam releases. Its schedule and readings are on the dam page.',
  archive: 'This gauge has recent readings. Its daily history is outside this edition of the seasonal study.',
};

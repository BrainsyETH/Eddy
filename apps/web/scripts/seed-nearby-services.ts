/**
 * seed-nearby-services.ts
 *
 * Populates nearby_services and service_rivers tables with outfitters,
 * campgrounds, cabins, and lodging that serve the 5 active rivers on eddy.guide.
 *
 * Usage:
 *   npx tsx scripts/seed-nearby-services.ts
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Types
// ============================================

type ServiceType = 'outfitter' | 'campground' | 'cabin_lodge';
type ServiceStatus = 'active' | 'seasonal' | 'temporarily_closed' | 'permanently_closed' | 'unverified';

interface RiverLink {
  slug: string;
  section_description?: string;
  is_primary: boolean;
}

interface ServiceRecord {
  name: string;
  slug: string;
  type: ServiceType;
  phone: string | null;
  phone_toll_free: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  city: string;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string;
  services_offered: string[];
  seasonal_notes: string | null;
  nps_authorized: boolean;
  usfs_authorized: boolean;
  owner_name: string | null;
  ownership_changed_at: string | null;
  status: ServiceStatus;
  verified_source: string;
  notes: string | null;
  display_order: number;
  rivers: RiverLink[];
}

// ============================================
// SERVICE DATA
// ============================================

const services: ServiceRecord[] = [

  // ============================================
  // CURRENT RIVER — UPPER (Montauk to Round Spring)
  // ============================================

  {
    name: 'Montauk State Park',
    slug: 'montauk-state-park',
    type: 'cabin_lodge',
    phone: '573-548-2201',
    phone_toll_free: '800-334-6946',
    email: null,
    website: 'https://mostateparks.com/park/montauk-state-park',
    address_line1: '345 County Road 6670',
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: 37.4407,
    longitude: -91.6739,
    description: 'State park at the headwaters of the Current River, fed by Montauk Spring. Famous for trout fishing (catch-and-release and harvest seasons). Offers cabins, lodge rooms, campground, and dining.',
    services_offered: ['cabins', 'lodge_rooms', 'camping_rv', 'camping_primitive', 'food_service', 'general_store', 'fishing_supplies', 'showers'],
    seasonal_notes: 'Park open year-round. Trout season Mar 1 – Oct 31. Lodge and dining seasonal.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mostateparks.com, existing_codebase',
    notes: 'Near headwaters — popular base camp for upper Current floats. Not technically an outfitter but floaters use it heavily.',
    display_order: 10,
    rivers: [
      { slug: 'current', section_description: 'Headwaters / Montauk area', is_primary: true },
    ],
  },

  {
    name: 'Current River Canoe Rental',
    slug: 'current-river-canoe-rental',
    type: 'outfitter',
    phone: '573-858-3250',
    phone_toll_free: null,
    email: null,
    website: 'https://currentrivercanoe.com',
    address_line1: null,
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: null,
    longitude: null,
    description: 'Full-service outfitter near Pulltite and Cedar Grove on the upper Current River. Canoe, kayak, raft, and tube rentals with shuttle service.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_primitive'],
    seasonal_notes: 'Open April through October.',
    nps_authorized: true,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mcfa_directory, knowledge_base',
    notes: 'NPS authorized concessioner. Operates at Pulltite and Cedar Grove areas.',
    display_order: 20,
    rivers: [
      { slug: 'current', section_description: 'Pulltite to Cedar Grove', is_primary: true },
      { slug: 'jacks-fork', section_description: 'Via shuttle', is_primary: false },
    ],
  },

  {
    name: 'Running River Canoe Rental',
    slug: 'running-river-canoe-rental',
    type: 'outfitter',
    phone: '573-858-3371',
    phone_toll_free: null,
    email: null,
    website: 'https://runningrivercanoe.com',
    address_line1: null,
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: null,
    longitude: null,
    description: 'Family-owned outfitter since 1979 serving the upper Current River area near Salem. Canoe, kayak, raft, and tube rentals with shuttle service.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'runningrivercanoe.com, tripadvisor, user_report_2026',
    notes: 'Family-owned since 1979. Phone corrected to 573-858-3371 (was 573-858-3214). Also offers rafts and tubes per Tripadvisor.',
    display_order: 30,
    rivers: [
      { slug: 'current', section_description: 'Upper Current', is_primary: true },
    ],
  },

  {
    name: 'Akers Ferry Canoe Rental',
    slug: 'akers-ferry-canoe-rental',
    type: 'outfitter',
    phone: '573-858-3224',
    phone_toll_free: null,
    email: null,
    website: 'https://akersferrycanoe.com',
    address_line1: null,
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: null,
    longitude: null,
    description: 'NPS authorized outfitter at Akers Ferry on the Current River. One of the most popular put-in locations. Canoe, kayak, raft, and tube rentals with full shuttle service.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_primitive', 'general_store'],
    seasonal_notes: 'Open April through October.',
    nps_authorized: true,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps_concessioner_list, mcfa_directory',
    notes: 'NPS authorized concessioner at Akers. Historic ferry crossing site.',
    display_order: 40,
    rivers: [
      { slug: 'current', section_description: 'Akers Ferry area', is_primary: true },
    ],
  },

  {
    name: 'Jadwin Canoe Rental',
    slug: 'jadwin-canoe-rental',
    type: 'outfitter',
    phone: '573-729-5229',
    phone_toll_free: null,
    email: null,
    website: 'https://jadwincanoe.com',
    address_line1: null,
    city: 'Jadwin',
    state: 'MO',
    zip: '65501',
    latitude: null,
    longitude: null,
    description: 'NPS authorized outfitter at Jadwin on the Current River. Serves the mid-Current section between Akers and Round Spring. Canoe, kayak, and raft rentals.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'shuttle', 'camping_primitive'],
    seasonal_notes: 'Open April through October.',
    nps_authorized: true,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps_concessioner_list, mcfa_directory',
    notes: 'NPS authorized concessioner at Jadwin.',
    display_order: 50,
    rivers: [
      { slug: 'current', section_description: 'Jadwin / mid-Current', is_primary: true },
    ],
  },

  // ============================================
  // CURRENT RIVER — NPS CAMPGROUNDS
  // ============================================

  {
    name: 'Akers Campground',
    slug: 'akers-campground-nps',
    type: 'campground',
    phone: '573-323-4236',
    phone_toll_free: null,
    email: null,
    website: 'https://www.nps.gov/ozar/planyourvisit/akers.htm',
    address_line1: null,
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: null,
    longitude: null,
    description: 'NPS-managed campground at Akers Ferry within Ozark National Scenic Riverways. Walk-in sites on a scenic bluff above the Current River near the historic Akers Ferry crossing.',
    services_offered: ['camping_primitive', 'showers'],
    seasonal_notes: 'Open year-round. Water and services may be limited in winter.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps.gov/ozar',
    notes: 'NPS-managed campground, not a private business. First-come, first-served.',
    display_order: 45,
    rivers: [
      { slug: 'current', section_description: 'Akers Ferry', is_primary: true },
    ],
  },

  {
    name: 'Pulltite Campground',
    slug: 'pulltite-campground-nps',
    type: 'campground',
    phone: '573-323-4236',
    phone_toll_free: null,
    email: null,
    website: 'https://www.nps.gov/ozar/planyourvisit/pulltite.htm',
    address_line1: null,
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: null,
    longitude: null,
    description: 'NPS-managed campground at Pulltite Spring within ONSR. Scenic spring-fed swimming area and popular put-in for Current River floats.',
    services_offered: ['camping_primitive'],
    seasonal_notes: 'Open year-round. Limited services in winter.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps.gov/ozar',
    notes: 'NPS-managed. Pulltite Spring is a popular swimming spot.',
    display_order: 25,
    rivers: [
      { slug: 'current', section_description: 'Pulltite', is_primary: true },
    ],
  },

  {
    name: 'Round Spring Campground',
    slug: 'round-spring-campground-nps',
    type: 'campground',
    phone: '573-323-4236',
    phone_toll_free: null,
    email: null,
    website: 'https://www.nps.gov/ozar/planyourvisit/round-spring.htm',
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'NPS-managed campground at Round Spring on the Current River. Features cave tours, spring viewing, and river access. Popular mid-point stop between Salem and Eminence.',
    services_offered: ['camping_primitive', 'showers'],
    seasonal_notes: 'Open year-round. Cave tours seasonal (spring-fall).',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps.gov/ozar',
    notes: 'NPS-managed. USGS gauge at Round Spring broke and was never replaced — no functioning gauge here.',
    display_order: 55,
    rivers: [
      { slug: 'current', section_description: 'Round Spring', is_primary: true },
    ],
  },

  {
    name: 'Big Spring Campground',
    slug: 'big-spring-campground-nps',
    type: 'campground',
    phone: '573-323-4236',
    phone_toll_free: null,
    email: null,
    website: 'https://www.nps.gov/ozar/planyourvisit/big-spring.htm',
    address_line1: null,
    city: 'Van Buren',
    state: 'MO',
    zip: '63965',
    latitude: null,
    longitude: null,
    description: 'NPS-managed campground at Big Spring, the largest spring in the Ozarks and one of the largest in the US. Located on the lower Current River near Van Buren.',
    services_offered: ['camping_primitive', 'camping_rv', 'showers'],
    seasonal_notes: 'Open year-round. Some sites reservable, others first-come.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps.gov/ozar',
    notes: 'NPS-managed. Big Spring pumps ~286 million gallons/day. Historic CCC lodge on-site (now a museum).',
    display_order: 90,
    rivers: [
      { slug: 'current', section_description: 'Big Spring / Van Buren', is_primary: true },
    ],
  },

  {
    name: 'Two Rivers Campground',
    slug: 'two-rivers-campground-nps',
    type: 'campground',
    phone: '573-323-4236',
    phone_toll_free: null,
    email: null,
    website: 'https://www.nps.gov/ozar/planyourvisit/two-rivers.htm',
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'NPS-managed campground at the confluence of the Jacks Fork and Current Rivers. Strategic location for floating either river.',
    services_offered: ['camping_primitive'],
    seasonal_notes: 'Open year-round.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps.gov/ozar',
    notes: 'NPS-managed. At the confluence — convenient for both Current and Jacks Fork floats.',
    display_order: 70,
    rivers: [
      { slug: 'current', section_description: 'Two Rivers confluence', is_primary: true },
      { slug: 'jacks-fork', section_description: 'Mouth / confluence', is_primary: false },
    ],
  },

  // ============================================
  // CURRENT RIVER — LOWER (Eminence to Van Buren)
  // ============================================

  {
    name: "Carr's Canoe Rental",
    slug: 'carrs-canoe-rental',
    type: 'outfitter',
    phone: '573-858-3240',
    phone_toll_free: '800-333-3956',
    email: 'info@carrscanoerental.com',
    website: 'https://www.carrscanoerental.com/',
    address_line1: 'HCR 1, Box 137',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Family-owned outfitter (50+ years) serving both the Current River and Jacks Fork. Canoe, kayak, raft, and tube rentals with shuttle. Two locations: Jacks Fork near Eminence and Round Spring on the Current River. Services local lodging, campgrounds, and Echo Bluff State Park.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'carrscanoerental.com',
    notes: 'Family owned 50+ years. Two locations (Jacks Fork near Eminence + Round Spring on Current River).',
    display_order: 60,
    rivers: [
      { slug: 'current', section_description: 'Eminence area', is_primary: true },
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: false },
    ],
  },

  {
    name: "Windy's Floats",
    slug: 'windys-floats',
    type: 'outfitter',
    phone: '573-226-3404',
    phone_toll_free: '866-889-8177',
    email: 'windys@socket.net',
    website: 'https://windysfloats.com/',
    address_line1: '513 N. Main St',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Largest canoe rental on the Jacks Fork River. NPS authorized concessioner serving both the Current River and Jacks Fork since 1969. Canoe, kayak, raft, and tube rentals with shuttle. Weekday and group rates. Pets allowed in shuttle vehicles and boats (not rafts).',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle'],
    seasonal_notes: 'Open Apr 1 – Oct 15. Mon-Sun 8am-6pm.',
    nps_authorized: true,
    usfs_authorized: false,
    owner_name: 'Chris & Robin Brewer',
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'windysfloats.com, nps_concessioner_list',
    notes: 'NPS authorized concessioner. Largest on Jacks Fork. Family owned since 1969, served 500k+ people.',
    display_order: 65,
    rivers: [
      { slug: 'current', section_description: 'Eminence area', is_primary: true },
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: false },
    ],
  },

  {
    name: 'Silver Arrow Canoe Rental',
    slug: 'silver-arrow-canoe-rental',
    type: 'outfitter',
    phone: '573-323-4657',
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Van Buren',
    state: 'MO',
    zip: '63965',
    latitude: null,
    longitude: null,
    description: 'Outfitter near Van Buren serving the lower Current River. Canoe, kayak, and tube rentals with shuttle service for the Big Spring area.',
    services_offered: ['canoe_rental', 'kayak_rental', 'tube_rental', 'shuttle'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'knowledge_base',
    notes: 'Lower Current near Van Buren / Big Spring area.',
    display_order: 95,
    rivers: [
      { slug: 'current', section_description: 'Lower Current / Van Buren', is_primary: true },
    ],
  },

  {
    name: 'Cave Country Canoes',
    slug: 'cave-country-canoes',
    type: 'outfitter',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Van Buren',
    state: 'MO',
    zip: '63965',
    latitude: null,
    longitude: null,
    description: 'Outfitter in the Van Buren area serving the lower Current River. Named for the numerous caves along this section of the river.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'knowledge_base',
    notes: 'Need to verify current operating status and contact info.',
    display_order: 96,
    rivers: [
      { slug: 'current', section_description: 'Lower Current', is_primary: true },
    ],
  },

  {
    name: "KC's On The Current",
    slug: 'kcs-on-the-current',
    type: 'outfitter',
    phone: '573-996-7961',
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Doniphan',
    state: 'MO',
    zip: '63935',
    latitude: null,
    longitude: null,
    description: 'Outfitter serving the lower Current River near Doniphan. Canoe and kayak rentals with shuttle service.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mo_scenic_rivers_directory, user_report_2026',
    notes: 'Corrected city: Doniphan per Missouri Scenic Rivers directory, not just Deerleap. Serves lower Current near Doniphan.',
    display_order: 97,
    rivers: [
      { slug: 'current', section_description: 'Doniphan / lower Current', is_primary: true },
    ],
  },

  // ============================================
  // CURRENT RIVER — LODGING
  // ============================================

  {
    name: 'Echo Bluff State Park',
    slug: 'echo-bluff-state-park',
    type: 'cabin_lodge',
    phone: '573-226-3720',
    phone_toll_free: '844-235-8337',
    email: null,
    website: 'https://mostateparks.com/park/echo-bluff-state-park',
    address_line1: '34489 Echo Bluff Drive',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: 37.1590,
    longitude: -91.4060,
    description: 'Newest Missouri state park (opened 2016), located between the Current River and Jacks Fork near Eminence. Features lodge rooms, cabins, campground, dining hall, and swimming pool. Popular base camp for ONSR floaters.',
    services_offered: ['cabins', 'lodge_rooms', 'camping_rv', 'camping_primitive', 'food_service', 'swimming_pool', 'showers', 'wifi'],
    seasonal_notes: 'Open year-round. Pool open Memorial Day through Labor Day.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mostateparks.com',
    notes: 'Opened 2016. Very popular — book early for summer weekends. Located on Sinking Creek between Current and Jacks Fork.',
    display_order: 62,
    rivers: [
      { slug: 'current', section_description: 'Eminence area', is_primary: true },
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: false },
    ],
  },

  {
    name: 'Current River State Park',
    slug: 'current-river-state-park',
    type: 'campground',
    phone: '573-226-3720',
    phone_toll_free: null,
    email: null,
    website: 'https://mostateparks.com/park/current-river-state-park',
    address_line1: null,
    city: 'Salem',
    state: 'MO',
    zip: '65560',
    latitude: null,
    longitude: null,
    description: 'State park along the Current River offering camping and hiking. Adjacent to the Ozark National Scenic Riverways.',
    services_offered: ['camping_primitive', 'camping_rv'],
    seasonal_notes: 'Open year-round.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mostateparks.com',
    notes: null,
    display_order: 35,
    rivers: [
      { slug: 'current', section_description: 'Upper Current', is_primary: true },
    ],
  },

  {
    name: 'Big Spring Lodge & Cabins',
    slug: 'big-spring-lodge',
    type: 'cabin_lodge',
    phone: '573-323-4423',
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Van Buren',
    state: 'MO',
    zip: '63965',
    latitude: null,
    longitude: null,
    description: 'Historic CCC-era lodge and cabins at Big Spring on the lower Current River. Located within Ozark National Scenic Riverways near the largest spring in the Ozarks.',
    services_offered: ['cabins', 'lodge_rooms'],
    seasonal_notes: 'Seasonal operation.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'knowledge_base',
    notes: 'Historic CCC lodge. Verify current operating status — has had intermittent closures.',
    display_order: 92,
    rivers: [
      { slug: 'current', section_description: 'Big Spring / Van Buren', is_primary: true },
    ],
  },

  {
    name: 'Cobblestone Lodge',
    slug: 'cobblestone-lodge',
    type: 'cabin_lodge',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: 'https://cobblestonelodge.com',
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'All-inclusive family resort in Steelville on the Meramec River. Lodge rooms and resort amenities for floaters and families.',
    services_offered: ['lodge_rooms'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'cobblestonelodge.com, user_report_2026',
    notes: 'Corrected location: Steelville on the Meramec River, not Eminence/Current+Jacks Fork.',
    display_order: 68,
    rivers: [
      { slug: 'meramec', section_description: 'Steelville area', is_primary: true },
    ],
  },

  // ============================================
  // JACKS FORK RIVER
  // ============================================

  {
    name: "Harvey's Alley Spring Canoe Rental",
    slug: 'harveys-alley-spring',
    type: 'outfitter',
    phone: '573-226-3386',
    phone_toll_free: '888-963-5628',
    email: null,
    website: 'https://harveysalleyspring.com/',
    address_line1: 'HC 3, Box 18',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'NPS authorized concessioner at Alley Spring on the Jacks Fork River. Established 1963 by Harvey & Edna Staples. Canoe, kayak, raft, and tube rentals with shuttle service on both the Jacks Fork and Current River. Main office 6 mi west of Eminence on Hwy 106; satellite at Hwys 19 & 106 in Eminence.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_primitive'],
    seasonal_notes: 'Open April through October. Sun-Fri 8am, Sat 7am.',
    nps_authorized: true,
    usfs_authorized: false,
    owner_name: 'Danny & Barb Staples',
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps_concessioner_list, harveysalleyspring.com',
    notes: 'NPS authorized concessioner. Main office at Alley Spring, satellite in Eminence. Serves both Jacks Fork and Current River.',
    display_order: 10,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Alley Spring area', is_primary: true },
      { slug: 'current', section_description: 'Eminence area', is_primary: false },
    ],
  },

  {
    name: 'Two Rivers Canoe Rental',
    slug: 'two-rivers-canoe-rental',
    type: 'outfitter',
    phone: '573-226-3478',
    phone_toll_free: '888-833-4931',
    email: 'float@2riverscanoe.com',
    website: 'https://www.2riverscanoe.com/',
    address_line1: '21575 State Route V',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Outfitter at the junction of the Current & Jacks Fork Rivers on Hwy V east of Eminence. Canoe, kayak, raft, and tube rentals with shuttle. Also has a campground and store with groceries. Year-round float trips.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_primitive', 'general_store'],
    seasonal_notes: 'Year-round float trips available.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: '2riverscanoe.com',
    notes: 'Located at "Two Rivers" confluence. Best outfitter to use if taking out at Two Rivers.',
    display_order: 20,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
      { slug: 'current', section_description: 'Near confluence', is_primary: false },
    ],
  },

  {
    name: 'Eminence Canoe Rental',
    slug: 'eminence-canoe-rental',
    type: 'outfitter',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Outfitter based in Eminence serving the Jacks Fork River.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'knowledge_base',
    notes: 'Verify if still operating. May have merged or closed.',
    display_order: 30,
    rivers: [
      { slug: 'jacks-fork', is_primary: true },
    ],
  },

  {
    name: 'Alley Spring Campground',
    slug: 'alley-spring-campground-nps',
    type: 'campground',
    phone: '573-323-4236',
    phone_toll_free: null,
    email: 'OZAR_Campground_Operations@nps.gov',
    website: 'https://www.nps.gov/ozar/planyourvisit/alley-spring.htm',
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'NPS-managed campground at Alley Spring, one of the most photographed spots in the Ozarks. 162 campsites (28 electric). Features the iconic red Alley Mill (1894) and brilliant blue spring. Located on the Jacks Fork River. Swimming area, amphitheater, visitor center, camp store.',
    services_offered: ['camping_primitive', 'camping_rv', 'showers', 'general_store'],
    seasonal_notes: 'Reservations Apr 15 – Oct 15 via Recreation.gov. First-come first-served Oct 16 – Apr 14. Water off Oct 15 – Apr 14 (heated showers year-round).',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'nps.gov/ozar',
    notes: 'NPS-managed. Alley Spring is the 7th largest spring in Missouri (~81M gallons/day). Historic Alley Mill is a must-see.',
    display_order: 15,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Alley Spring', is_primary: true },
    ],
  },

  {
    name: 'Circle B Campground & Resort',
    slug: 'circle-b-campground',
    type: 'campground',
    phone: '573-226-3618',
    phone_toll_free: null,
    email: 'circlebcampground@gmail.com',
    website: 'https://circlebcampground.com/',
    address_line1: '18823 Circle B Road',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Riverfront campground and resort in Eminence. Air-conditioned cabins with bathrooms and kitchens, tent camping, full RV hookups, canoe rentals, store, showers, and public laundry. The 8-mile Circle B to Two Rivers float is especially recommended.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle', 'camping_rv', 'camping_primitive', 'cabins', 'showers', 'general_store'],
    seasonal_notes: 'Seasonal — typically March through November.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'circlebcampground.com',
    notes: 'Private campground within the ONSR area. Primarily a campground with boat rental services.',
    display_order: 25,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
      { slug: 'current', section_description: 'Eminence area', is_primary: false },
    ],
  },

  {
    name: 'Jacks Fork Canoe Rental & Campground',
    slug: 'jacks-fork-canoe-rental',
    type: 'outfitter',
    phone: '573-858-3221',
    phone_toll_free: '800-522-5736',
    email: null,
    website: 'https://www.jacksforkcanoe.com/',
    address_line1: '19433 Missouri 106',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Combined outfitter and campground directly on the Jacks Fork River. Canoe, kayak, raft, and tube rentals. Campground with sites ranging from primitive to full hookups.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_primitive', 'camping_rv'],
    seasonal_notes: 'Open Apr 15 – Oct.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'jacksforkcanoe.com',
    notes: 'Outfitter + campground on the Jacks Fork. Toll-free: 800-JACKSFORK.',
    display_order: 22,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
    ],
  },

  {
    name: "Jack's Fork River Resort",
    slug: 'jacks-fork-river-resort',
    type: 'cabin_lodge',
    phone: '573-226-6450',
    phone_toll_free: null,
    email: 'jacksforkrivercabins@gmail.com',
    website: 'https://eminencemocabins.com/',
    address_line1: '16169 Tom Akers Rd',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Newly built/renovated resort on the Jacks Fork River. 14 lodge rooms, 23 cabins. Large gravel bar/swimming area, store, bar & grill, pizza, specialty coffee, ice cream. Private beach access. A/C, flat screen TVs with satellite. Pets in select cabins ($50/pet/stay).',
    services_offered: ['cabins', 'lodge_rooms', 'food_service', 'general_store'],
    seasonal_notes: 'Check-in 3pm, check-out 10am. 14-day cancellation policy.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'eminencemocabins.com',
    notes: 'Accepts cash, Mastercard, Visa, Discover.',
    display_order: 40,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
    ],
  },

  {
    name: 'Adventure River Resort',
    slug: 'adventure-river-resort',
    type: 'cabin_lodge',
    phone: '573-226-3233',
    phone_toll_free: null,
    email: null,
    website: 'https://adventureriverresort.com/',
    address_line1: '16492 Tom Akers Road',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Cabins and hotel rooms on the Jacks Fork River near Eminence. Swimming, kayaking, fishing. Pet-friendly. Near Alley Spring, Rocky Falls, and Blue Spring.',
    services_offered: ['cabins', 'lodge_rooms'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'adventureriverresort.com, user_report_2026',
    notes: 'Ownership/naming unclear: River\'s Edge Resort (riversedge-eminence.com, 573-226-3233) may still operate separately at the same address area. Missouri Scenic Rivers notes "Apple Jacks 21 Resort is run by the same owner as Rivers Edge Resort." Adventure River Resort (adventureriverresort.com) may be a genuinely separate business or only a partial rename. Needs verification.',
    display_order: 42,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
    ],
  },

  {
    name: 'Eminence Cottages and Camp',
    slug: 'eminence-cottages-camp',
    type: 'cabin_lodge',
    phone: '573-226-3500',
    phone_toll_free: null,
    email: null,
    website: 'https://www.eminencecottagescamp.com/',
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Hotel suites and cottages in the center of the Ozark National Scenic Riverways. Suites with fireplaces, whirlpool tubs, king beds. Canoeing, horseback riding, and UTV access on Jacks Fork and Current River.',
    services_offered: ['cabins', 'lodge_rooms', 'horseback_riding'],
    seasonal_notes: 'Open March 1 – November 1.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'eminencecottagescamp.com',
    notes: null,
    display_order: 44,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
      { slug: 'current', section_description: 'Eminence area', is_primary: false },
    ],
  },

  {
    name: 'Riverside Motel & River Cabins',
    slug: 'riverside-motel-eminence',
    type: 'cabin_lodge',
    phone: '573-226-3291',
    phone_toll_free: null,
    email: null,
    website: 'https://riversidemotelonline.com/',
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Motel rooms, river cabins, and Horseshoe Holler Cabins near Eminence on the Jacks Fork River.',
    services_offered: ['cabins', 'lodge_rooms'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'riversidemotelonline.com',
    notes: null,
    display_order: 46,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
    ],
  },

  {
    name: 'Hidden Ridge Cabins',
    slug: 'hidden-ridge-cabins',
    type: 'cabin_lodge',
    phone: '573-291-5353',
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: '16313 Hidden Ridge Road',
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Cabins on 40 acres about 5 minutes south of Eminence, 2.5 miles from town and the Jacks Fork River. Built in 2021 with fireplaces and nice yards. Airbnb-only, no standalone website.',
    services_offered: ['cabins'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'facebook, airbnb, user_report_2026',
    notes: 'Built 2021. Phone 573-291-5353 per Facebook (old number 573-604-5155 may be outdated). Address is 16313 Hidden Ridge Road. Airbnb-only, no standalone website. Property listed for sale at $350K on Trulia — may close or change hands.',
    display_order: 48,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
    ],
  },

  {
    name: 'Cross Country Trail Rides',
    slug: 'cross-country-trail-rides',
    type: 'cabin_lodge',
    phone: '573-226-3492',
    phone_toll_free: null,
    email: 'carolyndyer67@hotmail.com',
    website: 'https://crosscountrytrailrides.com',
    address_line1: null,
    city: 'Eminence',
    state: 'MO',
    zip: '65466',
    latitude: null,
    longitude: null,
    description: 'Trail riding resort near Eminence offering horseback riding, cabins, and camping. Adjacent to the Jacks Fork River. Also offers shuttle services for floaters.',
    services_offered: ['cabins', 'camping_rv', 'camping_primitive', 'horseback_riding', 'showers'],
    seasonal_notes: 'Seasonal — typically March through November.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'knowledge_base',
    notes: 'Primarily a horseback riding operation, but floaters use the cabins/camping as base camp. Adjacent to Jacks Fork.',
    display_order: 35,
    rivers: [
      { slug: 'jacks-fork', section_description: 'Eminence area', is_primary: true },
    ],
  },

  // ============================================
  // ELEVEN POINT RIVER
  // ============================================

  {
    name: "Hufstedler's Canoe Rental & Campground",
    slug: 'hufstedlers-canoe-rental',
    type: 'outfitter',
    phone: '417-778-6116',
    phone_toll_free: null,
    email: null,
    website: 'https://hufstedlers.com',
    address_line1: null,
    city: 'Riverton',
    state: 'MO',
    zip: '63965',
    latitude: null,
    longitude: null,
    description: 'USFS authorized outfitter on the Eleven Point River near Riverton/Alton. Canoe, kayak, and raft rentals with shuttle service and campground. Under new ownership as of 2024.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'shuttle', 'camping_primitive', 'camping_rv'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: true,
    owner_name: 'Steve Ipock',
    ownership_changed_at: '2024-01-01',
    status: 'active',
    verified_source: 'usfs_authorized_list, knowledge_base',
    notes: 'Ownership changed 2024: Steve Ipock bought from Wendy Jones. USFS authorized outfitter in Mark Twain National Forest.',
    display_order: 10,
    rivers: [
      { slug: 'eleven-point', section_description: 'Riverton area', is_primary: true },
    ],
  },

  {
    name: "Richard's Canoe Rental",
    slug: 'richards-canoe-rental',
    type: 'outfitter',
    phone: '417-778-6189',
    phone_toll_free: null,
    email: null,
    website: 'https://richardscanoerentals.com',
    address_line1: null,
    city: 'Alton',
    state: 'MO',
    zip: '65606',
    latitude: null,
    longitude: null,
    description: 'Family-run outfitter on the Eleven Point River near Alton. Canoe and kayak rentals with shuttle service. Now operated by the grandson of founder Jerry Richard.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: '2022-01-01',
    status: 'active',
    verified_source: 'knowledge_base',
    notes: 'Jerry Richard died in 2022. His grandson now runs the business. Verify USFS authorization status.',
    display_order: 20,
    rivers: [
      { slug: 'eleven-point', section_description: 'Alton area', is_primary: true },
    ],
  },

  // ============================================
  // HUZZAH CREEK / COURTOIS CREEK
  // ============================================

  {
    name: 'Huzzah Valley Resort',
    slug: 'huzzah-valley-resort',
    type: 'outfitter',
    phone: '573-786-2225',
    phone_toll_free: '800-367-4516',
    email: null,
    website: 'https://huzzahvalley.com',
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'Family-run resort since 1979, located on Huzzah Creek east of Steelville. Offers 2.5 miles of riverfront camping, canoe/kayak/raft rentals, cabins, restaurant, and shuttle service. Serves Huzzah Creek, Courtois Creek, and Meramec River.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_rv', 'camping_primitive', 'cabins', 'food_service', 'general_store', 'showers', 'horseback_riding', 'swimming_pool'],
    seasonal_notes: 'Open April through October. Restaurant and pool seasonal.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'huzzahvalley.com, existing_codebase_migration_00055',
    notes: 'Family-run since 1979. One of the largest resorts in the Huzzah corridor. Serves all three creeks (Huzzah, Courtois, Meramec via shuttle).',
    display_order: 10,
    rivers: [
      { slug: 'huzzah', section_description: 'Mid-Huzzah / Hwy V area', is_primary: true },
      { slug: 'courtois', section_description: 'Via shuttle', is_primary: false },
      { slug: 'meramec', section_description: 'Via shuttle', is_primary: false },
    ],
  },

  {
    name: 'Bass River Resort',
    slug: 'bass-river-resort',
    type: 'outfitter',
    phone: '573-786-8517',
    phone_toll_free: null,
    email: null,
    website: 'https://bassresort.com',
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'Full-service outfitter on Courtois Creek, also serving Huzzah Creek and Meramec River. Family-run for 50+ years. Canoe/kayak/raft rentals, shuttle service, camping, cabins, and horseback riding.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'shuttle', 'camping_rv', 'camping_primitive', 'cabins', 'horseback_riding', 'showers', 'general_store'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'bassresort.com, existing_codebase_migration_00055',
    notes: 'Family-run 50+ years. Located on Courtois Creek near Butts Road. Serves Huzzah, Courtois, and Meramec.',
    display_order: 20,
    rivers: [
      { slug: 'courtois', section_description: 'Butts Road area', is_primary: true },
      { slug: 'huzzah', section_description: 'Via shuttle', is_primary: false },
      { slug: 'meramec', section_description: 'Via shuttle', is_primary: false },
    ],
  },

  {
    name: 'Red Bluff Campground',
    slug: 'red-bluff-campground-usfs',
    type: 'campground',
    phone: '573-438-5427',
    phone_toll_free: null,
    email: null,
    website: 'https://www.recreation.gov/camping/campgrounds/232391',
    address_line1: null,
    city: 'Davisville',
    state: 'MO',
    zip: '65456',
    latitude: 37.8862,
    longitude: -91.3390,
    description: 'USFS campground in the Mark Twain National Forest on Huzzah Creek. Four camping loops with mix of electric and primitive sites. Named for towering red bluffs carved over thousands of years.',
    services_offered: ['camping_rv', 'camping_primitive', 'showers'],
    seasonal_notes: 'Reservations via Recreation.gov. Some loops seasonal.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'recreation.gov, existing_codebase_migration_00055',
    notes: 'USFS-managed campground, not a private business. Facility ID 232391 on Recreation.gov. Creek Loop closest to water.',
    display_order: 15,
    rivers: [
      { slug: 'huzzah', section_description: 'Red Bluff / Mile 8.3', is_primary: true },
    ],
  },

  {
    name: 'Dillard Mill State Historic Site',
    slug: 'dillard-mill-campground',
    type: 'campground',
    phone: '573-244-3120',
    phone_toll_free: null,
    email: null,
    website: 'https://mostateparks.com/historic-site/dillard-mill-state-historic-site',
    address_line1: '142 Dillard Mill Rd',
    city: 'Viburnum',
    state: 'MO',
    zip: '65566',
    latitude: 37.8300,
    longitude: -91.3826,
    description: 'State historic site on upper Huzzah Creek featuring a beautifully restored 1908 red gristmill. Uppermost access point for Huzzah Creek. Picnic area and hiking trail.',
    services_offered: [],
    seasonal_notes: 'Park open year-round. Mill tours May–Oct.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mostateparks.com, existing_codebase_migration_00055',
    notes: 'Historic site, not really a campground. Included as a notable access point for Huzzah floaters at mile 0.0.',
    display_order: 5,
    rivers: [
      { slug: 'huzzah', section_description: 'Headwaters / Mile 0.0', is_primary: true },
    ],
  },

  // ============================================
  // MERAMEC RIVER
  // ============================================

  {
    name: 'Ozark Outdoors Resort',
    slug: 'ozark-outdoors-resort',
    type: 'outfitter',
    phone: '573-245-6517',
    phone_toll_free: null,
    email: null,
    website: 'https://ozarkoutdoors.net',
    address_line1: null,
    city: 'Leasburg',
    state: 'MO',
    zip: '65535',
    latitude: null,
    longitude: null,
    description: 'Primary Meramec River outfitter with 1 mile of riverfront near Leasburg. Canoe, kayak, raft, and tube rentals with shuttle service. Also offers camping, cabins, and services for Huzzah Creek floaters.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle', 'camping_rv', 'camping_primitive', 'cabins', 'general_store', 'showers'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'ozarkoutdoors.net, existing_codebase_migration_00068',
    notes: 'Located near Onondaga Cave State Park. 1 mile of Meramec River frontage. Also does Huzzah shuttles.',
    display_order: 10,
    rivers: [
      { slug: 'meramec', section_description: 'Leasburg / Onondaga area', is_primary: true },
      { slug: 'huzzah', section_description: 'Via shuttle', is_primary: false },
    ],
  },

  {
    name: "Bird's Nest Lodge / Meramec River Resort",
    slug: 'birds-nest-lodge',
    type: 'outfitter',
    phone: '573-775-2606',
    phone_toll_free: null,
    email: null,
    website: 'https://meramecriverresort.com',
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'Outfitter near Steelville on the Meramec River. Canoe, kayak, and raft rentals with shuttle service. Also offers cabins and campground. Now operating as Meramec River Resort under new management.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'shuttle', 'cabins', 'camping_rv', 'camping_primitive'],
    seasonal_notes: 'Seasonal — typically April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'meramecriverresort.com, birdsnestlodge.com, user_report_2026',
    notes: 'Rebranded as Meramec River Resort (meramecriverresort.com) under new management. Old birdsnestlodge.com site still live. Phone updated to 573-775-2606.',
    display_order: 20,
    rivers: [
      { slug: 'meramec', section_description: 'Steelville area / upper Meramec', is_primary: true },
    ],
  },

  {
    name: '3 Bridges Raft Rental',
    slug: '3-bridges-raft-rental',
    type: 'outfitter',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Sullivan',
    state: 'MO',
    zip: '63080',
    latitude: null,
    longitude: null,
    description: 'Raft and tube rental outfitter south of Sullivan on the Meramec River. Specializes in rafts and tubes for the lower-middle Meramec section.',
    services_offered: ['raft_rental', 'tube_rental', 'shuttle'],
    seasonal_notes: 'Seasonal — typically May through September.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'existing_codebase_migration_00068',
    notes: 'Located 3 miles south of Sullivan. Verify phone and website.',
    display_order: 50,
    rivers: [
      { slug: 'meramec', section_description: 'Sullivan / Meramec State Park area', is_primary: true },
    ],
  },

  {
    name: 'The Rafting Company',
    slug: 'the-rafting-company',
    type: 'outfitter',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'Outfitter in the Steelville area serving the upper Meramec River and Huzzah Creek. Raft, canoe, and kayak rentals with shuttle service.',
    services_offered: ['canoe_rental', 'kayak_rental', 'raft_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'knowledge_base',
    notes: 'Verify current operating status, phone, website.',
    display_order: 25,
    rivers: [
      { slug: 'meramec', section_description: 'Upper Meramec / Steelville', is_primary: true },
      { slug: 'huzzah', section_description: 'Via shuttle', is_primary: false },
    ],
  },

  {
    name: 'Old Cove Canoe & Kayak',
    slug: 'old-cove-canoe-kayak',
    type: 'outfitter',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: 'https://oldcovecanoe.com',
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'Canoe and kayak outfitter on the Meramec River, offering trips on both the upper and lower sections.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'existing_codebase_migration_00068',
    notes: 'Mentioned in migration 00068 source comments. Verify all details.',
    display_order: 30,
    rivers: [
      { slug: 'meramec', section_description: 'Upper and Lower Meramec', is_primary: true },
    ],
  },

  {
    name: 'Indian Springs Family Resort',
    slug: 'indian-springs-resort',
    type: 'outfitter',
    phone: null,
    phone_toll_free: null,
    email: null,
    website: null,
    address_line1: null,
    city: 'Steelville',
    state: 'MO',
    zip: '65565',
    latitude: null,
    longitude: null,
    description: 'Family resort on the upper Meramec River offering camping, cabins, and canoe/kayak rentals.',
    services_offered: ['canoe_rental', 'kayak_rental', 'shuttle', 'camping_rv', 'camping_primitive', 'cabins'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'unverified',
    verified_source: 'knowledge_base',
    notes: 'Verify current operating status and all contact info.',
    display_order: 35,
    rivers: [
      { slug: 'meramec', section_description: 'Upper Meramec', is_primary: true },
    ],
  },

  {
    name: 'The Landing',
    slug: 'the-landing-current-river',
    type: 'cabin_lodge',
    phone: '573-323-8156',
    phone_toll_free: null,
    email: null,
    website: 'https://thelandingcurrentriver.com',
    address_line1: null,
    city: 'Van Buren',
    state: 'MO',
    zip: '63965',
    latitude: null,
    longitude: null,
    description: 'NPS concessioner in Van Buren on the Current River with 40+ years of operation. 54 lodge rooms, Blue Heron restaurant, and full outfitter services. One of the biggest operations on the lower Current.',
    services_offered: ['lodge_rooms', 'food_service', 'canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: true,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'thelandingcurrentriver.com, user_report_2026',
    notes: 'Corrected location: Van Buren on Current River, not Sullivan/Meramec. NPS concessioner. Major operation with 54 lodge rooms and Blue Heron restaurant.',
    display_order: 55,
    rivers: [
      { slug: 'current', section_description: 'Van Buren / Lower Current', is_primary: true },
    ],
  },

  // ============================================
  // MERAMEC RIVER — STATE PARKS
  // ============================================

  {
    name: 'Onondaga Cave State Park',
    slug: 'onondaga-cave-state-park',
    type: 'campground',
    phone: '573-245-6576',
    phone_toll_free: null,
    email: null,
    website: 'https://mostateparks.com/park/onondaga-cave-state-park',
    address_line1: '7556 Highway H',
    city: 'Leasburg',
    state: 'MO',
    zip: '65535',
    latitude: null,
    longitude: null,
    description: 'State park on the Meramec River featuring Onondaga Cave (a National Natural Landmark) and Cathedral Cave. Full campground with 61 electric sites, basic sites, and showers. River access via Hwy H low-water bridge.',
    services_offered: ['camping_rv', 'camping_primitive', 'showers'],
    seasonal_notes: 'Park open year-round. Cave tours seasonal (spring-fall). Campground open April through October.',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mostateparks.com, existing_codebase_migration_00055_00068',
    notes: 'Adjacent to Ozark Outdoors Resort. Hwy H low-water bridge is a key Meramec access point. Also accessible from downstream end of Huzzah Creek.',
    display_order: 15,
    rivers: [
      { slug: 'meramec', section_description: 'Leasburg / Hwy H', is_primary: true },
    ],
  },

  {
    name: 'Meramec State Park',
    slug: 'meramec-state-park',
    type: 'campground',
    phone: '573-468-6072',
    phone_toll_free: null,
    email: null,
    website: 'https://mostateparks.com/park/meramec-state-park',
    address_line1: '115 Meramec Park Dr',
    city: 'Sullivan',
    state: 'MO',
    zip: '63080',
    latitude: null,
    longitude: null,
    description: 'Large state park on the Meramec River near Sullivan. Full campground with electric and basic sites, cabins, canoe rental concession, cave tours, and extensive trail system. One of Missouri\'s most popular state parks.',
    services_offered: ['camping_rv', 'camping_primitive', 'cabins', 'canoe_rental', 'kayak_rental', 'raft_rental', 'shuttle', 'showers', 'general_store'],
    seasonal_notes: 'Park open year-round. Canoe rental concession seasonal (spring-fall).',
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'active',
    verified_source: 'mostateparks.com, existing_codebase_migration_00068',
    notes: 'Concession canoe rental operates on-site. Must arrive 30 min before shuttle departure — no refunds for missed shuttles. Has over 30 caves.',
    display_order: 45,
    rivers: [
      { slug: 'meramec', section_description: 'Sullivan / Meramec State Park', is_primary: true },
    ],
  },

  {
    name: 'Steele River Kayaks and Boards',
    slug: 'steele-river-kayaks',
    type: 'outfitter',
    phone: '573-932-4299',
    phone_toll_free: null,
    email: null,
    website: 'https://steeleriverkayaks.com',
    address_line1: null,
    city: 'Windyville',
    state: 'MO',
    zip: null,
    latitude: null,
    longitude: null,
    description: 'Kayak and paddleboard outfitter in Windyville (near Lebanon) on the Niangua River, not the Meramec.',
    services_offered: ['kayak_rental', 'shuttle'],
    seasonal_notes: null,
    nps_authorized: false,
    usfs_authorized: false,
    owner_name: null,
    ownership_changed_at: null,
    status: 'permanently_closed',
    verified_source: 'steeleriverkayaks.com, user_report_2026',
    notes: 'Corrected location: Windyville on the Niangua River, not Steelville/Meramec. Does not belong in eddy.guide dataset if Niangua is not covered. Marked permanently_closed to remove from active listings.',
    display_order: 40,
    rivers: [],
  },

];

// ============================================
// SEED LOGIC
// ============================================

async function seed() {
  console.log('🌊 Starting nearby services seed...');
  console.log(`📦 ${services.length} services to upsert\n`);

  // Step 1: Look up river IDs by slug
  const { data: rivers, error: riverError } = await supabase
    .from('rivers')
    .select('id, slug, name');

  if (riverError || !rivers) {
    console.error('❌ Failed to fetch rivers:', riverError);
    process.exit(1);
  }

  const riverMap = new Map(rivers.map(r => [r.slug, { id: r.id, name: r.name }]));
  console.log(`🗺️  Found ${rivers.length} rivers in database:`);
  for (const r of rivers) {
    console.log(`   • ${r.name} (${r.slug})`);
  }
  console.log();

  let successCount = 0;
  let errorCount = 0;

  for (const service of services) {
    // Extract rivers before upserting
    const { rivers: riverLinks, ...serviceData } = service;

    // Step 2: Upsert the service
    const { data: upserted, error: upsertError } = await supabase
      .from('nearby_services')
      .upsert(serviceData, { onConflict: 'slug' })
      .select('id, slug')
      .single();

    if (upsertError || !upserted) {
      console.error(`❌ ${service.name}: ${upsertError?.message}`);
      errorCount++;
      continue;
    }

    // Step 3: Link to rivers via service_rivers
    for (const link of riverLinks) {
      const river = riverMap.get(link.slug);
      if (!river) {
        console.warn(`  ⚠️  River slug "${link.slug}" not found for ${service.name}`);
        continue;
      }

      const { error: linkError } = await supabase
        .from('service_rivers')
        .upsert(
          {
            service_id: upserted.id,
            river_id: river.id,
            is_primary: link.is_primary,
            section_description: link.section_description || null,
          },
          { onConflict: 'service_id,river_id' }
        );

      if (linkError) {
        console.error(`  ❌ Link ${service.name} → ${river.name}: ${linkError.message}`);
      }
    }

    const riverNames = riverLinks
      .map(l => {
        const r = riverMap.get(l.slug);
        return r ? `${r.name}${l.is_primary ? ' (primary)' : ''}` : l.slug;
      })
      .join(', ');

    const statusIcon = service.status === 'active' ? '✅' :
                        service.status === 'unverified' ? '🔍' :
                        service.status === 'seasonal' ? '📅' : '⏸️';

    console.log(`${statusIcon} ${service.name} → ${riverNames}`);
    successCount++;
  }

  console.log(`\n🏁 Done! ${successCount} services upserted, ${errorCount} errors.`);

  // Summary by type
  const outfitters = services.filter(s => s.type === 'outfitter').length;
  const campgrounds = services.filter(s => s.type === 'campground').length;
  const cabinLodges = services.filter(s => s.type === 'cabin_lodge').length;
  console.log(`   🛶 ${outfitters} outfitters`);
  console.log(`   ⛺ ${campgrounds} campgrounds`);
  console.log(`   🏠 ${cabinLodges} cabin/lodge`);

  // Summary by status
  const active = services.filter(s => s.status === 'active').length;
  const unverified = services.filter(s => s.status === 'unverified').length;
  console.log(`   ✅ ${active} active, 🔍 ${unverified} unverified`);
}

seed().catch(console.error);

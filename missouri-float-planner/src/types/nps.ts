// src/types/nps.ts
// TypeScript types for NPS API responses and internal NPS data

// ─────────────────────────────────────────────────────────────
// NPS API Response Types (from developer.nps.gov/api/v1)
// ─────────────────────────────────────────────────────────────

export interface NPSApiResponse<T> {
  total: string;
  limit: string;
  start: string;
  data: T[];
}

export interface NPSCampgroundRaw {
  id: string;
  url: string;
  name: string;
  parkCode: string;
  description: string;
  latitude: string;
  longitude: string;
  latLong: string;
  reservationInfo: string;
  reservationUrl: string;
  regulationsurl: string;
  regulationsOverview: string;
  fees: NPSFee[];
  directionsOverview: string;
  directionsUrl: string;
  operatingHours: NPSOperatingHours[];
  addresses: NPSAddress[];
  images: NPSImage[];
  weatherOverview: string;
  numberOfSitesReservable: string;
  numberOfSitesFirstComeFirstServe: string;
  campsites: NPSCampsites;
  accessibility: NPSAccessibility;
  amenities: NPSCampgroundAmenities;
  contacts: NPSContacts;
  audioDescription: string;
  isPassportStampLocation: string;
  geometryPoiId: string;
  multimedia: unknown[];
  relevanceScore: number;
  lastIndexedDate: string;
}

export interface NPSPlaceRaw {
  id: string;
  url: string;
  title: string;
  listingDescription: string;
  images: NPSPlaceImage[];
  relatedParks: NPSRelatedPark[];
  tags: string[];
  latitude: string;
  longitude: string;
  latLong: string;
  bodyText: string;
  audioDescription: string;
  isPassportStampLocation: string;
  geometryPoiId: string;
  isManagedByNps: string;
  isOpenToPublic: string;
  isMapPinHidden: string;
  amenities: string[];
  managedByOrg: string;
  quickFacts: NPSQuickFact[];
  multimedia: unknown[];
  relevanceScore: number;
}

// ─────────────────────────────────────────────────────────────
// NPS Sub-types
// ─────────────────────────────────────────────────────────────

export interface NPSFee {
  cost: string;
  description: string;
  title: string;
}

export interface NPSOperatingHours {
  exceptions: NPSHoursException[];
  description: string;
  standardHours: Record<string, string>;
  name: string;
}

export interface NPSHoursException {
  exceptionHours: Record<string, string>;
  startDate: string;
  name: string;
  endDate: string;
}

export interface NPSAddress {
  postalCode: string;
  city: string;
  stateCode: string;
  countryCode: string;
  provinceTerritoryCode: string;
  line1: string;
  type: string;
  line2: string;
  line3: string;
}

export interface NPSImage {
  credit: string;
  crops: unknown[];
  title: string;
  altText: string;
  caption: string;
  url: string;
}

export interface NPSPlaceImage {
  url: string;
  credit: string;
  altText: string;
  title: string;
  description: string;
  caption: string;
  crops: { aspectRatio: string; url: string }[];
}

export interface NPSCampsites {
  totalSites: string;
  group: string;
  horse: string;
  tentOnly: string;
  electricalHookups: string;
  rvOnly: string;
  walkBoatTo: string;
  other: string;
}

export interface NPSAccessibility {
  wheelchairAccess: string;
  internetInfo: string;
  cellPhoneInfo: string;
  fireStovePolicy: string;
  rvAllowed: string;
  rvInfo: string;
  rvMaxLength: string;
  additionalInfo: string;
  trailerMaxLength: string;
  adaInfo: string;
  trailerAllowed: string;
  accessRoads: string[];
  classifications: string[];
}

export interface NPSCampgroundAmenities {
  trashRecyclingCollection: string;
  toilets: string[];
  internetConnectivity: string;
  showers: string[];
  cellPhoneReception: string;
  laundry: string;
  amphitheater: string;
  dumpStation: string;
  campStore: string;
  staffOrVolunteerHostOnsite: string;
  potableWater: string[];
  iceAvailableForSale: string;
  firewoodForSale: string;
  foodStorageLockers: string;
}

export interface NPSContacts {
  phoneNumbers: { phoneNumber: string; description: string; extension: string; type: string }[];
  emailAddresses: { description: string; emailAddress: string }[];
}

export interface NPSRelatedPark {
  states: string;
  parkCode: string;
  designation: string;
  fullName: string;
  url: string;
  name: string;
}

export interface NPSQuickFact {
  id: string;
  value: string;
  name: string;
}

// ─────────────────────────────────────────────────────────────
// Internal App Types (for display)
// ─────────────────────────────────────────────────────────────

export interface NPSCampgroundData {
  npsId: string;
  name: string;
  description: string;
  npsUrl: string;
  reservationInfo: string | null;
  reservationUrl: string | null;
  fees: { cost: string; description: string; title: string }[];
  totalSites: number;
  sitesReservable: number;
  sitesFirstCome: number;
  sitesGroup: number;
  sitesTentOnly: number;
  sitesElectrical: number;
  amenities: {
    toilets: string[];
    showers: string[];
    cellPhoneReception: string;
    potableWater: string[];
    campStore: string;
    firewoodForSale: string;
    dumpStation: string;
    trashCollection: string;
  };
  operatingHours: { description: string; name: string }[];
  classification: string | null;
  directionsOverview: string | null;
  images: { url: string; title: string; altText: string; caption: string; credit: string }[];
  accessibility: {
    wheelchairAccess: string;
    cellPhoneInfo: string;
    rvAllowed: boolean;
    rvInfo: string;
    accessRoads: string[];
  };
}

export interface PointOfInterest {
  id: string;
  riverId: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  bodyText: string | null;
  type: POIType;
  source: 'nps' | 'manual';
  npsUrl: string | null;
  latitude: number;
  longitude: number;
  riverMile: number | null;
  images: { url: string; title: string; altText: string; caption: string; credit: string }[];
  amenities: string[];
  active: boolean;
  isOnWater: boolean;
}

export type POIType =
  | 'spring'
  | 'cave'
  | 'historical_site'
  | 'scenic_viewpoint'
  | 'waterfall'
  | 'geological'
  | 'other';

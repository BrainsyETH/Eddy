// src/types/ridb.ts
// TypeScript types for Recreation Information Database (RIDB) API responses
// Docs: https://ridb.recreation.gov/docs

// ─────────────────────────────────────────────────────────────
// RIDB API Response Wrapper
// ─────────────────────────────────────────────────────────────

export interface RIDBPaginatedResponse<T> {
  RECDATA: T[];
  METADATA: {
    RESULTS: {
      CURRENT_COUNT: number;
      TOTAL_COUNT: number;
    };
    SEARCH_PARAMETERS: {
      QUERY: string;
      LIMIT: number;
      OFFSET: number;
    };
  };
}

// ─────────────────────────────────────────────────────────────
// Recreation Area
// ─────────────────────────────────────────────────────────────

export interface RIDBRecArea {
  RecAreaID: string;
  OrgRecAreaID: string;
  ParentOrgID: string;
  RecAreaName: string;
  RecAreaDescription: string;
  RecAreaFeeDescription: string;
  RecAreaDirections: string;
  RecAreaPhone: string;
  RecAreaEmail: string;
  RecAreaReservationURL: string;
  RecAreaMapURL: string;
  RecAreaLatitude: number;
  RecAreaLongitude: number;
  StayLimit: string;
  Keywords: string;
  Reservable: boolean;
  Enabled: boolean;
  LastUpdatedDate: string;
  ACTIVITY: RIDBActivity[];
  MEDIA: RIDBMedia[];
  LINK: RIDBLink[];
  ORGANIZATION: RIDBOrganization[];
}

// ─────────────────────────────────────────────────────────────
// Facility (Campground, Day Use Area, Trailhead, etc.)
// ─────────────────────────────────────────────────────────────

export interface RIDBFacility {
  FacilityID: string;
  LegacyFacilityID: string;
  OrgFacilityID: string;
  ParentOrgID: string;
  ParentRecAreaID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityTypeDescription: string;
  FacilityUseFeeDescription: string;
  FacilityDirections: string;
  FacilityPhone: string;
  FacilityEmail: string;
  FacilityReservationURL: string;
  FacilityMapURL: string;
  FacilityAdaAccess: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  StayLimit: string;
  Keywords: string;
  Reservable: boolean;
  Enabled: boolean;
  LastUpdatedDate: string;
  CAMPSITE: RIDBCampsite[];
  PERMITENTRANCE: unknown[];
  TOUR: unknown[];
  ORGANIZATION: RIDBOrganization[];
  GEOJSON: RIDBGeoJSON | null;
  FACILITYADDRESS: RIDBFacilityAddress[];
  ACTIVITY: RIDBActivity[];
  MEDIA: RIDBMedia[];
  LINK: RIDBLink[];
  EVENT: unknown[];
}

// ─────────────────────────────────────────────────────────────
// Campsite
// ─────────────────────────────────────────────────────────────

export interface RIDBCampsite {
  CampsiteID: string;
  FacilityID: string;
  CampsiteName: string;
  CampsiteType: string;
  TypeOfUse: string;
  Loop: string;
  CampsiteAccessible: boolean;
  CampsiteReservable: boolean;
  CampsiteLongitude: number;
  CampsiteLatitude: number;
  CreatedDate: string;
  LastUpdatedDate: string;
  ATTRIBUTES: RIDBAttribute[];
  PERMITTEDEQUIPMENT: RIDBPermittedEquipment[];
  ENTITYMEDIA: RIDBMedia[];
}

// ─────────────────────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────────────────────

export interface RIDBActivity {
  ActivityID: number;
  ActivityParentID: number;
  RecAreaID: string;
  FacilityID: string;
  ActivityName: string;
  ActivityDescription: string;
}

export interface RIDBMedia {
  EntityMediaID: string;
  MediaType: string;
  EntityID: string;
  EntityType: string;
  Title: string;
  Subtitle: string;
  Description: string;
  EmbedCode: string;
  URL: string;
  Height: number;
  Width: number;
  Credits: string;
}

export interface RIDBLink {
  EntityLinkID: string;
  LinkType: string;
  EntityID: string;
  EntityType: string;
  Title: string;
  Description: string;
  URL: string;
}

export interface RIDBOrganization {
  OrgID: string;
  OrgName: string;
  OrgImageURL: string;
  OrgURLText: string;
  OrgURLAddress: string;
  OrgType: string;
  OrgAbbrevName: string;
  OrgJurisdictionType: string;
  OrgParentID: string;
  LastUpdatedDate: string;
}

export interface RIDBFacilityAddress {
  FacilityAddressID: string;
  FacilityID: string;
  FacilityAddressType: string;
  FacilityStreetAddress1: string;
  FacilityStreetAddress2: string;
  FacilityStreetAddress3: string;
  City: string;
  PostalCode: string;
  AddressStateCode: string;
  AddressCountryCode: string;
  LastUpdatedDate: string;
}

export interface RIDBAttribute {
  AttributeName: string;
  AttributeValue: string;
  AttributeID: number;
}

export interface RIDBPermittedEquipment {
  EquipmentName: string;
  MaxLength: number;
}

export interface RIDBGeoJSON {
  TYPE: string;
  COORDINATES: [number, number];
}

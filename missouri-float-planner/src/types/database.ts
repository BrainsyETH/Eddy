// src/types/database.ts
// Database types for Eddy
// Note: In production, generate this file with:
// npx supabase gen types typescript --project-id [id] > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      rivers: {
        Row: {
          id: string;
          name: string;
          slug: string;
          geom: unknown; // PostGIS geometry
          length_miles: number | null;
          downstream_point: unknown | null;
          direction_verified: boolean;
          description: string | null;
          difficulty_rating: string | null;
          region: string | null;
          nhd_feature_id: string | null;
          smoothed_geometries: Json | null; // Pre-processed bezier-smoothed geometry
          active: boolean; // Whether river is visible in public app
          float_summary: string | null;
          float_tip: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          geom: unknown;
          length_miles?: number | null;
          downstream_point?: unknown | null;
          direction_verified?: boolean;
          description?: string | null;
          difficulty_rating?: string | null;
          region?: string | null;
          nhd_feature_id?: string | null;
          smoothed_geometries?: Json | null;
          active?: boolean;
          float_summary?: string | null;
          float_tip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          geom?: unknown;
          length_miles?: number | null;
          downstream_point?: unknown | null;
          direction_verified?: boolean;
          description?: string | null;
          difficulty_rating?: string | null;
          region?: string | null;
          nhd_feature_id?: string | null;
          smoothed_geometries?: Json | null;
          active?: boolean;
          float_summary?: string | null;
          float_tip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      gauge_stations: {
        Row: {
          id: string;
          usgs_site_id: string;
          name: string;
          location: unknown;
          active: boolean;
          high_frequency_flag: boolean;
          threshold_descriptions: Json | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          usgs_site_id: string;
          name: string;
          location: unknown;
          active?: boolean;
          high_frequency_flag?: boolean;
          threshold_descriptions?: Json | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          usgs_site_id?: string;
          name?: string;
          location?: unknown;
          active?: boolean;
          high_frequency_flag?: boolean;
          threshold_descriptions?: Json | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      river_gauges: {
        Row: {
          id: string;
          river_id: string | null;
          gauge_station_id: string | null;
          distance_from_section_miles: number | null;
          is_primary: boolean;
          accuracy_warning_threshold_miles: number;
          threshold_unit: string;
          level_too_low: number | null;
          level_low: number | null;
          level_optimal_min: number | null;
          level_optimal_max: number | null;
          level_high: number | null;
          level_dangerous: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          river_id?: string | null;
          gauge_station_id?: string | null;
          distance_from_section_miles?: number | null;
          is_primary?: boolean;
          accuracy_warning_threshold_miles?: number;
          threshold_unit?: string;
          level_too_low?: number | null;
          level_low?: number | null;
          level_optimal_min?: number | null;
          level_optimal_max?: number | null;
          level_high?: number | null;
          level_dangerous?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          river_id?: string | null;
          gauge_station_id?: string | null;
          distance_from_section_miles?: number | null;
          is_primary?: boolean;
          accuracy_warning_threshold_miles?: number;
          threshold_unit?: string;
          level_too_low?: number | null;
          level_low?: number | null;
          level_optimal_min?: number | null;
          level_optimal_max?: number | null;
          level_high?: number | null;
          level_dangerous?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      gauge_readings: {
        Row: {
          id: string;
          gauge_station_id: string | null;
          reading_timestamp: string;
          gauge_height_ft: number | null;
          discharge_cfs: number | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          gauge_station_id?: string | null;
          reading_timestamp: string;
          gauge_height_ft?: number | null;
          discharge_cfs?: number | null;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          gauge_station_id?: string | null;
          reading_timestamp?: string;
          gauge_height_ft?: number | null;
          discharge_cfs?: number | null;
          fetched_at?: string;
        };
      };
      access_points: {
        Row: {
          id: string;
          river_id: string | null;
          name: string;
          slug: string;
          location_orig: unknown;
          location_snap: unknown | null;
          river_mile_downstream: number | null;
          river_mile_upstream: number | null;
          type: string;
          types: string[] | null;
          is_public: boolean;
          ownership: string | null;
          description: string | null;
          amenities: string[] | null;
          parking_info: string | null;
          road_access: string | null;
          facilities: string | null;
          fee_required: boolean;
          fee_notes: string | null;
          approved: boolean;
          submitted_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          directions_override: string | null;
          driving_lat: number | null;
          driving_lng: number | null;
          image_urls: string[] | null;
          google_maps_url: string | null;
          // New detail fields (migration 00034)
          road_surface: string[] | null;
          parking_capacity: string | null;
          managing_agency: string | null;
          official_site_url: string | null;
          local_tips: string | null;
          nearby_services: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          river_id?: string | null;
          name: string;
          slug: string;
          location_orig: unknown;
          location_snap?: unknown | null;
          river_mile_downstream?: number | null;
          river_mile_upstream?: number | null;
          type?: string;
          types?: string[] | null;
          is_public?: boolean;
          ownership?: string | null;
          description?: string | null;
          amenities?: string[] | null;
          parking_info?: string | null;
          road_access?: string | null;
          facilities?: string | null;
          fee_required?: boolean;
          fee_notes?: string | null;
          approved?: boolean;
          submitted_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          directions_override?: string | null;
          driving_lat?: number | null;
          driving_lng?: number | null;
          image_urls?: string[] | null;
          google_maps_url?: string | null;
          // New detail fields (migration 00034)
          road_surface?: string[] | null;
          parking_capacity?: string | null;
          managing_agency?: string | null;
          official_site_url?: string | null;
          local_tips?: string | null;
          nearby_services?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          river_id?: string | null;
          name?: string;
          slug?: string;
          location_orig?: unknown;
          location_snap?: unknown | null;
          river_mile_downstream?: number | null;
          river_mile_upstream?: number | null;
          type?: string;
          types?: string[] | null;
          is_public?: boolean;
          ownership?: string | null;
          description?: string | null;
          amenities?: string[] | null;
          parking_info?: string | null;
          road_access?: string | null;
          facilities?: string | null;
          fee_required?: boolean;
          fee_notes?: string | null;
          approved?: boolean;
          submitted_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          directions_override?: string | null;
          driving_lat?: number | null;
          driving_lng?: number | null;
          image_urls?: string[] | null;
          google_maps_url?: string | null;
          // New detail fields (migration 00034)
          road_surface?: string[] | null;
          parking_capacity?: string | null;
          managing_agency?: string | null;
          official_site_url?: string | null;
          local_tips?: string | null;
          nearby_services?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      river_hazards: {
        Row: {
          id: string;
          river_id: string | null;
          name: string;
          type: string;
          location: unknown | null;
          river_mile_downstream: number | null;
          description: string | null;
          severity: string | null;
          portage_required: boolean;
          portage_side: string | null;
          active: boolean;
          seasonal_notes: string | null;
          min_safe_level: number | null;
          max_safe_level: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          river_id?: string | null;
          name: string;
          type: string;
          location?: unknown | null;
          river_mile_downstream?: number | null;
          description?: string | null;
          severity?: string | null;
          portage_required?: boolean;
          portage_side?: string | null;
          active?: boolean;
          seasonal_notes?: string | null;
          min_safe_level?: number | null;
          max_safe_level?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          river_id?: string | null;
          name?: string;
          type?: string;
          location?: unknown | null;
          river_mile_downstream?: number | null;
          description?: string | null;
          severity?: string | null;
          portage_required?: boolean;
          portage_side?: string | null;
          active?: boolean;
          seasonal_notes?: string | null;
          min_safe_level?: number | null;
          max_safe_level?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      drive_time_cache: {
        Row: {
          id: string;
          start_access_id: string | null;
          end_access_id: string | null;
          drive_minutes: number | null;
          drive_miles: number | null;
          route_summary: string | null;
          fetched_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          start_access_id?: string | null;
          end_access_id?: string | null;
          drive_minutes?: number | null;
          drive_miles?: number | null;
          route_summary?: string | null;
          fetched_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          start_access_id?: string | null;
          end_access_id?: string | null;
          drive_minutes?: number | null;
          drive_miles?: number | null;
          route_summary?: string | null;
          fetched_at?: string;
          expires_at?: string;
        };
      };
      vessel_types: {
        Row: {
          id: string;
          name: string;
          slug: string;
          speed_low_water: number | null;
          speed_normal: number | null;
          speed_high_water: number | null;
          description: string | null;
          icon: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          speed_low_water?: number | null;
          speed_normal?: number | null;
          speed_high_water?: number | null;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          speed_low_water?: number | null;
          speed_normal?: number | null;
          speed_high_water?: number | null;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
        };
      };
      float_plans: {
        Row: {
          id: string;
          short_code: string;
          river_id: string | null;
          start_access_id: string | null;
          end_access_id: string | null;
          vessel_type_id: string | null;
          distance_miles: number | null;
          estimated_float_minutes: number | null;
          drive_back_minutes: number | null;
          condition_at_creation: string | null;
          gauge_reading_at_creation: number | null;
          discharge_cfs_at_creation: number | null;
          gauge_name_at_creation: string | null;
          created_at: string;
          view_count: number;
          last_viewed_at: string | null;
        };
        Insert: {
          id?: string;
          short_code: string;
          river_id?: string | null;
          start_access_id?: string | null;
          end_access_id?: string | null;
          vessel_type_id?: string | null;
          distance_miles?: number | null;
          estimated_float_minutes?: number | null;
          drive_back_minutes?: number | null;
          condition_at_creation?: string | null;
          gauge_reading_at_creation?: number | null;
          discharge_cfs_at_creation?: number | null;
          gauge_name_at_creation?: string | null;
          created_at?: string;
          view_count?: number;
          last_viewed_at?: string | null;
        };
        Update: {
          id?: string;
          short_code?: string;
          river_id?: string | null;
          start_access_id?: string | null;
          end_access_id?: string | null;
          vessel_type_id?: string | null;
          distance_miles?: number | null;
          estimated_float_minutes?: number | null;
          drive_back_minutes?: number | null;
          condition_at_creation?: string | null;
          gauge_reading_at_creation?: number | null;
          discharge_cfs_at_creation?: number | null;
          gauge_name_at_creation?: string | null;
          created_at?: string;
          view_count?: number;
          last_viewed_at?: string | null;
        };
      };
      user_roles: {
        Row: {
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role?: string;
          created_at?: string;
        };
      };
      segment_cache: {
        Row: {
          id: string;
          start_access_id: string | null;
          end_access_id: string | null;
          segment_geom: unknown; // PostGIS geometry
          distance_miles: number | null;
          cached_at: string;
        };
        Insert: {
          id?: string;
          start_access_id?: string | null;
          end_access_id?: string | null;
          segment_geom?: unknown;
          distance_miles?: number | null;
          cached_at?: string;
        };
        Update: {
          id?: string;
          start_access_id?: string | null;
          end_access_id?: string | null;
          segment_geom?: unknown;
          distance_miles?: number | null;
          cached_at?: string;
        };
      };
      community_reports: {
        Row: {
          id: string;
          user_id: string | null;
          river_id: string | null;
          hazard_id: string | null;
          type: 'hazard' | 'water_level' | 'debris';
          coordinates: unknown; // PostGIS geometry
          river_mile: number | null;
          image_url: string | null;
          description: string;
          status: 'pending' | 'verified' | 'rejected';
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          river_id?: string | null;
          hazard_id?: string | null;
          type: 'hazard' | 'water_level' | 'debris';
          coordinates: unknown;
          river_mile?: number | null;
          image_url?: string | null;
          description: string;
          status?: 'pending' | 'verified' | 'rejected';
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          river_id?: string | null;
          hazard_id?: string | null;
          type?: 'hazard' | 'water_level' | 'debris';
          coordinates?: unknown;
          river_mile?: number | null;
          image_url?: string | null;
          description?: string;
          status?: 'pending' | 'verified' | 'rejected';
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shuttle_services: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          primary_access_point_id: string | null;
          service_radius_miles: number | null;
          offers_shuttle: boolean;
          offers_rental: boolean;
          offers_camping: boolean;
          rental_types: string[] | null;
          shuttle_price_range: string | null;
          rental_price_range: string | null;
          hours_of_operation: Json | null;
          seasonal_notes: string | null;
          active: boolean;
          verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          primary_access_point_id?: string | null;
          service_radius_miles?: number | null;
          offers_shuttle?: boolean;
          offers_rental?: boolean;
          offers_camping?: boolean;
          rental_types?: string[] | null;
          shuttle_price_range?: string | null;
          rental_price_range?: string | null;
          hours_of_operation?: Json | null;
          seasonal_notes?: string | null;
          active?: boolean;
          verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          primary_access_point_id?: string | null;
          service_radius_miles?: number | null;
          offers_shuttle?: boolean;
          offers_rental?: boolean;
          offers_camping?: boolean;
          rental_types?: string[] | null;
          shuttle_price_range?: string | null;
          rental_price_range?: string | null;
          hours_of_operation?: Json | null;
          seasonal_notes?: string | null;
          active?: boolean;
          verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      shuttle_service_coverage: {
        Row: {
          id: string;
          shuttle_service_id: string | null;
          access_point_id: string | null;
          is_pickup: boolean;
          is_dropoff: boolean;
        };
        Insert: {
          id?: string;
          shuttle_service_id?: string | null;
          access_point_id?: string | null;
          is_pickup?: boolean;
          is_dropoff?: boolean;
        };
        Update: {
          id?: string;
          shuttle_service_id?: string | null;
          access_point_id?: string | null;
          is_pickup?: boolean;
          is_dropoff?: boolean;
        };
      };
      feedback: {
        Row: {
          id: string;
          feedback_type: 'inaccurate_data' | 'missing_access_point' | 'suggestion' | 'bug_report' | 'other';
          user_name: string | null;
          user_email: string;
          message: string;
          image_url: string | null;
          context_type: 'gauge' | 'access_point' | 'river' | 'general' | null;
          context_id: string | null;
          context_name: string | null;
          context_data: Json | null;
          status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          feedback_type: 'inaccurate_data' | 'missing_access_point' | 'suggestion' | 'bug_report' | 'other';
          user_name?: string | null;
          user_email: string;
          message: string;
          image_url?: string | null;
          context_type?: 'gauge' | 'access_point' | 'river' | 'general' | null;
          context_id?: string | null;
          context_name?: string | null;
          context_data?: Json | null;
          status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          feedback_type?: 'inaccurate_data' | 'missing_access_point' | 'suggestion' | 'bug_report' | 'other';
          user_name?: string | null;
          user_email?: string;
          message?: string;
          image_url?: string | null;
          context_type?: 'gauge' | 'access_point' | 'river' | 'general' | null;
          context_id?: string | null;
          context_name?: string | null;
          context_data?: Json | null;
          status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      blog_posts: {
        Row: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          content: string | null;
          category: 'Guides' | 'Tips' | 'News' | 'Safety' | 'River Profiles' | 'Gear Reviews' | 'Trip Reports';
          featured_image_url: string | null;
          og_image_url: string | null;
          meta_keywords: string[] | null;
          read_time_minutes: number | null;
          status: 'draft' | 'published' | 'scheduled';
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          description?: string | null;
          content?: string | null;
          category?: 'Guides' | 'Tips' | 'News' | 'Safety' | 'River Profiles' | 'Gear Reviews' | 'Trip Reports';
          featured_image_url?: string | null;
          og_image_url?: string | null;
          meta_keywords?: string[] | null;
          read_time_minutes?: number | null;
          status?: 'draft' | 'published' | 'scheduled';
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          description?: string | null;
          content?: string | null;
          category?: 'Guides' | 'Tips' | 'News' | 'Safety' | 'River Profiles' | 'Gear Reviews' | 'Trip Reports';
          featured_image_url?: string | null;
          og_image_url?: string | null;
          meta_keywords?: string[] | null;
          read_time_minutes?: number | null;
          status?: 'draft' | 'published' | 'scheduled';
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Functions: {
      snap_to_river: {
        Args: {
          p_point: unknown;
          p_river_id: string;
        };
        Returns: {
          snapped_point: unknown;
          river_mile: number;
          distance_from_original_meters: number;
        }[];
      };
      get_float_segment: {
        Args: {
          p_start_access_id: string;
          p_end_access_id: string;
        };
        Returns: {
          segment_geom: unknown;
          distance_miles: number;
          start_name: string;
          end_name: string;
          start_river_mile: number;
          end_river_mile: number;
        }[];
      };
      get_river_condition: {
        Args: {
          p_river_id: string;
        };
        Returns: {
          condition_label: string;
          condition_code: string;
          gauge_height_ft: number;
          discharge_cfs: number;
          reading_timestamp: string;
          reading_age_hours: number;
          accuracy_warning: boolean;
          accuracy_warning_reason: string;
          gauge_name: string;
          gauge_usgs_id: string;
        }[];
      };
      calculate_float_time: {
        Args: {
          p_distance_miles: number;
          p_vessel_type_id: string;
          p_condition_code: string;
        };
        Returns: {
          float_minutes: number;
          speed_mph: number;
          vessel_name: string;
        }[];
      };
      generate_short_code: {
        Args: {
          length?: number;
        };
        Returns: string;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_segment_nearest_gauge: {
        Args: {
          p_river_id: string;
          p_put_in_point: unknown;
        };
        Returns: {
          gauge_station_id: string;
          gauge_name: string;
          usgs_site_id: string;
          distance_meters: number;
          threshold_unit: string;
          level_too_low: number;
          level_low: number;
          level_optimal_min: number;
          level_optimal_max: number;
          level_high: number;
          level_dangerous: number;
          distance_from_section_miles: number;
          accuracy_warning_threshold_miles: number;
        }[];
      };
      get_river_condition_segment: {
        Args: {
          p_river_id: string;
          p_put_in_point?: unknown;
        };
        Returns: {
          condition_label: string;
          condition_code: string;
          gauge_height_ft: number;
          discharge_cfs: number;
          reading_timestamp: string;
          reading_age_hours: number;
          accuracy_warning: boolean;
          accuracy_warning_reason: string;
          gauge_name: string;
          gauge_usgs_id: string;
          distance_to_put_in_meters: number;
        }[];
      };
      cache_segment: {
        Args: {
          p_start_access_id: string;
          p_end_access_id: string;
        };
        Returns: {
          segment_geom: unknown;
          distance_miles: number;
        }[];
      };
      invalidate_segment_cache: {
        Args: {
          p_river_id?: string;
          p_access_point_id?: string;
        };
        Returns: number;
      };
      get_campgrounds_along_route: {
        Args: {
          p_river_id: string;
          p_start_mile: number;
          p_end_mile: number;
          p_interval_min_miles?: number;
          p_interval_max_miles?: number;
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          river_mile: number;
          coordinates: unknown;
          amenities: string[];
          distance_from_start: number;
        }[];
      };
      get_gauge_rate_of_change: {
        Args: {
          p_gauge_station_id: string;
          p_hours_lookback?: number;
        };
        Returns: {
          rate_ft_per_hour: number;
          current_height: number;
          previous_height: number;
          hours_elapsed: number;
          is_rapid_change: boolean;
        }[];
      };
    };
  };
}

// src/types/database.ts
// AUTO-GENERATED from the live Supabase schema (project: FloatMe / ilefwfpvphadsbptiaur).
// Regenerate with: npm run db:gen-types  (see scripts) — do not edit by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_points: {
        Row: {
          amenities: string[] | null
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          description: string | null
          directions_override: string | null
          driving_lat: number | null
          driving_lng: number | null
          facilities: string | null
          fee_notes: string | null
          fee_required: boolean | null
          google_maps_url: string | null
          id: string
          image_urls: string[] | null
          is_public: boolean | null
          local_tips: string | null
          location_orig: unknown
          location_snap: unknown
          managing_agency: string | null
          name: string
          nearby_services: Json | null
          nps_campground_id: string | null
          official_site_url: string | null
          ownership: string | null
          parking_capacity: string | null
          parking_info: string | null
          ridb_data: Json | null
          ridb_facility_id: string | null
          river_id: string | null
          river_mile_downstream: number | null
          river_mile_upstream: number | null
          road_access: string | null
          road_surface: string[] | null
          slug: string
          snap_distance_m: number | null
          submitted_by: string | null
          type: string | null
          types: string[] | null
          updated_at: string | null
        }
        Insert: {
          amenities?: string[] | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          directions_override?: string | null
          driving_lat?: number | null
          driving_lng?: number | null
          facilities?: string | null
          fee_notes?: string | null
          fee_required?: boolean | null
          google_maps_url?: string | null
          id?: string
          image_urls?: string[] | null
          is_public?: boolean | null
          local_tips?: string | null
          location_orig: unknown
          location_snap?: unknown
          managing_agency?: string | null
          name: string
          nearby_services?: Json | null
          nps_campground_id?: string | null
          official_site_url?: string | null
          ownership?: string | null
          parking_capacity?: string | null
          parking_info?: string | null
          ridb_data?: Json | null
          ridb_facility_id?: string | null
          river_id?: string | null
          river_mile_downstream?: number | null
          river_mile_upstream?: number | null
          road_access?: string | null
          road_surface?: string[] | null
          slug: string
          snap_distance_m?: number | null
          submitted_by?: string | null
          type?: string | null
          types?: string[] | null
          updated_at?: string | null
        }
        Update: {
          amenities?: string[] | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          directions_override?: string | null
          driving_lat?: number | null
          driving_lng?: number | null
          facilities?: string | null
          fee_notes?: string | null
          fee_required?: boolean | null
          google_maps_url?: string | null
          id?: string
          image_urls?: string[] | null
          is_public?: boolean | null
          local_tips?: string | null
          location_orig?: unknown
          location_snap?: unknown
          managing_agency?: string | null
          name?: string
          nearby_services?: Json | null
          nps_campground_id?: string | null
          official_site_url?: string | null
          ownership?: string | null
          parking_capacity?: string | null
          parking_info?: string | null
          ridb_data?: Json | null
          ridb_facility_id?: string | null
          river_id?: string | null
          river_mile_downstream?: number | null
          river_mile_upstream?: number | null
          road_access?: string | null
          road_surface?: string[] | null
          slug?: string
          snap_distance_m?: number | null
          submitted_by?: string | null
          type?: string | null
          types?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_points_nps_campground_id_fkey"
            columns: ["nps_campground_id"]
            isOneToOne: false
            referencedRelation: "nps_campgrounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_points_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          category: string
          content: string | null
          created_at: string
          description: string | null
          featured_image_url: string | null
          guide_data: Json | null
          id: string
          meta_keywords: string[] | null
          og_image_url: string | null
          published_at: string | null
          read_time_minutes: number | null
          river_slug: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          description?: string | null
          featured_image_url?: string | null
          guide_data?: Json | null
          id?: string
          meta_keywords?: string[] | null
          og_image_url?: string | null
          published_at?: string | null
          read_time_minutes?: number | null
          river_slug?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          description?: string | null
          featured_image_url?: string | null
          guide_data?: Json | null
          id?: string
          meta_keywords?: string[] | null
          og_image_url?: string | null
          published_at?: string | null
          read_time_minutes?: number | null
          river_slug?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_river_slug_fkey"
            columns: ["river_slug"]
            isOneToOne: false
            referencedRelation: "gauge_snap_diagnostics"
            referencedColumns: ["river_slug"]
          },
          {
            foreignKeyName: "blog_posts_river_slug_fkey"
            columns: ["river_slug"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["slug"]
          },
        ]
      }
      clip_library: {
        Row: {
          brand_check_error: string | null
          brand_check_result: Json | null
          brand_check_status: string | null
          clip_end_secs: number | null
          clip_start_secs: number | null
          clip_url: string
          content_tags: string[] | null
          content_type: string | null
          created_at: string | null
          duration_secs: number | null
          heatmap_score: number | null
          id: string
          orientation: string | null
          posting_claimed_at: string | null
          river_slug: string | null
          source_creator: string | null
          source_url: string | null
          thumbnail_url: string | null
          tone: string | null
          updated_at: string | null
          used_in_posts: string[] | null
          youtube_channel: string | null
          youtube_video_id: string
        }
        Insert: {
          brand_check_error?: string | null
          brand_check_result?: Json | null
          brand_check_status?: string | null
          clip_end_secs?: number | null
          clip_start_secs?: number | null
          clip_url: string
          content_tags?: string[] | null
          content_type?: string | null
          created_at?: string | null
          duration_secs?: number | null
          heatmap_score?: number | null
          id?: string
          orientation?: string | null
          posting_claimed_at?: string | null
          river_slug?: string | null
          source_creator?: string | null
          source_url?: string | null
          thumbnail_url?: string | null
          tone?: string | null
          updated_at?: string | null
          used_in_posts?: string[] | null
          youtube_channel?: string | null
          youtube_video_id: string
        }
        Update: {
          brand_check_error?: string | null
          brand_check_result?: Json | null
          brand_check_status?: string | null
          clip_end_secs?: number | null
          clip_start_secs?: number | null
          clip_url?: string
          content_tags?: string[] | null
          content_type?: string | null
          created_at?: string | null
          duration_secs?: number | null
          heatmap_score?: number | null
          id?: string
          orientation?: string | null
          posting_claimed_at?: string | null
          river_slug?: string | null
          source_creator?: string | null
          source_url?: string | null
          thumbnail_url?: string | null
          tone?: string | null
          updated_at?: string | null
          used_in_posts?: string[] | null
          youtube_channel?: string | null
          youtube_video_id?: string
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          access_point_id: string | null
          coordinates: unknown
          created_at: string | null
          description: string
          discharge_cfs: number | null
          gauge_height_ft: number | null
          gauge_station_id: string | null
          hazard_id: string | null
          id: string
          image_url: string | null
          river_id: string | null
          river_mile: number | null
          status: string | null
          submitter_name: string | null
          type: string
          updated_at: string | null
          user_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          access_point_id?: string | null
          coordinates: unknown
          created_at?: string | null
          description: string
          discharge_cfs?: number | null
          gauge_height_ft?: number | null
          gauge_station_id?: string | null
          hazard_id?: string | null
          id?: string
          image_url?: string | null
          river_id?: string | null
          river_mile?: number | null
          status?: string | null
          submitter_name?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          access_point_id?: string | null
          coordinates?: unknown
          created_at?: string | null
          description?: string
          discharge_cfs?: number | null
          gauge_height_ft?: number | null
          gauge_station_id?: string | null
          hazard_id?: string | null
          id?: string
          image_url?: string | null
          river_id?: string | null
          river_mile?: number | null
          status?: string | null
          submitter_name?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_access_point_id_fkey"
            columns: ["access_point_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_snap_diagnostics"
            referencedColumns: ["gauge_id"]
          },
          {
            foreignKeyName: "community_reports_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_hazard_id_fkey"
            columns: ["hazard_id"]
            isOneToOne: false
            referencedRelation: "river_hazards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          heartbeat_at: string
          job: string
          started_at: string
        }
        Insert: {
          heartbeat_at?: string
          job: string
          started_at?: string
        }
        Update: {
          heartbeat_at?: string
          job?: string
          started_at?: string
        }
        Relationships: []
      }
      drive_time_cache: {
        Row: {
          drive_miles: number | null
          drive_minutes: number | null
          end_access_id: string | null
          expires_at: string | null
          fetched_at: string | null
          id: string
          route_geometry: Json | null
          route_summary: string | null
          start_access_id: string | null
        }
        Insert: {
          drive_miles?: number | null
          drive_minutes?: number | null
          end_access_id?: string | null
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          route_geometry?: Json | null
          route_summary?: string | null
          start_access_id?: string | null
        }
        Update: {
          drive_miles?: number | null
          drive_minutes?: number | null
          end_access_id?: string | null
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          route_geometry?: Json | null
          route_summary?: string | null
          start_access_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drive_time_cache_end_access_id_fkey"
            columns: ["end_access_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_time_cache_start_access_id_fkey"
            columns: ["start_access_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
        ]
      }
      eddy_updates: {
        Row: {
          cache_creation_tokens: number | null
          cache_read_tokens: number | null
          condition_code: string
          discharge_cfs: number | null
          expires_at: string
          gauge_height_ft: number | null
          generated_at: string
          id: string
          input_tokens: number | null
          is_event_driven: boolean | null
          model_used: string | null
          output_tokens: number | null
          quote_text: string
          river_slug: string
          section_slug: string | null
          sources_used: Json | null
          summary_text: string | null
          trigger_reason: string | null
          weather: Json | null
        }
        Insert: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          condition_code: string
          discharge_cfs?: number | null
          expires_at: string
          gauge_height_ft?: number | null
          generated_at?: string
          id?: string
          input_tokens?: number | null
          is_event_driven?: boolean | null
          model_used?: string | null
          output_tokens?: number | null
          quote_text: string
          river_slug: string
          section_slug?: string | null
          sources_used?: Json | null
          summary_text?: string | null
          trigger_reason?: string | null
          weather?: Json | null
        }
        Update: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          condition_code?: string
          discharge_cfs?: number | null
          expires_at?: string
          gauge_height_ft?: number | null
          generated_at?: string
          id?: string
          input_tokens?: number | null
          is_event_driven?: boolean | null
          model_used?: string | null
          output_tokens?: number | null
          quote_text?: string
          river_slug?: string
          section_slug?: string | null
          sources_used?: Json | null
          summary_text?: string | null
          trigger_reason?: string | null
          weather?: Json | null
        }
        Relationships: []
      }
      email_subscribers: {
        Row: {
          created_at: string | null
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      float_plans: {
        Row: {
          condition_at_creation: string | null
          created_at: string | null
          discharge_cfs_at_creation: number | null
          distance_miles: number | null
          drive_back_minutes: number | null
          end_access_id: string | null
          estimated_float_minutes: number | null
          gauge_name_at_creation: string | null
          gauge_reading_at_creation: number | null
          id: string
          last_viewed_at: string | null
          river_id: string | null
          short_code: string
          start_access_id: string | null
          user_id: string | null
          vessel_type_id: string | null
          view_count: number | null
        }
        Insert: {
          condition_at_creation?: string | null
          created_at?: string | null
          discharge_cfs_at_creation?: number | null
          distance_miles?: number | null
          drive_back_minutes?: number | null
          end_access_id?: string | null
          estimated_float_minutes?: number | null
          gauge_name_at_creation?: string | null
          gauge_reading_at_creation?: number | null
          id?: string
          last_viewed_at?: string | null
          river_id?: string | null
          short_code: string
          start_access_id?: string | null
          user_id?: string | null
          vessel_type_id?: string | null
          view_count?: number | null
        }
        Update: {
          condition_at_creation?: string | null
          created_at?: string | null
          discharge_cfs_at_creation?: number | null
          distance_miles?: number | null
          drive_back_minutes?: number | null
          end_access_id?: string | null
          estimated_float_minutes?: number | null
          gauge_name_at_creation?: string | null
          gauge_reading_at_creation?: number | null
          id?: string
          last_viewed_at?: string | null
          river_id?: string | null
          short_code?: string
          start_access_id?: string | null
          user_id?: string | null
          vessel_type_id?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "float_plans_end_access_id_fkey"
            columns: ["end_access_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_plans_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_plans_start_access_id_fkey"
            columns: ["start_access_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_plans_vessel_type_id_fkey"
            columns: ["vessel_type_id"]
            isOneToOne: false
            referencedRelation: "vessel_types"
            referencedColumns: ["id"]
          },
        ]
      }
      float_segments: {
        Row: {
          canoe_time_max: number | null
          canoe_time_min: number | null
          created_at: string | null
          distance_miles: number
          id: string
          notes: string | null
          put_in_id: string | null
          put_in_name: string
          raft_time_max: number | null
          raft_time_min: number | null
          river_id: string | null
          source: string | null
          take_out_id: string | null
          take_out_name: string
          trip_type: string | null
          tube_time_max: number | null
          tube_time_min: number | null
          updated_at: string | null
        }
        Insert: {
          canoe_time_max?: number | null
          canoe_time_min?: number | null
          created_at?: string | null
          distance_miles: number
          id?: string
          notes?: string | null
          put_in_id?: string | null
          put_in_name: string
          raft_time_max?: number | null
          raft_time_min?: number | null
          river_id?: string | null
          source?: string | null
          take_out_id?: string | null
          take_out_name: string
          trip_type?: string | null
          tube_time_max?: number | null
          tube_time_min?: number | null
          updated_at?: string | null
        }
        Update: {
          canoe_time_max?: number | null
          canoe_time_min?: number | null
          created_at?: string | null
          distance_miles?: number
          id?: string
          notes?: string | null
          put_in_id?: string | null
          put_in_name?: string
          raft_time_max?: number | null
          raft_time_min?: number | null
          river_id?: string | null
          source?: string | null
          take_out_id?: string | null
          take_out_name?: string
          trip_type?: string | null
          tube_time_max?: number | null
          tube_time_min?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "float_segments_put_in_id_fkey"
            columns: ["put_in_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_segments_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_segments_take_out_id_fkey"
            columns: ["take_out_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
        ]
      }
      gauge_readings: {
        Row: {
          discharge_cfs: number | null
          fetched_at: string | null
          gauge_height_ft: number | null
          gauge_station_id: string | null
          id: string
          qualifiers: string[] | null
          reading_timestamp: string
        }
        Insert: {
          discharge_cfs?: number | null
          fetched_at?: string | null
          gauge_height_ft?: number | null
          gauge_station_id?: string | null
          id?: string
          qualifiers?: string[] | null
          reading_timestamp: string
        }
        Update: {
          discharge_cfs?: number | null
          fetched_at?: string | null
          gauge_height_ft?: number | null
          gauge_station_id?: string | null
          id?: string
          qualifiers?: string[] | null
          reading_timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "gauge_readings_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_snap_diagnostics"
            referencedColumns: ["gauge_id"]
          },
          {
            foreignKeyName: "gauge_readings_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      gauge_stations: {
        Row: {
          active: boolean | null
          created_at: string | null
          drainage_area_sqmi: number | null
          high_frequency_flag: boolean | null
          id: string
          location: unknown
          name: string
          notes: string | null
          nws_lid: string | null
          provider: string
          site_id_external: string | null
          threshold_descriptions: Json | null
          usgs_site_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          drainage_area_sqmi?: number | null
          high_frequency_flag?: boolean | null
          id?: string
          location: unknown
          name: string
          notes?: string | null
          nws_lid?: string | null
          provider?: string
          site_id_external?: string | null
          threshold_descriptions?: Json | null
          usgs_site_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          drainage_area_sqmi?: number | null
          high_frequency_flag?: boolean | null
          id?: string
          location?: unknown
          name?: string
          notes?: string | null
          nws_lid?: string | null
          provider?: string
          site_id_external?: string | null
          threshold_descriptions?: Json | null
          usgs_site_id?: string | null
        }
        Relationships: []
      }
      gauge_updates: {
        Row: {
          cache_creation_tokens: number | null
          cache_read_tokens: number | null
          condition_code: string
          discharge_cfs: number | null
          expires_at: string
          gauge_height_ft: number | null
          gauge_station_id: string
          generated_at: string
          id: string
          input_tokens: number | null
          model_used: string | null
          output_tokens: number | null
          quote_text: string
          river_slug: string | null
          sources_used: Json | null
          summary_text: string | null
          usgs_site_id: string
        }
        Insert: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          condition_code: string
          discharge_cfs?: number | null
          expires_at: string
          gauge_height_ft?: number | null
          gauge_station_id: string
          generated_at?: string
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          output_tokens?: number | null
          quote_text: string
          river_slug?: string | null
          sources_used?: Json | null
          summary_text?: string | null
          usgs_site_id: string
        }
        Update: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          condition_code?: string
          discharge_cfs?: number | null
          expires_at?: string
          gauge_height_ft?: number | null
          gauge_station_id?: string
          generated_at?: string
          id?: string
          input_tokens?: number | null
          model_used?: string | null
          output_tokens?: number | null
          quote_text?: string
          river_slug?: string | null
          sources_used?: Json | null
          summary_text?: string | null
          usgs_site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gauge_updates_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_snap_diagnostics"
            referencedColumns: ["gauge_id"]
          },
          {
            foreignKeyName: "gauge_updates_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      nearby_services: {
        Row: {
          address_line1: string | null
          booking_platform: string | null
          cabin_count: number | null
          city: string
          created_at: string | null
          description: string | null
          details: Json | null
          display_order: number | null
          email: string | null
          fee_range: string | null
          id: string
          latitude: number | null
          longitude: number | null
          managing_agency: string | null
          max_guests: number | null
          name: string
          notes: string | null
          nps_authorized: boolean
          owner_name: string | null
          ownership_changed_at: string | null
          phone: string | null
          phone_toll_free: string | null
          reservation_url: string | null
          rv_sites: number | null
          season_close_month: number | null
          season_open_month: number | null
          seasonal_notes: string | null
          services_offered:
            | Database["public"]["Enums"]["service_offering"][]
            | null
          slug: string
          state: string
          status: Database["public"]["Enums"]["service_status"]
          tent_sites: number | null
          type: Database["public"]["Enums"]["service_type"]
          updated_at: string | null
          usfs_authorized: boolean
          verified_source: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          booking_platform?: string | null
          cabin_count?: number | null
          city: string
          created_at?: string | null
          description?: string | null
          details?: Json | null
          display_order?: number | null
          email?: string | null
          fee_range?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          managing_agency?: string | null
          max_guests?: number | null
          name: string
          notes?: string | null
          nps_authorized?: boolean
          owner_name?: string | null
          ownership_changed_at?: string | null
          phone?: string | null
          phone_toll_free?: string | null
          reservation_url?: string | null
          rv_sites?: number | null
          season_close_month?: number | null
          season_open_month?: number | null
          seasonal_notes?: string | null
          services_offered?:
            | Database["public"]["Enums"]["service_offering"][]
            | null
          slug: string
          state?: string
          status?: Database["public"]["Enums"]["service_status"]
          tent_sites?: number | null
          type: Database["public"]["Enums"]["service_type"]
          updated_at?: string | null
          usfs_authorized?: boolean
          verified_source?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          booking_platform?: string | null
          cabin_count?: number | null
          city?: string
          created_at?: string | null
          description?: string | null
          details?: Json | null
          display_order?: number | null
          email?: string | null
          fee_range?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          managing_agency?: string | null
          max_guests?: number | null
          name?: string
          notes?: string | null
          nps_authorized?: boolean
          owner_name?: string | null
          ownership_changed_at?: string | null
          phone?: string | null
          phone_toll_free?: string | null
          reservation_url?: string | null
          rv_sites?: number | null
          season_close_month?: number | null
          season_open_month?: number | null
          seasonal_notes?: string | null
          services_offered?:
            | Database["public"]["Enums"]["service_offering"][]
            | null
          slug?: string
          state?: string
          status?: Database["public"]["Enums"]["service_status"]
          tent_sites?: number | null
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string | null
          usfs_authorized?: boolean
          verified_source?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      nps_campgrounds: {
        Row: {
          accessibility: Json | null
          addresses: Json | null
          amenities: Json | null
          classification: string | null
          contacts: Json | null
          created_at: string | null
          description: string | null
          directions_overview: string | null
          directions_url: string | null
          fees: Json | null
          id: string
          images: Json | null
          last_synced_at: string | null
          latitude: number | null
          location: unknown
          location_snap: unknown
          longitude: number | null
          name: string
          nps_id: string
          nps_url: string | null
          operating_hours: Json | null
          park_code: string
          raw_data: Json | null
          regulations_overview: string | null
          regulations_url: string | null
          reservation_info: string | null
          reservation_url: string | null
          sites_electrical: number | null
          sites_first_come: number | null
          sites_group: number | null
          sites_horse: number | null
          sites_reservable: number | null
          sites_rv_only: number | null
          sites_tent_only: number | null
          sites_walk_boat_to: number | null
          snap_distance_m: number | null
          snap_river_id: string | null
          total_sites: number | null
          updated_at: string | null
          weather_overview: string | null
        }
        Insert: {
          accessibility?: Json | null
          addresses?: Json | null
          amenities?: Json | null
          classification?: string | null
          contacts?: Json | null
          created_at?: string | null
          description?: string | null
          directions_overview?: string | null
          directions_url?: string | null
          fees?: Json | null
          id?: string
          images?: Json | null
          last_synced_at?: string | null
          latitude?: number | null
          location?: unknown
          location_snap?: unknown
          longitude?: number | null
          name: string
          nps_id: string
          nps_url?: string | null
          operating_hours?: Json | null
          park_code?: string
          raw_data?: Json | null
          regulations_overview?: string | null
          regulations_url?: string | null
          reservation_info?: string | null
          reservation_url?: string | null
          sites_electrical?: number | null
          sites_first_come?: number | null
          sites_group?: number | null
          sites_horse?: number | null
          sites_reservable?: number | null
          sites_rv_only?: number | null
          sites_tent_only?: number | null
          sites_walk_boat_to?: number | null
          snap_distance_m?: number | null
          snap_river_id?: string | null
          total_sites?: number | null
          updated_at?: string | null
          weather_overview?: string | null
        }
        Update: {
          accessibility?: Json | null
          addresses?: Json | null
          amenities?: Json | null
          classification?: string | null
          contacts?: Json | null
          created_at?: string | null
          description?: string | null
          directions_overview?: string | null
          directions_url?: string | null
          fees?: Json | null
          id?: string
          images?: Json | null
          last_synced_at?: string | null
          latitude?: number | null
          location?: unknown
          location_snap?: unknown
          longitude?: number | null
          name?: string
          nps_id?: string
          nps_url?: string | null
          operating_hours?: Json | null
          park_code?: string
          raw_data?: Json | null
          regulations_overview?: string | null
          regulations_url?: string | null
          reservation_info?: string | null
          reservation_url?: string | null
          sites_electrical?: number | null
          sites_first_come?: number | null
          sites_group?: number | null
          sites_horse?: number | null
          sites_reservable?: number | null
          sites_rv_only?: number | null
          sites_tent_only?: number | null
          sites_walk_boat_to?: number | null
          snap_distance_m?: number | null
          snap_river_id?: string | null
          total_sites?: number | null
          updated_at?: string | null
          weather_overview?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_campgrounds_snap_river_id_fkey"
            columns: ["snap_river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_sync_log: {
        Row: {
          campgrounds_matched: number | null
          campgrounds_synced: number | null
          created_at: string | null
          duration_ms: number | null
          error_details: string | null
          errors: number | null
          id: string
          park_code: string
          places_synced: number | null
          pois_created: number | null
          sync_type: string
        }
        Insert: {
          campgrounds_matched?: number | null
          campgrounds_synced?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: string | null
          errors?: number | null
          id?: string
          park_code?: string
          places_synced?: number | null
          pois_created?: number | null
          sync_type: string
        }
        Update: {
          campgrounds_matched?: number | null
          campgrounds_synced?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: string | null
          errors?: number | null
          id?: string
          park_code?: string
          places_synced?: number | null
          pois_created?: number | null
          sync_type?: string
        }
        Relationships: []
      }
      og_backgrounds: {
        Row: {
          key: string
          prompt: string | null
          updated_at: string
          url: string
        }
        Insert: {
          key: string
          prompt?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          key?: string
          prompt?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      points_of_interest: {
        Row: {
          active: boolean | null
          amenities: string[] | null
          body_text: string | null
          created_at: string | null
          description: string | null
          fee_description: string | null
          id: string
          images: Json | null
          is_on_water: boolean | null
          last_synced_at: string | null
          latitude: number | null
          location: unknown
          location_snap: unknown
          longitude: number | null
          managing_agency: string | null
          name: string
          nps_id: string | null
          nps_url: string | null
          raw_data: Json | null
          reservation_url: string | null
          ridb_data: Json | null
          ridb_facility_id: string | null
          river_id: string | null
          river_mile: number | null
          slug: string | null
          snap_distance_m: number | null
          source: string
          tags: string[] | null
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          amenities?: string[] | null
          body_text?: string | null
          created_at?: string | null
          description?: string | null
          fee_description?: string | null
          id?: string
          images?: Json | null
          is_on_water?: boolean | null
          last_synced_at?: string | null
          latitude?: number | null
          location?: unknown
          location_snap?: unknown
          longitude?: number | null
          managing_agency?: string | null
          name: string
          nps_id?: string | null
          nps_url?: string | null
          raw_data?: Json | null
          reservation_url?: string | null
          ridb_data?: Json | null
          ridb_facility_id?: string | null
          river_id?: string | null
          river_mile?: number | null
          slug?: string | null
          snap_distance_m?: number | null
          source?: string
          tags?: string[] | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          amenities?: string[] | null
          body_text?: string | null
          created_at?: string | null
          description?: string | null
          fee_description?: string | null
          id?: string
          images?: Json | null
          is_on_water?: boolean | null
          last_synced_at?: string | null
          latitude?: number | null
          location?: unknown
          location_snap?: unknown
          longitude?: number | null
          managing_agency?: string | null
          name?: string
          nps_id?: string | null
          nps_url?: string | null
          raw_data?: Json | null
          reservation_url?: string | null
          ridb_data?: Json | null
          ridb_facility_id?: string | null
          river_id?: string | null
          river_mile?: number | null
          slug?: string | null
          snap_distance_m?: number | null
          source?: string
          tags?: string[] | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_of_interest_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      river_sections: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          river_id: string
          section_slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          river_id: string
          section_slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          river_id?: string
          section_slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "river_sections_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      river_characteristics: {
        Row: {
          drop_rate_note: string | null
          is_spring_fed: boolean | null
          low_water_meaning: string | null
          primary_hazards: string[] | null
          rain_lag_hours: number | null
          rain_lag_note: string | null
          river_id: string
          river_note: string | null
          rising_water_hazards: string | null
          speed_curve: Json | null
          updated_at: string | null
        }
        Insert: {
          drop_rate_note?: string | null
          is_spring_fed?: boolean | null
          low_water_meaning?: string | null
          primary_hazards?: string[] | null
          rain_lag_hours?: number | null
          rain_lag_note?: string | null
          river_id: string
          river_note?: string | null
          rising_water_hazards?: string | null
          speed_curve?: Json | null
          updated_at?: string | null
        }
        Update: {
          drop_rate_note?: string | null
          is_spring_fed?: boolean | null
          low_water_meaning?: string | null
          primary_hazards?: string[] | null
          rain_lag_hours?: number | null
          rain_lag_note?: string | null
          river_id?: string
          river_note?: string | null
          rising_water_hazards?: string | null
          speed_curve?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "river_characteristics_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: true
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      river_gauges: {
        Row: {
          accuracy_warning_threshold_miles: number | null
          action_stage_ft: number | null
          alt_level_dangerous: number | null
          alt_level_high: number | null
          alt_level_low: number | null
          alt_level_optimal_max: number | null
          alt_level_optimal_min: number | null
          alt_level_too_low: number | null
          created_at: string | null
          distance_from_section_miles: number | null
          flood_stage_ft: number | null
          gauge_station_id: string | null
          id: string
          is_primary: boolean | null
          last_condition_code: string | null
          level_dangerous: number | null
          level_high: number | null
          level_low: number | null
          level_optimal_max: number | null
          level_optimal_min: number | null
          level_too_low: number | null
          river_id: string | null
          river_mile: number | null
          threshold_source: string | null
          threshold_source_url: string | null
          threshold_unit: string | null
          threshold_updated_at: string | null
          updated_at: string | null
        }
        Insert: {
          accuracy_warning_threshold_miles?: number | null
          action_stage_ft?: number | null
          alt_level_dangerous?: number | null
          alt_level_high?: number | null
          alt_level_low?: number | null
          alt_level_optimal_max?: number | null
          alt_level_optimal_min?: number | null
          alt_level_too_low?: number | null
          created_at?: string | null
          distance_from_section_miles?: number | null
          flood_stage_ft?: number | null
          gauge_station_id?: string | null
          id?: string
          is_primary?: boolean | null
          last_condition_code?: string | null
          level_dangerous?: number | null
          level_high?: number | null
          level_low?: number | null
          level_optimal_max?: number | null
          level_optimal_min?: number | null
          level_too_low?: number | null
          river_id?: string | null
          river_mile?: number | null
          threshold_source?: string | null
          threshold_source_url?: string | null
          threshold_unit?: string | null
          threshold_updated_at?: string | null
          updated_at?: string | null
        }
        Update: {
          accuracy_warning_threshold_miles?: number | null
          action_stage_ft?: number | null
          alt_level_dangerous?: number | null
          alt_level_high?: number | null
          alt_level_low?: number | null
          alt_level_optimal_max?: number | null
          alt_level_optimal_min?: number | null
          alt_level_too_low?: number | null
          created_at?: string | null
          distance_from_section_miles?: number | null
          flood_stage_ft?: number | null
          gauge_station_id?: string | null
          id?: string
          is_primary?: boolean | null
          last_condition_code?: string | null
          level_dangerous?: number | null
          level_high?: number | null
          level_low?: number | null
          level_optimal_max?: number | null
          level_optimal_min?: number | null
          level_too_low?: number | null
          river_id?: string | null
          river_mile?: number | null
          threshold_source?: string | null
          threshold_source_url?: string | null
          threshold_unit?: string | null
          threshold_updated_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "river_gauges_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_snap_diagnostics"
            referencedColumns: ["gauge_id"]
          },
          {
            foreignKeyName: "river_gauges_gauge_station_id_fkey"
            columns: ["gauge_station_id"]
            isOneToOne: false
            referencedRelation: "gauge_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "river_gauges_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      river_hazards: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          location: unknown
          max_safe_level: number | null
          min_safe_level: number | null
          name: string
          portage_required: boolean | null
          portage_side: string | null
          river_id: string | null
          river_mile_downstream: number | null
          seasonal_notes: string | null
          severity: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          location?: unknown
          max_safe_level?: number | null
          min_safe_level?: number | null
          name: string
          portage_required?: boolean | null
          portage_side?: string | null
          river_id?: string | null
          river_mile_downstream?: number | null
          seasonal_notes?: string | null
          severity?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          location?: unknown
          max_safe_level?: number | null
          min_safe_level?: number | null
          name?: string
          portage_required?: boolean | null
          portage_side?: string | null
          river_id?: string | null
          river_mile_downstream?: number | null
          seasonal_notes?: string | null
          severity?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "river_hazards_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      river_mile_markers: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          mile: number
          name: string | null
          river_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          mile: number
          name?: string | null
          river_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          mile?: number
          name?: string | null
          river_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "river_mile_markers_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
      river_photos: {
        Row: {
          access_point_id: string | null
          attribution: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string
          last_used_at: string | null
          publishable: boolean | null
          river_slug: string
          season: string | null
          section: string | null
          source: string
          tags: string[] | null
          updated_at: string | null
          used_count: number | null
        }
        Insert: {
          access_point_id?: string | null
          attribution?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url: string
          last_used_at?: string | null
          publishable?: boolean | null
          river_slug: string
          season?: string | null
          section?: string | null
          source?: string
          tags?: string[] | null
          updated_at?: string | null
          used_count?: number | null
        }
        Update: {
          access_point_id?: string | null
          attribution?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string
          last_used_at?: string | null
          publishable?: boolean | null
          river_slug?: string
          season?: string | null
          section?: string | null
          source?: string
          tags?: string[] | null
          updated_at?: string | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "river_photos_access_point_id_fkey"
            columns: ["access_point_id"]
            isOneToOne: false
            referencedRelation: "access_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "river_photos_river_slug_fkey"
            columns: ["river_slug"]
            isOneToOne: false
            referencedRelation: "gauge_snap_diagnostics"
            referencedColumns: ["river_slug"]
          },
          {
            foreignKeyName: "river_photos_river_slug_fkey"
            columns: ["river_slug"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["slug"]
          },
        ]
      }
      rivers: {
        Row: {
          active: boolean | null
          alert_search_terms: string[] | null
          country: string
          created_at: string | null
          description: string | null
          difficulty_rating: string | null
          direction_verified: boolean | null
          downstream_point: unknown
          float_summary: string | null
          float_tip: string | null
          geom: unknown
          geometry_starts_at_headwaters: boolean | null
          id: string
          length_miles: number | null
          name: string
          nhd_feature_id: string | null
          park_code: string | null
          region: string | null
          river_type: string
          slug: string
          state: string
          timezone: string
          updated_at: string | null
          weather_city: string | null
          weather_lat: number | null
          weather_lon: number | null
        }
        Insert: {
          active?: boolean | null
          alert_search_terms?: string[] | null
          country?: string
          created_at?: string | null
          description?: string | null
          difficulty_rating?: string | null
          direction_verified?: boolean | null
          downstream_point?: unknown
          float_summary?: string | null
          float_tip?: string | null
          geom: unknown
          geometry_starts_at_headwaters?: boolean | null
          id?: string
          length_miles?: number | null
          name: string
          nhd_feature_id?: string | null
          park_code?: string | null
          region?: string | null
          river_type?: string
          slug: string
          state?: string
          timezone?: string
          updated_at?: string | null
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
        }
        Update: {
          active?: boolean | null
          alert_search_terms?: string[] | null
          country?: string
          created_at?: string | null
          description?: string | null
          difficulty_rating?: string | null
          direction_verified?: boolean | null
          downstream_point?: unknown
          float_summary?: string | null
          float_tip?: string | null
          geom?: unknown
          geometry_starts_at_headwaters?: boolean | null
          id?: string
          length_miles?: number | null
          name?: string
          nhd_feature_id?: string | null
          park_code?: string | null
          region?: string | null
          river_type?: string
          slug?: string
          state?: string
          timezone?: string
          updated_at?: string | null
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
        }
        Relationships: []
      }
      service_rivers: {
        Row: {
          id: string
          is_primary: boolean
          river_id: string
          section_description: string | null
          service_id: string
        }
        Insert: {
          id?: string
          is_primary?: boolean
          river_id: string
          section_description?: string | null
          service_id: string
        }
        Update: {
          id?: string
          is_primary?: boolean
          river_id?: string
          section_description?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_rivers_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_rivers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "nearby_services"
            referencedColumns: ["id"]
          },
        ]
      }
      social_config: {
        Row: {
          digest_enabled: boolean
          digest_time_cst: string
          disabled_rivers: string[] | null
          eddy_says: Json
          enabled_rivers: string[] | null
          favorite_float: Json
          highlight_conditions: string[]
          highlight_cooldown_hours: number
          highlights_per_run: number
          id: string
          media_schedule: Json
          posting_enabled: boolean
          posting_frequency_hours: number
          river_schedules: Json
          section_guide: Json
          timezone: string
          updated_at: string
          video_features: Json
          weekly_forecast: Json
          weekly_trend: Json
        }
        Insert: {
          digest_enabled?: boolean
          digest_time_cst?: string
          disabled_rivers?: string[] | null
          eddy_says?: Json
          enabled_rivers?: string[] | null
          favorite_float?: Json
          highlight_conditions?: string[]
          highlight_cooldown_hours?: number
          highlights_per_run?: number
          id?: string
          media_schedule?: Json
          posting_enabled?: boolean
          posting_frequency_hours?: number
          river_schedules?: Json
          section_guide?: Json
          timezone?: string
          updated_at?: string
          video_features?: Json
          weekly_forecast?: Json
          weekly_trend?: Json
        }
        Update: {
          digest_enabled?: boolean
          digest_time_cst?: string
          disabled_rivers?: string[] | null
          eddy_says?: Json
          enabled_rivers?: string[] | null
          favorite_float?: Json
          highlight_conditions?: string[]
          highlight_cooldown_hours?: number
          highlights_per_run?: number
          id?: string
          media_schedule?: Json
          posting_enabled?: boolean
          posting_frequency_hours?: number
          river_schedules?: Json
          section_guide?: Json
          timezone?: string
          updated_at?: string
          video_features?: Json
          weekly_forecast?: Json
          weekly_trend?: Json
        }
        Relationships: []
      }
      social_custom_content: {
        Row: {
          active: boolean
          content_type: string
          created_at: string
          end_date: string | null
          id: string
          platforms: string[]
          start_date: string | null
          text: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          content_type: string
          created_at?: string
          end_date?: string | null
          id?: string
          platforms?: string[]
          start_date?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          content_type?: string
          created_at?: string
          end_date?: string | null
          id?: string
          platforms?: string[]
          start_date?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          audience_segment: string | null
          caption: string
          content_type: string | null
          created_at: string
          eddy_update_id: string | null
          error_message: string | null
          facebook_post_id: string | null
          hashtags: string[] | null
          hook_style: string | null
          id: string
          image_url: string | null
          insights_clicks: number | null
          insights_engagement_rate: number | null
          insights_fetched_at: string | null
          insights_impressions: number | null
          insights_reach: number | null
          insights_saves: number | null
          insights_shares: number | null
          instagram_post_id: string | null
          media_type: string
          metadata: Json | null
          platform: string
          platform_post_id: string | null
          post_type: string
          published_at: string | null
          retry_count: number
          river_slug: string | null
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          audience_segment?: string | null
          caption: string
          content_type?: string | null
          created_at?: string
          eddy_update_id?: string | null
          error_message?: string | null
          facebook_post_id?: string | null
          hashtags?: string[] | null
          hook_style?: string | null
          id?: string
          image_url?: string | null
          insights_clicks?: number | null
          insights_engagement_rate?: number | null
          insights_fetched_at?: string | null
          insights_impressions?: number | null
          insights_reach?: number | null
          insights_saves?: number | null
          insights_shares?: number | null
          instagram_post_id?: string | null
          media_type?: string
          metadata?: Json | null
          platform: string
          platform_post_id?: string | null
          post_type: string
          published_at?: string | null
          retry_count?: number
          river_slug?: string | null
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          audience_segment?: string | null
          caption?: string
          content_type?: string | null
          created_at?: string
          eddy_update_id?: string | null
          error_message?: string | null
          facebook_post_id?: string | null
          hashtags?: string[] | null
          hook_style?: string | null
          id?: string
          image_url?: string | null
          insights_clicks?: number | null
          insights_engagement_rate?: number | null
          insights_fetched_at?: string | null
          insights_impressions?: number | null
          insights_reach?: number | null
          insights_saves?: number | null
          insights_shares?: number | null
          instagram_post_id?: string | null
          media_type?: string
          metadata?: Json | null
          platform?: string
          platform_post_id?: string | null
          post_type?: string
          published_at?: string | null
          retry_count?: number
          river_slug?: string | null
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      usfs_sync_log: {
        Row: {
          access_points_created: number | null
          access_points_updated: number | null
          campgrounds_matched: number | null
          campgrounds_synced: number | null
          created_at: string | null
          duration_ms: number | null
          error_details: string | null
          errors: number | null
          facilities_fetched: number | null
          facilities_filtered: number | null
          id: string
          pois_created: number | null
          pois_updated: number | null
          sync_type: string
        }
        Insert: {
          access_points_created?: number | null
          access_points_updated?: number | null
          campgrounds_matched?: number | null
          campgrounds_synced?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: string | null
          errors?: number | null
          facilities_fetched?: number | null
          facilities_filtered?: number | null
          id?: string
          pois_created?: number | null
          pois_updated?: number | null
          sync_type?: string
        }
        Update: {
          access_points_created?: number | null
          access_points_updated?: number | null
          campgrounds_matched?: number | null
          campgrounds_synced?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: string | null
          errors?: number | null
          facilities_fetched?: number | null
          facilities_filtered?: number | null
          id?: string
          pois_created?: number | null
          pois_updated?: number | null
          sync_type?: string
        }
        Relationships: []
      }
      vessel_types: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          speed_high_water: number | null
          speed_low_water: number | null
          speed_normal: number | null
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          speed_high_water?: number | null
          speed_low_water?: number | null
          speed_normal?: number | null
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          speed_high_water?: number | null
          speed_low_water?: number | null
          speed_normal?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      gauge_snap_diagnostics: {
        Row: {
          distance_m: number | null
          gauge_id: string | null
          gauge_name: string | null
          is_primary: boolean | null
          lat_raw: number | null
          lat_snapped: number | null
          lon_raw: number | null
          lon_snapped: number | null
          river_id: string | null
          river_name: string | null
          river_slug: string | null
          usgs_site_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "river_gauges_river_id_fkey"
            columns: ["river_id"]
            isOneToOne: false
            referencedRelation: "rivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      batch_match_campgrounds_to_access_points: {
        Args: { p_max_distance_meters?: number }
        Returns: {
          access_point_id: string
          access_point_name: string
          campground_name: string
          distance_meters: number
          match_type: string
        }[]
      }
      calculate_float_time: {
        Args: {
          p_condition_code: string
          p_distance_miles: number
          p_vessel_type_id: string
        }
        Returns: {
          float_minutes: number
          speed_mph: number
          vessel_name: string
        }[]
      }
      calculate_read_time: { Args: { content: string }; Returns: number }
      claim_clip_for_posting: {
        Args: { p_clip_id: string; p_stale_minutes?: number }
        Returns: boolean
      }
      compute_poi_river_mile: {
        Args: {
          p_lat: number
          p_lng: number
          p_poi_id: string
          p_river_id: string
        }
        Returns: {
          river_mile: number
        }[]
      }
      correct_access_point_mile_from_markers: {
        Args: { p_access_point_id: string; p_tolerance_miles?: number }
        Returns: {
          corrected: boolean
          new_mile: number
          old_mile: number
        }[]
      }
      correct_all_access_point_miles: {
        Args: { p_river_id?: string; p_tolerance_miles?: number }
        Returns: {
          access_point_id: string
          access_point_name: string
          corrected: boolean
          new_mile: number
          old_mile: number
        }[]
      }
      find_nearby_access_point: {
        Args: {
          p_lat: number
          p_lng: number
          p_max_distance_meters?: number
          p_name: string
          p_river_id: string
        }
        Returns: {
          distance_meters: number
          id: string
          name: string
        }[]
      }
      find_nearby_poi: {
        Args: {
          p_lat: number
          p_lng: number
          p_max_distance_meters?: number
          p_name: string
          p_river_id: string
        }
        Returns: {
          distance_meters: number
          id: string
          name: string
        }[]
      }
      find_nearest_river: {
        Args: { p_lat: number; p_lng: number; p_max_distance_meters?: number }
        Returns: {
          distance_meters: number
          river_id: string
          river_name: string
        }[]
      }
      generate_short_code: { Args: { length?: number }; Returns: string }
      get_float_segment: {
        Args: { p_end_access_id: string; p_start_access_id: string }
        Returns: {
          distance_miles: number
          end_name: string
          end_river_mile: number
          segment_geom: unknown
          start_name: string
          start_river_mile: number
        }[]
      }
      get_gauge_stations_with_geojson: {
        Args: never
        Returns: {
          active: boolean
          id: string
          location: Json
          name: string
          notes: string
          threshold_descriptions: Json
          usgs_site_id: string
        }[]
      }
      get_mo_surface_water_dataset: { Args: never; Returns: Json }
      get_nearest_mile_marker: {
        Args: { p_mile: number; p_river_id: string }
        Returns: {
          description: string
          distance: number
          mile: number
          name: string
        }[]
      }
      get_point_at_mile: {
        Args: { p_mile: number; p_river_id: string }
        Returns: {
          lat: number
          lng: number
          point: unknown
        }[]
      }
      get_river_condition: {
        Args: { p_river_id: string }
        Returns: {
          accuracy_warning: boolean
          accuracy_warning_reason: string
          condition_code: string
          condition_label: string
          discharge_cfs: number
          gauge_height_ft: number
          gauge_name: string
          gauge_usgs_id: string
          reading_age_hours: number
          reading_timestamp: string
        }[]
      }
      get_river_condition_segment: {
        Args: {
          p_put_in_mile?: number
          p_put_in_point?: unknown
          p_river_id: string
        }
        Returns: {
          accuracy_warning: boolean
          accuracy_warning_reason: string
          condition_code: string
          condition_label: string
          discharge_cfs: number
          gauge_height_ft: number
          gauge_name: string
          gauge_river_mile: number
          gauge_usgs_id: string
          reading_age_hours: number
          reading_timestamp: string
          threshold_unit: string
        }[]
      }
      get_river_pois: {
        Args: { p_river_id: string }
        Returns: {
          amenities: string[]
          description: string
          id: string
          images: Json
          latitude: number
          longitude: number
          name: string
          nps_url: string
          river_mile: number
          slug: string
          type: string
        }[]
      }
      get_segment_float_time: {
        Args: {
          p_put_in_id: string
          p_take_out_id: string
          p_vessel_type?: string
        }
        Returns: {
          distance_miles: number
          is_reverse: boolean
          source: string
          time_avg_minutes: number
          time_max_minutes: number
          time_min_minutes: number
          trip_type: string
        }[]
      }
      get_threshold_crossings: {
        Args: { since: string }
        Returns: {
          current_ft: number
          dangerous: number
          event: string
          gauge_station_name: string
          optimal_high: number
          optimal_low: number
          previous_ft: number
          reading_timestamp: string
          river_name: string
          too_low: number
        }[]
      }
      increment_plan_view_count: {
        Args: { p_short_code: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      link_float_segments: {
        Args: never
        Returns: {
          put_in_matched: boolean
          put_in_name: string
          segment_id: string
          take_out_matched: boolean
          take_out_name: string
        }[]
      }
      link_jacks_fork_nps_campgrounds: { Args: never; Returns: number }
      match_nps_campground_to_access_point: {
        Args: {
          p_lat: number
          p_lng: number
          p_max_distance_meters?: number
          p_name: string
          p_nps_campground_id: string
        }
        Returns: string
      }
      release_cron_lock: { Args: { job_name: string }; Returns: undefined }
      snap_to_river: {
        Args: { p_point: unknown; p_river_id: string }
        Returns: {
          distance_from_original_meters: number
          river_mile: number
          snapped_point: unknown
        }[]
      }
      try_cron_lock: {
        Args: { job_name: string; stale_after_seconds?: number }
        Returns: boolean
      }
    }
    Enums: {
      service_offering:
        | "canoe_rental"
        | "kayak_rental"
        | "raft_rental"
        | "tube_rental"
        | "jon_boat_rental"
        | "shuttle"
        | "camping_primitive"
        | "camping_rv"
        | "cabins"
        | "lodge_rooms"
        | "general_store"
        | "food_service"
        | "showers"
        | "fishing_supplies"
        | "horseback_riding"
        | "swimming_pool"
        | "wifi"
        | "potable_water"
        | "fire_rings"
        | "picnic_tables"
        | "boat_ramp"
        | "dump_station"
        | "flush_toilets"
        | "vault_toilets"
        | "laundry"
        | "playground"
      service_status:
        | "active"
        | "seasonal"
        | "temporarily_closed"
        | "permanently_closed"
        | "unverified"
      service_type: "outfitter" | "campground" | "cabin_lodge"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      service_offering: [
        "canoe_rental",
        "kayak_rental",
        "raft_rental",
        "tube_rental",
        "jon_boat_rental",
        "shuttle",
        "camping_primitive",
        "camping_rv",
        "cabins",
        "lodge_rooms",
        "general_store",
        "food_service",
        "showers",
        "fishing_supplies",
        "horseback_riding",
        "swimming_pool",
        "wifi",
        "potable_water",
        "fire_rings",
        "picnic_tables",
        "boat_ramp",
        "dump_station",
        "flush_toilets",
        "vault_toilets",
        "laundry",
        "playground",
      ],
      service_status: [
        "active",
        "seasonal",
        "temporarily_closed",
        "permanently_closed",
        "unverified",
      ],
      service_type: ["outfitter", "campground", "cabin_lodge"],
    },
  },
} as const

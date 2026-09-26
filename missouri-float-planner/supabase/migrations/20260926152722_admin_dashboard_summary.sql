-- Purpose-built aggregate over auth.users; never grants raw auth-table access.
-- Private schema is not exposed by PostgREST. Only the service role can execute;
-- the public dashboard entry point uses invoker rights and the same restricted ACL.
CREATE SCHEMA IF NOT EXISTS admin_metrics;
REVOKE ALL ON SCHEMA admin_metrics FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA admin_metrics TO service_role;
CREATE OR REPLACE FUNCTION admin_metrics.admin_recent_signins(p_since timestamptz)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT count(*) FROM auth.users WHERE last_sign_in_at>=greatest(p_since,now()-interval '31 days') AND coalesce(is_anonymous,false)=false;
$$;
REVOKE ALL ON FUNCTION admin_metrics.admin_recent_signins(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION admin_metrics.admin_recent_signins(timestamptz) TO service_role;

-- Admin-only, bounded aggregates. The caller authenticates before reading its server cache.
-- Invoker rights plus explicit grants: never available to consumer API roles.
CREATE OR REPLACE FUNCTION public.admin_dashboard_metric(p_key text, p_now timestamptz, p_entitlement text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public SET statement_timeout = '4s' AS $function$
DECLARE query_text text; result jsonb;
BEGIN
  CASE p_key
    WHEN 'subscribers' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.entitlements WHERE entitlement_id=$2 AND environment='PRODUCTION' AND expires_at>$1$query$;
    WHEN 'renewal_off' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.entitlements WHERE entitlement_id=$2 AND environment='PRODUCTION' AND expires_at>$1 AND will_renew=false$query$;
    WHEN 'expiring' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.entitlements WHERE entitlement_id=$2 AND environment='PRODUCTION' AND expires_at>$1 AND will_renew=false AND expires_at <= $1 + interval '7 days'$query$;
    WHEN 'billing' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.entitlements WHERE entitlement_id=$2 AND environment='PRODUCTION' AND expires_at>$1 AND billing_issue_detected_at IS NOT NULL$query$;
    WHEN 'rc_event' THEN query_text := $query$SELECT to_jsonb(max(last_event_at)) FROM public.entitlements WHERE environment='PRODUCTION'$query$;
    WHEN 'signups_7' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.profiles WHERE created_at >= $1 - interval '7 days'$query$;
    WHEN 'signins_7' THEN query_text := $query$SELECT to_jsonb(admin_metrics.admin_recent_signins($1 - interval '7 days'))$query$;
    WHEN 'email_7' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.email_subscribers WHERE created_at >= $1 - interval '7 days'$query$;
    WHEN 'plans_7' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.float_plans WHERE created_at >= $1 - interval '7 days'$query$;
    WHEN 'signups_30' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.profiles WHERE created_at >= $1 - interval '30 days'$query$;
    WHEN 'signins_30' THEN query_text := $query$SELECT to_jsonb(admin_metrics.admin_recent_signins($1 - interval '30 days'))$query$;
    WHEN 'email_30' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.email_subscribers WHERE created_at >= $1 - interval '30 days'$query$;
    WHEN 'plans_30' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.float_plans WHERE created_at >= $1 - interval '30 days'$query$;
    WHEN 'email_sources' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(source,'Unknown') name,count(*) count FROM public.email_subscribers WHERE created_at >= $1-interval '30 days' GROUP BY source ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'plan_views' THEN query_text := $query$SELECT to_jsonb(coalesce(sum(view_count),0)) FROM public.float_plans WHERE created_at >= $1-interval '30 days'$query$;
    WHEN 'plan_rivers' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(r.name,'Deleted river') name,count(*) count FROM public.float_plans f LEFT JOIN public.rivers r ON r.id=f.river_id WHERE f.created_at >= $1-interval '30 days' GROUP BY r.id,r.name ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'plan_pairs' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(a.name,'Unknown') || ' → ' || coalesce(b.name,'Unknown') name,count(*) count FROM public.float_plans f LEFT JOIN public.access_points a ON a.id=f.start_access_id LEFT JOIN public.access_points b ON b.id=f.end_access_id WHERE f.created_at >= $1-interval '30 days' GROUP BY a.id,a.name,b.id,b.name ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'stars_rivers' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT r.name name,count(*) count FROM public.starred_rivers s JOIN public.rivers r ON r.id=s.river_id GROUP BY r.id,r.name ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'stars_gauges' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT r.name name,count(*) count FROM public.starred_gauges s JOIN public.gauge_stations r ON r.id=s.gauge_station_id GROUP BY r.id,r.name ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'stars_dams' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT dam_id name,count(*) count FROM public.starred_dams GROUP BY dam_id ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'reports' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.community_reports WHERE status='pending'$query$;
    WHEN 'email' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.inbound_emails WHERE status='unread'$query$;
    WHEN 'feedback' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.feedback WHERE status='pending'$query$;
    WHEN 'push_sent' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.alert_push_deliveries WHERE sent_at >= $1-interval '7 days' AND status='sent'$query$;
    WHEN 'push_errors' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.alert_push_deliveries WHERE sent_at >= $1-interval '24 hours' AND status='error'$query$;
    WHEN 'receipt_errors' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.alert_push_deliveries WHERE sent_at >= $1-interval '24 hours' AND status='error' AND receipt_checked_at IS NOT NULL$query$;
    WHEN 'push_codes' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(error_code,'Unknown') name,count(*) count FROM public.alert_push_deliveries WHERE sent_at >= $1-interval '7 days' AND status='error' GROUP BY error_code ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'river_waiting' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.river_condition_events WHERE push_delivered_at IS NULL AND push_attempts=0 AND detected_at >= $1-interval '7 days' AND detected_at < $1-interval '15 minutes' AND kind IN ('floatable','warning','easing')$query$;
    WHEN 'river_retry' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.river_condition_events WHERE push_delivered_at IS NULL AND push_attempts BETWEEN 1 AND 4 AND detected_at >= $1-interval '7 days' AND detected_at < $1-interval '15 minutes' AND kind IN ('floatable','warning','easing')$query$;
    WHEN 'river_exhausted' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.river_condition_events WHERE push_delivered_at IS NULL AND push_attempts>=5 AND detected_at >= $1-interval '7 days' AND detected_at < $1-interval '15 minutes' AND kind IN ('floatable','warning','easing')$query$;
    WHEN 'gauge_waiting' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.gauge_alert_events WHERE push_delivered_at IS NULL AND push_attempts=0 AND detected_at >= $1-interval '7 days' AND detected_at < $1-interval '15 minutes'$query$;
    WHEN 'gauge_retry' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.gauge_alert_events WHERE push_delivered_at IS NULL AND push_attempts BETWEEN 1 AND 4 AND detected_at >= $1-interval '7 days' AND detected_at < $1-interval '15 minutes'$query$;
    WHEN 'gauge_exhausted' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.gauge_alert_events WHERE push_delivered_at IS NULL AND push_attempts>=5 AND detected_at >= $1-interval '7 days' AND detected_at < $1-interval '15 minutes'$query$;
    WHEN 'cleared_unknown' THEN query_text := $query$SELECT NULL::jsonb$query$;
    WHEN 'devices' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.device_tokens WHERE platform='ios' AND last_seen_at >= $1-interval '30 days'$query$;
    WHEN 'disabled_devices' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.device_tokens WHERE last_seen_at >= $1-interval '30 days' AND disabled_at IS NOT NULL$query$;
    WHEN 'failing_devices' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.device_tokens WHERE last_seen_at >= $1-interval '30 days' AND disabled_at IS NULL AND failure_count>0$query$;
    WHEN 'versions' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(app_version,'Unknown') name,count(*) count FROM public.device_tokens WHERE platform='ios' AND last_seen_at >= $1-interval '30 days' GROUP BY app_version ORDER BY count DESC,name LIMIT 20) t$query$;
    WHEN 'app_config' THEN query_text := $query$SELECT to_jsonb(t) FROM (SELECT min_supported_version,latest_version,push_enabled,planner_enabled,chat_enabled,offline_downloads_enabled FROM public.app_config LIMIT 1) t$query$;
    WHEN 'trust' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.trust_findings WHERE status='open' AND severity='critical'$query$;
    WHEN 'trust_last' THEN query_text := $query$SELECT to_jsonb(max(started_at)) FROM public.trust_runs$query$;
    WHEN 'trust_errors' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.trust_runs WHERE started_at >= $1-interval '24 hours' AND status='error'$query$;
    WHEN 'gauge_stale' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.gauge_stations g LEFT JOIN public.gauge_latest l ON l.gauge_station_id=g.id WHERE g.active AND g.curated AND coalesce(g.provider,'usgs')='usgs' AND (l.reading_timestamp < $1-interval '6 hours')$query$;
    WHEN 'gauge_missing' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.gauge_stations g LEFT JOIN public.gauge_latest l ON l.gauge_station_id=g.id WHERE g.active AND g.curated AND coalesce(g.provider,'usgs')='usgs' AND (l.reading_timestamp IS NULL OR l.reading_timestamp > $1+interval '5 minutes')$query$;
    WHEN 'dam_stale' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.dam_snapshots WHERE built_at < $1-interval '6 hours'$query$;
    WHEN 'social_failed' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.social_posts WHERE status='failed' AND created_at >= $1-interval '7 days'$query$;
    WHEN 'social_stuck' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.social_posts WHERE status='rendering' AND created_at < $1-interval '30 minutes' AND created_at >= $1-interval '7 days'$query$;
    WHEN 'social_fallback' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.social_posts WHERE status='published' AND media_type='image' AND error_message IS NOT NULL AND created_at >= $1-interval '7 days'$query$;
    WHEN 'campsite_sync_log_errors' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.campsite_sync_log WHERE created_at >= $1-interval '7 days' AND (facilities_failed>0 OR error_details IS NOT NULL)$query$;
    WHEN 'campsite_sync_log_empty' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.campsite_sync_log WHERE created_at >= $1-interval '7 days' AND (facilities_synced=0)$query$;
    WHEN 'nps_sync_log_errors' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.nps_sync_log WHERE created_at >= $1-interval '7 days' AND (errors>0)$query$;
    WHEN 'nps_sync_log_empty' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.nps_sync_log WHERE created_at >= $1-interval '7 days' AND (campgrounds_synced=0 AND places_synced=0)$query$;
    WHEN 'usfs_sync_log_errors' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.usfs_sync_log WHERE created_at >= $1-interval '7 days' AND (errors>0)$query$;
    WHEN 'usfs_sync_log_empty' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.usfs_sync_log WHERE created_at >= $1-interval '7 days' AND (facilities_fetched=0)$query$;
    WHEN 'images' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.access_points WHERE approved AND (coalesce(cardinality(image_urls),0)=0)$query$;
    WHEN 'descriptions' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.access_points WHERE approved AND (nullif(trim(description),'') IS NULL)$query$;
    WHEN 'driving' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.access_points WHERE approved AND (driving_lat IS NULL OR driving_lng IS NULL)$query$;
    WHEN 'hazards' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.river_hazards WHERE active AND updated_at < $1-interval '30 days'$query$;
    WHEN 'blogs' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.blog_posts WHERE status='scheduled' AND published_at < $1$query$;
    WHEN 'eddy_updates_expired' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.eddy_updates WHERE expires_at < $1$query$;
    WHEN 'eddy_updates_tokens' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(model_used,'Unknown model') name,coalesce(sum(input_tokens),0)+coalesce(sum(output_tokens),0) count FROM public.eddy_updates WHERE generated_at >= $1-interval '30 days' AND (input_tokens IS NOT NULL OR output_tokens IS NOT NULL) GROUP BY model_used ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'gauge_updates_expired' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.gauge_updates WHERE expires_at < $1$query$;
    WHEN 'gauge_updates_tokens' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(model_used,'Unknown model') name,coalesce(sum(input_tokens),0)+coalesce(sum(output_tokens),0) count FROM public.gauge_updates WHERE generated_at >= $1-interval '30 days' AND (input_tokens IS NOT NULL OR output_tokens IS NOT NULL) GROUP BY model_used ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'condition_mismatch' THEN query_text := $query$SELECT NULL::jsonb$query$;
    WHEN 'chat_sessions' THEN query_text := $query$SELECT to_jsonb(count(DISTINCT session_id)) FROM public.chat_logs WHERE created_at >= $1-interval '7 days'$query$;
    WHEN 'chat_duration' THEN query_text := $query$SELECT to_jsonb(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)) FROM public.chat_logs WHERE created_at >= $1-interval '7 days'$query$;
    WHEN 'chat_tokens' THEN query_text := $query$SELECT to_jsonb(sum(input_tokens+output_tokens)) FROM public.chat_logs WHERE created_at >= $1-interval '7 days'$query$;
    WHEN 'chat_tools' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT tool name,count(*) count FROM public.chat_logs CROSS JOIN LATERAL unnest(tools_called) tool WHERE created_at >= $1-interval '7 days' GROUP BY tool ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'chat_rivers' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT river_slug name,count(*) count FROM public.chat_logs WHERE created_at >= $1-interval '7 days' AND river_slug IS NOT NULL GROUP BY river_slug ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'embeds' THEN query_text := $query$SELECT to_jsonb(coalesce(sum(count),0)) FROM public.embed_impressions WHERE day >= ($1 AT TIME ZONE 'UTC')::date-6$query$;
    WHEN 'embed_hosts' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT referrer_host name,sum(count) count FROM public.embed_impressions WHERE day >= ($1 AT TIME ZONE 'UTC')::date-6 GROUP BY referrer_host ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'embed_partners' THEN query_text := $query$SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (SELECT coalesce(w.business_name,i.partner,'Unregistered') name,sum(i.count) count FROM public.embed_impressions i LEFT JOIN public.embed_widgets w ON w.embed_id=i.widget_key WHERE i.day >= ($1 AT TIME ZONE 'UTC')::date-6 GROUP BY coalesce(w.business_name,i.partner,'Unregistered') ORDER BY count DESC,name LIMIT 10) t$query$;
    WHEN 'login_failed' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.admin_activity_log WHERE action='login_failed' AND created_at >= $1-interval '24 hours'$query$;
    WHEN 'login_success' THEN query_text := $query$SELECT to_jsonb(count(*)) FROM public.admin_activity_log WHERE action='login_success' AND created_at >= $1-interval '24 hours'$query$;
    ELSE RAISE EXCEPTION 'Unknown dashboard metric';
  END CASE;
  EXECUTE query_text INTO result USING p_now, p_entitlement;
  RETURN jsonb_build_object('state', CASE WHEN result IS NULL THEN 'unknown' ELSE 'ok' END, 'value', result);
EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
  RETURN jsonb_build_object('state','unknown','value',NULL,'reason','Source unavailable');
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_dashboard_metric(text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metric(text,timestamptz,text) TO service_role;

-- Time-window indexes used by the dashboard. Existing equivalents are reused.
CREATE INDEX IF NOT EXISTS dashboard_profiles_created ON public.profiles(created_at);
CREATE INDEX IF NOT EXISTS dashboard_plans_created ON public.float_plans(created_at);
CREATE INDEX IF NOT EXISTS dashboard_devices_seen ON public.device_tokens(last_seen_at);
CREATE INDEX IF NOT EXISTS dashboard_deliveries_sent ON public.alert_push_deliveries(sent_at);
CREATE INDEX IF NOT EXISTS dashboard_eddy_generated ON public.eddy_updates(generated_at);
CREATE INDEX IF NOT EXISTS dashboard_gauge_generated ON public.gauge_updates(generated_at);

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(p_now timestamptz, p_entitlement text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE k text; v jsonb; result jsonb='{}'::jsonb;
BEGIN
  FOR k IN SELECT unnest(ARRAY['subscribers','renewal_off','expiring','billing','rc_event','signups_7','signins_7','email_7','plans_7','signups_30','signins_30','email_30','plans_30','email_sources','plan_views','plan_rivers','plan_pairs','stars_rivers','stars_gauges','stars_dams','reports','email','feedback','push_sent','push_errors','receipt_errors','push_codes','river_waiting','river_retry','river_exhausted','gauge_waiting','gauge_retry','gauge_exhausted','cleared_unknown','devices','disabled_devices','failing_devices','versions','app_config','trust','trust_last','trust_errors','gauge_stale','gauge_missing','dam_stale','social_failed','social_stuck','social_fallback','campsite_sync_log_errors','campsite_sync_log_empty','nps_sync_log_errors','nps_sync_log_empty','usfs_sync_log_errors','usfs_sync_log_empty','images','descriptions','driving','hazards','blogs','eddy_updates_expired','eddy_updates_tokens','gauge_updates_expired','gauge_updates_tokens','condition_mismatch','chat_sessions','chat_duration','chat_tokens','chat_tools','chat_rivers','embeds','embed_hosts','embed_partners','login_failed','login_success']::text[]) LOOP
    BEGIN
      v := public.admin_dashboard_metric(k,p_now,p_entitlement);
    EXCEPTION WHEN OTHERS THEN
      v := jsonb_build_object('state','unknown','value',NULL,'reason','Source query failed');
    END;
    result := result || jsonb_build_object(k,v);
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_summary(timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_summary(timestamptz,text) TO service_role;

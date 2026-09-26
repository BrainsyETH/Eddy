CREATE TABLE public.upstream_usage_daily (
 day date NOT NULL,
 environment text NOT NULL CHECK(environment IN ('production','preview','development')),
 provider text NOT NULL,
 operation text NOT NULL,
 model text NOT NULL,
 kind text NOT NULL,
 sample_rate numeric NOT NULL CHECK(sample_rate>0 AND sample_rate<=1),
 observed_calls bigint NOT NULL CHECK(observed_calls>=0),
 estimated_calls double precision NOT NULL CHECK(estimated_calls>=0),
 estimated_errors double precision NOT NULL CHECK(estimated_errors>=0),
 observed_429s bigint NOT NULL CHECK(observed_429s>=0),
 histogram jsonb NOT NULL,
 input_tokens double precision NOT NULL DEFAULT 0,
 output_tokens double precision NOT NULL DEFAULT 0,
 cache_read_tokens double precision NOT NULL DEFAULT 0,
 cache_write_tokens double precision NOT NULL DEFAULT 0,
 collected_at timestamptz NOT NULL,
 PRIMARY KEY(day,environment,provider,operation,model,kind,sample_rate)
);
ALTER TABLE public.upstream_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upstream_usage_daily FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.upstream_usage_daily TO service_role;

-- Absolute snapshots, not increments. A later duplicate/late-write snapshot
-- replaces an earlier one; concurrent old snapshots cannot overwrite new ones.
CREATE OR REPLACE FUNCTION public.store_upstream_snapshot(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE affected integer;
BEGIN
 IF jsonb_array_length(p_rows)>2000 THEN RAISE EXCEPTION 'Snapshot too large'; END IF;
 INSERT INTO public.upstream_usage_daily
 SELECT * FROM jsonb_populate_recordset(NULL::public.upstream_usage_daily,p_rows)
 ON CONFLICT(day,environment,provider,operation,model,kind,sample_rate) DO UPDATE SET
 observed_calls=EXCLUDED.observed_calls,estimated_calls=EXCLUDED.estimated_calls,
 estimated_errors=EXCLUDED.estimated_errors,observed_429s=EXCLUDED.observed_429s,
 histogram=EXCLUDED.histogram,input_tokens=EXCLUDED.input_tokens,output_tokens=EXCLUDED.output_tokens,
 cache_read_tokens=EXCLUDED.cache_read_tokens,cache_write_tokens=EXCLUDED.cache_write_tokens,
 collected_at=EXCLUDED.collected_at
 WHERE EXCLUDED.collected_at>upstream_usage_daily.collected_at
 AND EXCLUDED.observed_calls>=upstream_usage_daily.observed_calls;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.store_upstream_snapshot(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_upstream_snapshot(jsonb) TO service_role;

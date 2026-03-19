-- Chat usage logging for analytics
-- Not for conversation persistence — just tracks what users ask and how Eddy responds

create table chat_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  river_slug text,
  user_message text not null,
  assistant_response text,
  tools_called text[],
  input_tokens int,
  output_tokens int,
  duration_ms int,
  ip_hash text,
  created_at timestamptz default now()
);

-- Index for analytics queries
create index idx_chat_logs_created_at on chat_logs(created_at desc);
create index idx_chat_logs_river_slug on chat_logs(river_slug);
create index idx_chat_logs_session_id on chat_logs(session_id);

-- RLS: service role can insert, public can't read
alter table chat_logs enable row level security;

create policy "Service role can manage chat_logs"
  on chat_logs for all
  using (auth.role() = 'service_role');

alter table public.campaigns
  add column if not exists categoria text not null default 'avulsas'
  check (categoria in ('agentepro','academy','p360','avulsas'));

-- supabase/migrations/0001_init.sql

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  group_id text not null unique,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.audiences (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('todos','manual')),
  -- group_ids: Z-API group IDs. Intentionally NOT a FK to groups.group_id — validated at write time in the API layer.
  group_ids text[],
  criado_em timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('texto','imagem','video','pdf')),
  mensagem text not null,
  midia_url text,
  mencionar_todos boolean not null default false,
  audience_id uuid references public.audiences(id) on delete set null,
  -- on delete set null; revisit to 'restrict' when an audience-delete UI ships so a scheduled campaign can't silently lose its target.
  enviar_em timestamptz,
  status text not null default 'rascunho'
    check (status in ('rascunho','agendada','enviando','enviada','cancelada','erro')),
  resultado jsonb,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists campaigns_due_idx
  on public.campaigns (status, enviar_em);

create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists trg_campaigns_touch on public.campaigns;
create trigger trg_campaigns_touch before update on public.campaigns
for each row execute function public.touch_atualizado_em();

-- RLS enabled with NO policies: service_role (API routes + n8n) bypasses RLS. Add anon/auth policies when login ships.
alter table public.groups   enable row level security;
alter table public.audiences enable row level security;
alter table public.campaigns enable row level security;

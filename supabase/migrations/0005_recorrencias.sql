-- supabase/migrations/0005_recorrencias.sql
-- Campanhas recorrentes: um molde que dispara toda semana num dia fixo (ex.: P360 toda segunda).
-- O refill materializa as próximas ocorrências como campanhas 'agendada' normais; o cron de 1 min
-- do n8n envia como qualquer outra agendada — nada muda no motor de envio.

create table if not exists public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'p360'
    check (categoria in ('agentepro','academy','p360','avulsas')),
  dia_semana smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  hora text not null,                                               -- 'HH:MM' (America/Sao_Paulo)
  tipo text not null default 'texto' check (tipo in ('texto','imagem','video','pdf')),
  mensagem text not null,
  midia_url text,
  mencionar_todos boolean not null default false,
  audience_id uuid references public.audiences(id) on delete set null,
  group_ids text[],
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- RLS enabled with NO policies: service_role (API routes) bypassa RLS, igual às outras tabelas.
alter table public.recorrencias enable row level security;

-- Mantém atualizado_em em dia (reusa a função criada em 0001_init.sql).
drop trigger if exists trg_recorrencias_touch on public.recorrencias;
create trigger trg_recorrencias_touch before update on public.recorrencias
for each row execute function public.touch_atualizado_em();

-- Vínculo da campanha gerada com o molde. on delete set null: apagar a recorrência
-- preserva o histórico das campanhas já enviadas.
alter table public.campaigns add column if not exists recorrencia_id uuid
  references public.recorrencias(id) on delete set null;

-- Torna o refill idempotente: rodar dez vezes no mesmo dia não duplica ocorrências.
-- Índice total (sem WHERE) de propósito: PostgREST só resolve ON CONFLICT contra um índice
-- sem predicado, e no Postgres NULLs são distintos entre si — campanhas comuns
-- (recorrencia_id null) nunca colidem, mesmo com o mesmo enviar_em.
create unique index if not exists campaigns_recorrencia_ocorrencia_idx
  on public.campaigns (recorrencia_id, enviar_em);

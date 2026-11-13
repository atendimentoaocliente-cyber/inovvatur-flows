-- supabase/migrations/0026_telegram.sql
--
-- Numerada depois da 0025 do ramo base-sendflow, cujas migrations já estão aplicadas
-- neste banco (API oficial, e-mail, automações…). É por isso que este arquivo trata
-- o provider `cloud` e a regra de identidade, que o main ainda não tem.
--
-- TELEGRAM COMO CANAL DE ENVIO, AO LADO DO WHATSAPP.
--
-- Um bot oficial (Bot API) entra nos grupos e canais como administrador e publica
-- as campanhas. Uma campanha pode ir para grupos do WhatsApp E do Telegram ao
-- mesmo tempo.
--
-- O QUE NÃO PODE ACONTECER: o n8n enxergar um destino do Telegram. Ele pega toda
-- campanha `agendada` com `connection_id` nulo e, se ela não tiver grupos marcados,
-- manda para TODOS os grupos ativos de `groups`. Por isso:
--
--   · os grupos do Telegram ficam em tabela própria (`telegram_chats`), nunca em
--     `groups` — o n8n lê `groups` e mandaria pela Z-API;
--   · a campanha guarda os destinos do Telegram em coluna própria
--     (`telegram_chat_ids`), fora de `group_ids`;
--   · a campanha SÓ de Telegram sai "pela conexão do bot" (a linha de
--     `connections` com provider 'telegram'). Com `connection_id` preenchido, o n8n
--     não a vê — sem isso, ela iria para todos os grupos do WhatsApp.

-- ── a conexão do bot ──────────────────────────────────────────────────────
-- `cloud` (API oficial da Meta, migration 0019 do base-sendflow) continua valendo.
alter table public.connections drop constraint if exists connections_provider_check;
alter table public.connections
  add constraint connections_provider_check check (provider in ('evolution', 'cloud', 'telegram'));

-- A regra "cada tipo de conexão tem o seu identificador" ganha o caso do bot: ele
-- não tem número nem instância da Evolution. Só onde a regra existe — num banco só
-- com as migrations do main, nem a coluna phone_number_id existe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'connections' and column_name = 'phone_number_id'
  ) then
    alter table public.connections drop constraint if exists connections_identidade_do_provider;
    alter table public.connections add constraint connections_identidade_do_provider check (
      (provider = 'evolution' and instance_name is not null and phone_number_id is null)
      or (provider = 'cloud' and phone_number_id is not null)
      or (provider = 'telegram' and phone_number_id is null)
    );
  end if;
end $$;

-- Uma linha só. O token NÃO fica aqui: está na variável TELEGRAM_BOT_TOKEN.
insert into public.connections (nome, provider, instance_name, status, ativo)
values ('Telegram', 'telegram', 'telegram-bot', 'conectada', true)
on conflict (instance_name) do nothing;

-- Apagar esta linha seria perigoso: `campaigns.connection_id` é `on delete set
-- null`, e uma campanha só de Telegram sem conexão vira campanha do n8n — que, sem
-- grupos marcados, manda para TODOS os grupos do WhatsApp. O banco recusa.
create or replace function public.proteger_conexao_telegram()
returns trigger language plpgsql as $$
begin
  if old.provider = 'telegram' then
    raise exception 'a conexão do Telegram não pode ser apagada (as campanhas só de Telegram cairiam no n8n)';
  end if;
  return old;
end; $$;

drop trigger if exists trg_proteger_conexao_telegram on public.connections;
create trigger trg_proteger_conexao_telegram before delete on public.connections
for each row execute function public.proteger_conexao_telegram();

-- ── os grupos e canais onde o bot está ───────────────────────────────────
-- Preenchida sozinha pelo webhook: quando alguém adiciona o bot (link do painel),
-- o Telegram avisa com `my_chat_member`. Ninguém procura ID de grupo.
create table if not exists public.telegram_chats (
  id uuid primary key default gen_random_uuid(),
  -- O id do Telegram MUDA quando um grupo vira supergrupo. As campanhas apontam
  -- para `id` (uuid), e só esta coluna é atualizada na migração.
  chat_id bigint not null unique,
  tipo text not null check (tipo in ('group', 'supergroup', 'channel')),
  titulo text not null,
  username text,
  -- Situação do bot no chat, como o Telegram informa.
  bot_status text not null
    check (bot_status in ('creator', 'administrator', 'member', 'restricted', 'left', 'kicked')),
  -- Em canal, só administrador com "publicar mensagens" consegue enviar.
  pode_postar boolean not null default true,
  -- Liga/desliga do painel: inativo não aparece para escolher.
  ativo boolean not null default true,
  membros integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.telegram_chats enable row level security;

drop trigger if exists trg_telegram_chats_touch on public.telegram_chats;
create trigger trg_telegram_chats_touch before update on public.telegram_chats
for each row execute function public.touch_atualizado_em();

-- ── destinos do Telegram na campanha e na recorrência ────────────────────
alter table public.campaigns
  add column if not exists telegram_chat_ids uuid[],
  -- Quando a fila do Telegram desta campanha foi montada. Nulo = ainda não.
  add column if not exists telegram_fila_em timestamptz,
  -- {total, enviados, falhas} só do Telegram. `resultado` continua sendo de quem
  -- envia o WhatsApp (o n8n escreve lá por cima).
  add column if not exists telegram_resultado jsonb;

alter table public.recorrencias
  add column if not exists telegram_chat_ids uuid[];

-- ── a fila: uma linha por campanha × chat ────────────────────────────────
create table if not exists public.telegram_envios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  chat_ref uuid references public.telegram_chats(id) on delete set null,
  -- Cópia do momento da fila: se o chat for apagado, o histórico continua legível.
  chat_titulo text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'falha', 'cancelado')),
  tentativas smallint not null default 0,
  -- Pausa pedida pelo Telegram (erro 429 com retry_after). Nulo = pode ir já.
  liberar_em timestamptz,
  message_ids bigint[],
  erro text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (campaign_id, chat_ref)
);

create index if not exists telegram_envios_fila_idx
  on public.telegram_envios (status, liberar_em)
  where status in ('pendente', 'enviando');

alter table public.telegram_envios enable row level security;

drop trigger if exists trg_telegram_envios_touch on public.telegram_envios;
create trigger trg_telegram_envios_touch before update on public.telegram_envios
for each row execute function public.touch_atualizado_em();

-- A fila procura campanha vencida com Telegram ainda sem fila montada.
create index if not exists campaigns_telegram_pendente_idx
  on public.campaigns (enviar_em)
  where telegram_chat_ids is not null and telegram_fila_em is null;

notify pgrst, 'reload schema';

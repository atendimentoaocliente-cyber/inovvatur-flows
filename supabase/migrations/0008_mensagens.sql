-- supabase/migrations/0008_mensagens.sql
-- As mensagens das conversas, guardadas por nós.
--
-- Por que precisamos disto, sendo que a Evolution tem um banco próprio: porque o dela
-- não é confiável para o que está acontecendo AGORA. Medido em produção: com o grupo
-- ativo, o registro mais novo que a Evolution tinha era de 40 minutos antes. Ela grava
-- em lotes, pela sincronização de histórico — o que serve para o passado e não serve
-- para uma tela de conversa.
--
-- O webhook, esse sim, chega no instante em que a mensagem acontece. Esta tabela é
-- onde ele deposita o que chega, e a tela passa a ler daqui o que é recente (e da
-- Evolution o histórico antigo, que ela tem e nós não).
--
-- Guardamos TEXTO, não mídia: o arquivo continua na Evolution e é buscado sob demanda.

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,

  -- Conversa: JID do grupo (…@g.us), do contato (…@s.whatsapp.net) ou opaco (…@lid).
  jid text not null,
  -- ID da mensagem no WhatsApp. Com connection_id forma a chave natural: é ele que
  -- evita gravar duas vezes quando a Evolution reenvia o mesmo evento — e ela reenvia.
  message_id text not null,

  from_me boolean not null default false,
  tipo text not null default 'texto',
  texto text,
  -- Em grupo, quem mandou (o JID do participante) e o nome que o WhatsApp informou.
  autor text,
  autor_nome text,

  -- Momento da mensagem no relógio do WhatsApp (segundos desde 1970), como a Evolution
  -- entrega. Guardado como timestamptz para ordenar e filtrar sem conversão na consulta.
  enviada_em timestamptz not null,
  criado_em timestamptz not null default now()
);

-- Idempotência: o mesmo evento chegando duas vezes não vira duas mensagens.
create unique index if not exists mensagens_unica_idx
  on public.mensagens (connection_id, message_id);

-- O índice da tela: as mensagens mais recentes de uma conversa.
create index if not exists mensagens_conversa_idx
  on public.mensagens (connection_id, jid, enviada_em desc);

alter table public.mensagens enable row level security;

-- supabase/migrations/0004_sequences.sql
-- Roteiros reutilizáveis ("Sequências de Aula"). Cada linha é um roteiro (nome + categoria)
-- cujos passos (steps jsonb) são renderizados e agendados como campanhas individuais no dispatch.

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'academy'
    check (categoria in ('agentepro','academy','p360','avulsas')),
  steps jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- RLS enabled with NO policies: service_role (API routes) bypasses RLS, igual às outras tabelas.
alter table public.sequences enable row level security;

-- Mantém atualizado_em em dia (reusa a função criada em 0001_init.sql).
drop trigger if exists trg_sequences_touch on public.sequences;
create trigger trg_sequences_touch before update on public.sequences
for each row execute function public.touch_atualizado_em();

-- Semeia o roteiro da Academy (10 passos), apenas se ainda não existir uma sequência 'academy'.
-- Os \n no JSON viram quebras de linha reais no texto ao fazer o cast ::jsonb / extrair com ->>.
insert into public.sequences (nome, categoria, steps)
select 'Academy', 'academy', $json$[
  {
    "id": "s1",
    "ordem": 0,
    "dia_offset": -1,
    "hora_tipo": "fixo",
    "hora_fixa": "08:00",
    "offset_min": null,
    "mensagem": "Bom dia, pessoal! ☀️ Tudo bem por aí?\n\nPassando aqui pra dar aquele aviso imperdível: essa semana tem AULA ao vivo! 🎉\n\nE o tema está sensacional.\n\nJá vai separando o horário e avisando quem ainda não viu essa mensagem, porque serão aulas incríveis e a gente não quer ninguém de fora não! 👊\n\nAnota aí o horário, estaremos esperando vocês!",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s2",
    "ordem": 1,
    "dia_offset": -1,
    "hora_tipo": "fixo",
    "hora_fixa": "12:00",
    "offset_min": null,
    "mensagem": "Passando pra reforçar: nossa aula ao vivo é {{diasemana}} ({{data}}), às {{hora}}.\n\nTema: {{tema}}\n\nSepara esse horário aí. 😉",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s3",
    "ordem": 2,
    "dia_offset": -1,
    "hora_tipo": "fixo",
    "hora_fixa": "18:00",
    "offset_min": null,
    "mensagem": "Faaala pessoal, tudo certo por aí?\n\nLembrando que amanhã tem aula ao vivo e a gente quer ver todo mundo presente! 🔥\n\nTema da semana: {{tema}}\n\nSepara um tempinho no seu dia e vem com a gente, porque quem participa ao vivo sempre leva muito mais do que quem assiste depois na gravação. 😉\n\n{{diasemana}}, às {{hora}} — anota e coloca no alarme, estaremos te esperando! ⏰💪",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s4",
    "ordem": 3,
    "dia_offset": 0,
    "hora_tipo": "fixo",
    "hora_fixa": "08:00",
    "offset_min": null,
    "mensagem": "Faaala pessoal, tudo certo por aí?\n\nLembrando que hoje tem aula ao vivo e a gente quer ver todo mundo presente! 🔥\n\nO tema vai ser *\"{{tema}}\"*\n\nSepara um tempinho no seu dia, fecha o que tiver aberto antes da reunião e vem com a gente. 😉\n\nHoje às {{hora}} — anota e coloca no alarme, estaremos te esperando! ⏰💪",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s5",
    "ordem": 4,
    "dia_offset": 0,
    "hora_tipo": "fixo",
    "hora_fixa": "12:00",
    "offset_min": null,
    "mensagem": "Pessoal, o Fialho mandou um recado especial pra vocês hoje! 👆\n\nHoje é dia de aula ao vivo! 🚀 A gente se encontra às {{hora}}. Queremos ver todo mundo presente, animado e pronto pra aprender muito. Não percam! 🔥",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s6",
    "ordem": 5,
    "dia_offset": 0,
    "hora_tipo": "relativo",
    "hora_fixa": null,
    "offset_min": -60,
    "mensagem": "Ei galera, é HOJE! 🚨 Falta 1 hora pra nossa aula ao vivo!\n\nTermina o que estiver fazendo, pega seu caderno, sua água e se prepara, porque às {{hora}} a gente começa e vai ser incrível! 👊🔥\n\nNão deixa passar, te esperamos lá! 🚀",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s7",
    "ordem": 6,
    "dia_offset": 0,
    "hora_tipo": "relativo",
    "hora_fixa": null,
    "offset_min": 0,
    "mensagem": "Estamos esperando vocês, pessoal! 👊\n\nJá iremos começar, entra agora para não perder nenhum conteúdo! 🚀🔥\n\nhttps://turis.inovvatur.com.br/checkin",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s8",
    "ordem": 7,
    "dia_offset": 0,
    "hora_tipo": "relativo",
    "hora_fixa": null,
    "offset_min": 5,
    "mensagem": "Pessoal, vamos esperar mais 5 min para começar, não percam! 🚀🔥\n\nhttps://turis.inovvatur.com.br/checkin",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s9",
    "ordem": 8,
    "dia_offset": 0,
    "hora_tipo": "relativo",
    "hora_fixa": null,
    "offset_min": 10,
    "mensagem": "Já estamos começando, pessoal! Estamos esperando vocês. 🚀🔥\n\nhttps://turis.inovvatur.com.br/checkin",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  },
  {
    "id": "s10",
    "ordem": 9,
    "dia_offset": 0,
    "hora_tipo": "relativo",
    "hora_fixa": null,
    "offset_min": 20,
    "mensagem": "Último aviso, pessoal, não percam. 🚀🔥\n\nhttps://turis.inovvatur.com.br/checkin",
    "tipo": "texto",
    "midia_url": null,
    "mencionar_todos": false
  }
]$json$::jsonb
where not exists (select 1 from public.sequences where categoria = 'academy');

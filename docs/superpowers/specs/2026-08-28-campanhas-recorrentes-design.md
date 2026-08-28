# Campanhas Recorrentes (semanal por dia da semana) — Design

**Data:** 2026-08-28
**Escopo:** uma mensagem fixa que dispara **toda semana num dia escolhido** (caso motivador: P360 toda segunda). Genérico: serve para qualquer categoria.

## Problema

Existem cadências fixas ("P360 manda a mesma mensagem toda segunda") que hoje vivem num workflow n8n fora da plataforma. O usuário quer ligar isso uma vez no painel e esquecer: escolhe dia da semana, hora, mensagem e público; a plataforma agenda para sempre.

## Abordagem: materializar campanhas com antecedência

Não criamos motor de recorrência no envio. Uma **recorrência** é um molde; um job de *refill* cria, com antecedência, campanhas `agendada` normais (uma por ocorrência) dentro de um **horizonte de 6 semanas**. O cron de 1 min do n8n que já existe envia essas campanhas como qualquer outra agendada — **nada muda no envio**. Cada ocorrência aparece no painel e pode ser editada/cancelada individualmente.

## Modelo de dados

Migration `supabase/migrations/0005_recorrencias.sql`:

```sql
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
alter table public.recorrencias enable row level security;  -- sem policies: service_role, igual às outras
```

E o vínculo na campanha gerada:

```sql
alter table public.campaigns add column if not exists recorrencia_id uuid
  references public.recorrencias(id) on delete set null;
create unique index if not exists campaigns_recorrencia_ocorrencia_idx
  on public.campaigns (recorrencia_id, enviar_em) where recorrencia_id is not null;
```

O índice único é o que torna o refill **idempotente**: rodar dez vezes no mesmo dia não duplica nada.

## Cálculo das ocorrências (`src/lib/recurrence.ts`)

Timezone fixo **America/Sao_Paulo (UTC−03:00)**, coerente com `sequence.ts` e `format.ts`.

- `nextOccurrences(diaSemana, hora, desdeISO, semanas)` → lista de ISO (UTC) das próximas ocorrências dentro da janela, **estritamente no futuro** em relação a `desde`.
- A busca do primeiro dia usa aritmética de calendário em `Date.UTC` sobre a data local SP (mesmo truque de `shiftDateYMD`), evitando drift de fuso.
- Se a ocorrência desta semana já passou (ou é agora), começa na próxima.

## Refill

`POST /api/recorrencias/refill`:

- Autenticação: header `x-cron-secret` (ou `Authorization: Bearer`) igual a `CRON_SECRET` (env). Sem `CRON_SECRET` definido o endpoint fica aberto — a página de recorrências não depende dele (chama a função de refill direto no servidor), então em produção basta definir o segredo.
- Para cada recorrência `ativo=true`: calcula as ocorrências do horizonte, lê as campanhas já existentes daquela recorrência (`enviar_em` futuro) e insere só as que faltam, com `status='agendada'`, `recorrencia_id`, `nome` = `"<nome> — DD/MM"`, e os campos de conteúdo/público copiados do molde.
- Nunca agenda no passado.
- Retorna `{ criadas, porRecorrencia: [{ id, nome, criadas }] }`.

**Gatilho:** Schedule Trigger diário no n8n chamando o endpoint (workflow JSON versionado em `n8n/recorrencias-refill.workflow.json`). Alternativa equivalente: Vercel Cron. Além disso, abrir `/recorrencias` dispara um refill, então o horizonte nunca fica seco durante o uso normal.

## Edição e desativação

O molde é a verdade para o que **ainda não foi enviado**:

- `PATCH` que muda conteúdo/hora/dia/público **reescreve** as campanhas futuras `agendada` daquela recorrência (as com `enviar_em` fora da nova grade são canceladas e as novas datas são criadas no refill seguinte, que roda no mesmo request).
- `ativo=false` → cancela (`status='cancelada'`) as futuras `agendada` da recorrência.
- `ativo=true` de novo → refill recria o horizonte.
- `DELETE` → cancela as futuras e apaga o molde (`recorrencia_id` das enviadas vira null pelo `on delete set null`, preservando o histórico).
- Campanhas já `enviada`/`enviando` nunca são tocadas.

## Feriados

Feriado nacional **não** é pulado: a ocorrência é agendada normalmente e o usuário cancela a campanha específica no painel se quiser. (`holidays.ts` continua sendo só do compositor.)

## API

- `GET /api/recorrencias` → lista.
- `POST /api/recorrencias` → cria (valida nome, dia_semana 0–6, hora HH:MM, mensagem não vazia, tipo válido, mídia quando tipo≠texto) e já faz refill da nova.
- `GET|PATCH|DELETE /api/recorrencias/[id]`.
- `POST /api/recorrencias/refill`.

## UI

- **Sidebar:** novo item **"Recorrentes"** (🔄).
- **`/recorrencias`** — lista: nome, chip da categoria, "toda segunda às 09:00", público, **próximas 3 datas** já agendadas, toggle Ativo, Editar, Excluir. Server component dispara o refill antes de listar.
- **`/recorrencias/nova`** e **`/recorrencias/[id]/editar`** — form reusando `AudiencePicker`, upload de mídia (`/api/upload`) e `WhatsAppPreview` do compositor. Seletor de dia da semana (7 botões) + hora.

## Testes (Vitest)

- `recurrence.ts`: primeira ocorrência quando hoje é o dia e a hora já passou / ainda não passou; virada de mês e de ano; quantidade correta para N semanas; saída UTC certa para SP (09:00 SP = 12:00Z).
- Construção da linha da campanha a partir do molde (nome com data, campos copiados, status agendada).
- Mantém os 56 testes atuais verdes.

## Fora de escopo

- Recorrência diária/mensal/quinzenal (o modelo aceita só semanal por enquanto).
- Pular feriados automaticamente.
- Mais de uma mensagem por semana no mesmo molde (crie duas recorrências).

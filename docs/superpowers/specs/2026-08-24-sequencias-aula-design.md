# Sequências de Aula (cadência reutilizável) — Design

**Data:** 2026-08-24
**Escopo desta entrega:** roteiro reutilizável, **começando pela Academy**. Estrutura já preparada para ter vários roteiros (um por produto) no futuro. O caso "P360 mensagem fixa toda segunda" fica para depois (é mais simples).

## Problema

Toda semana a Academy dispara uma **sequência de ~10 mensagens** em volta da aula ao vivo (do "bom dia" no dia anterior até o "último aviso, tá começando"). A estrutura e os horários são sempre os mesmos; o que muda é só **tema, hora e data** da aula. Hoje isso é feito na mão / via planilha+n8n. Queremos um **roteiro salvo** onde o usuário preenche 3 campos e a plataforma **agenda a sequência inteira**, com as variáveis já substituídas.

## Abordagem: renderizar na criação (reaproveita o pipeline atual)

Não criamos "motor de recorrência" no n8n. Ao disparar a sequência, o servidor **renderiza cada mensagem** (troca as variáveis) e **cria N campanhas `agendada`** normais (uma por passo), cada uma com seu `enviar_em`. O cron de 1 min que já existe dispara nos horários certos. Cada campanha aparece no painel (categoria Academy) e pode ser editada/cancelada individualmente. **Nenhuma mudança no n8n.**

## Variáveis suportadas

- `{{tema}}` → texto do tema, como digitado.
- `{{hora}}` → hora da aula em estilo BR: `19h` (ou `19h30` quando tem minutos). Entrada é um campo horário `HH:MM`.
- `{{data}}` → data da aula, formato `DD/MM/YYYY`.
- `{{diasemana}}` → dia da semana por extenso, pt-BR minúsculo (ex.: `quinta-feira`). Assim o usuário não precisa "chumbar" o dia no texto.

Substituição tolerante a espaços e caixa: `{{ tema }}`, `{{Tema}}` etc. funcionam.

## Modelo de dados

Nova migration `supabase/migrations/0004_sequences.sql`:

```sql
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'academy'
    check (categoria in ('agentepro','academy','p360','avulsas')),
  steps jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.sequences enable row level security;
-- (sem policies: as APIs usam service_role, igual às outras tabelas)
```

Cada elemento de `steps` (JSONB):

```ts
interface SequenceStep {
  id: string;                       // uuid gerado no cliente (key/reordenação)
  ordem: number;                    // 0..n para ordenar
  dia_offset: number;               // 0 = dia da aula, -1 = 1 dia antes, -2 = 2 dias antes
  hora_tipo: 'fixo' | 'relativo';
  hora_fixa: string | null;         // 'HH:MM' quando hora_tipo='fixo'
  offset_min: number | null;        // quando 'relativo': minutos em relação à hora da aula (-60, 0, 5, 10, 15)
  mensagem: string;                 // template com {{tema}}/{{hora}}/{{data}}/{{diasemana}}
  tipo: 'texto'|'imagem'|'video'|'pdf';
  midia_url: string | null;
  mencionar_todos: boolean;
}
```

A migration também **semeia o roteiro da Academy** (INSERT com os 10 passos abaixo), pré-carregado com as mensagens reais para o usuário só ajustar horários.

## Cálculo do horário de cada passo (`src/lib/sequence.ts`)

Timezone fixo **America/Sao_Paulo (UTC−03:00)**, coerente com `format.ts`.

- Data base = `data_da_aula` deslocada por `dia_offset` dias (aritmética de calendário via `Date.UTC`, sem drift de fuso — mesmo truque de `holidays.ts`).
- `hora_tipo='fixo'`: `enviar_em = new Date('${dataBase}T${hora_fixa}:00-03:00')`.
- `hora_tipo='relativo'`: `dt = new Date('${dataBase}T${hora_da_aula}:00-03:00'); dt.setTime(dt + offset_min*60000)` (rola meia-noite/hora naturalmente).
- Retorna `dt.toISOString()` (UTC), que é o formato de `enviar_em`.

`renderTemplate(tpl, { tema, hora, data, diasemana })` faz a substituição das 4 variáveis.

## API

- `GET /api/sequences` → lista `{id, nome, categoria}`.
- `POST /api/sequences` → cria sequência (para múltiplos roteiros no futuro).
- `GET /api/sequences/[id]` → sequência com `steps`.
- `PATCH /api/sequences/[id]` → atualiza `nome`/`steps` (o builder salva aqui). Valida cada step (dia_offset ≤ 0; hora_fixa `HH:MM` quando fixo; offset_min inteiro quando relativo; mensagem não vazia; tipo válido; mídia quando tipo≠texto). 400 em valor inválido.
- `POST /api/sequences/[id]/dispatch` → corpo `{ data:'YYYY-MM-DD', hora:'HH:MM', tema, categoria?, audience_id?, group_ids? }`.
  - Carrega a sequência, calcula `enviar_em` e renderiza `mensagem` de cada passo.
  - **Pula** passos cujo `enviar_em <= agora` (retorna quantos foram pulados) — não agenda mensagem no passado.
  - Insere as campanhas restantes (`status='agendada'`, `categoria` do corpo ou da sequência, `nome` = `"<nome da sequência> — <tema> (passo N)"`), dispara o webhook n8n por id criado (fire-and-forget, igual ao POST de campanha).
  - Retorna `{ criadas: Campaign[], puladas: number }`. Valida `data`/`hora`/`tema` obrigatórios (400).

## UI

- **Sidebar:** novo item **"Sequências"**.
- **`/sequencias`** — lista de roteiros (por ora só Academy) com botões **"Editar roteiro"** e **"Disparar semana"**.
- **`/sequencias/[id]/editar`** — builder do roteiro: lista de passos (adicionar/remover/reordenar). Cada passo: seletor `dia_offset` (No dia / 1 dia antes / 2 dias antes), toggle `hora_tipo` (Relógio fixo `HH:MM` / Relativo à aula: `1h antes`, `No horário`, `+5 min`, `+10 min`, `+15 min`), `textarea` da mensagem com **chips das variáveis** (clicar insere `{{...}}`), tipo/mídia, "mencionar todos". Botão **Salvar** → PATCH.
- **`/sequencias/[id]/disparar`** — form: **data da aula**, **hora da aula** (`HH:MM`), **tema**, seletor de público (Todos/Público salvo/Grupos — reusa o do compositor) e categoria (default academy). **Preview ao vivo**: lista dos passos com data/hora calculada e mensagem já renderizada (passos no passado marcados "não será agendado"). Botão **"Agendar tudo"** → POST dispatch → sucesso → redireciona para `/campanhas` (aba Academy) mostrando as campanhas criadas.

## Roteiro semeado (Academy) — horários são chute inicial, editáveis

| # | Quando | Mensagem (resumo) |
|---|--------|-------------------|
| 1 | 1 dia antes, 08:00 | "Bom dia, pessoal! ☀️… essa semana tem AULA ao vivo!" |
| 2 | 1 dia antes, 12:00 | "Passando pra reforçar: aula é {{diasemana}} ({{data}}), às {{hora}}. Tema: {{tema}}" |
| 3 | 1 dia antes, 18:00 | "Lembrando que amanhã tem aula… {{diasemana}}, {{hora}}" |
| 4 | No dia, 08:00 | "Lembrando que hoje tem aula… hoje às {{hora}}. Tema: {{tema}}" |
| 5 | No dia, 12:00 | "O Fialho mandou um recado… hoje é dia de aula, às {{hora}}" |
| 6 | No dia, 1h antes | "É HOJE! Falta 1 hora… às {{hora}}" |
| 7 | No dia, no horário | "Estamos esperando vocês… entra agora! <link checkin>" |
| 8 | No dia, +5 min | "{{hora}} vamos esperar mais 5 min… <link checkin>" |
| 9 | No dia, +10 min | "Já estamos começando! <link checkin>" |
| 10 | No dia, +20 min | "Último aviso, não percam. <link checkin>" |

Link de check-in: `https://turis.inovvatur.com.br/checkin`.

## Fora de escopo (agora)

- Múltiplos roteiros por produto na UI (o modelo já suporta; a UI só lista/edita os que existirem).
- Roteiro fixo "P360 toda segunda" (entrega futura, simples: 1 mensagem semanal).
- Reordenar por drag-and-drop sofisticado (basta subir/descer).

## Testes

- `sequence.ts`: `renderTemplate` (4 variáveis, tolerância a espaços/caixa); `computeStepEnviarEm` (fixo, relativo −60/0/+5, `dia_offset` −1/−2, rollover de meia-noite, saída UTC correta para SP).
- `dispatch`: pula passos no passado; cria N campanhas com categoria/enviar_em corretos.
- Vitest, mantendo os 39 testes atuais verdes.

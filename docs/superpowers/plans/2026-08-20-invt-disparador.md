# INVT Disparador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase web panel to compose, schedule and track one-off WhatsApp group campaigns, dispatched by the existing n8n `[SUB] Enviar para Grupos` engine.

**Architecture:** Next.js (App Router) on Vercel writes campaigns + media to Supabase (Postgres + Storage). A new n8n cron workflow polls Supabase for due campaigns, resolves the target group IDs, calls the existing SUB workflow (Z-API, 8–15s throttling), and writes status back. The fixed weekly/class cadences in n8n stay untouched.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, `@supabase/supabase-js`, Vitest (unit tests), n8n, Z-API.

**Spec:** `docs/superpowers/specs/2026-08-20-invt-disparador-design.md`

**Scope note:** Phases 0–10 build the web app (works on its own — you can create/see campaigns). Phases 11–13 wire the n8n dispatcher (makes campaigns actually send). Do the app first; it is independently testable.

**Convention:** Run every command from the project root `C:\Users\paulo\inovvatur-disparador` unless stated. Commit after every green test / working step.

---

## Phase 0 — Project setup

### Task 0.1: Scaffold Next.js app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Initialize the project**

Run:
```bash
npx create-next-app@latest . --ts --tailwind --app --eslint --src-dir --import-alias "@/*" --no-turbopack
```
Expected: project files created under `src/`. Accept defaults when prompted.

- [ ] **Step 2: Add runtime + test dependencies**

Run:
```bash
npm install @supabase/supabase-js
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Create `.env.example`**

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_MEDIA_BUCKET=campanhas-midia
```

- [ ] **Step 4: Ensure `.env.local` is ignored**

Confirm `.gitignore` contains `.env*.local` and add `/.superpowers/` on its own line.

- [ ] **Step 5: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind and Vitest deps"
```

### Task 0.2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 2: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add test scripts to `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" (that is fine).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest"
```

### Task 0.3: Brand theme (Inovvatur / INVT)

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Set brand colors in `tailwind.config.ts`**

Replace the `theme.extend` block:
```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#04070F',
        surface: '#0A0F1F',
        surface2: '#0E1526',
        border: '#1C2338',
        blue: '#0147FF',
        blue2: '#2E6BFF',
        ink: '#F6F8FF',
        muted: '#8C99B6',
        orange: '#FF5C00',
        green: '#00FF9C',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '16px' },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Replace `src/app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; }
body {
  background-color: #04070F;
  color: #F6F8FF;
  background-image: radial-gradient(900px 500px at 85% 115%, rgba(1,71,255,.16), transparent 60%);
  background-attachment: fixed;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: Inovvatur brand theme tokens"
```

---

## Phase 1 — Database schema (Supabase)

### Task 1.1: Create the schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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

-- keep atualizado_em fresh
create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists trg_campaigns_touch on public.campaigns;
create trigger trg_campaigns_touch before update on public.campaigns
for each row execute function public.touch_atualizado_em();

-- RLS on; only the service role (used by API routes + n8n) bypasses it.
alter table public.groups   enable row level security;
alter table public.audiences enable row level security;
alter table public.campaigns enable row level security;
-- No anon policies for now (login postponed). service_role bypasses RLS.
```

- [ ] **Step 2: Apply it in Supabase**

Open the Supabase project → SQL Editor → paste the file contents → Run.
Expected: "Success. No rows returned." Confirm the 3 tables exist under Table Editor.

- [ ] **Step 3: Create the Storage bucket**

Supabase → Storage → New bucket → name `campanhas-midia` → **Public** bucket → Save.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): initial schema (groups, audiences, campaigns) + storage bucket"
```

---

## Phase 2 — Types and Supabase client

### Task 2.1: Domain types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/types.ts
export type CampaignType = 'texto' | 'imagem' | 'video' | 'pdf';
export type CampaignStatus =
  | 'rascunho' | 'agendada' | 'enviando' | 'enviada' | 'cancelada' | 'erro';

export interface Group {
  id: string;
  group_id: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
}

export interface Audience {
  id: string;
  nome: string;
  tipo: 'todos' | 'manual';
  group_ids: string[] | null;
  criado_em: string;
}

export interface CampaignResult {
  total: number;
  enviados: number;
  falhas: number;
  erro?: string;
}

export interface Campaign {
  id: string;
  nome: string;
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  audience_id: string | null;
  enviar_em: string | null;
  status: CampaignStatus;
  resultado: CampaignResult | null;
  enviado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: domain types"
```

### Task 2.2: Server-side Supabase client

**Files:**
- Create: `src/lib/supabase/server.ts`

- [ ] **Step 1: Write the client factory**

```ts
// src/lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';

// Server-only. Uses the service role key — never import this into a client component.
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET ?? 'campanhas-midia';
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: server-side Supabase client"
```

---

## Phase 3 — Core logic (TDD)

### Task 3.1: Message rendering + duration estimate

**Files:**
- Create: `src/lib/message.ts`
- Test: `src/lib/message.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/message.test.ts
import { describe, it, expect } from 'vitest';
import { renderMessage, estimateDuration, formatDuration } from './message';

describe('renderMessage', () => {
  it('replaces {{data}} with the provided value', () => {
    expect(renderMessage('Bom dia {{data}}!', { data: '12/10' })).toBe('Bom dia 12/10!');
  });
  it('replaces every occurrence', () => {
    expect(renderMessage('{{x}}-{{x}}', { x: 'a' })).toBe('a-a');
  });
  it('leaves unknown variables untouched', () => {
    expect(renderMessage('Oi {{tema}}', { data: 'x' })).toBe('Oi {{tema}}');
  });
});

describe('estimateDuration', () => {
  it('multiplies group count by the delay range', () => {
    expect(estimateDuration(18)).toEqual({ minSec: 144, maxSec: 270 });
  });
  it('is zero for no groups', () => {
    expect(estimateDuration(0)).toEqual({ minSec: 0, maxSec: 0 });
  });
});

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });
  it('formats minutes', () => {
    expect(formatDuration(270)).toBe('4min 30s');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/message.test.ts`
Expected: FAIL — cannot resolve `./message`.

- [ ] **Step 3: Implement**

```ts
// src/lib/message.ts
export function renderMessage(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.split(`{{${key}}}`).join(value),
    template,
  );
}

export function estimateDuration(groupCount: number, minDelay = 8, maxDelay = 15) {
  return { minSec: groupCount * minDelay, maxSec: groupCount * maxDelay };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}min ${rem}s`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/message.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: message rendering + duration estimate (TDD)"
```

### Task 3.2: Campaign draft validation

**Files:**
- Create: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateCampaign, type CampaignDraft } from './validation';

const now = new Date('2026-08-20T12:00:00Z');
const base: CampaignDraft = {
  nome: 'Feriado',
  tipo: 'texto',
  mensagem: 'Bom dia',
  midia_url: null,
  mencionar_todos: false,
  agendar: true,
  enviar_em: '2026-08-21T12:00:00Z',
};

describe('validateCampaign', () => {
  it('accepts a valid scheduled text campaign', () => {
    expect(validateCampaign(base, now)).toEqual([]);
  });
  it('requires a nome', () => {
    const errs = validateCampaign({ ...base, nome: '  ' }, now);
    expect(errs.map(e => e.field)).toContain('nome');
  });
  it('requires a mensagem', () => {
    const errs = validateCampaign({ ...base, mensagem: '' }, now);
    expect(errs.map(e => e.field)).toContain('mensagem');
  });
  it('requires media when tipo is not texto', () => {
    const errs = validateCampaign({ ...base, tipo: 'imagem', midia_url: null }, now);
    expect(errs.map(e => e.field)).toContain('midia_url');
  });
  it('requires a future date when scheduling', () => {
    const errs = validateCampaign({ ...base, enviar_em: '2026-08-19T12:00:00Z' }, now);
    expect(errs.map(e => e.field)).toContain('enviar_em');
  });
  it('does not require a date when sending now', () => {
    const errs = validateCampaign({ ...base, agendar: false, enviar_em: null }, now);
    expect(errs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: FAIL — cannot resolve `./validation`.

- [ ] **Step 3: Implement**

```ts
// src/lib/validation.ts
import type { CampaignType } from './types';

export interface CampaignDraft {
  nome: string;
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  agendar: boolean;          // true = schedule, false = send now
  enviar_em: string | null;  // ISO string when agendar is true
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateCampaign(d: CampaignDraft, now: Date): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!d.nome.trim()) errors.push({ field: 'nome', message: 'Dê um nome à campanha.' });
  if (!d.mensagem.trim()) errors.push({ field: 'mensagem', message: 'Escreva a mensagem.' });
  if (d.tipo !== 'texto' && !d.midia_url) {
    errors.push({ field: 'midia_url', message: 'Envie a mídia para este tipo de campanha.' });
  }
  if (d.agendar) {
    if (!d.enviar_em) {
      errors.push({ field: 'enviar_em', message: 'Escolha a data e hora.' });
    } else if (new Date(d.enviar_em).getTime() <= now.getTime()) {
      errors.push({ field: 'enviar_em', message: 'A data precisa ser no futuro.' });
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: campaign validation (TDD)"
```

### Task 3.3: Build the DB row from a draft

**Files:**
- Create: `src/lib/campaign-row.ts`
- Test: `src/lib/campaign-row.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/campaign-row.test.ts
import { describe, it, expect } from 'vitest';
import { buildCampaignRow } from './campaign-row';
import type { CampaignDraft } from './validation';

const now = new Date('2026-08-20T12:00:00Z');
const draft: CampaignDraft = {
  nome: 'Feriado', tipo: 'imagem', mensagem: 'Bom dia',
  midia_url: 'https://x/y.jpg', mencionar_todos: true,
  agendar: true, enviar_em: '2026-08-21T09:00:00Z',
};

describe('buildCampaignRow', () => {
  it('maps a scheduled draft to an agendada row', () => {
    const row = buildCampaignRow(draft, 'aud-1', now, { asDraft: false });
    expect(row).toMatchObject({
      nome: 'Feriado', tipo: 'imagem', mensagem: 'Bom dia',
      midia_url: 'https://x/y.jpg', mencionar_todos: true,
      audience_id: 'aud-1', status: 'agendada', enviar_em: '2026-08-21T09:00:00Z',
    });
  });
  it('send-now sets status agendada with enviar_em = now', () => {
    const row = buildCampaignRow({ ...draft, agendar: false, enviar_em: null }, null, now, { asDraft: false });
    expect(row.status).toBe('agendada');
    expect(row.enviar_em).toBe(now.toISOString());
    expect(row.audience_id).toBeNull();
  });
  it('asDraft forces status rascunho', () => {
    const row = buildCampaignRow(draft, 'aud-1', now, { asDraft: true });
    expect(row.status).toBe('rascunho');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/campaign-row.test.ts`
Expected: FAIL — cannot resolve `./campaign-row`.

- [ ] **Step 3: Implement**

```ts
// src/lib/campaign-row.ts
import type { CampaignDraft } from './validation';
import type { CampaignStatus, CampaignType } from './types';

export interface CampaignRow {
  nome: string;
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  audience_id: string | null;
  enviar_em: string | null;
  status: CampaignStatus;
}

export function buildCampaignRow(
  draft: CampaignDraft,
  audienceId: string | null,
  now: Date,
  opts: { asDraft: boolean },
): CampaignRow {
  const enviar_em = draft.agendar ? draft.enviar_em : now.toISOString();
  const status: CampaignStatus = opts.asDraft ? 'rascunho' : 'agendada';
  return {
    nome: draft.nome.trim(),
    tipo: draft.tipo,
    mensagem: draft.mensagem,
    midia_url: draft.midia_url,
    mencionar_todos: draft.mencionar_todos,
    audience_id: audienceId,
    enviar_em,
    status,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/campaign-row.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: build campaign DB row from draft (TDD)"
```

---

## Phase 4 — API routes

> All DB access goes through server-side API routes using the service role. No Supabase calls from client components.

### Task 4.1: Groups API

**Files:**
- Create: `src/app/api/groups/route.ts`

- [ ] **Step 1: Implement GET (list) and POST (create)**

```ts
// src/app/api/groups/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('groups').select('*').order('criado_em', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const group_id = String(body.group_id ?? '').trim();
  const nome = String(body.nome ?? '').trim();
  if (!group_id || !nome) {
    return NextResponse.json({ error: 'group_id e nome são obrigatórios' }, { status: 400 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('groups')
    .insert({ group_id, nome, ativo: body.ativo ?? true })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Manual verification**

Start dev server: `npm run dev`. In a second terminal:
```bash
curl -X POST http://localhost:3000/api/groups -H "Content-Type: application/json" \
  -d '{"group_id":"120363000000000000-group","nome":"Clientes Turma 12"}'
curl http://localhost:3000/api/groups
```
Expected: POST returns the created row (201); GET returns an array containing it.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): groups list/create"
```

### Task 4.2: Audiences API

**Files:**
- Create: `src/app/api/audiences/route.ts`

- [ ] **Step 1: Implement GET and POST**

```ts
// src/app/api/audiences/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('audiences').select('*').order('criado_em', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const nome = String(body.nome ?? '').trim();
  const tipo = body.tipo === 'manual' ? 'manual' : 'todos';
  if (!nome) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 });
  const group_ids = tipo === 'manual' ? (body.group_ids ?? []) : null;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('audiences').insert({ nome, tipo, group_ids }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(api): audiences list/create"
```

### Task 4.3: Media upload API

**Files:**
- Create: `src/app/api/upload/route.ts`

- [ ] **Step 1: Implement upload to Storage**

```ts
// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { createServerClient, MEDIA_BUCKET } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 });
  }
  const supabase = createServerClient();
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(key, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: data.publicUrl });
}
```

- [ ] **Step 2: Manual verification**

```bash
curl -X POST http://localhost:3000/api/upload -F "file=@some-image.jpg"
```
Expected: `{"url":"https://.../campanhas-midia/....jpg"}`. Open the URL — image loads.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): media upload to Supabase Storage"
```

### Task 4.4: Campaigns API (list + create)

**Files:**
- Create: `src/app/api/campaigns/route.ts`

- [ ] **Step 1: Implement GET (with optional ?status=) and POST**

```ts
// src/app/api/campaigns/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { validateCampaign, type CampaignDraft } from '@/lib/validation';
import { buildCampaignRow } from '@/lib/campaign-row';

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status');
  const supabase = createServerClient();
  let query = supabase.from('campaigns').select('*').order('enviar_em', { ascending: true });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const draft = body.draft as CampaignDraft;
  const asDraft = Boolean(body.asDraft);
  const audienceId = (body.audience_id as string | null) ?? null;

  if (!asDraft) {
    const errors = validateCampaign(draft, new Date());
    if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  }
  const row = buildCampaignRow(draft, audienceId, new Date(), { asDraft });
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Manual verification**

```bash
curl -X POST http://localhost:3000/api/campaigns -H "Content-Type: application/json" -d '{
  "draft": {"nome":"Teste","tipo":"texto","mensagem":"Oi","midia_url":null,
            "mencionar_todos":false,"agendar":false,"enviar_em":null},
  "asDraft": false, "audience_id": null }'
curl http://localhost:3000/api/campaigns
```
Expected: POST returns a row with `status:"agendada"` and `enviar_em` ≈ now; GET lists it.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): campaigns list/create with validation"
```

### Task 4.5: Single campaign API (get / cancel)

**Files:**
- Create: `src/app/api/campaigns/[id]/route.ts`

- [ ] **Step 1: Implement GET and PATCH (used for cancel + edits)**

```ts
// src/app/api/campaigns/[id]/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  // Only allow a safe subset of fields to be edited from the UI.
  const allowed = ['nome', 'mensagem', 'midia_url', 'mencionar_todos', 'enviar_em', 'status', 'audience_id'];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').update(clean).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Manual verification (cancel)**

```bash
# replace ID with one from the previous GET
curl -X PATCH http://localhost:3000/api/campaigns/ID -H "Content-Type: application/json" -d '{"status":"cancelada"}'
```
Expected: returns the row with `status:"cancelada"`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): single campaign get + patch (cancel/edit)"
```

---

## Phase 5 — UI shell and shared components

### Task 5.1: App shell (sidebar + layout)

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Logo.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Logo component**

```tsx
// src/components/Logo.tsx
export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1">
      <svg viewBox="0 0 48 48" className="w-6 h-6">
        <path d="M24 3 L40 45 L24 34 L8 45 Z" fill="#2E6BFF" />
        <path d="M24 3 L24 34 L8 45 Z" fill="#0147FF" />
      </svg>
      <b className="font-display font-bold tracking-[0.14em] text-[18px]">INVT</b>
    </div>
  );
}
```

- [ ] **Step 2: Sidebar component**

```tsx
// src/components/Sidebar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const items = [
  { href: '/campanhas', label: 'Campanhas', icon: '📣' },
  { href: '/grupos', label: 'Grupos', icon: '👥' },
  { href: '/publicos', label: 'Públicos', icon: '⭐' },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-gradient-to-b from-[#080C18] to-[#05080F] p-4 flex flex-col gap-6 min-h-screen">
      <Logo />
      <nav className="flex flex-col gap-1">
        {items.map((it) => {
          const active = path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                active ? 'bg-blue/15 text-ink' : 'text-muted hover:bg-white/5 hover:text-ink'
              }`}>
              <span>{it.icon}</span> {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Root layout**

```tsx
// src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = { title: 'INVT Disparador' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Home redirect**

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/campanhas'); }
```

- [ ] **Step 5: Verify it renders**

Run `npm run dev`, open `http://localhost:3000`. Expected: redirects to `/campanhas` (blank page for now) with the sidebar + INVT logo visible.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): app shell with sidebar and brand logo"
```

### Task 5.2: Status chip + formatting helpers

**Files:**
- Create: `src/components/StatusChip.tsx`
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

- [ ] **Step 1: Write the failing test for date formatting**

```ts
// src/lib/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatWhen } from './format';

describe('formatWhen', () => {
  it('returns "—" for null', () => {
    expect(formatWhen(null)).toBe('—');
  });
  it('formats an ISO date as dd/MM HH:mm', () => {
    expect(formatWhen('2026-10-12T09:00:00-03:00')).toBe('12/10 09:00');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement**

```ts
// src/lib/format.ts
export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS. (Note: uses the machine's local timezone; run the app in America/Sao_Paulo.)

- [ ] **Step 5: StatusChip component**

```tsx
// src/components/StatusChip.tsx
import type { CampaignStatus } from '@/lib/types';

const map: Record<CampaignStatus, { label: string; cls: string }> = {
  rascunho:  { label: 'Rascunho',  cls: 'bg-muted/15 text-[#c3cbe0]' },
  agendada:  { label: 'Agendada',  cls: 'bg-blue2/15 text-[#9cc0ff]' },
  enviando:  { label: 'Enviando…', cls: 'bg-orange/15 text-[#ffb183]' },
  enviada:   { label: 'Enviada',   cls: 'bg-green/10 text-[#7effcf]' },
  cancelada: { label: 'Cancelada', cls: 'bg-muted/15 text-muted' },
  erro:      { label: 'Erro',      cls: 'bg-orange/15 text-[#ffb183]' },
};

export function StatusChip({ status, detail }: { status: CampaignStatus; detail?: string }) {
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
      {s.label}{detail ? ` ${detail}` : ''}
    </span>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): status chip + date formatting (TDD)"
```

---

## Phase 6 — Grupos page

### Task 6.1: Grupos list + add form

**Files:**
- Create: `src/app/grupos/page.tsx`
- Create: `src/app/grupos/GroupsClient.tsx`

- [ ] **Step 1: Server page fetches groups**

```tsx
// src/app/grupos/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { GroupsClient } from './GroupsClient';
import type { Group } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function GruposPage() {
  const supabase = createServerClient();
  const { data } = await supabase.from('groups').select('*').order('criado_em', { ascending: false });
  return <GroupsClient initial={(data ?? []) as Group[]} />;
}
```

- [ ] **Step 2: Client component with add form**

```tsx
// src/app/grupos/GroupsClient.tsx
'use client';
import { useState } from 'react';
import type { Group } from '@/lib/types';

export function GroupsClient({ initial }: { initial: Group[] }) {
  const [groups, setGroups] = useState(initial);
  const [groupId, setGroupId] = useState('');
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    setSaving(true);
    const res = await fetch('/api/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, nome }),
    });
    setSaving(false);
    if (res.ok) {
      const g = await res.json();
      setGroups([g, ...groups]);
      setGroupId(''); setNome('');
    } else {
      alert((await res.json()).error ?? 'Erro ao salvar');
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Grupos</h1>
      <p className="text-muted text-sm mb-6">Cadastre cada grupo uma vez (cole o ID do grupo) para usar nas campanhas.</p>

      <div className="bg-surface border border-border rounded-xl2 p-5 mb-6 flex gap-3 items-end flex-wrap">
        <label className="flex-1 min-w-[220px] text-sm">
          <span className="block mb-2 font-semibold">ID do grupo (Z-API)</span>
          <input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="120363...-group"
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-3 text-sm" />
        </label>
        <label className="flex-1 min-w-[220px] text-sm">
          <span className="block mb-2 font-semibold">Nome amigável</span>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Clientes Turma 12"
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-3 text-sm" />
        </label>
        <button onClick={add} disabled={saving || !groupId || !nome}
          className="bg-blue text-white px-5 py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
          {saving ? 'Salvando…' : '＋ Adicionar'}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl2 overflow-hidden">
        {groups.length === 0 && <div className="p-5 text-muted text-sm">Nenhum grupo cadastrado ainda.</div>}
        {groups.map(g => (
          <div key={g.id} className="flex items-center gap-3 px-4 py-3 border-t border-border first:border-t-0">
            <div className="flex-1">
              <div className="text-sm font-medium">{g.nome}</div>
              <div className="text-muted text-xs mt-0.5">{g.group_id}</div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full ${g.ativo ? 'text-green border border-green/30' : 'text-muted border border-border'}`}>
              {g.ativo ? 'ativo' : 'inativo'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open `http://localhost:3000/grupos`. Add a group with a fake ID + name. Expected: it appears in the list immediately and persists after refresh.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): grupos page (list + add)"
```

---

## Phase 7 — Campanhas painel (agenda)

### Task 7.1: Campaign row component

**Files:**
- Create: `src/components/CampaignRow.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/CampaignRow.tsx
import type { Campaign } from '@/lib/types';
import { StatusChip } from './StatusChip';
import { formatWhen } from '@/lib/format';

const typeIcon: Record<string, string> = { texto: '💬', imagem: '🖼️', video: '🎬', pdf: '📄' };

export function CampaignRow({ c }: { c: Campaign }) {
  const detail = c.status === 'enviando' && c.resultado
    ? `${c.resultado.enviados}/${c.resultado.total}` : undefined;
  return (
    <div className="grid grid-cols-[2.4fr_1.3fr_1fr_0.7fr] gap-3 items-center px-4 py-4 border-t border-border first:border-t-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg border border-border bg-surface2 flex items-center justify-center text-base">
          {typeIcon[c.tipo] ?? '💬'}
        </div>
        <div>
          <div className="font-semibold text-sm">{c.nome}</div>
          <div className="text-muted text-xs mt-0.5 capitalize">{c.tipo}{c.mencionar_todos ? ' · menção a todos' : ''}</div>
        </div>
      </div>
      <div className="text-sm">{formatWhen(c.enviar_em)}</div>
      <div className="text-sm text-ink">Todos <span className="text-muted text-xs">· grupos ativos</span></div>
      <div><StatusChip status={c.status} detail={detail} /></div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(ui): campaign row component"
```

### Task 7.2: Painel page with tabs

**Files:**
- Create: `src/app/campanhas/page.tsx`
- Create: `src/app/campanhas/CampaignsClient.tsx`

- [ ] **Step 1: Server page fetches all campaigns**

```tsx
// src/app/campanhas/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { CampaignsClient } from './CampaignsClient';
import type { Campaign } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CampanhasPage() {
  const supabase = createServerClient();
  const { data } = await supabase.from('campaigns').select('*').order('enviar_em', { ascending: true });
  return <CampaignsClient initial={(data ?? []) as Campaign[]} />;
}
```

- [ ] **Step 2: Client component with tabs + "Nova campanha" button**

```tsx
// src/app/campanhas/CampaignsClient.tsx
'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Campaign, CampaignStatus } from '@/lib/types';
import { CampaignRow } from '@/components/CampaignRow';

type Tab = 'agendadas' | 'historico' | 'rascunhos';
const tabFilter: Record<Tab, (s: CampaignStatus) => boolean> = {
  agendadas: (s) => s === 'agendada' || s === 'enviando',
  historico: (s) => s === 'enviada' || s === 'erro' || s === 'cancelada',
  rascunhos: (s) => s === 'rascunho',
};

export function CampaignsClient({ initial }: { initial: Campaign[] }) {
  const [tab, setTab] = useState<Tab>('agendadas');
  const rows = useMemo(() => initial.filter(c => tabFilter[tab](c.status)), [initial, tab]);

  return (
    <div>
      <div className="flex justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Campanhas</h1>
          <p className="text-muted text-sm mt-1.5">Crie disparos pontuais para os grupos e acompanhe o que já saiu.</p>
        </div>
        <Link href="/campanhas/nova" className="bg-blue text-white px-4.5 py-3 rounded-xl font-semibold text-sm shadow-[0_6px_20px_rgba(1,71,255,.35)]">
          ＋ Nova campanha
        </Link>
      </div>

      <div className="flex gap-1.5 border-b border-border mb-3.5">
        {(['agendadas', 'historico', 'rascunhos'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3.5 py-2.5 font-semibold text-sm border-b-2 -mb-px capitalize ${
              tab === t ? 'text-ink border-blue' : 'text-muted border-transparent'
            }`}>{t}</button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl2 overflow-hidden">
        {rows.length === 0 && <div className="p-6 text-muted text-sm">Nada por aqui ainda.</div>}
        {rows.map(c => <CampaignRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open `http://localhost:3000/campanhas`. Expected: the test campaign created earlier appears under "Agendadas". Tabs switch the list.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): campaigns panel with tabs"
```

---

## Phase 8 — Nova campanha (composer)

### Task 8.1: WhatsApp preview component

**Files:**
- Create: `src/components/WhatsAppPreview.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/WhatsAppPreview.tsx
import type { CampaignType } from '@/lib/types';

export function WhatsAppPreview({
  tipo, mensagem, midiaUrl, mencionarTodos,
}: { tipo: CampaignType; mensagem: string; midiaUrl: string | null; mencionarTodos: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-2.5">Prévia no WhatsApp</div>
      <div className="rounded-[22px] overflow-hidden border border-border shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        <div className="bg-[#1f2c34] flex items-center gap-2.5 px-3.5 py-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue to-bg flex items-center justify-center">
            <svg viewBox="0 0 48 48" className="w-4 h-4"><path d="M24 5 L39 44 L24 34 L9 44 Z" fill="#fff" /></svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#e9edef]">Clientes INVT — Turma 12</div>
            <div className="text-[11px] text-[#8696a0]">você, +47 participantes</div>
          </div>
        </div>
        <div className="p-4 min-h-[320px] bg-[#0b141a]">
          <div className="bg-[#005c4b] text-[#e9edef] rounded-[10px] rounded-tr-[2px] px-2 pt-1.5 pb-2 max-w-[86%] ml-auto text-[13.5px] leading-relaxed">
            {tipo !== 'texto' && midiaUrl && (
              <div className="rounded-md overflow-hidden mb-1.5">
                {tipo === 'imagem'
                  ? <img src={midiaUrl} alt="" className="block w-full" />
                  : <div className="bg-black/40 text-center py-6 text-xs">{tipo === 'video' ? '🎬 vídeo' : '📄 documento'}</div>}
              </div>
            )}
            {mencionarTodos && <span className="text-[#53bdeb]">@todos </span>}
            {mensagem || <span className="text-[#8fb9ae]">sua mensagem…</span>}
            <div className="text-[10px] text-[#8fb9ae] text-right mt-1">agora ✓✓</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(ui): WhatsApp preview component"
```

### Task 8.2: Composer page

**Files:**
- Create: `src/app/campanhas/nova/page.tsx`

- [ ] **Step 1: Implement the composer (client component)**

```tsx
// src/app/campanhas/nova/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CampaignType } from '@/lib/types';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { validateCampaign, type CampaignDraft } from '@/lib/validation';
import { estimateDuration, formatDuration } from '@/lib/message';

const GROUP_COUNT_HINT = 18; // display only; the n8n dispatcher uses the real active count

export default function NovaCampanha() {
  const router = useRouter();
  const [tipo, setTipo] = useState<CampaignType>('texto');
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [midiaUrl, setMidiaUrl] = useState<string | null>(null);
  const [mencionar, setMencionar] = useState(false);
  const [agendar, setAgendar] = useState(true);
  const [enviarEm, setEnviarEm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const est = estimateDuration(GROUP_COUNT_HINT);

  async function uploadFile(file: File) {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (res.ok) setMidiaUrl((await res.json()).url);
    else alert('Falha no upload');
  }

  async function submit(asDraft: boolean) {
    const draft: CampaignDraft = {
      nome, tipo, mensagem, midia_url: midiaUrl, mencionar_todos: mencionar,
      agendar, enviar_em: agendar && enviarEm ? new Date(enviarEm).toISOString() : null,
    };
    if (!asDraft) {
      const errs = validateCampaign(draft, new Date());
      if (errs.length) { setErrors(Object.fromEntries(errs.map(e => [e.field, e.message]))); return; }
    }
    setErrors({});
    setBusy(true);
    const res = await fetch('/api/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft, asDraft, audience_id: null }),
    });
    setBusy(false);
    if (res.ok) router.push('/campanhas');
    else alert('Erro ao salvar');
  }

  return (
    <div>
      <div className="text-muted text-sm mb-1.5">Campanhas / <b className="text-ink">Nova campanha</b></div>
      <h1 className="font-display text-2xl font-semibold mb-6">Nova campanha</h1>

      <div className="grid grid-cols-[1fr_380px] gap-7 items-start">
        <div className="bg-surface border border-border rounded-xl2 p-6 space-y-5">
          <Field label="Nome da campanha" error={errors.nome}>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-3 text-sm" />
          </Field>

          <Field label="Tipo de conteúdo">
            <div className="flex gap-2">
              {(['texto', 'imagem', 'video', 'pdf'] as CampaignType[]).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize border ${
                    tipo === t ? 'border-blue bg-blue/15 text-ink' : 'border-border bg-surface2 text-muted'
                  }`}>{t === 'texto' ? 'só texto' : t}</button>
              ))}
            </div>
          </Field>

          {tipo !== 'texto' && (
            <Field label="Mídia" error={errors.midia_url}>
              <input type="file" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}
                className="block w-full text-sm text-muted" />
              {midiaUrl && <div className="text-green text-xs mt-2">✓ enviada</div>}
            </Field>
          )}

          <Field label="Mensagem  ·  use {{data}} se quiser" error={errors.mensagem}>
            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={4}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-3 text-sm resize-y" />
          </Field>

          <label className="flex items-center justify-between bg-surface2 border border-border rounded-xl px-3.5 py-3">
            <span className="text-sm font-semibold">Mencionar todos</span>
            <input type="checkbox" checked={mencionar} onChange={e => setMencionar(e.target.checked)} />
          </label>

          <Field label="Agendamento" error={errors.enviar_em}>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setAgendar(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${agendar ? 'border-blue bg-blue/15 text-ink' : 'border-border bg-surface2 text-muted'}`}>Agendar</button>
              <button onClick={() => setAgendar(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${!agendar ? 'border-blue bg-blue/15 text-ink' : 'border-border bg-surface2 text-muted'}`}>Enviar agora</button>
            </div>
            {agendar && (
              <input type="datetime-local" value={enviarEm} onChange={e => setEnviarEm(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-3 py-3 text-sm" />
            )}
          </Field>

          <div className="text-[12.5px] text-[#b9c6e6] bg-blue/8 border border-blue2/30 rounded-xl px-3.5 py-3">
            ⏱️ Envio com 8–15s entre grupos (anti-bloqueio). ~{GROUP_COUNT_HINT} grupos ≈ {formatDuration(est.minSec)}–{formatDuration(est.maxSec)}.
          </div>

          <div className="flex gap-3">
            <button onClick={() => submit(false)} disabled={busy}
              className="bg-blue text-white px-5 py-3 rounded-xl font-semibold text-sm">
              {agendar ? '📅 Agendar campanha' : '🚀 Enviar agora'}
            </button>
            <button onClick={() => submit(true)} disabled={busy}
              className="border border-border px-5 py-3 rounded-xl font-semibold text-sm">Salvar rascunho</button>
          </div>
        </div>

        <div className="sticky top-6">
          <WhatsAppPreview tipo={tipo} mensagem={mensagem} midiaUrl={midiaUrl} mencionarTodos={mencionar} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2">{label}</label>
      {children}
      {error && <div className="text-orange text-xs mt-1.5">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify end-to-end (app-only)**

Open `http://localhost:3000/campanhas/nova`. Fill name + message, pick "Enviar agora", click the button. Expected: redirects to `/campanhas` and the new campaign shows under "Agendadas". Try image type without a file → inline validation error appears.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): nova campanha composer with live preview"
```

### Task 8.3: Públicos page (minimal)

**Files:**
- Create: `src/app/publicos/page.tsx`
- Create: `src/app/publicos/AudiencesClient.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/publicos/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { AudiencesClient } from './AudiencesClient';
import type { Audience, Group } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PublicosPage() {
  const supabase = createServerClient();
  const [{ data: auds }, { data: groups }] = await Promise.all([
    supabase.from('audiences').select('*').order('criado_em', { ascending: false }),
    supabase.from('groups').select('*').eq('ativo', true).order('nome'),
  ]);
  return <AudiencesClient initial={(auds ?? []) as Audience[]} groups={(groups ?? []) as Group[]} />;
}
```

- [ ] **Step 2: Client component (create manual/todos audience)**

```tsx
// src/app/publicos/AudiencesClient.tsx
'use client';
import { useState } from 'react';
import type { Audience, Group } from '@/lib/types';

export function AudiencesClient({ initial, groups }: { initial: Audience[]; groups: Group[] }) {
  const [auds, setAuds] = useState(initial);
  const [nome, setNome] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  async function save() {
    const tipo = selected.length ? 'manual' : 'todos';
    const res = await fetch('/api/audiences', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, tipo, group_ids: selected }),
    });
    if (res.ok) { setAuds([await res.json(), ...auds]); setNome(''); setSelected([]); }
    else alert('Erro ao salvar');
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Públicos salvos</h1>
      <p className="text-muted text-sm mb-6">Conjuntos de grupos que você reusa nas campanhas.</p>

      <div className="bg-surface border border-border rounded-xl2 p-5 mb-6">
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do público (ex.: Grupos VIP)"
          className="w-full bg-surface2 border border-border rounded-xl px-3 py-3 text-sm mb-3" />
        <div className="text-xs text-muted mb-2">Marque os grupos (nenhum marcado = todos os ativos):</div>
        <div className="max-h-52 overflow-auto border border-border rounded-xl mb-3">
          {groups.map(g => (
            <label key={g.id} className="flex items-center gap-3 px-3 py-2.5 border-t border-border first:border-t-0 text-sm">
              <input type="checkbox" checked={selected.includes(g.group_id)} onChange={() => toggle(g.group_id)} />
              {g.nome} <span className="text-muted text-xs">{g.group_id}</span>
            </label>
          ))}
        </div>
        <button onClick={save} disabled={!nome}
          className="bg-blue text-white px-5 py-3 rounded-xl font-semibold text-sm disabled:opacity-50">💾 Salvar público</button>
      </div>

      <div className="bg-surface border border-border rounded-xl2 overflow-hidden">
        {auds.map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-t border-border first:border-t-0">
            <div className="flex-1 text-sm font-medium">{a.nome}</div>
            <span className="text-muted text-xs">{a.tipo === 'todos' ? 'todos os grupos' : `${a.group_ids?.length ?? 0} grupos`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open `/publicos`, create "Grupos VIP" with 0 selected → saved as "todos"; create another with some selected → shows count. Both persist on refresh.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): publicos (audiences) page"
```

---

## Phase 9 — Deploy the app

### Task 9.1: Ship to Vercel

- [ ] **Step 1: Push to a Git remote**

Create a private GitHub repo and push:
```bash
git remote add origin <your-repo-url>
git push -u origin main
```

- [ ] **Step 2: Import in Vercel**

Vercel → New Project → import the repo. Add Environment Variables (Production + Preview):
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MEDIA_BUCKET=campanhas-midia`.

- [ ] **Step 3: Deploy and smoke test**

After deploy, open the production URL → `/grupos`, add a group; `/campanhas/nova`, create a "send now" text campaign. Expected: it appears under Agendadas. (It won't dispatch yet — that's Phase 10–11.)

---

## Phase 10 — n8n: extend the SUB to accept `group_ids` and image/PDF

> Work on a **copy** first. In n8n, duplicate `[SUB] Enviar para Grupos (Z-API)`, verify, then swap.

### Task 10.1: Accept `group_ids` from the caller

**Files:**
- Modify (n8n): node **"Expandir Grupos"** (Code) in the SUB workflow.

- [ ] **Step 1: Replace the "Expandir Grupos" code with this**

```js
const cfg = $('Config').first().json;
const msg = $('Entrada').first().json;

function ehAtivo(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return ['sim', 's', 'yes', 'y', 'true', '1', 'x', 'ativo'].includes(s);
}

let grupos;
if (Array.isArray(msg.group_ids) && msg.group_ids.length) {
  // Caller (site campaigns) passed explicit group IDs — use them, ignore the sheet.
  grupos = msg.group_ids
    .map(id => ({ group_id: String(id).trim(), nome: '' }))
    .filter(g => g.group_id && !g.group_id.includes(' '));
} else {
  // Fixed cadences: read all active groups from the sheet as before.
  const linhas = $input.all().map(i => i.json);
  grupos = linhas
    .filter(g => {
      const id = String(g.group_id == null ? '' : g.group_id).trim();
      return id && !id.includes(' ') && ehAtivo(g.ativo);
    })
    .map(g => ({ group_id: String(g.group_id).trim(), nome: g.nome || '' }));
}

if (!grupos.length) throw new Error('Nenhum grupo para enviar (group_ids vazio e nenhum ativo na planilha).');
if (!msg.texto) throw new Error('Nenhum texto recebido do chamador.');

const mencionar = msg.mencionar_todos === true || String(msg.mencionar_todos).trim().toLowerCase() === 'sim';

return grupos.map(g => ({
  json: {
    group_id: g.group_id,
    grupo_nome: g.nome,
    texto: msg.texto,
    tipo: (msg.tipo || 'texto').trim().toLowerCase(),
    midia_url: msg.midia_url || '',
    mencionar_todos: mencionar,
    slot: msg.slot || '',
    zapiBase: cfg.zapiBase,
    delayMin: Number(cfg.delayMin || 8),
    delayMax: Number(cfg.delayMax || 15),
  },
}));
```

- [ ] **Step 2: Verify group_ids path**

In the SUB, click "Execute Workflow" with pinned input:
```json
{ "texto": "teste group_ids", "tipo": "texto", "midia_url": "", "mencionar_todos": "nao",
  "group_ids": ["SEU_GROUP_ID_DE_TESTE"] }
```
Expected: "Expandir Grupos" outputs exactly 1 item for your test group; the message arrives only in that group.

### Task 10.2: Support imagem and PDF in "Montar Payload"

**Files:**
- Modify (n8n): node **"Montar Payload"** (Code) in the SUB workflow.

- [ ] **Step 1: Replace the payload builder with this**

```js
const item = $('Loop Grupos').first().json;
const meta = $input.first().json || {};

let mentioned = [];
if (item.mencionar_todos && Array.isArray(meta.participants)) {
  mentioned = meta.participants.map(p => String(p.phone || '').replace(/\D/g, '')).filter(Boolean);
}

const base = item.zapiBase;
let url, body;
const hasMedia = !!item.midia_url;

if (item.tipo === 'video' && hasMedia) {
  url = base + '/send-video';
  body = { phone: item.group_id, video: item.midia_url, caption: item.texto };
} else if (item.tipo === 'imagem' && hasMedia) {
  url = base + '/send-image';
  body = { phone: item.group_id, image: item.midia_url, caption: item.texto };
} else if (item.tipo === 'pdf' && hasMedia) {
  url = base + '/send-document/pdf';
  body = { phone: item.group_id, document: item.midia_url, fileName: 'documento.pdf', caption: item.texto };
} else {
  url = base + '/send-text';
  body = { phone: item.group_id, message: item.texto };
}
if (mentioned.length) body.mentioned = mentioned;

const min = item.delayMin, max = item.delayMax;
const delay = Math.floor(Math.random() * (max - min + 1)) + min;

return [{ json: { grupo_nome: item.grupo_nome, group_id: item.group_id, slot: item.slot, url, body, delay, mencionados: mentioned.length } }];
```

- [ ] **Step 2: Verify each media type**

Run the SUB with pinned input for `tipo:"imagem"` + a public `midia_url` (use a URL from your Supabase bucket) and `group_ids:["TEST"]`. Expected: the image arrives in the test group with the caption. Repeat for `video` and `pdf`.

- [ ] **Step 3: Swap the copy into place**

Once both paths verified, apply the same two Code changes to the real `[SUB] Enviar para Grupos (Z-API)` (id `kEPapZTa9tcUSKgH`). Re-run the fixed cadences once (or pin-test them) to confirm they still work with **no** `group_ids` (sheet path).

---

## Phase 11 — n8n: "Campanhas Avulsas" dispatcher

### Task 11.1: Create the dispatcher workflow

**Files:**
- Create (n8n): workflow **"Campanhas Avulsas (Supabase → SUB)"**.

Build these nodes (left to right). Where a header uses the service key, set it in the **Config** node and reference it; ideally move to n8n credentials later.

- [ ] **Step 1: Schedule Trigger**

Type: Schedule Trigger. Rule: every **3 minutes**.

- [ ] **Step 2: Config (Set)**

Assignments (string): `supabaseUrl` = `https://YOUR_PROJECT.supabase.co` · `supabaseKey` = `YOUR_SERVICE_ROLE_KEY` · `subWorkflowId` = `kEPapZTa9tcUSKgH`.

- [ ] **Step 3: HTTP Request "Buscar campanhas due"**

- Method: GET
- URL: `={{ $json.supabaseUrl }}/rest/v1/campaigns?select=*,audiences(*)&status=eq.agendada&enviar_em=lte.{{ $now.toUTC().toISO() }}`
- Send Headers → add two: `apikey` = `={{ $json.supabaseKey }}` and `Authorization` = `=Bearer {{ $json.supabaseKey }}`
- On the node, "Always Output Data" on. (Returns `[]` when nothing is due.)

- [ ] **Step 4: HTTP Request "Buscar grupos ativos"**

- Method: GET
- URL: `={{ $('Config').first().json.supabaseUrl }}/rest/v1/groups?select=group_id&ativo=eq.true`
- Same two headers as Step 3.
- (Runs once; used to resolve "todos".)

- [ ] **Step 5: Code "Preparar lote"**

```js
const campaigns = $('Buscar campanhas due').all().map(i => i.json).filter(c => c && c.id);
const allGroupIds = $('Buscar grupos ativos').all().map(i => i.json.group_id).filter(Boolean);

return campaigns.map(c => {
  const aud = c.audiences; // embedded row or null
  const group_ids = (aud && aud.tipo === 'manual' && Array.isArray(aud.group_ids) && aud.group_ids.length)
    ? aud.group_ids
    : allGroupIds;
  return { json: {
    id: c.id, texto: c.mensagem, tipo: c.tipo, midia_url: c.midia_url || '',
    mencionar_todos: c.mencionar_todos ? 'sim' : 'nao', group_ids,
    supabaseUrl: $('Config').first().json.supabaseUrl,
    supabaseKey: $('Config').first().json.supabaseKey,
  } };
});
```

- [ ] **Step 6: SplitInBatches "Loop Campanhas"** (batch size 1)

- [ ] **Step 7: HTTP Request "Marcar enviando"** (guarded)

- Method: PATCH
- URL: `={{ $json.supabaseUrl }}/rest/v1/campaigns?id=eq.{{ $json.id }}&status=eq.agendada`
- Headers: `apikey`, `Authorization: Bearer …`, `Prefer: return=representation`
- Body (JSON): `{ "status": "enviando", "resultado": { "total": {{ $json.group_ids.length }}, "enviados": 0, "falhas": 0 } }`
- The `&status=eq.agendada` filter makes this a no-op if another run already grabbed it (idempotency).

- [ ] **Step 8: Execute Workflow "Enviar para Grupos"**

- Workflow: id from `subWorkflowId` (`kEPapZTa9tcUSKgH`)
- Options: **Wait for sub-workflow completion** = true
- Input: passes the current item (which already has `texto, tipo, midia_url, mencionar_todos, group_ids`).

- [ ] **Step 9: HTTP Request "Marcar enviada"**

- Method: PATCH
- URL: `={{ $('Loop Campanhas').first().json.supabaseUrl }}/rest/v1/campaigns?id=eq.{{ $('Loop Campanhas').first().json.id }}`
- Headers: `apikey`, `Authorization`, `Prefer: return=representation`
- Body (JSON):
```json
{ "status": "enviada",
  "enviado_em": "={{ $now.toUTC().toISO() }}",
  "resultado": { "total": {{ $('Loop Campanhas').first().json.group_ids.length }},
                 "enviados": {{ $('Loop Campanhas').first().json.group_ids.length }},
                 "falhas": 0 } }
```

- [ ] **Step 10: Wire the loop**

Connect: Trigger → Config → Buscar campanhas due → Buscar grupos ativos → Preparar lote → Loop Campanhas. From Loop Campanhas (main output) → Marcar enviando → Execute Workflow → Marcar enviada → back into Loop Campanhas. Leave the SplitInBatches "done" output unconnected (ends the run).

- [ ] **Step 11: Error handling — mark `erro`**

On the "Execute Workflow" node set **Settings → On Error → Continue (using error output)**, and from its error output add an HTTP Request "Marcar erro": PATCH the campaign `id` with body `{ "status": "erro", "resultado": { "total": {{ ... group_ids.length }}, "enviados": 0, "falhas": {{ ... group_ids.length }}, "erro": "falha no envio" } }`, then connect back into the loop.

### Task 11.2: End-to-end verification

- [ ] **Step 1: Seed a real send-now campaign**

In the deployed site: `/grupos` add your real test group; `/campanhas/nova` create a **text** "Enviar agora" campaign.

- [ ] **Step 2: Run the dispatcher once**

In n8n, open "Campanhas Avulsas" and click **Execute Workflow** (don't wait for the 3-min cron).
Expected: the campaign row in Supabase flips `agendada → enviando → enviada`; the message arrives in the test group; the site `/campanhas` shows it under **Histórico**.

- [ ] **Step 3: Verify scheduling**

Create an "Agendar" campaign 4 minutes out. Activate the workflow (toggle **Active**). Wait for the cron.
Expected: it sends within ~3 min of the scheduled time and moves to Histórico.

- [ ] **Step 4: Verify media**

Create an **imagem** campaign (upload a file), send now, run dispatcher. Expected: image + caption arrives in the group.

---

## Self-review checklist (done during authoring)

- **Spec coverage:** campanhas avulsas (compose/schedule/media/preview) → Phase 8; agenda+histórico → Phase 7; públicos salvos + manual → Phase 8.3; grupos cadastrados no site → Phase 6; Supabase store → Phases 1–4; n8n dispatcher + SUB `group_ids` + image/PDF → Phases 10–11; throttling reused (SUB) → Phase 10; login postponed → not built (as decided). Recurring "read-only" rows in the panel are **not** implemented in this plan (spec open-question #2, deferred) — the panel shows only site-managed campaigns for v1.
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `CampaignDraft`, `CampaignRow`, `Campaign`, `validateCampaign`, `buildCampaignRow`, `estimateDuration/formatDuration`, `formatWhen` used consistently across API routes and UI.

## Deferred (not in this plan, by design)

- Login/auth (decided: postponed).
- Recurring cadences shown read-only in the panel (spec open-question #2).
- Edit-in-place of a scheduled campaign (only cancel is wired; PATCH endpoint exists for a future edit screen).
- Per-group delivery detail (aggregate counts only for v1).

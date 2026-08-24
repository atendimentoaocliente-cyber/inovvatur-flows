import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import type { ValidationError } from '@/lib/validation';

const TIPOS = ['texto', 'imagem', 'video', 'pdf'];
const HHMM = /^\d{2}:\d{2}$/;

// Valida a lista de passos vinda do builder antes de persistir no jsonb.
function validateSteps(steps: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(steps)) {
    errors.push({ field: 'steps', message: 'steps deve ser uma lista.' });
    return errors;
  }
  steps.forEach((raw, i) => {
    const s = raw as Record<string, unknown>;
    const at = (f: string) => `steps[${i}].${f}`;
    if (!s || typeof s !== 'object') {
      errors.push({ field: `steps[${i}]`, message: 'Passo inválido.' });
      return;
    }
    if (typeof s.dia_offset !== 'number' || !Number.isInteger(s.dia_offset) || s.dia_offset > 0) {
      errors.push({ field: at('dia_offset'), message: 'dia_offset deve ser inteiro ≤ 0.' });
    }
    if (s.hora_tipo !== 'fixo' && s.hora_tipo !== 'relativo') {
      errors.push({ field: at('hora_tipo'), message: "hora_tipo deve ser 'fixo' ou 'relativo'." });
    } else if (s.hora_tipo === 'fixo') {
      if (typeof s.hora_fixa !== 'string' || !HHMM.test(s.hora_fixa)) {
        errors.push({ field: at('hora_fixa'), message: 'hora_fixa deve ser HH:MM.' });
      }
    } else {
      if (typeof s.offset_min !== 'number' || !Number.isInteger(s.offset_min)) {
        errors.push({ field: at('offset_min'), message: 'offset_min deve ser inteiro.' });
      }
    }
    if (typeof s.mensagem !== 'string' || !s.mensagem.trim()) {
      errors.push({ field: at('mensagem'), message: 'Escreva a mensagem do passo.' });
    }
    if (typeof s.tipo !== 'string' || !TIPOS.includes(s.tipo)) {
      errors.push({ field: at('tipo'), message: 'Tipo inválido.' });
    } else if (s.tipo !== 'texto' && !s.midia_url) {
      errors.push({ field: at('midia_url'), message: 'Envie a mídia para este tipo de passo.' });
    }
  });
  return errors;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase.from('sequences').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Sequência não encontrada.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<{ nome?: unknown; steps?: unknown }>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;

  const clean: Record<string, unknown> = {};
  if ('nome' in body) {
    const n = String(body.nome ?? '').trim();
    if (!n) {
      return NextResponse.json({ errors: [{ field: 'nome', message: 'nome não pode ser vazio.' }] }, { status: 400 });
    }
    clean.nome = n;
  }
  if ('steps' in body) {
    const errors = validateSteps(body.steps);
    if (errors.length) return NextResponse.json({ errors }, { status: 400 });
    clean.steps = body.steps;
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
  }
  clean.atualizado_em = new Date().toISOString();

  const supabase = createServerClient();
  const { data, error } = await supabase.from('sequences').update(clean).eq('id', id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Sequência não encontrada.' }, { status: 404 });
  return NextResponse.json(data);
}

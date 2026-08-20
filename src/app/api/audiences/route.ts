import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('audiences').select('*').order('criado_em', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const parsed = await readJson<{ nome?: unknown; tipo?: unknown; group_ids?: unknown }>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
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

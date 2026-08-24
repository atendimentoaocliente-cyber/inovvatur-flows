import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<{ ativo?: unknown; nome?: unknown }>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const clean: Record<string, unknown> = {};
  if ('ativo' in body) clean.ativo = Boolean(body.ativo);
  if ('nome' in body) {
    const n = String(body.nome ?? '').trim();
    if (!n) return NextResponse.json({ error: 'nome não pode ser vazio' }, { status: 400 });
    clean.nome = n;
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase.from('groups').update(clean).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

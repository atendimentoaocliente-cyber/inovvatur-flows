import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<Record<string, unknown>>(req);
  if (!parsed.ok) return parsed.res;
  const patch = parsed.data;
  const allowed = ['nome', 'mensagem', 'midia_url', 'mencionar_todos', 'enviar_em', 'audience_id'];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  // Only cancellation is a client-writable status change; the n8n dispatcher owns enviando/enviada/erro.
  if (patch.status === 'cancelada') clean.status = 'cancelada';
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').update(clean).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

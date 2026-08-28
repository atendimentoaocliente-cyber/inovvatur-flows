import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { parseRecorrencia } from '@/lib/recorrencia-validation';
import { cancelarFuturas, sincronizarFuturas } from '@/lib/recorrencia-refill';
import type { Recorrencia } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase.from('recorrencias').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Recorrência não encontrada.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<Record<string, unknown>>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;

  const supabase = createServerClient();
  const { data: atual, error: readErr } = await supabase
    .from('recorrencias')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!atual) return NextResponse.json({ error: 'Recorrência não encontrada.' }, { status: 404 });

  // Toggle de ativo manda só { ativo }; o form manda o molde inteiro. Mesclar com o
  // atual deixa os dois casos passarem pela mesma validação.
  const { value, errors } = parseRecorrencia({ ...(atual as Record<string, unknown>), ...body });
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  const { data, error } = await supabase
    .from('recorrencias')
    .update(value)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Recorrência não encontrada.' }, { status: 404 });

  // O molde é a verdade para o que ainda não foi enviado.
  const sync = await sincronizarFuturas(supabase, data as Recorrencia);
  if (sync.error) return NextResponse.json({ error: sync.error }, { status: 500 });
  return NextResponse.json({ ...data, criadas: sync.criadas });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();

  // Cancela o que estava agendado antes de apagar o molde: com o molde fora, o
  // recorrencia_id vira null (on delete set null) e essas campanhas ficariam órfãs e ativas.
  const cancelErr = await cancelarFuturas(supabase, id);
  if (cancelErr) return NextResponse.json({ error: cancelErr }, { status: 500 });

  const { error } = await supabase.from('recorrencias').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

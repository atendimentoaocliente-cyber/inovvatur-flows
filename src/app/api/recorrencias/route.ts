import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { parseRecorrencia } from '@/lib/recorrencia-validation';
import { refillRecorrencia } from '@/lib/recorrencia-refill';
import type { Recorrencia } from '@/lib/types';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('recorrencias')
    .select('*')
    .order('criado_em', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const parsed = await readJson<Record<string, unknown>>(req);
  if (!parsed.ok) return parsed.res;

  const { value, errors } = parseRecorrencia(parsed.data);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from('recorrencias').insert(value).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Já materializa o horizonte para a recorrência nova aparecer com datas na lista.
  const refill = await refillRecorrencia(supabase, data as Recorrencia);
  return NextResponse.json({ ...data, criadas: refill.criadas }, { status: 201 });
}

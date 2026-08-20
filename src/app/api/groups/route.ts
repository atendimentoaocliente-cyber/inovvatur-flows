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

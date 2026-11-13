import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Liga/desliga um chat no painel. Desligado não aparece para escolher na campanha. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<{ ativo?: unknown }>(req);
  if (!parsed.ok) return parsed.res;
  if (typeof parsed.data.ativo !== 'boolean') {
    return NextResponse.json({ error: 'ativo precisa ser true ou false.' }, { status: 400 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('telegram_chats')
    .update({ ativo: parsed.data.ativo })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Chat não encontrado.' }, { status: 404 });
  return NextResponse.json(data);
}

/**
 * Tira o chat do painel. Não tira o bot do grupo — isso é no Telegram. Se o bot
 * continuar lá, o chat volta na próxima mudança de permissão.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { error } = await supabase.from('telegram_chats').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { idDaConexaoTelegram } from '@/lib/dispatch/telegram-worker';
import { atualizarChats } from '@/lib/telegram/chats';
import { telegramConfigurado } from '@/lib/telegram/api';

export const dynamic = 'force-dynamic';

/**
 * Os chats onde o bot está, e o id da conexão do bot — o compositor precisa dele
 * para saber se uma campanha é "só de Telegram".
 */
export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('telegram_chats')
    .select('*')
    .order('titulo', { ascending: true });
  if (error) {
    // Migration 0026 ainda não aplicada: o compositor segue funcionando sem Telegram.
    return NextResponse.json({ chats: [], conexao_id: null, erro: error.message });
  }
  return NextResponse.json({
    chats: data ?? [],
    conexao_id: await idDaConexaoTelegram(supabase),
    configurado: telegramConfigurado(),
  });
}

/** "Atualizar": pergunta ao Telegram nome, membros e se o bot continua em cada chat. */
export async function POST() {
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN não configurado.' }, { status: 400 });
  }
  try {
    const r = await atualizarChats(createServerClient());
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

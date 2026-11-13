import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { assinaturaConfere } from '@/lib/seguranca';
import { migrarChat, registrarChat, segredoDoWebhook, type ChatDoTelegram, type MembroBot } from '@/lib/telegram/chats';

export const dynamic = 'force-dynamic';

interface Update {
  my_chat_member?: { chat: ChatDoTelegram; new_chat_member: MembroBot };
  message?: { chat: ChatDoTelegram; migrate_to_chat_id?: number; migrate_from_chat_id?: number };
}

/**
 * O Telegram chama aqui quando o bot entra, sai ou muda de permissão num grupo ou
 * canal (`my_chat_member`), e quando um grupo vira supergrupo (`message` com
 * migrate_*). É isso que faz o chat aparecer sozinho no painel.
 *
 * Depois de conferir o segredo, responde sempre 200: um erro aqui faria o Telegram
 * repetir o mesmo aviso por horas, e o que der errado num aviso não se conserta
 * reenviando-o.
 */
export async function POST(req: Request) {
  const esperado = segredoDoWebhook();
  const recebido = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!esperado || !assinaturaConfere(recebido, esperado)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  try {
    const update = (await req.json()) as Update;
    const supabase = createServerClient();

    if (update.my_chat_member) {
      await registrarChat(supabase, update.my_chat_member.chat, update.my_chat_member.new_chat_member);
    }

    const m = update.message;
    if (m?.migrate_to_chat_id) await migrarChat(supabase, m.chat.id, m.migrate_to_chat_id);
    if (m?.migrate_from_chat_id) await migrarChat(supabase, m.migrate_from_chat_id, m.chat.id);
  } catch (e) {
    console.error('[telegram/webhook]', e);
  }
  return NextResponse.json({ ok: true });
}

/** Conferência de saúde: abrir no navegador mostra que a rota existe. */
export async function GET() {
  return NextResponse.json({ ok: true, rota: 'telegram/webhook' });
}

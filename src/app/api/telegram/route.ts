import { NextResponse } from 'next/server';
import {
  envioTelegramLigado,
  estadoDoWebhook,
  linksDeEntrada,
  registrarWebhook,
  sobreOBot,
  telegramConfigurado,
} from '@/lib/telegram/api';
import { segredoDoWebhook } from '@/lib/telegram/chats';
import { urlPublica, urlPublicaEstavel } from '@/lib/url';

export const dynamic = 'force-dynamic';

function urlDoWebhook(): string {
  return `${urlPublica()}/api/telegram/webhook`;
}

/** Como está o bot: quem é, os links de entrada e se o webhook está apontado para cá. */
export async function GET() {
  if (!telegramConfigurado()) {
    return NextResponse.json({ configurado: false });
  }
  try {
    const [bot, webhook] = await Promise.all([sobreOBot(), estadoDoWebhook()]);
    const esperado = urlDoWebhook();
    return NextResponse.json({
      configurado: true,
      envio_ligado: envioTelegramLigado(),
      bot: { username: bot.username, nome: bot.first_name },
      links: linksDeEntrada(bot.username),
      webhook: {
        conectado: webhook.url === esperado,
        url: webhook.url || null,
        esperado,
        pendentes: webhook.pending_update_count,
        ultimo_erro: webhook.last_error_message ?? null,
      },
      url_estavel: urlPublicaEstavel(),
    });
  } catch (e) {
    return NextResponse.json(
      { configurado: true, erro: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * Aponta o bot para o webhook deste sistema. Sem isso, o bot entra nos grupos mas o
 * painel não fica sabendo. Pode ser chamado de novo sem efeito colateral — o
 * Telegram só troca a URL.
 */
export async function POST() {
  const segredo = segredoDoWebhook();
  if (!segredo) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN não configurado.' }, { status: 400 });
  }
  const url = urlDoWebhook();
  if (!url.startsWith('https://')) {
    return NextResponse.json(
      { error: `O Telegram só chama endereço https. Este sistema está em ${url}.` },
      { status: 400 },
    );
  }
  try {
    await registrarWebhook(url, segredo);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

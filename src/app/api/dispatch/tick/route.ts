import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { rodarWhatsApp } from '@/lib/dispatch/whatsapp-worker';
import { Orcamento } from '@/lib/dispatch/ritmo';
import { motorLigado, origemDoMotor } from '@/lib/dispatch/motor';
import { rodarTelegram } from '@/lib/dispatch/telegram-worker';
import { envioTelegramLigado } from '@/lib/telegram/api';

export const dynamic = 'force-dynamic';

/** Teto de tempo da função na hospedagem (60s é o limite do plano padrão da Vercel). */
export const maxDuration = 60;

/**
 * Quanto o motor pode trabalhar antes de devolver a vez. Fica abaixo de `maxDuration`
 * de propósito: a diferença é a margem para fechar campanhas e responder. Ser cortado
 * no meio não corrompe nada (o estado é a fila), mas deixa linhas em 'enviando' que só
 * voltam para a fila depois de 15 minutos.
 */
const ORCAMENTO_MS = 45_000;

async function executar(req: Request) {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (secret) {
    const header = req.headers.get('x-cron-secret') ?? '';
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const query = new URL(req.url).searchParams.get('secret') ?? '';
    if (header !== secret && bearer !== secret && query !== secret) {
      return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
    }
  }

  const inicio = Date.now();
  const supabase = createServerClient();

  // O Telegram não depende do interruptor do WhatsApp: com o motor da Evolution
  // desligado (quem manda WhatsApp é o n8n), o Telegram continua sendo deste tick.
  // Ele vem primeiro e com metade do tempo, para uma fila grande de WhatsApp não
  // atrasar o Telegram nem o contrário.
  const telegram = envioTelegramLigado()
    ? await rodarTelegram(
        supabase,
        new Orcamento(motorLigado() ? ORCAMENTO_MS / 2 : ORCAMENTO_MS, inicio),
        new Date(),
      ).catch((e) => {
        console.error('[tick] telegram falhou:', e);
        return null;
      })
    : null;

  // 200 em vez de erro: um agendador chamando o motor desligado não é uma falha, e
  // não deve encher log de alerta nem disparar retentativa.
  if (!motorLigado()) {
    return NextResponse.json({
      ok: true,
      motor: 'desligado',
      origem: origemDoMotor(),
      detalhe:
        origemDoMotor() === 'codigo'
          ? 'Desligado no código (lib/dispatch/motor.ts). Quem envia hoje é o n8n + Z-API.'
          : 'Desligado pela variável MOTOR_WHATSAPP. Quem envia hoje é o n8n + Z-API.',
      duracao_ms: Date.now() - inicio,
      restante: telegram?.pendentes ?? 0,
      telegram,
    });
  }

  const orcamento = new Orcamento(ORCAMENTO_MS, inicio);
  const whatsapp = await rodarWhatsApp(supabase, orcamento, new Date()).catch((e) => {
    console.error('[tick] whatsapp falhou:', e);
    return null;
  });

  return NextResponse.json({
    ok: true,
    motor: 'ligado',
    duracao_ms: Date.now() - inicio,
    // > 0 significa que ainda há fila: um agendador esperto pode chamar de novo na
    // hora, em vez de esperar o próximo minuto.
    restante: (whatsapp?.pendentes ?? 0) + (telegram?.pendentes ?? 0),
    whatsapp,
    telegram,
  });
}

export async function POST(req: Request) {
  return executar(req);
}

/** O Vercel Cron chama por GET, então a rota aceita os dois verbos. */
export async function GET(req: Request) {
  return executar(req);
}

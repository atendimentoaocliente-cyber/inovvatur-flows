import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { refillTodas } from '@/lib/recorrencia-refill';

/**
 * Materializa as próximas ocorrências de todas as recorrências ativas.
 * Chamado por um cron diário (Schedule Trigger do n8n ou Vercel Cron) e também
 * pela própria tela de recorrências. Idempotente — rodar de novo não duplica nada.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('x-cron-secret') ?? '';
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (header !== secret && bearer !== secret) {
      return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
    }
  }

  const supabase = createServerClient();
  const result = await refillTodas(supabase);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ criadas: result.criadas, porRecorrencia: result.porRecorrencia });
}

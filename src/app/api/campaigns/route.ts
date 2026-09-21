import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { validateCampaign, type CampaignDraft } from '@/lib/validation';
import { buildCampaignRow } from '@/lib/campaign-row';
import { readJson } from '@/lib/http';

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status');
  const supabase = createServerClient();
  let query = supabase.from('campaigns').select('*').order('enviar_em', { ascending: true });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const parsed = await readJson<{
    draft?: unknown;
    asDraft?: unknown;
    audience_id?: unknown;
    group_ids?: unknown;
    connection_id?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const draft = body.draft as CampaignDraft | undefined;
  if (!draft || typeof draft !== 'object') {
    return NextResponse.json({ error: 'draft é obrigatório' }, { status: 400 });
  }
  if (!['texto', 'imagem', 'video', 'pdf'].includes(draft.tipo)) {
    return NextResponse.json({ errors: [{ field: 'tipo', message: 'Tipo inválido.' }] }, { status: 400 });
  }
  const asDraft = Boolean(body.asDraft);
  const audienceId = (body.audience_id as string | null) ?? null;
  const groupIds = Array.isArray(body.group_ids) ? (body.group_ids as string[]) : null;
  if (!asDraft) {
    const errors = validateCampaign(draft, new Date());
    if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  }
  const row = buildCampaignRow(draft, audienceId, groupIds, new Date(), { asDraft });

  // Por qual motor esta campanha sai. Nulo (o padrão) = n8n + Z-API, como sempre foi.
  // Com um número escolhido, ela passa a ser do motor novo — é o opt-in que deixa os
  // dois conviverem durante o mês de teste.
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id : null;
  const rowComConexao = { ...row, connection_id: connectionId };
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').insert(rowComConexao).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Agendamento no horário exato: avisa o n8n na hora, pra ele esperar até enviar_em.
  // Fire-and-forget — se falhar, o cron dispatcher de 3 min é a rede de segurança.
  if (data?.status === 'agendada' && !connectionId && process.env.N8N_WEBHOOK_URL) {
    fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.id }),
    }).catch(() => {});
  }

  return NextResponse.json(data, { status: 201 });
}

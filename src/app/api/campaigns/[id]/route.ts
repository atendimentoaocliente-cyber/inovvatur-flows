import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { isCategoria } from '@/lib/categories';
import { lerTelegramChatIds } from '@/lib/campaign-row';
import { idDaConexaoTelegram } from '@/lib/dispatch/telegram-worker';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<Record<string, unknown>>(req);
  if (!parsed.ok) return parsed.res;
  const patch = parsed.data;

  // Validate the fields backed by DB constraints, so a bad value is a clean 400, not a raw 500.
  if ('tipo' in patch && !['texto', 'imagem', 'video', 'pdf'].includes(patch.tipo as string)) {
    return NextResponse.json({ errors: [{ field: 'tipo', message: 'Tipo inválido.' }] }, { status: 400 });
  }
  if ('categoria' in patch && !isCategoria(patch.categoria)) {
    return NextResponse.json({ errors: [{ field: 'categoria', message: 'Categoria inválida.' }] }, { status: 400 });
  }
  if (
    'group_ids' in patch &&
    patch.group_ids !== null &&
    !(Array.isArray(patch.group_ids) && patch.group_ids.every((x) => typeof x === 'string'))
  ) {
    return NextResponse.json({ errors: [{ field: 'group_ids', message: 'group_ids inválido.' }] }, { status: 400 });
  }

  const telegramIds = lerTelegramChatIds(patch.telegram_chat_ids);
  if (telegramIds === false) {
    return NextResponse.json({ errors: [{ field: 'telegram', message: 'Lista de chats do Telegram inválida.' }] }, { status: 400 });
  }

  const allowed = ['nome', 'mensagem', 'midia_url', 'mencionar_todos', 'enviar_em', 'audience_id', 'group_ids', 'tipo', 'categoria'];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  if (telegramIds !== undefined) clean.telegram_chat_ids = telegramIds;
  // Client may cancel, or retry (back to agendada). The dispatcher owns enviando/enviada/erro.
  if (patch.status === 'cancelada' || patch.status === 'agendada') clean.status = patch.status;

  const supabase = createServerClient();

  // "Só Telegram" liga e desliga pela conexão do bot (ver migration 0009). Desligar
  // só mexe se a campanha estava NA conexão do bot: uma campanha num número da
  // Evolution continua nele.
  if (typeof patch.sem_whatsapp === 'boolean') {
    const conexaoTelegram = await idDaConexaoTelegram(supabase);
    if (patch.sem_whatsapp) {
      if (!conexaoTelegram) {
        return NextResponse.json({ error: 'O Telegram ainda não foi instalado no banco (migration 0009).' }, { status: 500 });
      }
      clean.connection_id = conexaoTelegram;
    } else if (conexaoTelegram) {
      const { data: atual } = await supabase.from('campaigns').select('connection_id').eq('id', id).maybeSingle();
      if ((atual as { connection_id: string | null } | null)?.connection_id === conexaoTelegram) {
        clean.connection_id = null;
      }
    }
  }

  // Re-armar (agendada de novo) refaz a fila do Telegram: o motor só monta fila de
  // campanha com `telegram_fila_em` nulo, e o resumo antigo deixaria de valer.
  const rearmando = clean.status === 'agendada';
  if (rearmando) {
    clean.telegram_fila_em = null;
    clean.telegram_resultado = null;
  }
  // Atomic guard: never mutate a campaign that is mid-send or already sent. This is what
  // prevents flipping enviando -> agendada/cancelada and re-triggering a duplicate blast.
  const { data, error } = await supabase
    .from('campaigns')
    .update(clean)
    .eq('id', id)
    .not('status', 'in', '("enviando","enviada")')
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'Campanha em envio ou já enviada — não pode ser alterada.' },
      { status: 409 },
    );
  }

  // A fila antiga do Telegram: o que falhou ou foi cancelado volta a valer para os
  // chats que continuam na campanha; o que saiu da lista não sai mais. O que já foi
  // enviado fica como está — refazer não repete mensagem em quem já recebeu.
  if (rearmando) {
    const alvo = (data.telegram_chat_ids as string[] | null) ?? [];
    await supabase
      .from('telegram_envios')
      .update({ status: 'pendente', tentativas: 0, erro: null, liberar_em: null })
      .eq('campaign_id', id)
      .in('status', ['falha', 'cancelado'])
      .in('chat_ref', alvo.length ? alvo : ['00000000-0000-0000-0000-000000000000']);
    let fora = supabase
      .from('telegram_envios')
      .update({ status: 'cancelado' })
      .eq('campaign_id', id)
      .in('status', ['pendente', 'falha']);
    if (alvo.length) fora = fora.not('chat_ref', 'in', `(${alvo.join(',')})`);
    await fora;
  }

  // Retry re-arms the exact-time scheduler, same fire-and-forget pattern as POST.
  // Só campanha sem conexão é do n8n: avisar por uma que tem número (ou que é só de
  // Telegram) faria o n8n mandá-la pela Z-API — e, sem grupos, para todos.
  if (data.status === 'agendada' && !data.connection_id && process.env.N8N_WEBHOOK_URL) {
    fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.id }),
    }).catch(() => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  // Don't delete a campaign that is mid-send — the dispatcher is still writing its result back.
  const { data, error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)
    .neq('status', 'enviando')
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'Não foi possível excluir (campanha em envio ou inexistente).' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

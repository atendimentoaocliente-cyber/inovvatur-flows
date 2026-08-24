import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { isCategoria } from '@/lib/categories';

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

  const allowed = ['nome', 'mensagem', 'midia_url', 'mencionar_todos', 'enviar_em', 'audience_id', 'group_ids', 'tipo', 'categoria'];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  // Client may cancel, or retry (back to agendada). The dispatcher owns enviando/enviada/erro.
  if (patch.status === 'cancelada' || patch.status === 'agendada') clean.status = patch.status;

  const supabase = createServerClient();
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

  // Retry re-arms the exact-time scheduler, same fire-and-forget pattern as POST.
  if (data.status === 'agendada' && process.env.N8N_WEBHOOK_URL) {
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

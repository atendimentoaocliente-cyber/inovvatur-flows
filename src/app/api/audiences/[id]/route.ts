import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Quem depende deste público — o que ainda vai sair E o que já saiu.
 *
 * O histórico conta tanto quanto o futuro, e isso custou caro para aprender: apagar um
 * público com `on delete set null` zera o `audience_id` de TODAS as campanhas que
 * apontavam para ele, inclusive as enviadas há meses. O painel passa a dizer que
 * aquelas campanhas foram para "todos os grupos" quando foram para três. O registro do
 * que foi feito deixa de ser verdade, e não há como reconstruir com certeza depois.
 */
async function emUso(
  supabase: ReturnType<typeof createServerClient>,
  id: string,
): Promise<{ pendentes: number; historico: number; recorrencias: number }> {
  const [{ count: pendentes }, { count: historico }, { count: recorrencias }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('audience_id', id)
      .in('status', ['agendada', 'enviando', 'rascunho']),
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('audience_id', id)
      .in('status', ['enviada', 'cancelada', 'erro']),
    supabase
      .from('recorrencias')
      .select('id', { count: 'exact', head: true })
      .eq('audience_id', id),
  ]);
  return {
    pendentes: pendentes ?? 0,
    historico: historico ?? 0,
    recorrencias: recorrencias ?? 0,
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<{ nome?: unknown; group_ids?: unknown }>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;

  const clean: Record<string, unknown> = {};

  if ('nome' in body) {
    const n = String(body.nome ?? '').trim();
    if (!n) return NextResponse.json({ error: 'O nome não pode ficar vazio.' }, { status: 400 });
    clean.nome = n;
  }

  if ('group_ids' in body) {
    if (body.group_ids !== null && !Array.isArray(body.group_ids)) {
      return NextResponse.json({ error: 'group_ids deve ser uma lista.' }, { status: 400 });
    }
    const lista = (body.group_ids ?? []) as string[];
    // Lista vazia vira o público "todos". Guardar um público manual sem grupo nenhum
    // seria uma campanha que não vai para lugar algum — e o dispatcher trataria como
    // "todos os ativos", que é o oposto do que quem esvaziou a lista quis dizer.
    clean.group_ids = lista.length ? lista : null;
    clean.tipo = lista.length ? 'manual' : 'todos';
  }

  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('audiences')
    .update(clean)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Público não encontrado.' }, { status: 404 });

  // Quem já estava agendado passa a usar a lista nova — é o esperado de "editar o
  // público", e o motivo de existir público salvo. A tela avisa quantos foram afetados.
  const uso = await emUso(supabase, id);
  return NextResponse.json({ ...data, afetadas: uso.pendentes, recorrencias: uso.recorrencias });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();

  // ⚠️ A trava que não pode sair daqui: `audience_id` na campanha é `on delete set
  // null`, e campanha sem público vai para TODOS os grupos ativos. Apagar um público
  // de 3 grupos transformaria, em silêncio, as campanhas agendadas em disparos para
  // 15 grupos. Já aconteceu de uma campanha ir para todo mundo por falta de público.
  const uso = await emUso(supabase, id);

  if (uso.pendentes > 0 || uso.recorrencias > 0) {
    return NextResponse.json(
      {
        error:
          `Em uso por ${uso.pendentes} campanha(s) agendada(s) e ${uso.recorrencias} ` +
          'recorrência(s). Apagar faria esses disparos irem para TODOS os grupos ativos. ' +
          'Troque o público nelas antes de excluir.',
        emUso: uso,
      },
      { status: 409 },
    );
  }

  if (uso.historico > 0) {
    return NextResponse.json(
      {
        error:
          `${uso.historico} campanha(s) já enviada(s) apontam para este público. Apagar ` +
          'apagaria junto o registro de quem recebeu cada uma — o painel passaria a dizer ' +
          'que foram para todos os grupos. Se não usa mais, deixe-o parado: público não ' +
          'dispara nada sozinho.',
        emUso: uso,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('audiences').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

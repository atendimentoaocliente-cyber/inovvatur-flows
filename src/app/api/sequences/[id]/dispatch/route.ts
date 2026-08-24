import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { isCategoria } from '@/lib/categories';
import {
  computeStepEnviarEm,
  renderTemplate,
  formatHora,
  formatData,
  diaSemana,
} from '@/lib/sequence';
import type { Sequence, SequenceStep } from '@/lib/types';

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

interface Aula {
  data: string;
  hora: string;
  tema: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson<{
    aulas?: unknown;
    data?: unknown;
    hora?: unknown;
    tema?: unknown;
    categoria?: unknown;
    audience_id?: unknown;
    group_ids?: unknown;
  }>(req);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;

  // Back-compat: a antiga forma de body { data, hora, tema } (uma aula só) vira
  // aulas:[{data,hora,tema}]. Só entra nesse ramo quando `aulas` não veio no body.
  const rawAulas: unknown[] = Array.isArray(body.aulas)
    ? body.aulas
    : body.data !== undefined || body.hora !== undefined || body.tema !== undefined
      ? [{ data: body.data, hora: body.hora, tema: body.tema }]
      : [];

  const errors: { field: string; message: string }[] = [];
  if (rawAulas.length === 0) {
    errors.push({ field: 'aulas', message: 'Informe ao menos uma aula.' });
  }

  const aulas: Aula[] = rawAulas.map((raw, i) => {
    const a = (raw ?? {}) as { data?: unknown; hora?: unknown; tema?: unknown };
    const data = typeof a.data === 'string' ? a.data : '';
    const hora = typeof a.hora === 'string' ? a.hora : '';
    const tema = typeof a.tema === 'string' ? a.tema.trim() : '';
    if (!DATA_RE.test(data)) {
      errors.push({ field: `aulas[${i}].data`, message: 'Data da aula inválida (YYYY-MM-DD).' });
    }
    if (!HORA_RE.test(hora)) {
      errors.push({ field: `aulas[${i}].hora`, message: 'Hora da aula inválida (HH:MM).' });
    }
    if (!tema) {
      errors.push({ field: `aulas[${i}].tema`, message: 'Informe o tema da aula.' });
    }
    return { data, hora, tema };
  });
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  const supabase = createServerClient();
  const { data: seq, error: seqErr } = await supabase
    .from('sequences')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 });
  if (!seq) return NextResponse.json({ error: 'Sequência não encontrada.' }, { status: 404 });

  const sequence = seq as Sequence;
  const steps: SequenceStep[] = Array.isArray(sequence.steps) ? sequence.steps : [];
  const categoria = isCategoria(body.categoria) ? body.categoria : sequence.categoria;
  const audienceId = (body.audience_id as string | null) ?? null;
  const groupIds =
    Array.isArray(body.group_ids) && body.group_ids.length ? (body.group_ids as string[]) : null;

  const nowMs = Date.now();
  const total = steps.length;

  let puladasTotal = 0;
  const rows: Record<string, unknown>[] = [];
  const porAula: { data: string; tema: string; criadas: number; puladas: number }[] = [];

  for (const aula of aulas) {
    const vars = {
      tema: aula.tema,
      hora: formatHora(aula.hora),
      data: formatData(aula.data),
      diasemana: diaSemana(aula.data),
    };
    let criadasAula = 0;
    let puladasAula = 0;
    for (const step of steps) {
      const enviar_em = computeStepEnviarEm(aula.data, aula.hora, step);
      // Não agenda passo no passado — o cron não reprocessa horários já vencidos.
      if (new Date(enviar_em).getTime() <= nowMs) {
        puladasAula += 1;
        continue;
      }
      rows.push({
        nome: `${sequence.nome} — ${aula.tema} (${step.ordem + 1}/${total})`,
        tipo: step.tipo,
        categoria,
        mensagem: renderTemplate(step.mensagem, vars),
        midia_url: step.midia_url,
        mencionar_todos: step.mencionar_todos,
        audience_id: audienceId,
        group_ids: groupIds,
        enviar_em,
        status: 'agendada',
      });
      criadasAula += 1;
    }
    puladasTotal += puladasAula;
    porAula.push({ data: aula.data, tema: aula.tema, criadas: criadasAula, puladas: puladasAula });
  }

  let criadas: unknown[] = [];
  if (rows.length) {
    const { data: inserted, error } = await supabase.from('campaigns').insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    criadas = inserted ?? [];
  }

  // Não dispara o webhook n8n aqui — o cron dispatcher de 1 min pega as campanhas 'agendada'
  // nos horários certos (mesmo mecanismo dos agendamentos normais).
  return NextResponse.json({ criadas, puladas: puladasTotal, porAula }, { status: 201 });
}

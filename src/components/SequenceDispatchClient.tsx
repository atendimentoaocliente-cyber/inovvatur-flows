'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Audience, Group, Sequence } from '@/lib/types';
import {
  AudiencePicker,
  resolveAudience,
  type AudienceMode,
} from '@/components/AudiencePicker';
import { Field, SegButton, inputCls } from '@/components/ui';
import { CATEGORIAS, categoriaLabel, type CategoriaKey } from '@/lib/categories';
import {
  computeStepEnviarEm,
  renderTemplate,
  formatHora,
  formatData,
  diaSemana,
} from '@/lib/sequence';
import { formatWhen } from '@/lib/format';

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

const tipoBadge: Record<string, string> = {
  texto: '💬 Texto',
  imagem: '🖼️ Imagem',
  video: '🎬 Vídeo',
  pdf: '📄 PDF',
};

export function SequenceDispatchClient({ sequence }: { sequence: Sequence }) {
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [tema, setTema] = useState('');
  const [categoria, setCategoria] = useState<CategoriaKey>(sequence.categoria);

  // Audience picker state (same shape as the composer).
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('todos');
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupQuery, setGroupQuery] = useState('');

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ criadas: number; puladas: number } | null>(null);

  // Fetch audiences + groups on mount so both picker modes are ready.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [audRes, grpRes] = await Promise.allSettled([
        fetch('/api/audiences'),
        fetch('/api/groups'),
      ]);
      if (!alive) return;
      if (audRes.status === 'fulfilled' && audRes.value.ok) {
        setAudiences(((await audRes.value.json().catch(() => [])) as Audience[]) ?? []);
      }
      if (grpRes.status === 'fulfilled' && grpRes.value.ok) {
        setGroups(((await grpRes.value.json().catch(() => [])) as Group[]) ?? []);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const steps = useMemo(
    () => (Array.isArray(sequence.steps) ? sequence.steps : []),
    [sequence.steps],
  );

  const dataOk = DATA_RE.test(data);
  const horaOk = HORA_RE.test(hora);
  const temaOk = tema.trim().length > 0;
  const previewReady = dataOk && horaOk;

  // Live preview: compute each step's send time + rendered message. Recomputed on
  // every keystroke, and "now" is captured fresh so past-step badges stay honest.
  const preview = useMemo(() => {
    if (!previewReady) return [];
    const vars = {
      tema: tema.trim(),
      hora: formatHora(hora),
      data: formatData(data),
      diasemana: diaSemana(data),
    };
    const now = Date.now();
    return steps.map((step) => {
      const enviarEm = computeStepEnviarEm(data, hora, step);
      const past = new Date(enviarEm).getTime() <= now;
      return {
        step,
        enviarEm,
        past,
        mensagem: renderTemplate(step.mensagem, vars),
      };
    });
  }, [steps, data, hora, tema, previewReady]);

  const willSchedule = preview.filter((p) => !p.past).length;
  const canSubmit = dataOk && horaOk && temaOk && willSchedule > 0 && !busy;

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((s) =>
      s.includes(groupId) ? s.filter((x) => x !== groupId) : [...s, groupId],
    );
  }

  function clearError(field: string) {
    setErrors((e) => {
      if (!e[field]) return e;
      const { [field]: _omit, ...rest } = e;
      return rest;
    });
  }

  async function submit() {
    setSubmitError(null);
    setResult(null);
    const map: Record<string, string> = {};
    if (!dataOk) map.data = 'Escolha a data da aula.';
    if (!horaOk) map.hora = 'Informe a hora da aula.';
    if (!temaOk) map.tema = 'Informe o tema da aula.';
    if (Object.keys(map).length) {
      setErrors(map);
      return;
    }
    setErrors({});
    setBusy(true);
    const { audience_id, group_ids } = resolveAudience(
      audienceMode,
      selectedAudienceId,
      selectedGroupIds,
    );
    try {
      const res = await fetch(`/api/sequences/${sequence.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
          hora,
          tema: tema.trim(),
          categoria,
          audience_id,
          group_ids,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { criadas: unknown[]; puladas: number };
        setResult({ criadas: (body.criadas ?? []).length, puladas: body.puladas ?? 0 });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: { field: string; message: string }[];
      };
      if (body.errors?.length) {
        setErrors(Object.fromEntries(body.errors.map((e) => [e.field, e.message])));
      } else {
        setSubmitError(body.error ?? 'Não foi possível agendar a sequência. Tente de novo.');
      }
    } catch {
      setSubmitError('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl2 border border-green/30 bg-green/[0.06] p-6 text-center">
          <div className="mb-2 text-3xl">✅</div>
          <h1 className="font-display text-xl font-semibold">Sequência agendada!</h1>
          <p className="mt-2 text-sm text-muted">
            <b className="text-ink">{result.criadas}</b>{' '}
            {result.criadas === 1 ? 'campanha agendada' : 'campanhas agendadas'}
            {result.puladas > 0 && (
              <>
                {' '}
                · <b className="text-ink">{result.puladas}</b>{' '}
                {result.puladas === 1 ? 'pulada' : 'puladas'} (horário no passado)
              </>
            )}
            .
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/campanhas"
              className="rounded-xl bg-blue px-5 py-[13px] text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff]"
            >
              Ver campanhas
            </Link>
            <Link
              href="/sequencias"
              className="rounded-xl border border-border px-5 py-[13px] text-sm font-semibold text-ink transition-colors hover:bg-white/5"
            >
              Voltar aos roteiros
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 text-[13px] text-muted">
        <Link href="/sequencias" className="transition-colors hover:text-ink">
          Sequências
        </Link>{' '}
        / <b className="font-semibold text-ink">Disparar semana</b>
      </div>
      <div className="mb-[22px] flex items-center gap-2.5">
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">
          {sequence.nome}
        </h1>
        <span className="rounded-full border border-blue2/30 bg-blue2/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#9cc0ff]">
          {categoriaLabel(sequence.categoria)}
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-[26px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* FORM */}
        <div className="rounded-xl2 border border-border bg-surface p-[22px]">
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Data da aula" error={errors.data}>
              <input
                type="date"
                aria-label="Data da aula"
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  clearError('data');
                }}
                className={`${inputCls} [color-scheme:dark]`}
              />
            </Field>
            <Field label="Hora da aula" error={errors.hora}>
              <input
                type="time"
                aria-label="Hora da aula"
                value={hora}
                onChange={(e) => {
                  setHora(e.target.value);
                  clearError('hora');
                }}
                className={`${inputCls} [color-scheme:dark]`}
              />
            </Field>
          </div>

          <Field label="Tema da aula" error={errors.tema}>
            <input
              type="text"
              aria-label="Tema da aula"
              value={tema}
              onChange={(e) => {
                setTema(e.target.value);
                clearError('tema');
              }}
              placeholder="Como precificar pacotes"
              className={inputCls}
            />
          </Field>

          <Field label="Categoria" hint="· onde as campanhas vão aparecer">
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((cat) => (
                <SegButton
                  key={cat.key}
                  on={categoria === cat.key}
                  onClick={() => setCategoria(cat.key)}
                >
                  {cat.label}
                </SegButton>
              ))}
            </div>
          </Field>

          <AudiencePicker
            audiences={audiences}
            groups={groups}
            mode={audienceMode}
            onModeChange={setAudienceMode}
            selectedAudienceId={selectedAudienceId}
            onSelectAudience={setSelectedAudienceId}
            selectedGroupIds={selectedGroupIds}
            onToggleGroup={toggleGroup}
            groupQuery={groupQuery}
            onGroupQueryChange={setGroupQuery}
          />

          {submitError && (
            <p className="mt-4 text-sm text-[#ffb183]" role="alert">
              {submitError}
            </p>
          )}

          <div className="mt-[22px] flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="rounded-xl bg-blue px-5 py-[13px] text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {busy
                ? 'Agendando…'
                : previewReady
                  ? `📅 Agendar ${willSchedule} ${willSchedule === 1 ? 'mensagem' : 'mensagens'}`
                  : '📅 Agendar tudo'}
            </button>
            <Link
              href="/sequencias"
              className="rounded-xl border border-border px-5 py-[13px] text-sm font-semibold text-ink transition-colors hover:bg-white/5"
            >
              Cancelar
            </Link>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="lg:sticky lg:top-[26px]">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Prévia da semana ({preview.length || steps.length} passos)
          </div>

          {!previewReady ? (
            <div className="rounded-xl2 border border-dashed border-border bg-surface p-6 text-sm text-muted">
              Preencha <b className="text-ink">data</b> e <b className="text-ink">hora</b> da aula
              para ver os horários e as mensagens já com as variáveis substituídas.
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-2.5 overflow-auto pr-1">
              {preview.map(({ step, enviarEm, past, mensagem }, i) => (
                <div
                  key={step.id}
                  className={`rounded-xl border border-border bg-surface p-3.5 ${
                    past ? 'opacity-55' : ''
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue/15 font-display text-[11px] font-semibold text-[#9cc0ff]">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-ink">{formatWhen(enviarEm)}</span>
                    <span className="text-muted">{tipoBadge[step.tipo] ?? step.tipo}</span>
                    {past && (
                      <span className="ml-auto rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-semibold text-muted">
                        não será agendada (horário no passado)
                      </span>
                    )}
                  </div>

                  <div className="ml-auto max-w-[92%] rounded-[10px] rounded-tr-[2px] bg-[#005c4b] px-2.5 pb-2 pt-1.5 text-[13px] leading-[1.42] text-[#e9edef]">
                    {step.midia_url && step.tipo !== 'texto' && (
                      <div className="mb-1.5 overflow-hidden rounded-[7px]">
                        {step.tipo === 'imagem' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={step.midia_url} alt="" className="block max-h-40 w-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 bg-black/40 py-4 text-[#a7c4bc]">
                            <span>{step.tipo === 'video' ? '🎬' : '📄'}</span>
                            <span className="text-[11px]">
                              {step.tipo === 'video' ? 'Vídeo anexado' : 'PDF anexado'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {step.mencionar_todos && <span className="text-[#53bdeb]">@todos </span>}
                    <span className="whitespace-pre-wrap break-words">{mensagem}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

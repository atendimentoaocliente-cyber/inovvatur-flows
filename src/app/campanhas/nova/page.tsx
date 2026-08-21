'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Audience, Campaign, CampaignType, Group } from '@/lib/types';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { MultiDatePicker, type DateEntry } from '@/components/MultiDatePicker';
import { validateCampaign, type CampaignDraft } from '@/lib/validation';
import { estimateDuration, formatDuration } from '@/lib/message';

// Fallback for the throttling copy when we don't yet know the real active-group
// count (fetch pending or failed). The n8n dispatcher uses the true count at send
// time — this only drives the "~N grupos ≈ …" estimate line.
const GROUP_COUNT_HINT = 18;

type AudienceMode = 'todos' | 'salvo' | 'grupos';

const tipos: { key: CampaignType; label: string }[] = [
  { key: 'texto', label: 'Só texto' },
  { key: 'imagem', label: 'Imagem' },
  { key: 'video', label: 'Vídeo' },
  { key: 'pdf', label: 'PDF' },
];

const acceptByTipo: Record<Exclude<CampaignType, 'texto'>, string> = {
  imagem: 'image/jpeg,image/png,image/webp',
  video: 'video/mp4',
  pdf: 'application/pdf',
};

// Media filenames come back URL-encoded; a malformed %-sequence would throw, so
// fall back to the raw value instead of crashing the composer.
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Stored dates are ISO/UTC; <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"
// in the *browser's local* time. Build it from local getters so the wall-clock
// value the user picked survives the round-trip.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export default function NovaCampanhaPage() {
  // useSearchParams needs a Suspense boundary to keep the route buildable.
  return (
    <Suspense fallback={<ComposerSkeleton />}>
      <NovaCampanha />
    </Suspense>
  );
}

function ComposerSkeleton() {
  return (
    <div>
      <div className="mb-[22px] h-8 w-52 animate-pulse rounded-lg bg-surface2" />
      <div className="grid grid-cols-1 items-start gap-[26px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="h-[560px] animate-pulse rounded-xl2 border border-border bg-surface" />
        <div className="h-[440px] animate-pulse rounded-[22px] border border-border bg-surface" />
      </div>
    </div>
  );
}

function NovaCampanha() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const editing = Boolean(editId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tipo, setTipo] = useState<CampaignType>('imagem');
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [midiaUrl, setMidiaUrl] = useState<string | null>(null);
  const [midiaMeta, setMidiaMeta] = useState<{ name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mencionar, setMencionar] = useState(false);
  const [agendar, setAgendar] = useState(true);
  const [enviarEm, setEnviarEm] = useState('');

  // Multi-date scheduling (create mode only). When ON, the single datetime input
  // and the Agendar/Enviar-agora control are replaced by <MultiDatePicker>; every
  // selected date fires its own POST /api/campaigns with the shared base fields.
  const [multiDia, setMultiDia] = useState(false);
  const [multiEntries, setMultiEntries] = useState<DateEntry[]>([]);
  const [multiTime, setMultiTime] = useState('09:00');
  const [multiProgress, setMultiProgress] = useState<string | null>(null);

  // Audience picker
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('todos');
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupQuery, setGroupQuery] = useState('');

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch audiences + groups on mount so both picker modes are ready. Failures are
  // non-fatal — the composer still works, the lists just render empty.
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

  // Edit mode: load the campaign and prefill every field.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/campaigns/${editId}`);
        if (!alive) return;
        if (!res.ok) {
          setSubmitError('Não foi possível carregar a campanha para edição.');
          return;
        }
        const c = (await res.json()) as Campaign;
        setTipo(c.tipo);
        setNome(c.nome ?? '');
        setMensagem(c.mensagem ?? '');
        setMidiaUrl(c.midia_url ?? null);
        setMidiaMeta(null);
        setMencionar(Boolean(c.mencionar_todos));

        // No stored "agendar" flag: treat a future enviar_em as a live schedule,
        // a past one as "enviar agora". Prefill the field either way.
        if (c.enviar_em) {
          setEnviarEm(isoToLocalInput(c.enviar_em));
          setAgendar(new Date(c.enviar_em).getTime() > Date.now());
        } else {
          setAgendar(false);
          setEnviarEm('');
        }

        // Audience: explicit group list wins, then a saved público, else "todos".
        if (c.group_ids && c.group_ids.length) {
          setAudienceMode('grupos');
          setSelectedGroupIds(c.group_ids);
        } else if (c.audience_id) {
          setAudienceMode('salvo');
          setSelectedAudienceId(c.audience_id);
        } else {
          setAudienceMode('todos');
        }
      } catch {
        if (alive) setSubmitError('Sem conexão com o servidor. Tente de novo.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editId]);

  const activeGroups = useMemo(() => groups.filter((g) => g.ativo), [groups]);
  const activeCount = activeGroups.length || GROUP_COUNT_HINT;

  function audienceGroupCount(a: Audience): number {
    return a.tipo === 'manual' ? (a.group_ids?.length ?? 0) : activeCount;
  }

  const selectedAudience = useMemo(
    () => audiences.find((a) => a.id === selectedAudienceId) ?? null,
    [audiences, selectedAudienceId],
  );

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.nome.toLowerCase().includes(q) || g.group_id.toLowerCase().includes(q),
    );
  }, [groups, groupQuery]);

  // Effective group count drives the throttling estimate for the chosen audience.
  const effectiveCount =
    audienceMode === 'grupos'
      ? selectedGroupIds.length || activeCount
      : audienceMode === 'salvo' && selectedAudience
        ? audienceGroupCount(selectedAudience)
        : activeCount;
  const est = estimateDuration(effectiveCount);

  function clearError(field: string) {
    setErrors((e) => {
      if (!e[field]) return e;
      const { [field]: _omit, ...rest } = e;
      return rest;
    });
  }

  function pickTipo(t: CampaignType) {
    setTipo(t);
    if (t === 'texto') {
      setMidiaUrl(null);
      setMidiaMeta(null);
    }
    clearError('tipo');
    clearError('midia_url');
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((s) =>
      s.includes(groupId) ? s.filter((x) => x !== groupId) : [...s, groupId],
    );
  }

  // Resolve the picker into the API's { audience_id, group_ids } shape.
  function resolveAudience(): { audience_id: string | null; group_ids: string[] | null } {
    if (audienceMode === 'salvo') return { audience_id: selectedAudienceId, group_ids: null };
    if (audienceMode === 'grupos') {
      return { audience_id: null, group_ids: selectedGroupIds.length ? selectedGroupIds : null };
    }
    return { audience_id: null, group_ids: null };
  }

  async function uploadFile(file: File) {
    setUploading(true);
    clearError('midia_url');
    setMidiaUrl(null);
    setMidiaMeta(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.ok) {
        const body = (await res.json()) as { url: string };
        setMidiaUrl(body.url);
        setMidiaMeta({ name: file.name, size: file.size });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrors((e) => ({
          ...e,
          midia_url: body.error ?? 'Não foi possível enviar o arquivo.',
        }));
      }
    } catch {
      setErrors((e) => ({ ...e, midia_url: 'Sem conexão com o servidor. Tente de novo.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(asDraft: boolean) {
    setSubmitError(null);
    const draft: CampaignDraft = {
      nome,
      tipo,
      mensagem,
      midia_url: midiaUrl,
      mencionar_todos: mencionar,
      agendar,
      enviar_em: agendar && enviarEm ? new Date(enviarEm).toISOString() : null,
    };
    // Rascunho skips validation; a real submit (create or edit) must be complete.
    if (!asDraft) {
      const map = Object.fromEntries(
        validateCampaign(draft, new Date()).map((e) => [e.field, e.message]),
      );
      // "Público salvo" needs an actual selection — never silently fall back to "todos".
      if (audienceMode === 'salvo' && !selectedAudienceId) {
        map.audience = 'Escolha um público salvo para continuar.';
      }
      if (Object.keys(map).length) {
        setErrors(map);
        return;
      }
    }
    setErrors({});
    setBusy(true);
    const { audience_id, group_ids } = resolveAudience();
    try {
      if (editing) {
        const enviar_em = agendar && enviarEm ? new Date(enviarEm).toISOString() : new Date().toISOString();
        const res = await fetch(`/api/campaigns/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nome.trim(),
            mensagem: mensagem.trim(),
            midia_url: midiaUrl,
            mencionar_todos: mencionar,
            tipo,
            enviar_em,
            audience_id,
            group_ids,
            // Editing is always a (re)schedule: set status so a former rascunho/erro/
            // cancelada gets re-armed on the n8n scheduler when saved.
            status: 'agendada',
          }),
        });
        if (res.ok) {
          router.push('/campanhas');
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          errors?: { field: string; message: string }[];
        };
        if (body.errors?.length) {
          setErrors(Object.fromEntries(body.errors.map((e) => [e.field, e.message])));
        } else {
          // 409 = em envio / enviada; surface the server's message inline.
          setSubmitError(body.error ?? 'Não foi possível salvar as alterações. Tente de novo.');
        }
        return;
      }

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, asDraft, audience_id, group_ids }),
      });
      if (res.ok) {
        router.push('/campanhas');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: { field: string; message: string }[];
      };
      if (body.errors?.length) {
        setErrors(Object.fromEntries(body.errors.map((e) => [e.field, e.message])));
      } else {
        setSubmitError(body.error ?? 'Não foi possível salvar a campanha. Tente de novo.');
      }
    } catch {
      setSubmitError('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  // Multi-date submit: one POST per selected date, sharing the base fields. A date
  // with its own message wins; empty ones inherit the base message. Posts run
  // sequentially so progress is honest and a partial failure is recoverable.
  async function submitMulti() {
    setSubmitError(null);
    const now = new Date();
    const sorted = [...multiEntries].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time),
    );

    if (sorted.length === 0) {
      setSubmitError('Escolha pelo menos uma data.');
      return;
    }

    const firstISO = new Date(`${sorted[0].date}T${sorted[0].time}`).toISOString();
    const map = Object.fromEntries(
      validateCampaign(
        {
          nome,
          tipo,
          mensagem,
          midia_url: midiaUrl,
          mencionar_todos: mencionar,
          agendar: true,
          enviar_em: firstISO,
        },
        now,
      ).map((e) => [e.field, e.message]),
    );
    if (audienceMode === 'salvo' && !selectedAudienceId) {
      map.audience = 'Escolha um público salvo para continuar.';
    }
    if (Object.keys(map).length) {
      setErrors(map);
      return;
    }
    // Every date+time must still be in the future when we submit.
    const anyPast = sorted.some(
      (e) => new Date(`${e.date}T${e.time}`).getTime() <= now.getTime(),
    );
    if (anyPast) {
      setSubmitError('Todas as datas precisam estar no futuro. Ajuste os horários.');
      return;
    }

    setErrors({});
    setBusy(true);
    const { audience_id, group_ids } = resolveAudience();
    const total = sorted.length;
    let failures = 0;
    try {
      for (let i = 0; i < total; i++) {
        const entry = sorted[i];
        setMultiProgress(`Criando ${i + 1} de ${total}…`);
        const draft: CampaignDraft = {
          nome,
          tipo,
          mensagem: entry.mensagem?.trim() || mensagem,
          midia_url: midiaUrl,
          mencionar_todos: mencionar,
          agendar: true,
          enviar_em: new Date(`${entry.date}T${entry.time}`).toISOString(),
        };
        try {
          const res = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft, asDraft: false, audience_id, group_ids }),
          });
          if (!res.ok) failures++;
        } catch {
          failures++;
        }
      }
      if (failures === 0) {
        router.push('/campanhas');
        return;
      }
      setSubmitError(`${failures} de ${total} falharam. As demais foram agendadas — revise e tente de novo.`);
    } finally {
      setMultiProgress(null);
      setBusy(false);
    }
  }

  const midiaLabel =
    midiaMeta?.name ??
    (midiaUrl ? safeDecode(midiaUrl.split('/').pop() ?? 'Mídia atual') : null);

  return (
    <div>
      <div className="mb-1.5 text-[13px] text-muted">
        <Link href="/campanhas" className="transition-colors hover:text-ink">
          Campanhas
        </Link>{' '}
        / <b className="font-semibold text-ink">{editing ? 'Editar campanha' : 'Nova campanha'}</b>
      </div>
      <h1 className="mb-[22px] font-display text-[26px] font-semibold tracking-[-0.01em]">
        {editing ? 'Editar campanha' : 'Nova campanha'}
      </h1>

      <div className="grid grid-cols-1 items-start gap-[26px] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* FORM */}
        <div className="rounded-xl2 border border-border bg-surface p-[22px]">
          {loading && (
            <div className="mb-5 rounded-xl border border-border bg-surface2 px-3.5 py-3 text-[13px] text-muted">
              Carregando campanha…
            </div>
          )}

          <Field label="Nome da campanha" hint="(só pra você identificar)" error={errors.nome}>
            <input
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                clearError('nome');
              }}
              placeholder="Feriado — Bom dia turismo"
              className={inputCls}
            />
          </Field>

          <Field label="Tipo de conteúdo">
            <div className="flex flex-wrap gap-2">
              {tipos.map((t) => (
                <SegButton key={t.key} on={tipo === t.key} onClick={() => pickTipo(t.key)}>
                  {t.label}
                </SegButton>
              ))}
            </div>
          </Field>

          {tipo !== 'texto' && (
            <Field label="Mídia" error={errors.midia_url}>
              <input
                ref={fileRef}
                type="file"
                accept={acceptByTipo[tipo]}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="block w-full rounded-xl border border-dashed border-[#2a3550] bg-surface2 px-4 py-[18px] text-center text-[13px] text-muted transition-colors hover:border-blue2 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <span>Enviando arquivo…</span>
                ) : midiaLabel ? (
                  <>
                    <span className="font-semibold text-green">✓ {midiaLabel}</span>
                    <br />
                    <span className="text-xs text-muted">
                      {midiaMeta ? `${formatBytes(midiaMeta.size)} · ` : ''}clique para trocar
                    </span>
                  </>
                ) : (
                  <>
                    📎 Arraste um arquivo aqui ou <b className="text-blue2">clique para enviar</b>
                    <br />
                    <span className="text-xs">
                      {tipo === 'imagem'
                        ? 'JPEG, PNG ou WebP'
                        : tipo === 'video'
                          ? 'MP4'
                          : 'PDF'}{' '}
                      · até 20 MB
                    </span>
                  </>
                )}
              </button>
            </Field>
          )}

          <Field label="Mensagem" hint="· use {{data}}, {{tema}} se quiser" error={errors.mensagem}>
            <textarea
              value={mensagem}
              onChange={(e) => {
                setMensagem(e.target.value);
                clearError('mensagem');
              }}
              rows={4}
              placeholder="Bom dia, pessoal! ☀️ …"
              className={`${inputCls} min-h-[120px] resize-y leading-relaxed`}
            />
          </Field>

          <Field>
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface2 px-3.5 py-3">
              <span className="text-sm">
                <span className="font-semibold">Mencionar todos</span>
                <span className="mt-0.5 block font-normal text-muted">
                  marca @todos os participantes de cada grupo
                </span>
              </span>
              <Switch checked={mencionar} onChange={setMencionar} label="Mencionar todos" />
            </label>
          </Field>

          {/* AUDIENCE PICKER */}
          <Field label="Público" error={errors.audience}>
            <div className="mb-3 flex flex-wrap gap-2">
              <SegButton
                on={audienceMode === 'todos'}
                onClick={() => {
                  setAudienceMode('todos');
                  clearError('audience');
                }}
              >
                🌐 Todos os grupos
              </SegButton>
              <SegButton on={audienceMode === 'salvo'} onClick={() => setAudienceMode('salvo')}>
                ⭐ Público salvo
              </SegButton>
              <SegButton
                on={audienceMode === 'grupos'}
                onClick={() => {
                  setAudienceMode('grupos');
                  clearError('audience');
                }}
              >
                ✅ Grupos específicos
              </SegButton>
            </div>

            {audienceMode === 'todos' && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface2 px-3.5 py-[13px]">
                <span className="font-display text-xl font-semibold leading-none">🌐</span>
                <div className="text-sm">
                  <div className="font-semibold">Todos os grupos ativos</div>
                  <div className="text-xs text-muted">
                    {activeGroups.length ? `${activeCount} grupos` : 'definido no envio'} · da aba “Grupos”
                  </div>
                </div>
                <Link
                  href="/publicos"
                  className="ml-auto shrink-0 text-[13px] font-semibold text-blue2 transition-colors hover:text-ink"
                >
                  Gerenciar ›
                </Link>
              </div>
            )}

            {audienceMode === 'salvo' && (
              <div>
                {audiences.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface2 px-3.5 py-3 text-[13px] text-muted">
                    Nenhum público salvo ainda.{' '}
                    <Link href="/publicos" className="font-semibold text-blue2 hover:text-ink">
                      Criar um público ›
                    </Link>
                  </div>
                ) : (
                  <>
                    <select
                      aria-label="Público salvo"
                      value={selectedAudienceId ?? ''}
                      onChange={(e) => {
                        setSelectedAudienceId(e.target.value || null);
                        clearError('audience');
                      }}
                      className={`${inputCls} [color-scheme:dark] cursor-pointer`}
                    >
                      <option value="">Escolha um público…</option>
                      {audiences.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome} · {audienceGroupCount(a)} grupos
                        </option>
                      ))}
                    </select>
                    {selectedAudience && (
                      <div className="mt-2 text-[13px] text-muted">
                        Público:{' '}
                        <b className="text-ink">{selectedAudience.nome}</b> (
                        {audienceGroupCount(selectedAudience)})
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {audienceMode === 'grupos' && (
              <div>
                <input
                  aria-label="Buscar grupo pelo nome ou ID"
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder="🔎 Buscar grupo pelo nome ou ID…"
                  className={`${inputCls} mb-3 py-2.5`}
                />
                <div className="max-h-72 overflow-auto rounded-xl border border-border">
                  {groups.length === 0 ? (
                    <div className="px-3.5 py-6 text-sm text-muted">
                      Nenhum grupo cadastrado. Adicione grupos primeiro na aba Grupos.
                    </div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="px-3.5 py-6 text-sm text-muted">
                      Nenhum grupo encontrado para “{groupQuery}”.
                    </div>
                  ) : (
                    filteredGroups.map((g) => (
                      <GroupRow
                        key={g.id}
                        group={g}
                        checked={selectedGroupIds.includes(g.group_id)}
                        onToggle={() => toggleGroup(g.group_id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Summary line */}
            <div className="mt-2.5 text-[13px] text-muted">
              {audienceMode === 'todos' &&
                (activeGroups.length ? (
                  <>
                    <b className="text-ink">{activeCount} grupos</b> · todos os ativos
                  </>
                ) : (
                  <>
                    <b className="text-ink">Todos os grupos ativos</b> · definido no envio
                  </>
                ))}
              {audienceMode === 'salvo' &&
                (selectedAudience ? (
                  <>
                    Público: <b className="text-ink">{selectedAudience.nome}</b> (
                    {audienceGroupCount(selectedAudience)})
                  </>
                ) : (
                  <>Nenhum público escolhido</>
                ))}
              {audienceMode === 'grupos' &&
                (selectedGroupIds.length ? (
                  <>
                    <b className="text-ink">{selectedGroupIds.length}</b>{' '}
                    {selectedGroupIds.length === 1
                      ? 'grupo selecionado'
                      : 'grupos selecionados'}
                  </>
                ) : (
                  <>Nenhum grupo marcado · envia para todos os ativos</>
                ))}
            </div>
          </Field>

          <Field label="Agendamento" error={errors.enviar_em}>
            {!editing && (
              <label className="mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface2 px-3.5 py-3">
                <span className="text-sm">
                  <span className="font-semibold">Vários dias</span>
                  <span className="mt-0.5 block font-normal text-muted">
                    agenda a mesma campanha em várias datas de uma vez
                  </span>
                </span>
                <Switch checked={multiDia} onChange={setMultiDia} label="Vários dias" />
              </label>
            )}

            {multiDia && !editing ? (
              <MultiDatePicker
                entries={multiEntries}
                onChange={(next) => {
                  setMultiEntries(next);
                  clearError('enviar_em');
                }}
                baseMensagem={mensagem}
                defaultTime={multiTime}
                onDefaultTimeChange={setMultiTime}
              />
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <SegButton on={agendar} onClick={() => setAgendar(true)}>
                    Agendar
                  </SegButton>
                  <SegButton on={!agendar} onClick={() => setAgendar(false)}>
                    Enviar agora
                  </SegButton>
                </div>
                {agendar && (
                  <input
                    type="datetime-local"
                    value={enviarEm}
                    onChange={(e) => {
                      setEnviarEm(e.target.value);
                      clearError('enviar_em');
                    }}
                    className={`${inputCls} [color-scheme:dark]`}
                  />
                )}
              </>
            )}
          </Field>

          <div className="mt-4 flex gap-2.5 rounded-xl border border-blue2/30 bg-blue/[0.08] px-3.5 py-3 text-[12.5px] text-[#b9c6e6]">
            <span aria-hidden="true">⏱️</span>
            <span>
              O envio respeita o intervalo de{' '}
              <b className="text-[#cdd8f2]">8–15s entre grupos</b> (anti-bloqueio). ~{effectiveCount}{' '}
              grupos ≈ {formatDuration(est.minSec)}–{formatDuration(est.maxSec)} pra concluir.
            </span>
          </div>

          {multiProgress && (
            <p className="mt-4 text-sm text-[#b9c6e6]" role="status" aria-live="polite">
              {multiProgress}
            </p>
          )}

          {submitError && (
            <p className="mt-4 text-sm text-[#ffb183]" role="alert">
              {submitError}
            </p>
          )}

          <div className="mt-[22px] flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => (multiDia && !editing ? void submitMulti() : submit(false))}
              disabled={
                busy ||
                uploading ||
                loading ||
                (multiDia && !editing && multiEntries.length === 0)
              }
              className="rounded-xl bg-blue px-5 py-[13px] text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {busy
                ? multiDia && !editing
                  ? (multiProgress ?? 'Agendando…')
                  : 'Salvando…'
                : editing
                  ? '💾 Salvar alterações'
                  : multiDia
                    ? `📅 Agendar ${multiEntries.length} campanha${multiEntries.length === 1 ? '' : 's'}`
                    : agendar
                      ? '📅 Agendar campanha'
                      : '🚀 Enviar agora'}
            </button>
            {!editing && (
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={busy || uploading || loading}
                className="rounded-xl border border-border px-5 py-[13px] text-sm font-semibold text-ink transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Salvar rascunho
              </button>
            )}
            {editing && (
              <Link
                href="/campanhas"
                className="rounded-xl border border-border px-5 py-[13px] text-sm font-semibold text-ink transition-colors hover:bg-white/5"
              >
                Cancelar
              </Link>
            )}
          </div>
        </div>

        {/* PREVIEW */}
        <div className="sticky top-[26px]">
          <WhatsAppPreview
            tipo={tipo}
            mensagem={mensagem}
            midiaUrl={midiaUrl}
            mencionarTodos={mencionar}
          />
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-border bg-surface2 px-[13px] py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-blue2';

function GroupRow({
  group,
  checked,
  onToggle,
}: {
  group: Group;
  checked: boolean;
  onToggle: () => void;
}) {
  const selectable = group.ativo;
  const Wrapper = selectable ? 'label' : 'div';
  return (
    <Wrapper
      className={`flex items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0 ${
        selectable ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-not-allowed opacity-60'
      }`}
    >
      {selectable && (
        <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      )}
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs text-white transition-colors ${
          checked ? 'border-blue bg-blue' : 'border-[#33405f]'
        }`}
        aria-hidden="true"
      >
        {checked ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${selectable ? '' : 'text-muted'}`}>
          {group.nome}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted">{group.group_id}</span>
      </span>
      {selectable ? (
        <span className="ml-auto shrink-0 rounded-full border border-green/30 px-2 py-0.5 text-[11px] text-green">
          ativo
        </span>
      ) : (
        <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          inativo
        </span>
      )}
    </Wrapper>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      {label && (
        <label className="mb-[9px] block text-[13px] font-semibold">
          {label} {hint && <span className="font-normal text-muted">{hint}</span>}
        </label>
      )}
      {children}
      {error && (
        <div className="mt-1.5 text-xs text-[#ffb183]" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function SegButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-w-[80px] flex-1 rounded-xl border px-2 py-[11px] text-center text-[13px] font-semibold transition-colors ${
        on
          ? 'border-blue bg-blue/15 text-ink'
          : 'border-border bg-surface2 text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-[42px] shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue' : 'bg-[#2a3550]'
      }`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
          checked ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

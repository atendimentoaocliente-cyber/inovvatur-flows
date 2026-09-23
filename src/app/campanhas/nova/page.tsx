'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Audience, Campaign, CampaignType, Connection, Group } from '@/lib/types';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { MultiDatePicker, type DateEntry } from '@/components/MultiDatePicker';
import {
  AudiencePicker,
  resolveAudience,
  GROUP_COUNT_HINT,
  type AudienceMode,
} from '@/components/AudiencePicker';
import { Field, SegButton, Switch, inputCls } from '@/components/ui';
import { validateCampaign, type CampaignDraft } from '@/lib/validation';
import { estimateDuration, formatDuration } from '@/lib/message';
import { uploadMedia } from '@/lib/upload-client';
import { CATEGORIAS, isCategoria, type CategoriaKey } from '@/lib/categories';

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

// YYYY-MM-DD → dd/MM/yyyy, for naming a date in an error message (no Date, no
// timezone drift — mirrors MultiDatePicker's own formatter).
function ddMMyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
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
  const [categoria, setCategoria] = useState<CategoriaKey>('avulsas');
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
  // Conexões da Evolution. Vazio = só existe o motor antigo, e o seletor nem aparece.
  const [conexoes, setConexoes] = useState<Connection[]>([]);
  // Nulo = n8n + Z-API (o padrão de sempre). Com um id, a campanha vira do motor novo.
  const [conexaoId, setConexaoId] = useState<string | null>(null);
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
      const [audRes, grpRes, cnxRes] = await Promise.allSettled([
        fetch('/api/audiences'),
        fetch('/api/groups'),
        fetch('/api/connections'),
      ]);
      if (!alive) return;
      if (audRes.status === 'fulfilled' && audRes.value.ok) {
        setAudiences(((await audRes.value.json().catch(() => [])) as Audience[]) ?? []);
      }
      if (grpRes.status === 'fulfilled' && grpRes.value.ok) {
        setGroups(((await grpRes.value.json().catch(() => [])) as Group[]) ?? []);
      }
      if (cnxRes.status === 'fulfilled' && cnxRes.value.ok) {
        // /api/connections responde { conexoes, configurada } — não uma lista pura como
        // /api/audiences e /api/groups. O Array.isArray cobre as duas formas e qualquer
        // resposta inesperada: aqui uma lista errada derrubava o compositor inteiro.
        const body = await cnxRes.value.json().catch(() => null);
        const lista = Array.isArray(body) ? body : body?.conexoes;
        setConexoes(Array.isArray(lista) ? (lista as Connection[]) : []);
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
        setCategoria(isCategoria(c.categoria) ? c.categoria : 'avulsas');
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

  // Só número conectado pode receber campanha: oferecer um desconectado seria agendar
  // para um envio que falha na hora.
  const conectadas = useMemo(
    () => (Array.isArray(conexoes) ? conexoes.filter((c) => c.ativo && c.status === 'conectada') : []),
    [conexoes],
  );

  const activeGroups = useMemo(() => groups.filter((g) => g.ativo), [groups]);
  const activeCount = activeGroups.length || GROUP_COUNT_HINT;

  function audienceGroupCount(a: Audience): number {
    return a.tipo === 'manual' ? (a.group_ids?.length ?? 0) : activeCount;
  }

  const selectedAudience = useMemo(
    () => audiences.find((a) => a.id === selectedAudienceId) ?? null,
    [audiences, selectedAudienceId],
  );

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

  // Bare upload: envia direto para o Storage e devolve a URL, ou null na falha.
  // Sem efeito no estado do compositor — deixa o MultiDatePicker reusar o mesmo
  // caminho para a mídia por data sem mexer no tipo/midiaUrl base.
  async function uploadFileRaw(file: File): Promise<string | null> {
    const out = await uploadMedia(file);
    return 'url' in out ? out.url : null;
  }

  async function uploadFile(file: File) {
    setUploading(true);
    clearError('midia_url');
    setMidiaUrl(null);
    setMidiaMeta(null);
    const out = await uploadMedia(file);
    if ('url' in out) {
      setMidiaUrl(out.url);
      setMidiaMeta({ name: file.name, size: file.size });
    } else {
      setErrors((e) => ({ ...e, midia_url: out.error }));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(asDraft: boolean) {
    setSubmitError(null);
    const draft: CampaignDraft = {
      nome,
      tipo,
      categoria,
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
    const { audience_id, group_ids } = resolveAudience(audienceMode, selectedAudienceId, selectedGroupIds);
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
            categoria,
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
        body: JSON.stringify({ draft, asDraft, audience_id, group_ids, connection_id: conexaoId }),
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

    // A date with its own tipo overrides the base media entirely; it needs its
    // own uploaded midia_url unless it was switched to texto.
    const missingMidia = sorted.find((e) => {
      const eTipo = e.tipo ?? tipo;
      const eMidia = e.tipo ? (e.midia_url ?? null) : midiaUrl;
      return eTipo !== 'texto' && !eMidia;
    });
    if (missingMidia) {
      setSubmitError(
        `${ddMMyyyy(missingMidia.date)}: envie a mídia dessa data (ou troque para Herdar/Texto).`,
      );
      return;
    }

    setErrors({});
    setBusy(true);
    const { audience_id, group_ids } = resolveAudience(audienceMode, selectedAudienceId, selectedGroupIds);
    const total = sorted.length;
    let failures = 0;
    try {
      for (let i = 0; i < total; i++) {
        const entry = sorted[i];
        setMultiProgress(`Criando ${i + 1} de ${total}…`);
        const eTipo = entry.tipo ?? tipo;
        const eMidia = entry.tipo ? (entry.midia_url ?? null) : midiaUrl;
        const draft: CampaignDraft = {
          nome,
          tipo: eTipo,
          categoria,
          mensagem: entry.mensagem?.trim() || mensagem,
          midia_url: eMidia,
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

          <Field label="Categoria" hint="· organiza o painel por produto">
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

          {/* Só aparece quando existe conexão conectada. Enquanto o motor novo estiver
              em teste, o padrão continua sendo o de sempre — escolher é opt-in. */}
          {conectadas.length > 0 && (
            <Field
              label="Enviar por"
              hint="· em teste — o padrão continua sendo o motor atual"
            >
              <div className="flex flex-wrap gap-2">
                <SegButton on={conexaoId === null} onClick={() => setConexaoId(null)}>
                  n8n + Z-API
                </SegButton>
                {conectadas.map((c) => (
                  <SegButton
                    key={c.id}
                    on={conexaoId === c.id}
                    onClick={() => setConexaoId(c.id)}
                  >
                    {c.nome}
                  </SegButton>
                ))}
              </div>
              {conexaoId && (
                <p className="mt-2 text-xs text-[#b9c6e6]">
                  Esta campanha sai pelo motor novo (Evolution). O n8n não vai vê-la.
                </p>
              )}
            </Field>
          )}

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
            error={errors.audience}
            onClearError={() => clearError('audience')}
          />

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
                onUploadFile={uploadFileRaw}
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

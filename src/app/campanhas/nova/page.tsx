'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CampaignType } from '@/lib/types';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { validateCampaign, type CampaignDraft } from '@/lib/validation';
import { estimateDuration, formatDuration } from '@/lib/message';

// Display-only hint for the throttling copy — the n8n dispatcher uses the real
// active-group count at send time. Kept in one place so the info line and the
// "Público" card stay in sync with the mockup.
const GROUP_COUNT_HINT = 18;

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function NovaCampanha() {
  const router = useRouter();
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
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const est = estimateDuration(GROUP_COUNT_HINT);

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
    if (!asDraft) {
      const errs = validateCampaign(draft, new Date());
      if (errs.length) {
        setErrors(Object.fromEntries(errs.map((e) => [e.field, e.message])));
        return;
      }
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, asDraft, audience_id: null }),
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

  return (
    <div>
      <div className="mb-1.5 text-[13px] text-muted">
        <Link href="/campanhas" className="transition-colors hover:text-ink">
          Campanhas
        </Link>{' '}
        / <b className="font-semibold text-ink">Nova campanha</b>
      </div>
      <h1 className="mb-[22px] font-display text-[26px] font-semibold tracking-[-0.01em]">Nova campanha</h1>

      <div className="grid grid-cols-1 items-start gap-[26px] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* FORM */}
        <div className="rounded-xl2 border border-border bg-surface p-[22px]">
          <Field
            label="Nome da campanha"
            hint="(só pra você identificar)"
            error={errors.nome}
          >
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
                ) : midiaMeta ? (
                  <>
                    <span className="font-semibold text-green">✓ {midiaMeta.name}</span>
                    <br />
                    <span className="text-xs text-muted">
                      {formatBytes(midiaMeta.size)} · clique para trocar
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

          <Field label="Público">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface2 px-3.5 py-[13px]">
              <span className="font-display text-xl font-semibold leading-none">🌐</span>
              <div className="text-sm">
                <div className="font-semibold">Todos os grupos ativos</div>
                <div className="text-xs text-muted">da aba “Grupos” — definido no envio</div>
              </div>
              <Link
                href="/publicos"
                className="ml-auto shrink-0 text-[13px] font-semibold text-blue2 transition-colors hover:text-ink"
              >
                Escolher grupos ›
              </Link>
            </div>
          </Field>

          <Field label="Agendamento" error={errors.enviar_em}>
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
          </Field>

          <div className="mt-4 flex gap-2.5 rounded-xl border border-blue2/30 bg-blue/[0.08] px-3.5 py-3 text-[12.5px] text-[#b9c6e6]">
            <span aria-hidden="true">⏱️</span>
            <span>
              O envio respeita o intervalo de{' '}
              <b className="text-[#cdd8f2]">8–15s entre grupos</b> (anti-bloqueio). ~{GROUP_COUNT_HINT}{' '}
              grupos ≈ {formatDuration(est.minSec)}–{formatDuration(est.maxSec)} pra concluir.
            </span>
          </div>

          {submitError && (
            <p className="mt-4 text-sm text-[#ffb183]" role="alert">
              {submitError}
            </p>
          )}

          <div className="mt-[22px] flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy || uploading}
              className="rounded-xl bg-blue px-5 py-[13px] text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {busy ? 'Salvando…' : agendar ? '📅 Agendar campanha' : '🚀 Enviar agora'}
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={busy || uploading}
              className="rounded-xl border border-border px-5 py-[13px] text-sm font-semibold text-ink transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Salvar rascunho
            </button>
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

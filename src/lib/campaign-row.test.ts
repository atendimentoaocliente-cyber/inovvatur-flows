import { describe, it, expect } from 'vitest';
import { buildCampaignRow } from './campaign-row';
import type { CampaignDraft } from './validation';

const now = new Date('2026-08-20T12:00:00Z');
const draft: CampaignDraft = {
  nome: 'Feriado', tipo: 'imagem', mensagem: 'Bom dia',
  midia_url: 'https://x/y.jpg', mencionar_todos: true,
  agendar: true, enviar_em: '2026-08-21T09:00:00Z',
};

describe('buildCampaignRow', () => {
  it('maps a scheduled draft to an agendada row', () => {
    const row = buildCampaignRow(draft, 'aud-1', now, { asDraft: false });
    expect(row).toMatchObject({
      nome: 'Feriado', tipo: 'imagem', mensagem: 'Bom dia',
      midia_url: 'https://x/y.jpg', mencionar_todos: true,
      audience_id: 'aud-1', status: 'agendada', enviar_em: '2026-08-21T09:00:00Z',
    });
  });
  it('send-now sets status agendada with enviar_em = now', () => {
    const row = buildCampaignRow({ ...draft, agendar: false, enviar_em: null }, null, now, { asDraft: false });
    expect(row.status).toBe('agendada');
    expect(row.enviar_em).toBe(now.toISOString());
    expect(row.audience_id).toBeNull();
  });
  it('asDraft forces status rascunho', () => {
    expect(buildCampaignRow(draft, 'aud-1', now, { asDraft: true }).status).toBe('rascunho');
  });
  it('coerces a sparse draft without throwing', () => {
    const row = buildCampaignRow({ tipo: 'texto' } as unknown as CampaignDraft, null, now, { asDraft: true });
    expect(row.nome).toBe('');
    expect(row.mensagem).toBe('');
    expect(row.status).toBe('rascunho');
  });
});

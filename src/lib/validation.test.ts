import { describe, it, expect } from 'vitest';
import { validateCampaign, type CampaignDraft } from './validation';

const now = new Date('2026-08-20T12:00:00Z');
const base: CampaignDraft = {
  nome: 'Feriado', tipo: 'texto', mensagem: 'Bom dia',
  midia_url: null, mencionar_todos: false,
  agendar: true, enviar_em: '2026-08-21T12:00:00Z',
};

describe('validateCampaign', () => {
  it('accepts a valid scheduled text campaign', () => {
    expect(validateCampaign(base, now)).toEqual([]);
  });
  it('requires a nome', () => {
    expect(validateCampaign({ ...base, nome: '  ' }, now).map(e => e.field)).toContain('nome');
  });
  it('requires a mensagem', () => {
    expect(validateCampaign({ ...base, mensagem: '' }, now).map(e => e.field)).toContain('mensagem');
  });
  it('requires media when tipo is not texto', () => {
    expect(validateCampaign({ ...base, tipo: 'imagem', midia_url: null }, now).map(e => e.field)).toContain('midia_url');
  });
  it('requires a future date when scheduling', () => {
    expect(validateCampaign({ ...base, enviar_em: '2026-08-19T12:00:00Z' }, now).map(e => e.field)).toContain('enviar_em');
  });
  it('does not require a date when sending now', () => {
    expect(validateCampaign({ ...base, agendar: false, enviar_em: null }, now)).toEqual([]);
  });
});

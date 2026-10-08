import { describe, it, expect, vi, afterEach } from 'vitest';
import { conferirMidias } from './midia-viva';

afterEach(() => vi.unstubAllGlobals());

const campanha = (over: Partial<{ id: string; status: string; midia_url: string | null }> = {}) => ({
  id: 'c1',
  status: 'agendada',
  midia_url: 'https://bucket/arquivo.png',
  ...over,
});

describe('conferirMidias', () => {
  it('acusa a campanha cujo arquivo sumiu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
    expect(await conferirMidias([campanha()])).toEqual({ quebradas: ['c1'] });
  });

  it('não acusa quando o arquivo responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response));
    expect(await conferirMidias([campanha()])).toEqual({ quebradas: [] });
  });

  it('não confere campanha já enviada — o estrago, se houve, já aconteceu', async () => {
    const f = vi.fn(async () => ({ ok: false }) as Response);
    vi.stubGlobal('fetch', f);
    expect(await conferirMidias([campanha({ status: 'enviada' })])).toEqual({ quebradas: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it('campanha sem mídia não gera requisição', async () => {
    const f = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', f);
    await conferirMidias([campanha({ midia_url: null })]);
    expect(f).not.toHaveBeenCalled();
  });

  it('rede fora NÃO vira acusação — alarme falso custa mais que o silêncio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    expect(await conferirMidias([campanha()])).toEqual({ quebradas: [] });
  });
});

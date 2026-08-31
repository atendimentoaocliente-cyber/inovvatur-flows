import { describe, it, expect } from 'vitest';
import { MAX_BYTES, storageKey, validateUpload } from './upload-limits';

describe('validateUpload', () => {
  it('aceita os tipos suportados', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']) {
      expect(validateUpload({ type, size: 1024 })).toBeNull();
    }
  });

  it('recusa container de vídeo não suportado', () => {
    expect(validateUpload({ type: 'video/quicktime', size: 1024 })).toBe(
      'Tipo de arquivo não permitido',
    );
    expect(validateUpload({ type: '', size: 1024 })).toBe('Tipo de arquivo não permitido');
  });

  it('recusa acima de 20MB e aceita exatamente 20MB', () => {
    expect(validateUpload({ type: 'video/mp4', size: MAX_BYTES + 1 })).toBe('Arquivo acima de 20MB');
    expect(validateUpload({ type: 'video/mp4', size: MAX_BYTES })).toBeNull();
  });

  it('aceita vídeo de 6MB — o tamanho que a rota antiga não conseguia subir na Vercel', () => {
    expect(validateUpload({ type: 'video/mp4', size: 6 * 1024 * 1024 })).toBeNull();
  });
});

describe('storageKey', () => {
  it('mantém a extensão em minúsculas', () => {
    expect(storageKey('Video Final.MP4', 0.5)).toMatch(/^\d+-[a-z0-9]+\.mp4$/);
  });

  it('cai para .bin quando a extensão falta ou é estranha', () => {
    expect(storageKey('semextensao', 0.5)).toMatch(/\.bin$/);
    expect(storageKey('arquivo.extensao-muito-esquisita', 0.5)).toMatch(/\.bin$/);
  });

  it('não carrega acento, espaço nem caminho do nome original', () => {
    const key = storageKey('vídeo da aula/promoção 2026.mp4', 0.5);
    expect(key).toMatch(/^[A-Za-z0-9.-]+$/);
  });
});

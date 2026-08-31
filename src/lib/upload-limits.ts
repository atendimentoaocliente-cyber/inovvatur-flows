// Regras de mídia compartilhadas entre o endpoint que assina o upload e o cliente
// que manda o arquivo direto para o Supabase Storage.

export const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/pdf',
] as const;

export const MAX_BYTES = 20 * 1024 * 1024;

/** Mensagem de erro da mídia, ou null quando o arquivo é aceitável. */
export function validateUpload(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return 'Tipo de arquivo não permitido';
  }
  if (file.size > MAX_BYTES) return 'Arquivo acima de 20MB';
  return null;
}

/**
 * Nome do objeto no bucket: sempre único, sem depender do nome original
 * (que pode ter acento, espaço ou caractere que o Storage rejeita).
 */
export function storageKey(fileName: string, rand = Math.random()): string {
  const ext = fileName.includes('.') ? (fileName.split('.').pop() ?? 'bin') : 'bin';
  const safeExt = /^[A-Za-z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : 'bin';
  return `${Date.now()}-${rand.toString(36).slice(2)}.${safeExt}`;
}

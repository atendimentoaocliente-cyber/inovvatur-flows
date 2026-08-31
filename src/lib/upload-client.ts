import { validateUpload } from './upload-limits';

/**
 * Envia a mídia direto do navegador para o Supabase Storage.
 *
 * Passo 1: o servidor valida tipo/tamanho e devolve uma URL assinada.
 * Passo 2: o navegador faz PUT do arquivo nessa URL — os bytes não passam pela
 * nossa API, então o limite de corpo da hospedagem (4,5 MB na Vercel) não se aplica.
 *
 * O corpo do PUT imita o que o supabase-js manda (multipart com o campo vazio e
 * cacheControl), que é o formato que o Storage espera numa URL assinada.
 */
export async function uploadMedia(file: File): Promise<{ url: string } | { error: string }> {
  const problema = validateUpload({ type: file.type, size: file.size });
  if (problema) return { error: problema };

  let signedUrl: string;
  let url: string;
  try {
    const res = await fetch('/api/upload/assinar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: file.name, tipo: file.type, tamanho: file.size }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      signedUrl?: string;
      url?: string;
      error?: string;
    };
    if (!res.ok || !body.signedUrl || !body.url) {
      return { error: body.error ?? 'Não foi possível preparar o envio do arquivo.' };
    }
    signedUrl = body.signedUrl;
    url = body.url;
  } catch {
    return { error: 'Sem conexão com o servidor. Tente de novo.' };
  }

  try {
    const fd = new FormData();
    fd.append('cacheControl', '3600');
    fd.append('', file);
    const res = await fetch(signedUrl, { method: 'PUT', body: fd });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      return {
        error:
          res.status === 413
            ? 'Arquivo grande demais para o armazenamento.'
            : `Falha ao enviar o arquivo (${res.status}). ${detalhe.slice(0, 120)}`.trim(),
      };
    }
  } catch {
    return { error: 'O envio do arquivo foi interrompido. Tente de novo.' };
  }

  return { url };
}

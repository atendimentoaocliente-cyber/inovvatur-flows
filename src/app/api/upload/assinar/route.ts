import { NextResponse } from 'next/server';
import { createServerClient, MEDIA_BUCKET } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { storageKey, validateUpload } from '@/lib/upload-limits';

/**
 * Assina um upload direto para o Supabase Storage.
 *
 * O arquivo NÃO passa por aqui: hospedagens serverless limitam o corpo da
 * requisição (4,5 MB na Vercel), o que inviabiliza vídeo. O navegador recebe uma
 * URL assinada (válida por 2h) e manda os bytes direto para o Storage.
 */
export async function POST(req: Request) {
  const parsed = await readJson<{ nome?: unknown; tipo?: unknown; tamanho?: unknown }>(req);
  if (!parsed.ok) return parsed.res;
  const { nome, tipo, tamanho } = parsed.data;

  if (typeof nome !== 'string' || !nome.trim()) {
    return NextResponse.json({ error: 'arquivo sem nome' }, { status: 400 });
  }
  if (typeof tipo !== 'string' || typeof tamanho !== 'number' || !Number.isFinite(tamanho)) {
    return NextResponse.json({ error: 'tipo ou tamanho ausente' }, { status: 400 });
  }

  const problema = validateUpload({ type: tipo, size: tamanho });
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const key = storageKey(nome);
  const supabase = createServerClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUploadUrl(key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);
  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, url: pub.publicUrl });
}

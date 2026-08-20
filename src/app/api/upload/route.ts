import { NextResponse } from 'next/server';
import { createServerClient, MEDIA_BUCKET } from '@/lib/supabase/server';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'];
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'formulário inválido' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo acima de 20MB' }, { status: 400 });
  }
  const supabase = createServerClient();
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(key, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: data.publicUrl });
}

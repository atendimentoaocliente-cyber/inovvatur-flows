import { NextResponse } from 'next/server';

export async function readJson<T = unknown>(
  req: Request,
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, data: (await req.json()) as T };
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) };
  }
}

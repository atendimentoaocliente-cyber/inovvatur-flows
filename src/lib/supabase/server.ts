import { createClient } from '@supabase/supabase-js';

// Server-only. Uses the service role key — never import this into a client component.
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET ?? 'campanhas-midia';

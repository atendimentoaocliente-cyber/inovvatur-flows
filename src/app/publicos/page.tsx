import { createServerClient } from '@/lib/supabase/server';
import type { Audience, Group } from '@/lib/types';
import { AudiencesClient } from './AudiencesClient';

export const dynamic = 'force-dynamic';

export default async function PublicosPage() {
  const supabase = createServerClient();
  const [{ data: auds }, { data: groups }] = await Promise.all([
    supabase.from('audiences').select('*').order('criado_em', { ascending: false }),
    supabase.from('groups').select('*').eq('ativo', true).order('nome'),
  ]);

  return (
    <AudiencesClient
      initial={(auds ?? []) as Audience[]}
      groups={(groups ?? []) as Group[]}
    />
  );
}

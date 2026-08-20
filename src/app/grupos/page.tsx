import { createServerClient } from '@/lib/supabase/server';
import type { Group } from '@/lib/types';
import { GroupsClient } from './GroupsClient';

export const dynamic = 'force-dynamic';

export default async function GruposPage() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('groups')
    .select('*')
    .order('criado_em', { ascending: false });

  return <GroupsClient initial={(data ?? []) as Group[]} />;
}

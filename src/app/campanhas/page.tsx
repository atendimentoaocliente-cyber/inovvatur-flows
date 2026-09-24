import { createServerClient } from '@/lib/supabase/server';
import type { Audience, Campaign } from '@/lib/types';
import { CampaignsClient } from './CampaignsClient';

export const dynamic = 'force-dynamic';

export default async function CampanhasPage() {
  const supabase = createServerClient();
  // Os públicos e a contagem de ativos vêm junto porque a coluna "Público" da lista
  // precisa deles para dizer a verdade — antes ela era uma string fixa.
  const [{ data }, { data: audiences }, { count }] = await Promise.all([
    supabase.from('campaigns').select('*').order('enviar_em', { ascending: true }),
    supabase.from('audiences').select('id,nome,tipo,group_ids'),
    supabase.from('groups').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ]);

  return (
    <CampaignsClient
      initial={(data ?? []) as Campaign[]}
      audiences={(audiences ?? []) as Audience[]}
      gruposAtivos={count ?? 0}
    />
  );
}

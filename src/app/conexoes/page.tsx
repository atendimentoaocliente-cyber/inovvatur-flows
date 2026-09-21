import { createServerClient } from '@/lib/supabase/server';
import { evolutionConfigurada } from '@/lib/whatsapp/evolution';
import type { Connection } from '@/lib/types';
import { ConexoesClient } from './ConexoesClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Conexões · INVT Disparador' };

export default async function ConexoesPage() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .order('criado_em', { ascending: true });

  // Migration ainda não aplicada: sem isto a tela diria "nenhuma conexão", escondendo
  // o motivo real. Mesmo aviso que as telas de Sequências e Recorrentes já dão.
  const tableMissing =
    Boolean(error) &&
    /relation .*connections.* does not exist|could not find the table/i.test(error?.message ?? '');

  // Contagem de grupos por conexão, para a tela dizer "42 grupos" sem uma consulta
  // por linha no cliente.
  const { data: grupos } = await supabase.from('groups').select('connection_id,ativo');
  const porConexao: Record<string, { total: number; ativos: number }> = {};
  for (const g of (grupos ?? []) as { connection_id: string | null; ativo: boolean }[]) {
    if (!g.connection_id) continue;
    const atual = porConexao[g.connection_id] ?? { total: 0, ativos: 0 };
    atual.total += 1;
    if (g.ativo) atual.ativos += 1;
    porConexao[g.connection_id] = atual;
  }

  return (
    <ConexoesClient
      initial={(data ?? []) as Connection[]}
      gruposPorConexao={porConexao}
      configurada={evolutionConfigurada()}
      tableMissing={tableMissing}
    />
  );
}

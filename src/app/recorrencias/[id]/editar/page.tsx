import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import type { Recorrencia } from '@/lib/types';
import { RecorrenciaForm } from '@/components/RecorrenciaForm';

export const dynamic = 'force-dynamic';

export default async function EditarRecorrenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data } = await supabase.from('recorrencias').select('*').eq('id', id).maybeSingle();

  if (!data) {
    return (
      <div className="rounded-xl2 border border-border bg-surface p-6 text-sm text-muted">
        Recorrência não encontrada.{' '}
        <Link href="/recorrencias" className="font-semibold text-blue2 hover:underline">
          Voltar para a lista
        </Link>
      </div>
    );
  }

  return <RecorrenciaForm initial={data as Recorrencia} />;
}

import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import type { Sequence } from '@/lib/types';
import { SequenceEditorClient } from '@/components/SequenceEditorClient';

export const dynamic = 'force-dynamic';

export default async function EditarSequenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data } = await supabase.from('sequences').select('*').eq('id', id).maybeSingle();

  if (!data) return <NotFound />;

  return <SequenceEditorClient sequence={data as Sequence} />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1.5 text-[13px] text-muted">
        <Link href="/sequencias" className="transition-colors hover:text-ink">
          Sequências
        </Link>{' '}
        / <b className="font-semibold text-ink">Editar roteiro</b>
      </div>
      <div className="rounded-xl2 border border-border bg-surface p-6 text-sm text-muted">
        Roteiro não encontrado.{' '}
        <Link href="/sequencias" className="font-semibold text-blue2 hover:text-ink">
          Voltar para a lista ›
        </Link>
      </div>
    </div>
  );
}

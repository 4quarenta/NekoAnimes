import { useQuery } from '@tanstack/react-query';
import { fetchManifest } from '../lib/api';

export function HomePage() {
  const manifest = useQuery({
    queryKey: ['app-manifest'],
    queryFn: fetchManifest
  });

  if (manifest.isPending) {
    return <main className="min-h-screen p-6 text-zinc-400">Carregando Neko...</main>;
  }

  if (manifest.isError) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-sm text-red-300">Não foi possível carregar a configuração.</p>
      </main>
    );
  }

  if (manifest.data.mode === 'news') {
    return (
      <main className="mx-auto min-h-screen max-w-xl p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
          Neko News
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Últimas notícias</h1>
        <div className="mt-8 space-y-5">
          {['Destaques do dia', 'Novidades de anime e mangá', 'Indústria e cultura'].map((item) => (
            <article key={item} className="border-b border-zinc-800 pb-5">
              <p className="text-lg font-medium">{item}</p>
              <p className="mt-1 text-sm text-zinc-500">Conteúdo será conectado na etapa News.</p>
            </article>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
        NekoAnimes
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Streaming text-first</h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-300">Explorar de A–Z</h2>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
            <button
              key={letter}
              className="aspect-square rounded-xl bg-zinc-900 text-sm font-medium transition active:scale-95"
            >
              {letter}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-zinc-300">Estrutura inicial</h2>
        <div className="mt-3 divide-y divide-zinc-800 border-y border-zinc-800">
          {['Anime Alpha', 'Anime Beta', 'Anime Gamma'].map((title, index) => (
            <div key={title} className="py-4">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-zinc-500">
                Temporada 1 · {10 + index * 2} episódios
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

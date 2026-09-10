export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
        Neko
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 text-zinc-500">Tela reservada pela fundação.</p>
    </main>
  );
}

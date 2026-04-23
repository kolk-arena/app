export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="h-8 w-40 animate-pulse rounded-xl border border-slate-200 bg-slate-200" />
        <div className="h-14 w-full max-w-3xl animate-pulse rounded-xl border border-slate-200 bg-slate-200" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      </section>
    </main>
  );
}

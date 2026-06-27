export default function Home() {
  return (
    <main className="min-h-screen bg-[#171412] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-6 py-10 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <p className="text-sm font-semibold text-amber-300">Valhalla Clube</p>
          <span className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200">
            RPG de mesa
          </span>
        </header>

        <div className="grid gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="mb-5 text-base font-medium text-amber-200">
              Aventuras, mesas e comunidade
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white">
              O ponto de encontro para campanhas memoráveis.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Um espaço para acompanhar encontros, organizar campanhas e
              apresentar as mesas do clube.
            </p>
          </div>

          <figure
            aria-label="Mapa abstrato de uma mesa de RPG"
            className="relative min-h-90 overflow-hidden rounded-lg border border-amber-100/20 bg-[#ead9bd] shadow-2xl shadow-black/20"
          >
            <div className="absolute inset-8 rounded border border-[#7a5035]/40 bg-[linear-gradient(#7a503520_1px,transparent_1px),linear-gradient(90deg,#7a503520_1px,transparent_1px)] bg-size-[40px_40px]" />
            <div className="absolute left-[14%] top-[18%] h-20 w-20 rotate-45 rounded bg-[#9d2f3a] shadow-lg" />
            <div className="absolute bottom-[18%] right-[16%] h-24 w-24 rounded bg-[#1f6258] shadow-lg" />
            <div className="absolute left-[34%] top-[42%] h-28 w-28 rounded border-8 border-[#c68b3c] bg-[#f5ead8] shadow-lg" />
            <div className="absolute bottom-[22%] left-[18%] h-3 w-48 rotate-[-18deg] rounded bg-[#7a5035]" />
            <div className="absolute right-[20%] top-[22%] h-3 w-40 rotate-24 rounded bg-[#7a5035]" />
          </figure>
        </div>

        <footer className="border-t border-white/10 pt-5 text-sm text-slate-400">
          Front-end inicial pronto para evoluir junto com o projeto.
        </footer>
      </section>
    </main>
  );
}

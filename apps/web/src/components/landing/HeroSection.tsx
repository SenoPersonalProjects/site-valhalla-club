export function HeroSection() {
  return (
    <section className="border-b border-[#1e1c19] bg-[#0d0b09]" id="inicio">
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-20 sm:px-10 lg:px-12 lg:pb-20 lg:pt-32">
        <div className="grid min-w-0 gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="min-w-0">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
              Layout provisório
            </p>
            <h1 className="max-w-full wrap-break-word font-serif text-3xl leading-[1.08] tracking-tight text-[#f0ebe0] sm:max-w-4xl sm:text-6xl lg:text-7xl xl:text-8xl">
              Título principal
            </h1>
          </div>

          <div className="min-w-0 max-w-xl lg:justify-self-end">
            <p className="text-lg leading-8 text-[#8a7d6e]">
              Texto provisório para apresentar a proposta do Valhalla.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row lg:justify-end">
              <a
                className="inline-flex w-full justify-center rounded-md bg-[#c9a84c] px-6 py-3 text-sm font-bold text-[#0c0a09] transition-colors hover:bg-[#e0c060] sm:w-auto"
                href="#contato"
              >
                Fale conosco
              </a>
              <a
                className="inline-flex w-full justify-center rounded-md border border-[#3a3028] bg-[#1c1917]/70 px-6 py-3 text-sm font-semibold text-[#d0c5b5] transition-colors hover:border-[#c9a84c] hover:text-[#c9a84c] sm:w-auto"
                href="#eventos"
              >
                Ver eventos
              </a>
            </div>
          </div>
        </div>

        <figure
          aria-label="Espaço visual provisório"
          className="relative mt-16 flex min-h-80 max-w-full items-end overflow-hidden rounded-lg border border-[#2a2420] bg-[#141210] p-8 shadow-xl shadow-black/50 sm:mt-20 sm:min-h-115"
        >
          <div className="rounded border border-[#3a3028] bg-[#0c0a09]/95 px-4 py-3 text-sm font-semibold text-[#8a7d6e]">
            Espaço visual provisório
          </div>
        </figure>
      </div>
    </section>
  );
}

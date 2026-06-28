const steps = [
  {
    step: "01",
    title: "Bloco informativo 01",
    description: "Texto provisório.",
  },
  {
    step: "02",
    title: "Bloco informativo 02",
    description: "Texto provisório.",
  },
  {
    step: "03",
    title: "Bloco informativo 03",
    description: "Texto provisório.",
  },
];

export function AboutSection() {
  return (
    <section className="border-b border-[#1e1c19] bg-[#111009]" id="sobre">
      <div className="mx-auto max-w-7xl px-6 py-28 sm:px-10 lg:px-12">
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
              Seção sobre
            </p>
            <h2 className="mt-5 font-serif text-4xl leading-tight text-[#f0ebe0] sm:text-5xl">
              Título provisório da seção sobre o Valhalla.
            </h2>
          </div>

          <p className="self-end text-base leading-8 text-[#8a7d6e]">
            Texto provisório para explicar quem é o Valhalla, qual é a proposta
            do clube e por que essa seção existe na página.
          </p>
        </div>

        <div className="relative mt-16 grid gap-px md:grid-cols-3">
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-[#2a2420] md:block" />

          {steps.map((item) => (
            <article className="relative bg-[#111009] pr-8" key={item.step}>
              <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-full border border-[#3a3028] bg-[#1c1917]">
                <span className="font-serif text-sm font-semibold text-[#c9a84c]">
                  {item.step}
                </span>
              </div>
              <h3 className="font-serif text-xl font-semibold text-[#f0ebe0]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#8a7d6e]">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

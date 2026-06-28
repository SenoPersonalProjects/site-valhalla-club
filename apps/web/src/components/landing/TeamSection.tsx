const spotlight = {
  name: "Perfil em Destaque",
  role: "Função principal ou título provisório",
  quote:
    "Texto provisório para uma citação ou depoimento do membro em destaque. Esse espaço será preenchido com conteúdo real do clube.",
  meta: "00 campanhas · Ativo desde 0000",
};

const teamMembers = [
  {
    name: "Perfil 01",
    role: "Função ou descrição provisória",
  },
  {
    name: "Perfil 02",
    role: "Função ou descrição provisória",
  },
  {
    name: "Perfil 03",
    role: "Função ou descrição provisória",
  },
];

export function TeamSection() {
  return (
    <section className="bg-[#111009]" id="equipe">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
              Equipe
            </p>
            <h2 className="mt-5 font-serif text-4xl leading-tight text-[#f0ebe0] sm:text-5xl">
              Título provisório da seção da equipe.
            </h2>
          </div>
          <p className="text-base leading-8 text-[#8a7d6e]">
            Texto provisório para apresentar quem faz parte da equipe, quais
            papéis serão exibidos e como essa área será usada.
          </p>
        </div>

        <article className="mt-14 overflow-hidden rounded-lg border border-[#2a2420] bg-[#1c1917] lg:grid lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center border-b border-[#2a2420] p-10 lg:border-b-0 lg:border-r lg:px-14">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#3a3028] bg-[#252018] font-serif text-2xl font-semibold text-[#c9a84c]">
              {spotlight.name.slice(0, 1)}
            </div>
            <h3 className="mt-5 font-serif text-xl font-semibold text-[#f0ebe0]">
              {spotlight.name}
            </h3>
            <p className="mt-1 text-sm text-[#c9a84c]">{spotlight.role}</p>
            <p className="mt-4 text-xs text-[#6a5d50]">{spotlight.meta}</p>
          </div>
          <div className="flex items-center p-8 lg:p-12">
            <blockquote>
              <p className="font-serif text-xl leading-9 text-[#d0c5b5] sm:text-2xl">
                &ldquo;{spotlight.quote}&rdquo;
              </p>
            </blockquote>
          </div>
        </article>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {teamMembers.map((member) => (
            <article
              className="rounded-lg border border-[#2a2420] bg-[#1c1917] p-6"
              key={member.name}
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#3a3028] bg-[#252018] font-serif text-lg font-semibold text-[#c9a84c]">
                {member.name.slice(0, 1)}
              </div>
              <h3 className="font-serif text-xl font-semibold text-[#f0ebe0]">
                {member.name}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#8a7d6e]">
                {member.role}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

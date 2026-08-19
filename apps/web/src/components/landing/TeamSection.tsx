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
    <section className="bg-surface" id="equipe">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Equipe
            </p>
            <h2 className="mt-5 font-display text-4xl leading-tight text-foreground sm:text-5xl">
              Título provisório da seção da equipe.
            </h2>
          </div>

          <p className="font-editorial text-xl leading-8 text-muted-foreground">
            Texto provisório para apresentar quem faz parte da equipe, quais
            papéis serão exibidos e como essa área será usada.
          </p>
        </div>

        <article className="mt-14 overflow-hidden rounded-lg border border-border bg-surface-elevated lg:grid lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center border-b border-border p-10 lg:border-b-0 lg:border-r lg:px-14">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-secondary font-display text-2xl font-semibold text-primary">
              {spotlight.name.slice(0, 1)}
            </div>
            <h3 className="mt-5 font-display text-xl font-semibold text-foreground">
              {spotlight.name}
            </h3>
            <p className="mt-1 text-sm text-primary">{spotlight.role}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              {spotlight.meta}
            </p>
          </div>

          <div className="flex items-center p-8 lg:p-12">
            <blockquote>
              <p className="font-editorial text-2xl leading-9 text-foreground sm:text-3xl">
                &ldquo;{spotlight.quote}&rdquo;
              </p>
            </blockquote>
          </div>
        </article>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {teamMembers.map((member) => (
            <article
              className="rounded-lg border border-border bg-surface-elevated p-6"
              key={member.name}
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-secondary font-display text-lg font-semibold text-primary">
                {member.name.slice(0, 1)}
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground">
                {member.name}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {member.role}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

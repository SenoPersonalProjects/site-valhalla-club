const audience = [
  "Quem nunca jogou ou ainda não sabe como começar.",
  "Quem sente vergonha de entrar em uma mesa ou considera o RPG complicado.",
  "Quem procura novos sistemas, mesas, amizades e experiências.",
  "Quem deseja criar personagens e compartilhar suas próprias histórias.",
];

const communitySpaces = [
  {
    title: "Sistemas de RPG",
    description:
      "Grupos dedicados a sistemas como Ordem Paranormal, Dungeons & Dragons e Vaesen.",
  },
  {
    title: "Sistemas próprios",
    description:
      "Espaço para criação, testes e discussão de RPGs autorais.",
  },
  {
    title: "Games",
    description: "Jogos digitais e experiências multiplayer.",
  },
  {
    title: "Vendas e trocas",
    description:
      "Circulação de produtos ligados ao universo nerd, geek e aos jogos.",
  },
  {
    title: "Projetos solidários",
    description:
      "Iniciativas que buscam transformar a união do grupo em ajuda concreta.",
  },
  {
    title: "Grupo de Mestres",
    description:
      "Organização e divulgação das mesas antes de chegarem ao grupo geral.",
  },
];

const principles = [
  {
    title: "Respeito",
    description:
      "Todos devem ser tratados com respeito, independentemente da experiência.",
  },
  {
    title: "Inclusão",
    description: "Ninguém deve ser excluído por ainda não saber jogar.",
  },
  {
    title: "Colaboração",
    description:
      "A comunidade cresce quando seus integrantes ajudam uns aos outros.",
  },
  {
    title: "Empatia",
    description: "Buscamos compreender antes de julgar.",
  },
  {
    title: "Responsabilidade",
    description: "Cada participante contribui para o ambiente que compartilha.",
  },
  {
    title: "Liberdade com respeito",
    description:
      "A convivência mantém o foco em RPG, jogos e cultura geek, evitando conflitos políticos e temas que prejudiquem o ambiente.",
  },
];

const projects = [
  {
    number: "01",
    title: "Projeto Solidário",
    description:
      "O projeto busca utilizar a força da comunidade para apoiar pessoas em situação de necessidade, especialmente crianças. A ideia é transformar a união ao redor do RPG em ações concretas e na vontade de ajudar o próximo.",
  },
  {
    number: "02",
    title: "RPG + Inglês",
    description:
      "O RPG é utilizado como ferramenta pedagógica para tornar o aprendizado do inglês mais prático e divertido. As atividades podem estimular vocabulário, comunicação, leitura, interpretação e construção de frases.",
  },
  {
    number: "03",
    title: "RPG + Teatro",
    description:
      "Técnicas teatrais ajudam a desenvolver expressão corporal e emocional, voz, improvisação e interpretação. A proposta é ampliar a capacidade de expressão dentro e fora da mesa, não formar atores profissionais.",
  },
];

const futureSpace = [
  "Mesas preparadas para campanhas e eventos",
  "Decoração inspirada em tavernas e salões de aventura",
  "Biblioteca com livros, sistemas e suplementos",
  "Jogos de tabuleiro e card games",
  "Cafeteria voltada à convivência",
  "Ambiente confortável para jogar, conversar e permanecer",
];

function ChapterRail({
  label,
  number,
}: {
  label: string;
  number: string;
}) {
  return (
    <div className="flex items-center gap-4 border-l border-primary/60 pl-4 lg:block">
      <span
        aria-hidden="true"
        className="font-display text-2xl font-semibold text-primary"
      >
        {number}
      </span>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:mt-3">
        {label}
      </p>
    </div>
  );
}

export function AboutSection() {
  return (
    <section
      aria-labelledby="sobre-heading"
      className="overflow-hidden border-b border-border bg-surface"
      id="sobre"
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-10 sm:py-24 lg:px-12 lg:py-28">
        <header className="grid gap-10 pb-16 sm:pb-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end lg:gap-16">
          <div className="min-w-0">
            <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <span aria-hidden="true" className="h-px w-10 bg-primary" />
              Sobre o Valhalla
            </p>
            <h2
              className="mt-5 max-w-xl text-balance font-display text-4xl leading-[1.08] text-foreground sm:text-5xl lg:text-[3.5rem]"
              id="sobre-heading"
            >
              De uma ideia
              <span className="mt-1 block text-primary">
                para uma comunidade.
              </span>
            </h2>
          </div>

          <div className="min-w-0 max-w-2xl lg:justify-self-end">
            <p className="font-editorial text-xl leading-8 text-foreground sm:text-2xl sm:leading-9">
              O Valhalla Club RPG de Mesa nasceu para apresentar o RPG a mais
              pessoas e mostrar que esse universo não precisa ser complicado,
              inacessível ou reservado a quem já conhece seus sistemas e regras.
            </p>
            <p className="mt-5 border-l border-primary/60 pl-5 text-sm font-semibold uppercase leading-6 tracking-[0.12em] text-primary">
              Um salão para todos que querem criar histórias.
            </p>
          </div>
        </header>

        <article
          aria-labelledby="origem-heading"
          className="grid gap-8 border-t border-border py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
        >
          <ChapterRail label="O chamado" number="01" />

          <div className="min-w-0">
            <h3
              className="max-w-3xl font-display text-3xl leading-tight text-foreground sm:text-4xl"
              id="origem-heading"
            >
              Um grande salão simbólico
            </h3>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
              <div className="space-y-5 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                <p>
                  Criado por Daniel Petson, o Valhalla começou de forma
                  espontânea, sem investidores, empresa ou estrutura pronta. O
                  propósito inicial era simples: apresentar o RPG de mesa a mais
                  pessoas e desfazer a impressão de que esse universo pertence
                  apenas a quem já domina regras e sistemas.
                </p>
                <p>
                  Entre possibilidades como “taverna” e “casa do RPG”, surgiu o
                  nome Valhalla. Ele traduzia a imagem que Daniel buscava: um
                  grande salão onde pessoas diferentes pudessem se reunir para
                  jogar, conversar, criar personagens e construir histórias.
                </p>
              </div>

              <blockquote className="border-l border-primary/60 pl-6">
                <p className="font-editorial text-2xl leading-snug text-foreground sm:text-3xl">
                  “Um lugar onde todos podem ter espaço para jogar.”
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  A ideia que deu origem ao Valhalla.
                </p>
              </blockquote>
            </div>

            <div className="mt-12 grid gap-10 border-t border-border pt-10 md:grid-cols-2 md:gap-12">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Nossa missão
                </p>
                <h4 className="mt-3 font-display text-2xl leading-tight text-foreground">
                  Queremos ensinar enquanto jogamos
                </h4>
                <p className="mt-5 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  A missão do clube é democratizar o acesso ao RPG, aproximando
                  quem nunca teve contato com esse universo e construindo um
                  ambiente seguro, acolhedor e colaborativo para iniciantes e
                  jogadores experientes.
                </p>
                <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  Durante o jogo, criatividade, comunicação, interpretação,
                  imaginação, trabalho em equipe, expressão emocional,
                  construção narrativa e socialização também encontram espaço.
                </p>
              </div>

              <div className="md:border-l md:border-border md:pl-10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Para quem é
                </p>
                <ul className="mt-4 divide-y divide-border">
                  {audience.map((item) => (
                    <li
                      className="flex gap-3 py-3 text-sm leading-6 text-muted-foreground"
                      key={item}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rotate-45 bg-primary"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-editorial text-xl leading-7 text-foreground sm:text-2xl">
                  Aqui, ninguém precisa chegar sabendo tudo. É possível aprender
                  junto com a comunidade.
                </p>
              </div>
            </div>
          </div>
        </article>

        <article
          aria-labelledby="comunidade-heading"
          className="grid gap-8 border-t border-border py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
        >
          <ChapterRail label="O salão vivo" number="02" />

          <div className="min-w-0">
            <h3
              className="max-w-4xl font-display text-3xl leading-tight text-foreground sm:text-4xl"
              id="comunidade-heading"
            >
              Uma comunidade construída por quem participa
            </h3>

            <div className="mt-8 grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:gap-12">
              <p className="text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                O que começou como um grupo interessado em RPG ganhou organização
                própria. Hoje, o salão se movimenta principalmente pelo WhatsApp,
                onde circulam mesas, eventos, discussões, enquetes, projetos e
                conteúdos ligados ao universo geek e aos jogos.
              </p>

              <p className="font-editorial text-xl leading-8 text-foreground sm:text-3xl sm:leading-10">
                Em <span className="font-display text-primary">6 anos</span>,
                mais de{" "}
                <span className="font-display text-primary">250 integrantes</span>{" "}
                passaram a fazer parte do Valhalla. Aproximadamente{" "}
                <span className="font-display text-primary">100</span> participam
                ativamente.
              </p>
            </div>

            <div className="mt-12 border-t border-border pt-10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Como o salão se organiza
              </p>
              <h4 className="mt-3 font-display text-2xl leading-tight text-foreground">
                Muitos interesses, uma mesma comunidade
              </h4>
              <ul className="mt-7 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
                {communitySpaces.map((space) => (
                  <li className="border-t border-border py-5" key={space.title}>
                    <p className="font-display text-base font-semibold text-foreground">
                      {space.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {space.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="mt-8 border-l border-primary/60 pl-6">
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                Enquetes ajudam a compreender quais sistemas, atividades,
                eventos e projetos despertam interesse. A administração
                organiza o salão, mas a comunidade também é construída por cada
                pessoa que participa dela.
              </p>
            </aside>
          </div>
        </article>

        <article
          aria-labelledby="convivencia-heading"
          className="grid gap-8 border-t border-border py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
        >
          <ChapterRail label="O pacto" number="03" />

          <div className="min-w-0">
            <h3
              className="max-w-3xl font-display text-3xl leading-tight text-foreground sm:text-4xl"
              id="convivencia-heading"
            >
              Regras que protegem a mesa
            </h3>
            <div className="mt-6 max-w-3xl space-y-4 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
              <p>
                Crescer também significou assumir responsabilidades. A liderança
                precisou estabelecer limites para lidar com desrespeito,
                assédio, comportamento inadequado, atrasos, faltas e problemas de
                convivência, preservando o respeito aos Mestres e aos demais
                participantes.
              </p>
              <p>
                Advertências são utilizadas quando problemas se repetem; em
                situações graves ou recorrentes, a administração pode afastar
                membros. Essas decisões existem para proteger a continuidade e
                o propósito da comunidade.
              </p>
            </div>

            <div className="valhalla-cut-corners mt-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
              {principles.map((principle) => (
                <div
                  className="bg-surface-elevated px-6 py-5 sm:py-7"
                  key={principle.title}
                >
                  <p className="font-display text-lg font-semibold text-primary">
                    {principle.title}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {principle.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article
          aria-labelledby="retro-heading"
          className="grid gap-8 border-t border-border py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
        >
          <ChapterRail label="Portas abertas" number="04" />

          <div className="min-w-0">
            <h3
              className="max-w-4xl font-display text-3xl leading-tight text-foreground sm:text-4xl"
              id="retro-heading"
            >
              O primeiro contato pode começar sem barreiras
            </h3>

            <div className="mt-10 grid overflow-hidden border-y border-border xl:grid-cols-[0.8fr_1.2fr]">
              <div className="valhalla-grid relative flex min-h-48 items-center bg-background/40 px-7 py-10 sm:min-h-64 sm:px-10">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-linear-to-br from-surface/20 via-surface/75 to-surface"
                />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Retro Games Sergipe
                  </p>
                  <p className="mt-5 font-display text-3xl leading-tight text-foreground sm:text-5xl">
                    Chegar.
                    <span className="block text-primary">Sentar.</span>
                    Jogar.
                  </p>
                </div>
              </div>

              <div className="border-t border-border px-6 py-9 sm:px-10 xl:border-l xl:border-t-0">
                <p className="text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  Na Retro Games Sergipe, o Valhalla oferece mesas de RPG
                  gratuitas para que pessoas sem contato prévio possam
                  experimentar o jogo. Fichas prontas, sistemas diferentes e
                  mesas introdutórias eliminam a necessidade de preparação.
                </p>
                <p className="mt-4 font-editorial text-xl leading-7 text-foreground sm:text-2xl">
                  Não é preciso comprar nada, conhecer regras ou preparar uma
                  ficha. Basta chegar, sentar e jogar.
                </p>
              </div>
            </div>
          </div>
        </article>

        <article
          aria-labelledby="projetos-heading"
          className="grid gap-8 border-t border-border py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
        >
          <ChapterRail label="Além da mesa" number="05" />

          <div className="min-w-0">
            <h3
              className="max-w-3xl font-display text-3xl leading-tight text-foreground sm:text-4xl"
              id="projetos-heading"
            >
              Jogar também pode transformar
            </h3>
            <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
              Com o tempo, o clube percebeu que o RPG poderia ir além do
              entretenimento e apoiar aprendizagem, desenvolvimento pessoal e
              solidariedade. Dessa percepção nasceram três projetos principais.
            </p>

            <div className="mt-10 divide-y divide-border border-y border-border">
              {projects.map((project) => (
                <div
                  className="grid gap-5 py-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10"
                  key={project.number}
                >
                  <div>
                    <span className="font-display text-sm text-primary">
                      {project.number}
                    </span>
                    <h4 className="mt-2 font-display text-xl font-semibold text-foreground">
                      {project.title}
                    </h4>
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                    {project.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article
          aria-labelledby="futuro-heading"
          className="grid gap-8 border-t border-border py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
        >
          <ChapterRail label="O próximo salão" number="06" />

          <div className="min-w-0">
            <h3
              className="max-w-4xl text-balance font-display text-2xl leading-tight text-foreground sm:text-3xl lg:text-4xl"
              id="futuro-heading"
            >
              De uma comunidade para um projeto. De um projeto para um sonho.
            </h3>

            <div className="mt-10 border-y border-border bg-background/30 px-4 py-9 sm:px-10 sm:py-11">
              <div className="grid gap-10 xl:grid-cols-[0.9fr_1.1fr] xl:gap-14">
                <div>
                  <p className="text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                    O maior sonho do Valhalla é criar um espaço físico permanente
                    onde a comunidade possa se reunir durante toda a semana. Mais
                    do que uma loja, o lugar representaria a concretização de
                    seis anos de história e a profissionalização sustentável do
                    trabalho construído pelo clube.
                  </p>
                  <blockquote className="mt-7 border-l border-primary/60 pl-4 sm:pl-6">
                    <p className="font-editorial text-xl leading-7 text-foreground sm:text-2xl sm:leading-8">
                      “Um negócio que nasce de uma comunidade, e não uma
                      comunidade criada apenas para sustentar um negócio.”
                    </p>
                  </blockquote>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    O espaço imaginado
                  </p>
                  <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
                    {futureSpace.map((item) => (
                      <li
                        className="flex gap-3 border-t border-border py-4 text-sm leading-6 text-muted-foreground"
                        key={item}
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rotate-45 bg-primary"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </article>

        <div className="border-t border-primary/30 pt-10 sm:pt-16">
          <div className="grid gap-8 lg:grid-cols-[0.65fr_1.35fr] lg:items-start lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Nosso propósito
              </p>
              <h3 className="mt-4 font-display text-3xl leading-tight text-foreground sm:text-4xl">
                Há espaço para você nesta história
              </h3>
            </div>

            <div>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                O Valhalla existe para mostrar que qualquer pessoa pode fazer
                parte de uma história. Você não precisa conhecer RPG, saber
                interpretar, dominar todos os sistemas ou ter experiência.
              </p>
              <blockquote className="mt-6 max-w-4xl">
                <p className="font-editorial text-2xl leading-snug text-foreground sm:text-3xl lg:text-4xl">
                  “Você só precisa estar disposto a sentar à mesa.”
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Porque, quando uma história começa, todos podem participar.
                </p>
              </blockquote>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

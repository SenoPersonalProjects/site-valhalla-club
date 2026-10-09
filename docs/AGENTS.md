# Orientações para agentes e colaboradores

## Contexto e estado atual

O Site Valhalla Club é o site institucional do clube de RPG de mesa de Aracaju, Sergipe. O MVP da landing está homologado e aguarda preparação de produção; não está publicado.

O MVP implementa Header, Hero, Sobre, Eventos, Mesas rolando, Envolvidos e Contato/Footer, com conteúdo estático, responsividade, SEO básico e acessibilidade básica. A landing pública não depende do backend em runtime.

## Equipe

- Vinicius Ferreira — Tech Lead / FullStack;
- Charles Matias de Oliveira — FullStack;
- Gabriel Bomfim Bispo — FullStack;
- Dan — Stakeholder.

O modelo atual permite atuação fullstack. Não atribuir à equipe pessoas ou cargos históricos que não estejam nesta lista.

## Stack e estrutura

- `apps/web`: Next.js 16, React 19, TypeScript, Tailwind CSS 4, App Router e Embla Carousel;
- `apps/api`: NestJS 11, TypeScript e Prisma ORM, com base e health check;
- PostgreSQL: banco definido para homologação;
- Prisma ORM: camada integrada à API, ainda sem modelos de domínio ou migrations.

Componentes atuais da landing incluem `Header`, `HeroSection`, `AboutSection`, `NewsSection`, `EventCarousel`, `TablesSection`, `TableCard`, `TeamSection`, `Footer`, `SectionHeader` e `HorizontalCarousel`.

## Fluxo Git

```text
task branch → develop → main
```

- `main` é produção;
- `develop` é integração e homologação;
- task branches saem de `develop`;
- PRs de task apontam para `develop`;
- `develop` só segue para `main` após validação;
- não fazer push direto em `develop` ou `main`.

Prefixos de branch: `front/`, `back/`, `db/`, `docs/`, `chore/` e `fix/`.

Tipos de commit: `feat`, `fix`, `docs`, `chore`, `style`, `refactor` e `test`.

## Convenções de trabalho

- entender o escopo antes de editar e manter mudanças focadas;
- não alterar arquivos fora do escopo sem justificativa técnica;
- não instalar dependências ou expor credenciais sem necessidade;
- usar inglês para identificadores de código e português para conteúdo institucional;
- atualizar documentação quando setup, arquitetura, envs ou fluxo forem afetados;
- validar com os scripts realmente disponíveis no `package.json` da aplicação alterada.

## Front-end

- preservar os tokens e fontes definidos em `apps/web/src/app/globals.css`;
- usar componentes reutilizáveis de `apps/web/src/components/ui` quando aplicável;
- manter foco visível, semântica e responsividade;
- o carrossel usa Embla sem clones físicos; slides fora da área visível usam `inert` baseado em `slidesInView()`;
- Mesas usa estado vazio quando não há dados vigentes.

## Back-end e banco

A API atual possui a base NestJS, as rotas `/` e `/health` e a infraestrutura Prisma. Não documentar ou tratar login, JWT, usuários, mesas, pagamentos ou modelos de domínio como implementados.

PostgreSQL e Prisma ORM são as decisões atuais para homologação. Schema e migrations deverão ser versionados quando os primeiros modelos de domínio forem definidos. Em desenvolvimento, use `prisma migrate dev`; em homologação e produção, aplique somente migrations versionadas com `prisma migrate deploy`. Não use `prisma db push` em produção. Para preservar a portabilidade futura para MySQL, evite tipos nativos, extensões e SQL específicos do PostgreSQL sem decisão arquitetural documentada.

## Variáveis de ambiente

Nunca versionar `.env`, `.env.local` ou valores reais de credenciais. Versionar somente exemplos seguros.

No front-end, `SITE_URL` deve receber a URL HTTPS pública real em produção para metadata, canonical, Open Graph e JSON-LD. A landing não precisa de API em runtime no MVP.

## Roadmap

Próxima fase: autenticação, usuários, perfis de mestres, gerenciamento de mesas, participação de jogadores e calendário. Futuro: mesas pagas, pagamentos, integrações e ferramentas de RPG.

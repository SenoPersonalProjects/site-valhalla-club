# Orientações para agentes e colaboradores

## Contexto e estado atual

O Site Valhalla Club é o site institucional do clube de RPG de mesa de Aracaju,
Sergipe. O MVP está publicado na Vercel em https://clubevalhalla.vercel.app/.
A Fase 2 está em desenvolvimento/homologação; Netlify é legado não operacional.

O MVP implementa Header, Hero, Sobre, Eventos, Mesas rolando, Envolvidos e Contato/Footer, com conteúdo estático, responsividade, SEO básico e acessibilidade básica. A landing pública não depende do backend em runtime.

## Equipe

- Vinicius Ferreira — Tech Lead / FullStack;
- Charles Matias de Oliveira — FullStack;
- Gabriel Bomfim Bispo — FullStack;
- Vitor Xavier — Design/Figma;
- Dan — Stakeholder.

O modelo atual permite atuação fullstack. Não atribuir à equipe pessoas ou cargos históricos que não estejam nesta lista.

## Stack e estrutura

- `apps/web`: Next.js 16, React 19, TypeScript, Tailwind CSS 4, App Router e Embla Carousel;
- `apps/api`: NestJS 11, TypeScript, Prisma 7, logging/Request ID e domínio base de mesas;
- homologação: frontend Vercel, API Render Free e PostgreSQL hospedado no Supabase Free;
- Prisma integrado, schema inicial da Fase 2 e migration inicial aplicada em homologação;
- API/MySQL no Railway são produção planejada, condicionada a validação e métricas.

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

A API possui a base NestJS, observabilidade, Prisma e o domínio de campanhas,
sessões e one-shots. A autenticação e o JWT ainda não estão implementados. Até
essa integração, as rotas privadas falham fechadas com `401 USER_CONTEXT_REQUIRED`.
`request.user.id` é o contrato esperado da futura infraestrutura confiável de
autenticação. Nenhum header arbitrário, incluindo `x-user-id`, é tratado como
identidade. Não criar fallback de produção que fabrique `request.user` com dados
do cliente. Rotas públicas continuam acessíveis normalmente; contexto simulado
de autenticação pertence exclusivamente ao código de teste.

PostgreSQL e Prisma ORM são as decisões atuais para homologação. Schema e
migrations são versionados. Em desenvolvimento, use `prisma migrate dev`; em
homologação e produção, aplique somente migrations versionadas com
`prisma migrate deploy`. Não use `prisma db push` em produção. Para preservar a
portabilidade futura para MySQL, evite tipos nativos, extensões e SQL específicos
do PostgreSQL sem decisão arquitetural documentada.

Supabase é PostgreSQL hospedado: não adotar Auth como fundação da autenticação
nem Realtime, Edge Functions, Storage ou RLS sem nova decisão. Regras de negócio
pertencem à API NestJS. Distinguir modelo de schema, código implementado e
funcionalidade homologada. Documentos canônicos:
[arquitetura](architecture/fase2-ambientes.md),
[métricas e logs seguros](observability/metricas-capacidade-fase2.md),
[privacidade](privacy/lgpd-fase2.md) e [deploy Vercel](deploy-vercel.md).

## Variáveis de ambiente

Nunca versionar `.env`, `.env.local` ou valores reais de credenciais. Versionar somente exemplos seguros.

Nunca registrar secrets em PR, ClickUp, documentação ou logs. Vercel administra
variáveis do frontend; Render as da API de homologação; Railway deverá administrar
as de futura produção. Rotação deve ser possível por configuração, sem código.

No front-end, `SITE_URL` deve receber a URL HTTPS pública real em produção para metadata, canonical, Open Graph e JSON-LD. A landing não precisa de API em runtime no MVP.

## Roadmap

Fase 2 atual: autenticação/cadastro/aprovação, papéis, perfil, campanhas, sessões,
one-shots, participações, feedback, reports, advertências, sanções, recursos,
administração, audit log e homologação. O domínio base de mesas existe; não
documentar os demais fluxos como prontos por haver modelos no schema.

Futuro: menores, marketplace de assets/homebrews, pagamentos, fórum, galeria,
enquetes, Google Calendar e ferramentas avançadas de RPG. Ver [MVP e Fase 2](mvp.md).

# Site Valhalla Club

Site institucional do Valhalla Club, comunidade de RPG de mesa de Aracaju, Sergipe. Apresenta a marca, a história do clube, eventos, mesas vigentes, envolvidos e contato.

## Estado atual

O MVP institucional está **publicado na Vercel**:
[clubevalhalla.vercel.app](https://clubevalhalla.vercel.app/).
A Fase 2 está em desenvolvimento/homologação, separada da landing pública.

## MVP implementado

- Header, navegação interna e menu mobile;
- Hero, Sobre, Eventos, Mesas rolando, Envolvidos e Contato/Footer;
- conteúdo institucional e eventos estáticos;
- estado vazio para Mesas quando não existem mesas vigentes;
- identidade visual responsiva;
- SEO básico e acessibilidade básica.

A landing pública não depende da API em runtime.

As rotas públicas da API continuam acessíveis sem autenticação. Cadastro,
aprovação inicial e JWT estão implementados; rotas privadas exigem Bearer válido
e estado APPROVED atual no banco. O guard fornece `request.user.id`; `x-user-id`
não autentica. Logout revoga todos os tokens anteriores por versão de conta.
Ver [contrato de autenticação](docs/api/auth.md), incluindo configuração obrigatória.

## Stack

| Área      | Tecnologias e estado                                                          |
| --------- | ----------------------------------------------------------------------------- |
| Front-end | Next.js 16, React 19, TypeScript, Tailwind CSS 4, App Router e Embla Carousel |
| Back-end  | NestJS 11, TypeScript e Prisma ORM; campanhas, sessões e one-shots da Fase 2  |
| Banco     | PostgreSQL em homologação, com schema e migration inicial da Fase 2           |
| Gestão    | GitHub e ClickUp                                                              |

Homologação da Fase 2: frontend Vercel, API NestJS no Render Free e PostgreSQL
hospedado no Supabase Free. Prisma 7, schema inicial, migration aplicada em
homologação, logging estruturado/Request ID e domínio base de Campaign, Session
e OneShot já existem. Auth/JWT está implementada no código; administração completa
de usuários e os demais fluxos continuam fora dessa entrega. A migration adicional
de `authVersion` precisa ser aplicada pelo fluxo autorizado antes do deploy.
API NestJS e MySQL no Railway são **produção planejada**, condicionada a
homologação, métricas e validação da migração. Supabase é usado como PostgreSQL
hospedado, sem adotar Auth ou outros serviços como fundação do domínio.

## Estrutura

```text
apps/
  web/                 # landing Next.js
  api/                 # base NestJS
docs/                  # documentação do projeto
.github/               # template de Pull Request
```

## Como rodar

Consulte o [guia de setup local](docs/setup-local.md). Cada app possui seu próprio `package.json` e `.env.example`.

No front-end, `SITE_URL` define canonical, Open Graph e JSON-LD. Em produção, use a URL HTTPS pública real do deploy.

## Documentação

Fundamentos da Fase 2: arquitetura (`86e39wfaq`), métricas/capacidade
(`86e39whgu`), privacidade (`86e39wg1h`) e atualização documental (`86e39wf6c`).

- [MVP: escopo, estado e roadmap](docs/mvp.md)
- [Setup local](docs/setup-local.md)
- [Briefing inicial e evolução](docs/briefing.md)
- [Orientações para agentes e colaboradores](docs/AGENTS.md)
- [Design system](docs/design-system.md)
- [Header e Hero](docs/header-hero-landing.md)
- [Prisma ORM, PostgreSQL e portabilidade](docs/database/prisma-postgresql-e-portabilidade-mysql.md)
- [Campanhas, sessões e one-shots](docs/api/tables-domain.md)
- [Arquitetura e ambientes da Fase 2](docs/architecture/fase2-ambientes.md)
- [Métricas e capacidade da Fase 2](docs/observability/metricas-capacidade-fase2.md)
- [Privacidade e LGPD da Fase 2](docs/privacy/lgpd-fase2.md)
- [Deploy atual do frontend na Vercel](docs/deploy-vercel.md)
- [Histórico Netlify — legado não operacional](docs/deploy-netlify.md)
- [README do front-end](apps/web/README.md)
- [README da API](apps/api/README.md)

## Fluxo Git

```text
task branch → develop → main
```

- `main`: produção;
- `develop`: integração e homologação;
- task branches saem de `develop` e abrem PR para `develop`;
- `develop` só segue para `main` após validação;
- não fazer push direto em `develop` ou `main`.

## Roadmap

**MVP publicado:** landing institucional com conteúdo estático na Vercel.

**Fase 2 em desenvolvimento/homologação:** autenticação/cadastro/aprovação,
papéis, perfil, campanhas, sessões, one-shots, participações, feedback, reports,
advertências, sanções, recursos, administração e audit log. O domínio base de
mesas já existe; schema não significa que todos esses fluxos estejam entregues.

**Futuro / fora desta etapa:** menores de idade, marketplace de assets/homebrews,
pagamentos, fórum, galeria, enquetes, Google Calendar e ferramentas avançadas de
RPG. Detalhamento e estado de implementação: [MVP e Fase 2](docs/mvp.md).

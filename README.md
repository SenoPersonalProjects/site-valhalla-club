# Site Valhalla Club

Site institucional do Valhalla Club, comunidade de RPG de mesa de Aracaju, Sergipe. Apresenta a marca, a história do clube, eventos, mesas vigentes, envolvidos e contato.

## Estado atual

O MVP institucional está **homologado e em preparação para produção**. A publicação no Netlify ainda não ocorreu.

## MVP implementado

- Header, navegação interna e menu mobile;
- Hero, Sobre, Eventos, Mesas rolando, Envolvidos e Contato/Footer;
- conteúdo institucional e eventos estáticos;
- estado vazio para Mesas quando não existem mesas vigentes;
- identidade visual responsiva;
- SEO básico e acessibilidade básica.

A landing pública não depende da API em runtime.

As rotas públicas da API continuam acessíveis sem autenticação. Rotas privadas
exigem `request.user.id`, contrato da futura infraestrutura confiável de
autenticação. Enquanto essa integração não existir, falham fechadas com
`401 USER_CONTEXT_REQUIRED`. Nenhum header arbitrário do cliente, incluindo
`x-user-id`, é tratado como identidade. Autenticação/JWT ainda não foi implementada.

## Stack

| Área      | Tecnologias e estado                                                          |
| --------- | ----------------------------------------------------------------------------- |
| Front-end | Next.js 16, React 19, TypeScript, Tailwind CSS 4, App Router e Embla Carousel |
| Back-end  | NestJS 11, TypeScript e Prisma ORM; campanhas, sessões e one-shots da Fase 2  |
| Banco     | PostgreSQL em homologação, com schema e migration inicial da Fase 2           |
| Gestão    | GitHub e ClickUp                                                              |

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

- [MVP: escopo, estado e roadmap](docs/mvp.md)
- [Setup local](docs/setup-local.md)
- [Briefing inicial e evolução](docs/briefing.md)
- [Orientações para agentes e colaboradores](docs/AGENTS.md)
- [Design system](docs/design-system.md)
- [Header e Hero](docs/header-hero-landing.md)
- [Prisma ORM, PostgreSQL e portabilidade](docs/database/prisma-postgresql-e-portabilidade-mysql.md)
- [Campanhas, sessões e one-shots](docs/api/tables-domain.md)
- [Preparação de deploy no Netlify](docs/deploy-netlify.md)
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

**MVP atual:** landing institucional homologada, com conteúdo estático.

**Próxima fase:** autenticação, usuários, perfis de mestres, gerenciamento de mesas, participação de jogadores e calendário.

**Futuro:** mesas pagas, pagamentos, integrações e ferramentas específicas de RPG.

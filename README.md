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

## Stack

| Área | Tecnologias e estado |
| --- | --- |
| Front-end | Next.js 16, React 19, TypeScript, Tailwind CSS 4, App Router e Embla Carousel |
| Back-end | NestJS 11 e TypeScript; base com rotas `/` e `/health` |
| Banco | MySQL definido; Prisma ORM definido para a fase de dados, sem integração, schema ou migrations no repositório |
| Gestão | GitHub e ClickUp |

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
- [Prisma ORM e MySQL](docs/database/orm-e-conexao-mysql.md)
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

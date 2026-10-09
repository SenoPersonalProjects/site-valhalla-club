# Guia de setup local

## Pré-requisitos

- Node.js 24 e npm (a API também aceita `^20.19`, `^22.12` ou `>=24`);
- Git;
- acesso ao repositório privado no GitHub;
- PostgreSQL quando for executar a API com acesso ao banco.

## Clone

```bash
git clone https://github.com/SenoPersonalProjects/site-valhalla-club.git
cd site-valhalla-club
```

## Front-end

```bash
cd apps/web
npm install
```

Crie `.env.local` a partir de `.env.example` e ajuste as variáveis existentes:

```env
SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Site Valhalla Club
NEXT_PUBLIC_APP_ENV=development
```

Execute:

```bash
npm run dev
npm run lint
npm run build
```

O front-end local usa `http://localhost:3000`. No MVP público atual, `NEXT_PUBLIC_API_URL` não é consumida pela landing em runtime. Em produção, `SITE_URL` deve receber a URL HTTPS pública real, pois alimenta canonical, Open Graph e JSON-LD.

## Back-end

```bash
cd apps/api
npm install
```

Crie `.env` a partir de `.env.example`. As variáveis documentadas atualmente são:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://valhalla_app:change-me@localhost:5432/valhalla?schema=public
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
```

Execute:

```bash
npm run prisma:validate
npm run prisma:generate
npm run start:dev
npm run build
```

A API escuta `PORT` (ou 3000 se ela não for definida), expõe `/` e `/health` e conecta ao PostgreSQL ao iniciar. O valor do exemplo deve apontar para um banco local ou isolado para o desenvolvimento. Solicite ao Tech Lead a `DATABASE_URL` real somente quando precisar acessar homologação. JWT, CORS e integração com o front-end ainda não estão implementados.

## PostgreSQL e Prisma ORM

O Prisma está integrado à API e configurado para PostgreSQL. O schema ainda não possui modelos de domínio, por isso nenhuma migration vazia foi criada. Consulte [a documentação de banco](database/prisma-postgresql-e-portabilidade-mysql.md).

Depois que o primeiro modelo for aprovado, o fluxo local, usando exclusivamente um banco de desenvolvimento, será:

```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:migrate:dev -- --name nome_da_migration
npm run prisma:generate
```

Em homologação e produção, aplique apenas migrations já versionadas:

```bash
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

Não use `prisma db push` em produção.

Nunca execute `prisma:migrate:dev` com a URL de homologação. O ambiente ou job responsável por `prisma:migrate:deploy` deve instalar as `devDependencies`, pois elas incluem a CLI do Prisma.

## Testes da API

Os scripts existentes incluem `npm run lint`, `npm run test`, `npm run test:e2e` e `npm run build`. O script de lint da API contém `--fix`; não o execute em uma auditoria ou revisão sem autorização para escrita.

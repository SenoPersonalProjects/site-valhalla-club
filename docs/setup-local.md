# Guia de setup local

## Pré-requisitos

- Node.js e npm;
- Git;
- acesso ao repositório privado no GitHub;
- MySQL somente quando for trabalhar na futura fase de backend/database.

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
DATABASE_URL=mysql://usuario:senha@localhost:3306/valhalla
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
```

Execute:

```bash
npm run start:dev
npm run build
```

A API atual escuta `PORT` (ou 3000 se ela não for definida) e expõe `/` e `/health`. As variáveis de banco, JWT, CORS e front-end estão presentes no exemplo para a evolução da API, mas não correspondem a autenticação, banco ou CORS configurados no código atual.

## MySQL e Prisma ORM

MySQL é o banco definido e Prisma ORM é a decisão para a fase de dados. Atualmente não existem dependências Prisma, `prisma/schema.prisma` ou migrations. Portanto, não há comandos Prisma executáveis neste repositório ainda. Consulte [a documentação de banco](database/orm-e-conexao-mysql.md).

## Testes da API

Os scripts existentes incluem `npm run lint`, `npm run test`, `npm run test:e2e` e `npm run build`. O script de lint da API contém `--fix`; não o execute em uma auditoria ou revisão sem autorização para escrita.

# API — Site Valhalla Club

Base NestJS 11 para as futuras fases de backend do projeto.

## Estado atual

Existem somente as rotas `GET /` e `GET /health`. Não há autenticação, JWT funcional, usuários, mesas, pagamentos, Prisma, schema ou migrations implementados. A landing pública do MVP não depende desta API em runtime.

## Scripts

```bash
npm run start:dev
npm run build
npm run test
npm run test:e2e
```

O script `npm run lint` usa `--fix`; execute-o somente quando alterações automáticas forem autorizadas.

## Ambiente

Copie `.env.example` para `.env`. As variáveis presentes são `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL` e `CORS_ORIGIN`.

Elas registram necessidades da evolução futura; o código atual lê somente `PORT`. Consulte o [setup local](../../docs/setup-local.md) e a [decisão MySQL/Prisma](../../docs/database/orm-e-conexao-mysql.md).

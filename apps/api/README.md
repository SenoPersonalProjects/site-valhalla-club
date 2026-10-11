# API — Site Valhalla Club

API NestJS 11 com acesso a dados por Prisma ORM e o domínio inicial de mesas da
Fase 2.

## Estado atual

Além das rotas `GET /` e `GET /health`, a API implementa campanhas, sessões,
one-shots, consulta das mesas do usuário, aprovação administrativa e publicação.
O schema inicial e sua migration estão versionados. Ainda não há autenticação ou
JWT funcional; por isso, as rotas privadas usam temporariamente `x-user-id`,
conforme documentado no contrato do domínio. A landing pública do MVP não
depende desta API em runtime.

Consulte a [documentação de campanhas, sessões e one-shots](../../docs/api/tables-domain.md).

## Scripts

```bash
npm run start:dev
npm run build
npm run test
npm run test:e2e
npm run prisma:validate
npm run prisma:generate
```

Os comandos de build, execução e testes geram o Prisma Client automaticamente. `prisma:validate` e `prisma:generate` não abrem conexão e podem rodar antes de a URL real existir.

O script `npm run lint` usa `--fix`; execute-o somente quando alterações automáticas forem autorizadas.

## Ambiente

Use Node.js 24, versão registrada em `.nvmrc`. O Prisma também aceita Node `^20.19`, `^22.12` ou `>=24`.

Copie `.env.example` para `.env`. Para desenvolvimento e migrations locais, use um banco local ou isolado. Solicite ao Tech Lead o valor real de `DATABASE_URL` somente para homologação; nunca versione essa credencial. As demais variáveis presentes são `PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL` e `CORS_ORIGIN`.

`DATABASE_URL` é carregada pelo `ConfigModule` e usada pelo `PrismaService`. A API tenta conectar ao PostgreSQL ao iniciar e encerra o pool junto com a aplicação. Consulte o [setup local](../../docs/setup-local.md) e a [documentação do Prisma e PostgreSQL](../../docs/database/prisma-postgresql-e-portabilidade-mysql.md).

## Migrations

- Desenvolvimento: `npm run prisma:migrate:dev -- --name nome_da_migration`.
- Homologação e produção: `npm run prisma:migrate:deploy`.
- Diagnóstico: `npm run prisma:migrate:status`.

O Prisma 7 não gera necessariamente o client depois de uma migration; execute `npm run prisma:generate` explicitamente. Não use `prisma db push` em produção.

Nunca execute `prisma:migrate:dev` usando a URL de homologação. O job que aplica `prisma:migrate:deploy` precisa instalar as `devDependencies`, pois a CLI do Prisma pertence a esse grupo.

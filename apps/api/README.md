# API — Site Valhalla Club

API NestJS 11 com acesso a dados por Prisma ORM e o domínio inicial de mesas da
Fase 2.

## Estado atual

Além das rotas `GET /` e `GET /health`, a API implementa campanhas, sessões,
one-shots, consulta das mesas do usuário, aprovação administrativa e publicação.
O schema inicial e sua migration estão versionados. Ainda não há autenticação ou
JWT funcional. Rotas privadas exigem `request.user.id`, contrato da futura
infraestrutura confiável de autenticação. Sem esse contexto, falham fechadas com
`401 USER_CONTEXT_REQUIRED`, inclusive quando o cliente envia apenas `x-user-id`.
Nenhum header arbitrário é tratado como identidade e nenhum código de produção
fabrica `request.user` a partir de dados do cliente. As rotas públicas continuam
acessíveis normalmente. A landing pública do MVP não depende desta API em runtime.

Consulte a [documentação de campanhas, sessões e one-shots](../../docs/api/tables-domain.md).

A arquitetura temporária de desenvolvimento/homologação usa frontend Vercel,
API NestJS no Render Free e PostgreSQL hospedado no Supabase Free. Prisma 7 está
integrado; a migration inicial da Fase 2 está aplicada em homologação. Logging
estruturado JSON e Request ID também estão implementados. A landing do MVP já
está publicada na Vercel.

API e MySQL no Railway são produção planejada, dependente de homologação,
métricas e ensaio de migração. Supabase Auth e demais serviços específicos não
são fundação do domínio. Detalhes canônicos:
[ambientes e secrets](../../docs/architecture/fase2-ambientes.md),
[métricas, capacidade e logs seguros](../../docs/observability/metricas-capacidade-fase2.md)
e [dados pessoais e acesso](../../docs/privacy/lgpd-fase2.md).

Modelos de conta, perfil, participação, feedback, disciplina e audit log existem
no schema; seus fluxos completos não estão implementados por esta documentação.

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

Copie `.env.example` para `.env`, apenas localmente. Para desenvolvimento e
migrations locais, use um banco local ou isolado. Solicite acesso à conexão de
homologação por canal privado autorizado; nunca registre credenciais em PR,
ClickUp, documentação ou logs. As variáveis presentes são `DATABASE_URL`, `PORT`,
`NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL` e `CORS_ORIGIN`.
JWT e integração/CORS ainda são configurações reservadas, não recursos prontos.
Render administra os secrets de homologação; Railway deverá administrar os da
futura produção. Rotação por configuração, sem alteração de código.

`DATABASE_URL` é carregada pelo `ConfigModule` e usada pelo `PrismaService`. A API tenta conectar ao PostgreSQL ao iniciar e encerra o pool junto com a aplicação. Consulte o [setup local](../../docs/setup-local.md) e a [documentação do Prisma e PostgreSQL](../../docs/database/prisma-postgresql-e-portabilidade-mysql.md).

## Migrations

- Desenvolvimento: `npm run prisma:migrate:dev -- --name nome_da_migration`.
- Homologação e produção: `npm run prisma:migrate:deploy`.
- Diagnóstico: `npm run prisma:migrate:status`.

O Prisma 7 não gera necessariamente o client depois de uma migration; execute `npm run prisma:generate` explicitamente. Não use `prisma db push` em produção.

Nunca execute `prisma:migrate:dev` usando a URL de homologação. O job que aplica `prisma:migrate:deploy` precisa instalar as `devDependencies`, pois a CLI do Prisma pertence a esse grupo.

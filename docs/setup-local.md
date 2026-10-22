# Guia de setup local

## Pré-requisitos

- Node.js 24 e npm (a API também aceita `^20.19`, `^22.12` ou `>=24`);
- Git;
- acesso ao repositório privado no GitHub;
- PostgreSQL local ou isolado quando for executar a API com acesso ao banco.

MVP publicado na [Vercel](https://clubevalhalla.vercel.app/). Homologação da Fase 2
usa Vercel / Render Free / Supabase Free (PostgreSQL); Railway/MySQL é planejamento.
Ver [arquitetura e ambientes](architecture/fase2-ambientes.md).

## Clone

```bash
git clone https://github.com/SenoPersonalProjects/site-valhalla-club.git
cd site-valhalla-club
```

## Front-end

```bash
cd apps/web
npm ci
```

Crie `.env.local` a partir de `.env.example` e ajuste as variáveis existentes.
Somente nomes, sem credenciais:

```text
SITE_URL
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_APP_ENV
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
npm ci
```

Crie `.env` a partir de `.env.example`. As variáveis documentadas atualmente são:

```text
PORT
NODE_ENV
DATABASE_URL
JWT_SECRET
JWT_EXPIRES_IN
FRONTEND_URL
CORS_ORIGIN
```

Execute:

```bash
npm run prisma:validate
npm run prisma:generate
npm run start:dev
npm run build
```

A API escuta `PORT` (ou 3000 se ela não for definida), expõe `/`, `/health` e
rotas do [domínio de mesas](api/tables-domain.md), e conecta ao PostgreSQL ao
iniciar. Use banco local ou isolado para desenvolvimento; solicite acesso à
homologação por canal privado autorizado. Cadastro, aprovação inicial e JWT estão
implementados; CORS e integração da landing com a API continuam fora desta entrega.
Configure `JWT_SECRET` aleatório com pelo menos 32 bytes e `JWT_EXPIRES_IN`
(segundos positivos ou `s/m/h/d`, por exemplo `15m`) no ambiente local. Não há
secret padrão; sem configuração válida a inicialização falha. Nunca copie o
secret para o repositório, PR ou logs. Rotação por ambiente invalida tokens
assinados pela chave anterior e exige novo login.

O cadastro cria PENDING; um ADMIN/DEV de sistema APPROVED precisa revisar o registro
antes do login. Não há bootstrap público de administrador nem concessão de roles
no cadastro; provisionamento inicial de um operador é um procedimento operacional
controlado, fora desta API. Rotas privadas usam Bearer e `request.user.id` validado;
`x-user-id` não autentica. Ver [contrato de auth](api/auth.md), incluindo rotas
públicas e logout que invalida todos os tokens anteriores.

## PostgreSQL e Prisma ORM

Prisma 7 está integrado à API, configurado para PostgreSQL, com schema inicial
da Fase 2 e migration inicial versionada e aplicada em homologação. Logging
estruturado/Request ID e domínio base de Campaign, Session e OneShot estão
implementados. Consulte [a documentação de banco](database/prisma-postgresql-e-portabilidade-mysql.md).

A nova migration `20261021120000_add_user_auth_version` adiciona somente o contador
de invalidação de JWT. Foi criada/revisada sem aplicação ao banco nesta tarefa;
é necessário aplicá-la pelo fluxo autorizado antes de executar esta versão.
Não foi executado `migrate dev`, pois não se comprovou conexão local/isolada.

Para novas alterações de modelo aprovadas, o fluxo local usa exclusivamente
um banco de desenvolvimento:

```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:migrate:dev -- --name nome_da_migration
npm run prisma:generate
```

Em homologação, aplique apenas migrations já versionadas e revisadas. A futura
produção exige sua própria validação de provider e histórico MySQL; o SQL
PostgreSQL não deve ser aplicado diretamente nela. Para o ambiente compatível:

```bash
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

Não use `prisma db push` em produção.

Nunca execute `prisma:migrate:dev` com a URL de homologação. O ambiente ou job responsável por `prisma:migrate:deploy` deve instalar as `devDependencies`, pois elas incluem a CLI do Prisma.

## Testes da API

Os scripts existentes incluem `npm run lint`, `npm run test`, `npm run test:e2e` e `npm run build`. O script de lint da API contém `--fix`; não o execute em uma auditoria ou revisão sem autorização para escrita.

Os E2E atuais substituem Prisma por mock e não comprovam integração real com
PostgreSQL ou MySQL. Para critérios de capacidade, consultar
[métricas](observability/metricas-capacidade-fase2.md).

## Segurança de configuração

`.env` e `.env.local` são somente locais; exemplos versionados contêm apenas
nomes/exemplos seguros. Nunca copiar secrets para PR, ClickUp, documentação ou
logs. Variáveis `NEXT_PUBLIC_*` são públicas. Ambientes remotos administram
secrets pela plataforma e permitem rotação sem alterar código; inventário e
responsabilidades em [arquitetura](architecture/fase2-ambientes.md#secrets-e-variáveis-por-aplicação).
Não usar dados reais pessoais em desenvolvimento; ver [privacidade](privacy/lgpd-fase2.md).

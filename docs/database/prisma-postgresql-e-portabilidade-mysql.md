# Prisma ORM, PostgreSQL e portabilidade para MySQL

## Decisão arquitetural

- Banco de homologação: **PostgreSQL**.
- Camada de acesso a dados: **Prisma ORM 7**.
- Conexão: variável `DATABASE_URL`, mantida fora do Git.
- Alterações estruturais: migrations Prisma versionadas.
- Objetivo futuro: preservar a possibilidade de migração para MySQL.

Formato da conexão PostgreSQL:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/nome_do_banco?schema=public
```

O valor real de homologação deve ser solicitado ao Tech Lead. O exemplo usa `localhost` e deve ser substituído por uma conexão local ou isolada durante o desenvolvimento.

## Estado da implementação

| Item                                     | Estado atual                                   |
| ---------------------------------------- | ---------------------------------------------- |
| Dependências Prisma e adapter PostgreSQL | Instaladas                                     |
| `prisma/schema.prisma`                   | Criado com provider PostgreSQL                 |
| Integração com NestJS                    | `PrismaModule` e `PrismaService` implementados |
| Carregamento de `.env`                   | Configurado com `ConfigModule`                 |
| Modelos de domínio                       | Aguardando definição                           |
| `prisma/migrations/`                     | Aguardando o primeiro modelo aprovado          |
| Conexão de homologação                   | Pendente da `DATABASE_URL` real                |

A API abre a conexão no início da aplicação e a encerra durante o shutdown. Os testes e2e substituem o serviço de banco por um mock para continuarem determinísticos e independentes de infraestrutura externa.

## Fluxo de desenvolvimento

Após configurar em `apps/api/.env` uma `DATABASE_URL` que aponte exclusivamente para um banco de desenvolvimento:

```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:migrate:dev -- --name nome_da_migration
npm run prisma:generate
```

O comando `prisma:migrate:dev` é exclusivo para desenvolvimento. O Prisma 7 não executa necessariamente a geração do client depois de uma migration, por isso `prisma:generate` permanece explícito.

Não use a credencial de homologação nesse fluxo. A geração e a validação do client não abrem conexão e também são executadas automaticamente antes de build, execução local e testes.

O schema atual não contém modelos. Não foi criada uma migration vazia, pois ela não descreveria uma alteração real do domínio.

## Fluxo de homologação e produção

Configure `DATABASE_URL` como segredo do ambiente e aplique somente migrations já revisadas e versionadas:

```bash
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

Não use `prisma migrate dev` nem `prisma db push` em homologação ou produção. O projeto não oferece script de `db push`.

A CLI `prisma` é uma `devDependency`. Portanto, o estágio ou job que executar `prisma:migrate:deploy` precisa instalar as dependências de desenvolvimento antes de aplicar as migrations; a imagem final de runtime pode permanecer sem a CLI.

## Portabilidade para MySQL

Portabilidade não significa trocar apenas a URL em runtime. O provider e o adapter fazem parte da configuração gerada, e uma migração futura para MySQL exigirá:

1. revisar o schema e trocar provider e adapter;
2. criar ou baselinar um histórico de migrations próprio para MySQL;
3. migrar e validar os dados;
4. executar build, testes e testes de integração contra o novo banco.

Até essa decisão, os modelos devem evitar tipos nativos `@db.*`, arrays exclusivos do PostgreSQL, extensões, SQL bruto, índices e defaults específicos do banco sem justificativa arquitetural documentada.

## Segurança

Nunca versione `.env`, credenciais ou a `DATABASE_URL` real. Antes de considerar a conexão validada, execute `npm run prisma:migrate:status` com a URL fornecida pelo Tech Lead e registre o resultado no PR ou no ClickUp sem expor o segredo.

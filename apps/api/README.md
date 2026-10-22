# API — Site Valhalla Club

API NestJS 11 com acesso a dados por Prisma ORM e o domínio inicial de mesas da
Fase 2.

## Estado atual

Revisão e pendências de hardening: [segurança da Fase 2](../../docs/security/security-review-fase2.md),
incluindo os limites de login/cadastro e o débito TLS local.

Além das rotas `GET /` e `GET /health`, a API implementa campanhas, sessões,
one-shots, consulta das mesas do usuário, aprovação administrativa e publicação.
Cadastro, revisão inicial e autenticação JWT estão implementados. Um guard global
exige `Authorization: Bearer <token>` nas rotas privadas e popula `request.user.id`
após verificar assinatura, expiração, versão e estado atual APPROVED no banco.
Sem Bearer, retorna `401 AUTH_TOKEN_REQUIRED`; `x-user-id` não autentica.
`CurrentUserId` preserva a defesa adicional `401 USER_CONTEXT_REQUIRED` se não
receber contexto válido. Logout invalida todos os JWTs anteriores da conta.
As rotas públicas continuam acessíveis. A landing do MVP não depende desta API.

O [contrato de autenticação](../../docs/api/auth.md) detalha cadastro PENDING,
aprovação/rejeição por ADMIN/DEV, hash bcrypt, projeções e códigos de erro.
A [camada de autorização](../../docs/api/roles-authorization.md) centraliza os
requisitos de SystemRole e ClubRole, com guard global após a autenticação e
verificação no banco também pelos serviços, incluindo TransactionClient.
ClubRole.ADMIN não concede administração técnica; somente contas APPROVED
exercem roles. Administração completa de usuários permanece fora do escopo.
O cadastro não concede papéis de clube automaticamente.

O [perfil e ciclo de vida da própria conta](../../docs/api/account-lifecycle.md)
reutiliza `/auth/me`, permite editar nome/WhatsApp e solicitar exclusão com
janela de 90 dias e revogação de tokens. Recuperação segura e anonimização
definitiva ainda estão pendentes; não há administração de terceiros nessas rotas.

Consulte a [documentação de campanhas, sessões e one-shots](../../docs/api/tables-domain.md).

## Regras operacionais de mesas

`TableRulesService` centraliza as quotas e o calendário da tarefa `86e39wje2`:

- máximo de 2 campanhas ACTIVE por mestre, validado na publicação com aprovação
  inicial; DRAFTs não contam, a própria campanha é excluída na republicação e
  administradores não bypassam o limite;
- publicação de Campaign já ACTIVE e reaprovação de ACTIVE + APPROVED são
  no-ops autorizados, sem UPDATE e sem renovação de `updatedAt` ou dos metadados
  de revisão. Nova nota em reaprovação repetida não substitui a anterior;
- sessões posteriores de Campaign não removem aprovação; alteração de conteúdo
  continua removendo aprovação e exposição pública quando aplicável;
- máximo global de 5 one-shots por sistema/mês de `Session.scheduledAt` em
  America/Maceio, com limites do mês convertidos para UTC;
- todos os estados contam, inclusive DRAFT, CANCELLED e COMPLETED; cancelar não
  libera quota, exclusão legítima de DRAFT sem histórico libera;
- agendamento de one-shot deve ser futuro e no máximo 30 × 24 horas adiante,
  incluindo o limite exato; sessões de Campaign não recebem essa janela;
- PATCH comum de one-shot altera apenas conteúdo. Sistema/data exigem
  `PATCH /admin/one-shots/:id/correction`, com ADMIN/DEV de sistema APPROVED,
  sem privilégio por ClubRole.ADMIN e sem bypass de quota/janela;
- correção atualiza OneShot + Session atomicamente, exclui o próprio registro
  da contagem, reseta aprovação e devolve SCHEDULED a DRAFT. CANCELLED/COMPLETED
  não podem ser corrigidos.

Publicação de Campaign, criação e correção estrutural de OneShot usam transações
Prisma Serializable, com até três tentativas completas em conflito `P2034`.
As demais mutações de Campaign/OneShot existentes também validam estado dentro
da transação da escrita; a correção valida o sistema ativo com o mesmo
TransactionClient, sem leituras de estado reaproveitadas entre tentativas.
Erros novos: `CAMPAIGN_ACTIVE_LIMIT_REACHED`, `ONE_SHOT_MONTHLY_LIMIT_REACHED`,
`ONE_SHOT_SCHEDULE_TOO_FAR`, `ONE_SHOT_ADMIN_CORRECTION_REQUIRED`,
`ONE_SHOT_CORRECTION_EMPTY` e `TABLE_CONCURRENT_CHANGE`. Contratos e HTTP estão
no [guia de domínio](../../docs/api/tables-domain.md#concorrência-e-erros-operacionais).

`CampaignInactivityService` reconcilia no startup e a cada hora pelo scheduler
oficial `@nestjs/schedule` 6.1.3. Usa `updateMany` para ACTIVE → INACTIVE se
`updatedAt < agora - 30 dias` e não existe sessão não CANCELLED com data igual
ou posterior ao cutoff. `updatedAt` dá baseline a publicações sem sessões;
sessões recentes/futuras mantêm atividade. É idempotente, não altera outros
estados e não introduz escrita em GET. Ambientes que dormem fazem catch-up ao
reiniciar; falhas são logadas sem secrets e tentadas novamente no próximo ciclo.
Não depende de cron do sistema operacional.

Reconciliação e mutações de Session de Campaign usam transações Serializable;
conflitos repetem a operação completa com nova leitura de estado/predicado.
Não há auto-reativação: se a reconciliação serializar primeiro, uma sessão pode
ser adicionada/remarcada na Campaign INACTIVE, como já permitido; reativá-la
exige publicação explícita, aprovação e quota. Não há escrita artificial em
`Campaign.updatedAt` para coordenar essas operações.

As regras permanecem em NestJS/Prisma, sem mudança de schema/migrations ou SQL
específico. Testes de concorrência usam doubles de transações; a validação de
isolamento e desempenho em PostgreSQL/MySQL reais continua sendo revisão de
integração antes de produção, sem criar banco real nesta tarefa.

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
`JWT_SECRET` é obrigatório, sem fallback, com pelo menos 32 bytes; use um segredo
aleatório forte administrado pelo ambiente. `JWT_EXPIRES_IN` é obrigatório e aceita
segundos positivos ou sufixos `s`, `m`, `h`, `d` (exemplo: `15m`). A inicialização
falha com configuração ausente/inválida. Integração/CORS continuam reservados.
Render administra os secrets de homologação; Railway deverá administrar os da
futura produção. Rotação por configuração, sem alteração de código.

`DATABASE_URL` é carregada pelo `ConfigModule` e usada pelo `PrismaService`. A API tenta conectar ao PostgreSQL ao iniciar e encerra o pool junto com a aplicação. Consulte o [setup local](../../docs/setup-local.md) e a [documentação do Prisma e PostgreSQL](../../docs/database/prisma-postgresql-e-portabilidade-mysql.md).

## Migrations

`20261021120000_add_user_auth_version` acrescenta somente `User.authVersion`
com default 0. A migration inicial permanece intacta. Nesta implementação nenhuma
migration foi aplicada: valide/revise e aplique pelo fluxo autorizado do ambiente
antes de executar a API. O histórico PostgreSQL não deve ser aplicado no MySQL.

- Desenvolvimento: `npm run prisma:migrate:dev -- --name nome_da_migration`.
- Homologação e produção: `npm run prisma:migrate:deploy`.
- Diagnóstico: `npm run prisma:migrate:status`.

O Prisma 7 não gera necessariamente o client depois de uma migration; execute `npm run prisma:generate` explicitamente. Não use `prisma db push` em produção.

Nunca execute `prisma:migrate:dev` usando a URL de homologação. O job que aplica `prisma:migrate:deploy` precisa instalar as `devDependencies`, pois a CLI do Prisma pertence a esse grupo.

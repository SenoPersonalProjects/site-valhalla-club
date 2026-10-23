# Papéis e autorização

Task `86e39why4`. A autenticação permanece descrita em [auth.md](auth.md).
`CurrentUserId` fornece identidade; autorização é responsabilidade da camada
`src/authorization` e das regras de domínio.

## Dois conjuntos independentes

`SystemRole` é um único papel de sistema por conta: `USER`, `ADMIN` ou `DEV`.
`ClubRole` contém os papéis de negócio `PLAYER`, `MASTER` e `ADMIN`, cumulativos
pelos vínculos `UserClubRole`. Não existe promoção ou hierarquia implícita entre
esses conjuntos.

**ClubRole.ADMIN não concede administração técnica.** Não implica MASTER,
SystemRole.ADMIN ou DEV. SystemRole.ADMIN/DEV também não implica MASTER para
criação de mesas. PLAYER e ADMIN de clube não recebem novas funções nesta task.

O banco é a fonte de verdade. Roles não ficam no JWT e nunca são obtidas de
headers, body, query, cookies ou claims enviados pelo cliente. O AuthGuard
global continua validando o Bearer e atribuindo somente `request.user = { id }`.
O AuthorizationGuard é executado depois dele e consulta os papéis atuais.
`x-user-id` continua sem autenticar.

Somente `AccountStatus.APPROVED` exerce privilégios. PENDING, REJECTED,
SUSPENDED, DELETION_PENDING e ANONYMIZED são rejeitados também em chamadas
diretas aos serviços, independentemente do guard HTTP.

## Matriz atual

Toda linha permitida pressupõe conta APPROVED.

| SystemRole | Administração técnica | Criação de mesa sem ClubRole.MASTER |
| --- | --- | --- |
| USER | Não, inclusive com ClubRole.ADMIN | Não |
| ADMIN | Sim | Não |
| DEV | Sim | Não |

| ClubRole(s) | Satisfaz MASTER | Concede administração técnica |
| --- | --- | --- |
| PLAYER | Não | Não |
| ADMIN | Não | Não |
| MASTER | Sim | Não |
| PLAYER + MASTER | Sim | Não |
| MASTER + ADMIN (com ou sem PLAYER) | Sim | Não |

ADMIN e DEV de sistema têm o mesmo acesso às operações administrativas atuais.
A infraestrutura permite exigir apenas DEV futuramente, sem conceder esse
acesso automaticamente a ADMIN. Nenhuma operação exclusiva de DEV foi criada.

A [administração de usuários](admin-users.md), task `86e39wj3k`, implementa
alteração explícita de SystemRole e grant/remove de ClubRoles em outras contas
APPROVED. Não modifica a matriz acima, não autoriza autoalteração e não coloca
papéis no JWT. O efeito aparece no request posterior com o mesmo token.

## Contratos reutilizáveis

`AuthorizationService.assertRoles(userId, requirement, client?)` consulta somente
status e os campos de roles exigidos. Usuário inexistente gera `404 USER_NOT_FOUND`.
O cliente opcional aceita o `Prisma.TransactionClient`; o padrão é PrismaService.
Não há cache de autorização entre chamadas ou tentativas transacionais.

Decorators disponíveis:

```ts
@RequireSystemRoles(SystemRole.ADMIN, SystemRole.DEV)
@RequireClubRoles(ClubRole.MASTER)
```

Cada lista tem semântica OR. Se ambos os grupos estiverem presentes, é necessário
satisfazer **sistema E clube**. No exemplo, ADMIN ou DEV precisa também ter MASTER.
Uma lista explicitamente vazia nega acesso. Metadata de método substitui apenas
o mesmo grupo do controller; o outro grupo continua sendo exigido.
`RequireRoles({})`, sem nenhum grupo, é erro de configuração e impede a
inicialização dessa declaração, em vez de omitir silenciosamente a autorização.

`@RequireRoles(ADMINISTRATOR_REQUIREMENT)` e
`@RequireRoles(MASTER_REQUIREMENT)` reutilizam as mesmas políticas e erros do
domínio. Rotas sem metadata de roles continuam protegidas pelo AuthGuard quando
privadas. Metadata de roles não torna uma rota pública.
`@Public()` explícito tem precedência nos dois guards, inclusive em um método
de controller com requisito de roles. AuthGuard e AuthorizationGuard são
registrados nessa ordem no mesmo módulo; falhas de Bearer interrompem a execução
antes da camada de roles.

| Rota com autorização declarativa | Requisito |
| --- | --- |
| PATCH `/admin/users/:id/registration-review` | ADMIN ou DEV de sistema |
| GET `/admin/users`, GET `/admin/users/:id` | ADMIN ou DEV de sistema |
| GET `/admin/audit-logs` | ADMIN ou DEV de sistema; consulta read-only |
| PATCH `/admin/users/:id/system-role` | ADMIN ou DEV de sistema; outro alvo APPROVED |
| POST `/admin/users/:id/club-roles`, DELETE `/admin/users/:id/club-roles/:role` | ADMIN ou DEV de sistema; outro alvo APPROVED |
| PATCH `/admin/campaigns/:id/approval` | ADMIN ou DEV de sistema |
| PATCH `/admin/one-shots/:id/approval` | ADMIN ou DEV de sistema |
| PATCH `/admin/one-shots/:id/correction` | ADMIN ou DEV de sistema |
| POST `/campaigns` | MASTER de clube |
| POST `/one-shots` | MASTER de clube |

Nas demais operações de Campaign, OneShot e Session, a autorização depende do
recurso: o próprio responsável precisa de MASTER; outro operador precisa de
ADMIN/DEV de sistema, conforme a regra administrativa já existente. Um guard
MASTER indiscriminado nessas rotas impediria esse gerenciamento administrativo.
Essas decisões continuam nos serviços, via `TableActorsService.assertCanManage`.

As rotas públicas permanecem exatamente GET `/`, GET `/health`,
GET `/campaigns/public`, GET `/one-shots/public`, POST `/auth/register` e
POST `/auth/login`.

## Domínio e transações

TableActorsService delega `assertMaster` e `assertAdministrator` à mesma camada
central, preservando os contratos existentes. `assertCanManage` também aceita
cliente transacional e o encaminha à verificação correspondente.

As mutações transacionais existentes de Campaign/OneShot e as mutações de
Session consultam autorização pelo mesmo TransactionClient da leitura de estado
e escrita. Aprovação/correção administrativa verifica o operador dentro dessa
fronteira, assim como a revisão de cadastro. O guard é uma defesa HTTP adicional,
não substitui essas verificações. Retries Serializable reexecutam a autorização
e leem o estado atual, sem reaproveitar permissões da tentativa anterior.
A criação de Campaign mantém sua escrita atômica existente. Na criação de
OneShot, MASTER e sistema ativo também são relidos no TransactionClient de
cada tentativa, antes da quota e da criação atômica do agregado.

## Erros

| HTTP / código | Situação |
| --- | --- |
| 401 AUTH_TOKEN_REQUIRED e demais erros de auth | Contrato do AuthGuard, preservado |
| 401 USER_CONTEXT_REQUIRED | Metadata de roles sem identidade autenticada válida |
| 404 USER_NOT_FOUND | Usuário não existe na verificação de autorização |
| 403 ADMIN_ROLE_REQUIRED | Política administrativa negada, inclusive status não APPROVED |
| 403 MASTER_ACCOUNT_NOT_APPROVED | Política MASTER com conta não APPROVED |
| 403 MASTER_ROLE_REQUIRED | Conta APPROVED sem MASTER |
| 403 ACCOUNT_NOT_APPROVED | Conta não APPROVED em requisito genérico |
| 403 SYSTEM_ROLE_REQUIRED | Requisito genérico de sistema não satisfeito |
| 403 CLUB_ROLE_REQUIRED | Requisito genérico de clube não satisfeito |

Os erros não retornam os papéis do usuário ou dados pessoais. A camada central
não persiste auditoria; o [audit log](audit-log.md) integra eventos às transações
administrativas. Os contratos de gerenciamento de papéis,
estados e erros próprios estão em [admin-users.md](admin-users.md).

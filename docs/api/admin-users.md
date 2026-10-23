# Administração técnica de usuários

Task `86e39wj3k`. API para contas/papéis de terceiros, sem frontend, migration ou
acesso direto ao banco. Ver [auth](auth.md), [roles](roles-authorization.md),
[própria conta](account-lifecycle.md) e [privacidade](../privacy/lgpd-fase2.md).

## Autorização

Todas as rotas exigem Bearer válido e conta APPROVED com **SystemRole.ADMIN ou
SystemRole.DEV**, pela política central ADMINISTRATOR_REQUIREMENT. Ambos têm
o mesmo acesso nesta entrega; não foi criada operação exclusiva de DEV.
ClubRole.ADMIN isolado não autoriza administração técnica. ADMIN/DEV não
implicam MASTER, e os papéis de clube são cumulativos.

O operador vem de CurrentUserId, nunca de body/query/header. Roles são lidas
do banco; não foram adicionadas ao JWT. Cada serviço também verifica a política
central no TransactionClient da operação, sem depender apenas do guard HTTP.

## Endpoints

| Método | Rota | Request | Resposta |
| --- | --- | --- | --- |
| GET | `/admin/users` | page, limit, status?, systemRole? | 200, `{items, meta}` |
| GET | `/admin/users/:id` | ID técnico do alvo | 200, detalhe mínimo |
| PATCH | `/admin/users/:id/system-role` | `{ "systemRole": "USER" \| "ADMIN" \| "DEV" }` | 200, `{id, systemRole}` |
| POST | `/admin/users/:id/club-roles` | `{ "role": "PLAYER" \| "MASTER" \| "ADMIN" }` | 200, `{role, grantedAt}` |
| DELETE | `/admin/users/:id/club-roles/:role` | Sem body ou `{}`; role do enum | 204, body vazio |

A rota existente PATCH `/admin/users/:id/registration-review` permanece com seu
contrato e implementação em AuthService. Não há PATCH genérico de User nem
exportação ou edição administrativa de contatos/perfil.

## Listagem e detalhe: minimização

Listagem seleciona somente `id`, `status`, `systemRole`,
`clubRoles: [{role}]`, `profile: {displayName}`, `createdAt` e `updatedAt`.
Não inclui email, contatos, nascimento, revisão ou dados de exclusão.

Detalhe acrescenta **email**, `reviewedAt`, `suspendedAt`, `deletionRequestedAt`
e `deletionExpiresAt`. Email permite conferir a identidade do cadastro específico
antes de operar seus papéis; não está disponível para busca ampla/listagem.
As datas permitem compreender o estado atual sem revelar motivos pessoais.
WhatsApp e birthDate não são necessários às operações entregues e ficam omitidos
também no detalhe. O mesmo vale para reviewNote, suspensionReason e IDs de
revisores/suspensores. Não há conteúdo disciplinar ou histórico bruto.

As duas queries Prisma usam select explícito, sem buscar dados privados e
removê-los depois. PasswordHash, authVersion, tokens e secrets nunca são
consultados para montar essas respostas.

## Paginação e filtros

page inicia em 1, limit padrão 20 e máximo 50, conforme PaginationQueryDto.
Valores fracionários/não positivos e offsets acima de 2.147.483.647 são rejeitados
com 400 antes de consultar a listagem. status e systemRole aceitam somente seus
enums; outros filtros e busca textual por PII são rejeitados. Não há busca por
email, WhatsApp ou displayName.

Ordenação: `createdAt desc, id desc`. Cada resposta usa uma transação
RepeatableRead para autorização, itens e total no mesmo snapshot. Meta contém
`page`, `limit`, `total`, `pages`; lista vazia tem total/pages 0. Não há N+1 por
usuário. Paginação por offset não congela o conjunto entre requests separados:
novos cadastros podem deslocar páginas futuras, mesmo com ordenação determinística.

## Mutações e estados

Todos os três endpoints de papel exigem **alvo diferente do operador e APPROVED**.
PENDING, REJECTED, SUSPENDED, DELETION_PENDING e ANONYMIZED não podem ter papéis
mutados aqui, inclusive remoção/repetição. Ausência gera 404 USER_NOT_FOUND.
Consultar esses estados no detalhe não os reativa nem recupera dados.

SystemRole pode ser alterado entre os três valores explícitos em outra conta
aprovada. A escrita condicional compara status e papel lidos na transação.
Repetir o mesmo valor é no-op, sem renovar updatedAt. Nunca altera AccountStatus
ou ClubRoles, nem concede MASTER automaticamente. Autoalteração é negada também
para uma repetição sem efeito. Não foi inventada uma contagem de último admin.

Grant usa a chave única userId + role, registra grantedById pelo operador
autenticado e grantedAt pelo relógio da API. Repetição é idempotente: conserva
concessor/data originais, sem conceder PLAYER automaticamente ou hierarquia.
DELETE remove somente o vínculo alvo/role; ausência é no-op com 204. Remover
MASTER não remove PLAYER/ADMIN nem muda SystemRole. Concessões e revogações
integram o [audit log administrativo](audit-log.md) na mesma transação,
sem dados pessoais em metadata.

Tokens existentes continuam válidos como autenticação se status/authVersion
permitem; o próximo request já observa o novo papel no banco. Não é necessário
novo login para adquirir ou perder autorização. Requests já em execução não
são cancelados retroativamente.

## Concorrência

Somente **SystemRole usa Serializable**, com até três tentativas completas para
P2034. Dois operadores podem ler autorização válida e rebaixar um ao outro em
linhas diferentes; ambos os compare-and-set dos alvos poderiam passar em
ReadCommitted/RepeatableRead. O resultado não tem uma ordem válida de decisões:
quem fosse rebaixado primeiro não poderia autorizar o segundo rebaixamento.
Isso exige proteção contra write skew, não uma nova contagem de último admin.
Unicidade não protege leituras de autorização e o CAS do alvo não protege a
linha do operador. Cada retry relê operador/status/SystemRole no novo cliente;
somente se autorizado relê o alvo/status e escreve. P2034 esgotado ou CAS zero
retorna 409 USER_ROLE_CONFLICT; outras falhas não são engolidas.

**Grant/remove de ClubRole usam ReadCommitted, sem retry automático.** Papéis de
clube não concedem autorização técnica ao operador, portanto essas escritas não
formam o ciclo acima. A chave única userId + role, o insert com skipDuplicates e o delete atômico
coordenam o vínculo afetado; não existe quota ou outra invariante entre vínculos
que justifique Serializable. Grant duplicado conserva metadados e remoção
ausente permanece no-op. P2002/P2034 residual retorna 409 USER_ROLE_CONFLICT,
permitindo nova requisição autorizada em vez de repetir um snapshot.

Em ambas as operações, autorização e estado do alvo são lidos na mesma transação
da escrita. Relê-los é necessário, mas não significa cancelar requests já em
execução se houver revogação concorrente após essa leitura. Esse comportamento
preserva o contrato de auth; isolamento maior também não impõe uma ordem de
commit baseada no relógio. Uma alteração que antecede logicamente uma exclusão
pode deixar vínculos conservados porém inexercíveis em DELETION_PENDING. Nova
requisição (ou retry de SystemRole) que encontre o estado indisponível recusa.
Nunca há reativação, rollback da exclusão ou restauração de acesso.

Unitários usam doubles transacionais de conflito/rollback. Eles não substituem
validação de concorrência contra PostgreSQL e futuro MySQL reais.

## Erros e segurança

| HTTP | Código | Condição |
| --- | --- | --- |
| 401 | Erros existentes do AuthGuard | Bearer ausente/inválido/revogado ou conta indisponível |
| 403 | ADMIN_ROLE_REQUIRED | Operador sem privilégio técnico aprovado, inclusive chamada direta |
| 400 | BAD_REQUEST | Enum, paginação ou campo extra inválido |
| 404 | USER_NOT_FOUND | Alvo inexistente (ou operador ausente em chamada direta) |
| 409 | USER_ADMIN_OPERATION_NOT_ALLOWED | Autoalteração ou alvo não APPROVED |
| 409 | USER_ROLE_CONFLICT | CAS falhou, unicidade concorrente ou retries esgotados |

Nenhum erro ecoa o payload/PII, constraint, SQL ou segredo. Logs continuam
somente com metadados operacionais/Request ID e template de rota. Não registram
perfis, email, contatos, nascimento, notas, tokens ou bodies administrativos.

## Limites e decisões pendentes

- Não há suspensão/reativação manual: as fontes atuais descrevem estado de
  suspensão, mas não aprovam transições manuais independentes das futuras regras
  disciplinares. Fica para sanctions/moderação, sem antecipar restrições.
- Não há recuperação de DELETION_PENDING nem anonimização definitiva.
- Reports, warnings, pesos/recorrência, sanctions, expulsão, appeals e moderação
  de feedback permanecem fora do escopo. Nenhum dado dessas áreas é exposto.
- O [audit log administrativo](audit-log.md) registra revisão inicial e mutações
  de papéis bem-sucedidas, inclusive no-ops; não é histórico disciplinar ou
  auditoria de leituras/falhas.
- Autoalteração de papéis é restrita; isso não cria uma política global de último
  administrador. Autoexclusão existente ainda pode indisponibilizar um operador.
  Governança de continuidade e eventual política de último operador precisam de
  decisão própria, sem bootstrap público ou admin padrão.

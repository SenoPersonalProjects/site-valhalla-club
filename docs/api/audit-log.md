# Audit log administrativo

Task `86e39wk05`. Trilha persistente de ações administrativas explícitas,
distinta dos logs técnicos, requests e observabilidade. Usa o model e a tabela
AuditLog existentes, sem schema/migration ou dependência nova.

## Consulta

`GET /admin/audit-logs` exige Bearer e conta APPROVED com SystemRole.ADMIN ou
DEV. ClubRole.ADMIN isolado não autoriza. Guard e service usam a política
ADMINISTRATOR_REQUIREMENT; o service relê autorização no TransactionClient.
Roles continuam fora do JWT. Não existem endpoints de criação/edição/exclusão.

Resposta: `{items, meta: {page, limit, total, pages}}`. Select explícito contém
somente id, actorId, action, entityType, entityId, requestId, metadata, createdAt.
Não há join de ator/perfil ou consulta a PII do ator.

PaginationQueryDto: page >= 1, limit padrão 20 e máximo 50. Ordenação
createdAt desc, id desc. Itens/total/autorização usam o mesmo snapshot
RepeatableRead. Offset fora do intervalo suportado retorna 400 BAD_REQUEST.
Requests separados não congelam páginas contra novas inserções.

Filtros opcionais exatos: actorId, entityType (USER/CAMPAIGN/ONE_SHOT/SANCTION/WARNING/APPEAL), entityId
e requestId. entityId exige entityType. IDs são strings não vazias até 128
caracteres; requestId segue o padrão seguro do middleware. Não há contains,
busca textual/JSON/PII ou intervalo de datas. Filtros/campos extras inválidos
retornam 400 BAD_REQUEST. Auth e ADMIN_ROLE_REQUIRED preservam seus contratos.
Leituras não geram evento.

## Eventos

Constantes TypeScript, sem enum Prisma. entityId é o ID técnico afetado.

| Action | entityType | Metadata |
| --- | --- | --- |
| USER_REGISTRATION_REVIEWED | USER | changed, fromStatus, toStatus |
| USER_SYSTEM_ROLE_CHANGED | USER | changed, fromSystemRole, toSystemRole |
| USER_CLUB_ROLE_GRANTED | USER | changed, role |
| USER_CLUB_ROLE_REMOVED | USER | changed, role |
| CAMPAIGN_APPROVAL_REVIEWED | CAMPAIGN | changed, fromApprovalStatus, toApprovalStatus |
| ONE_SHOT_APPROVAL_REVIEWED | ONE_SHOT | changed, fromApprovalStatus, toApprovalStatus |
| ONE_SHOT_CORRECTED | ONE_SHOT | changed, fields |
| SANCTION_CREATED | SANCTION | changed, type, scopeType, hasReport, hasWarning |
| SANCTION_REVERSED | SANCTION | changed, fromStatus, toStatus |
| SANCTION_EXPIRED | SANCTION | changed: true, fromStatus: ACTIVE, toStatus: EXPIRED |
| WARNING_REVERSED | WARNING | changed, fromStatus, toStatus |
| APPEAL_SUBMITTED | APPEAL | changed: true, targetType, sequence |
| APPEAL_REVIEWED | APPEAL | changed, targetType, sequence, fromStatus, toStatus |

Cada operação administrativa documentada concluída com sucesso gera seu evento,
inclusive no-op (changed:false). Aprovação de recurso também gera o evento de
reversão da medida, no mesmo commit. Erros/negações/rollback não deixam eventos
de sucesso. changed reflete mudança funcional na própria transação.
SystemRole repetido, revisão inicial repetida aceita, grant existente, remove
ausente e reaprovação de Campaign ACTIVE + APPROVED são no-ops. A campanha
ativa continua sem UPDATE de reaprovação para preservar baseline de inatividade.

Os demais caminhos de review de Campaign/OneShot preservam suas escritas de
revisor/data/nota. Repetição com a mesma decisão, operador e nota gera
changed:false quando não há transição de status; renovação isolada de timestamps
não é mudança funcional. Troca de decisão, revisor, nota ou status gera true,
sem copiar notas/identificadores de revisores para metadata.

Correção enumera somente nomes técnicos alterados: gameSystemId, scheduledAt,
approvalStatus, status e review (limpeza de revisão). Não copia valores.
Correção sem mudança funcional tem changed:false; timestamps automáticos não
são mudança funcional. Quota, janela e reset de aprovação são preservados.

Criação de [sanção](sancoes-restricoes-reversoes-recursos.md) usa
`SANCTION_CREATED`, com `changed: true`, tipo, escopo e flags de vínculo, sem
copiar motivo, descrição do escopo ou conteúdo das origens. A criação e a
auditoria compartilham a transação Serializable; conflitos repetem a operação
completa e decisões equivalentes rejeitadas não geram eventos de sucesso.

Reversão de sanção registra `SANCTION_REVERSED` na mesma transação, sem copiar
motivo ou origem. Repetição preserva a primeira decisão e gera `changed: false`,
sem atualizar timestamps da sanção. Expiração reconciliada registra
`SANCTION_EXPIRED` com ator/Request ID nulos, somente quando altera ACTIVE para
EXPIRED. Atualização e auditoria do lote são atômicas; um ciclo sem vencimentos
não gera evento. Reversão concorrente não é sobrescrita pela expiração.

`APPEAL_SUBMITTED` registra envio do titular autenticado, inclusive quando seu
acesso comum está bloqueado por sanção. Contém somente tipo do caso e sequência;
não copia justificativa ou IDs de antecedentes para metadata. Leituras próprias
não geram evento. Avaliação registra `APPEAL_REVIEWED` com estados, tipo e
sequência; resposta permanece somente no recurso.

A primeira aprovação registra `WARNING_REVERSED` ou `SANCTION_REVERSED` junto
da decisão, ambos na mesma transação do recurso. Advertência mantém pesos e
histórico; sanções relacionadas permanecem independentes. Se a medida já foi
revertida manualmente, o evento de reversão tem `changed: false` e preserva
a primeira decisão. Repetição da mesma avaliação registra apenas
`APPEAL_REVIEWED` com `changed: false`, sem nova reversão ou UPDATE. Decisão oposta
é rejeitada e não deixa evento de sucesso.

## Atomicidade e concorrência

AuditService.record exige explicitamente o TransactionClient da mutação e não
abre transação própria. Falha de AuditLog propaga e aborta toda a operação;
não existe best effort ou cópia da auditoria no stdout/logger.

SystemRole conserva Serializable com até três tentativas P2034. Cada tentativa
relê autorização/alvo/estado e calcula changed novamente. Eventos de tentativas
abortadas rollbackam; somente o commit final deixa registro. Campaign/OneShot
conservam o helper Serializable. Revisão inicial conserva transação e CAS PENDING.

ClubRoles conserva ReadCommitted sem retry automático. Grant usa createMany com
skipDuplicates na chave única userId/role: count indica criação efetiva, sem
leitura prévia para decidir changed. O ID permanece gerado pelo default cuid()
do Prisma, sem UUID candidato ou biblioteca de IDs. Uma leitura pela mesma chave,
no mesmo TransactionClient, retorna somente role/grantedAt. Duplicata conserva
os metadados originais. Se uma remoção concorrente fizer o vínculo desaparecer
antes dessa leitura, a operação aborta com 409 USER_ROLE_CONFLICT, sem audit
ou sucesso parcial. Não há reinsert automático depois dessa remoção.
Remove deriva changed do count do deleteMany. P2002/P2034 residuais continuam
USER_ROLE_CONFLICT; isolamento e ausência de retry não mudam.

Registration review é diferente das revisões de mesas: decisão já igual ao
status sempre é no-op, independentemente de outro operador ou outra nota.
Preserva reviewedById/reviewedAt/reviewNote e gera um evento changed:false.
REJECTED continua exigindo nota em cada request, inclusive repetição; ausência
é erro e não gera evento.

## Request ID e privacidade

CurrentRequestId extrai apenas req.requestId já resolvido pelo middleware.
Header inválido/ausente é substituído, com o mesmo valor no response x-request-id
e no AuditLog. AuditService não relê header cru. Correlação não autoriza nada.
Chamadas diretas podem omitir requestId (null). Eventos HTTP atuais sempre têm
actorId autenticado. A reconciliação interna de expiração usa ator e Request ID
nulos; não inventa um usuário operador nem correlação HTTP para o scheduler.

Metadata é montada manualmente por evento, com união TypeScript limitada.
Não armazena DTO/entidade/request integral, email, WhatsApp, nascimento, nome,
senha/hash, JWT/token/Authorization/cookie, notas, motivo de suspensão,
descrição, evidências, IP, headers, stack, SQL ou constraint. Sanitização do
logger não substitui minimização persistente. IDs vinculáveis continuam sendo
dados restritos; não constituem anonimização jurídica.

## Limites

Não audita leituras, register/login/logout, perfil/exclusão do titular, ações
normais de MASTER, publicação/status comuns ou falhas HTTP. As integrações
disciplinares atuais cobrem criação/reversão/expiração de sanções, recursos e
reversão de advertência ao aprovar recurso. O envio de recurso é uma exceção
explícita à ausência de auditoria das ações comuns do titular. Os demais fluxos
dependem da task correspondente. Não implementa dashboard, exportação,
alertas, métricas, retenção automática ou SIEM.
Observabilidade continua independente, sem receber payload de auditoria.
Retenção/descarte dependem de aprovação conforme [LGPD](../privacy/lgpd-fase2.md).
Testes usam doubles de commit/rollback; integração autorizada com PostgreSQL e
futuro MySQL reais permanece necessária para validar concorrência operacional.
A etapa de criação de sanções também foi conferida em PostgreSQL local isolado,
incluindo rollback por falha de auditoria e criação concorrente; isso não representa
homologação do fluxo disciplinar completo ou validação operacional em MySQL.
A etapa de reversão/expiração também foi conferida com PostgreSQL local real,
incluindo reversões simultâneas, disputa com expiração, reconciliadores
concorrentes e rollback integral provocado por falha real de auditoria.
A etapa de recursos também foi conferida com PostgreSQL real descartável:
limite de tentativas sob concorrência, avaliações iguais/opostas simultâneas,
aprovação concorrente com reversão manual e rollback quando a auditoria final
falha. Isso não representa homologação ou teste operacional em MySQL.

# API de campanhas, sessões e one-shots

## Objetivo

O domínio de mesas separa campanhas contínuas de aventuras one-shot:

- uma campanha pertence a um mestre e pode possuir várias sessões;
- um one-shot pertence a um mestre e possui exatamente uma sessão;
- uma sessão pertence a uma campanha ou a um one-shot, nunca aos dois;
- publicação e aprovação administrativa são operações diferentes.

## Contexto autenticado

Rotas públicas continuam acessíveis. Um guard global exige Bearer JWT nas demais
rotas e preenche `request.user.id` exclusivamente após validar assinatura,
expiração, tipo de token, `authVersion` e estado APPROVED atual no banco.
Sem token, retorna `401 AUTH_TOKEN_REQUIRED`; somente `x-user-id` também retorna
401. `CurrentUserId` continua como defesa adicional (`USER_CONTEXT_REQUIRED`).
Não existe fallback a partir de headers alternativos, query, body ou cookies.
Testes E2E de autenticação usam Bearer real; testes isolados de domínio podem
substituir explicitamente o guard no TestingModule, sem backdoor de produção.
Ver [cadastro, aprovação e autenticação](auth.md). As regras de autorização de
mesas abaixo continuam sendo verificadas pelos serviços, com papéis do banco.
`TableActorsService` reutiliza a [camada central de autorização](roles-authorization.md).
Guards declarativos não substituem a verificação de domínio: as mutações
transacionais verificam o operador usando o mesmo TransactionClient da escrita.

## Regras de acesso

- criação exige conta aprovada com papel `MASTER`;
- alterações são permitidas ao mestre responsável ou a um administrador;
- aprovação e rejeição exigem conta administrativa aprovada;
- capacidade administrativa aceita somente `SystemRole.ADMIN` ou
  `SystemRole.DEV`, sempre com `AccountStatus.APPROVED`;
- `ClubRole.ADMIN` é um papel de negócio cumulativo e não concede, sozinho,
  privilégios administrativos do sistema;
- o sistema de RPG precisa existir e estar ativo;
- alterações de conteúdo removem a aprovação anterior;
- campanhas e one-shots alterados após aprovação deixam de ser públicos até
  nova análise.

## Campanhas

| Método   | Rota                            | Descrição                                   |
| -------- | ------------------------------- | ------------------------------------------- |
| `POST`   | `/campaigns`                    | Cria uma campanha em rascunho               |
| `GET`    | `/campaigns/public`             | Lista campanhas aprovadas e ativas          |
| `GET`    | `/campaigns/:id`                | Consulta uma campanha gerenciável pelo ator |
| `PATCH`  | `/campaigns/:id`                | Atualiza conteúdo da campanha               |
| `DELETE` | `/campaigns/:id`                | Remove rascunho sem sessões ou histórico    |
| `POST`   | `/campaigns/:id/publish`        | Publica uma campanha aprovada               |
| `PATCH`  | `/campaigns/:id/status`         | Inativa ou arquiva a campanha               |
| `PATCH`  | `/admin/campaigns/:id/approval` | Aprova ou rejeita a campanha                |

Exemplo de criação:

```json
{
  "gameSystemId": "id-do-sistema",
  "title": "Crônicas do Norte",
  "description": "Campanha quinzenal de fantasia."
}
```

Estados:

- `DRAFT`: rascunho não publicado;
- `ACTIVE`: campanha aprovada e publicada;
- `INACTIVE`: publicação pausada;
- `ARCHIVED`: estado terminal preservado para histórico.

Uma campanha só entra em `ACTIVE` pelo endpoint de publicação e depois de
receber aprovação administrativa.

Cada mestre pode ter no máximo **2 campanhas ACTIVE simultaneamente**. DRAFTs
não têm limite por essa regra. Transições DRAFT/INACTIVE → ACTIVE contam outras
campanhas ACTIVE do mestre, excluindo a própria; ADMIN/DEV respeitam o limite.
Publicar uma campanha já ACTIVE é no-op após autorização e aprovação: retorna
o registro existente sem UPDATE, sem nova contagem de quota e sem renovar
`updatedAt`. Repetir APPROVED em ACTIVE + APPROVED também é no-op, preservando
inclusive revisor, data e nota anteriores, mesmo que outra nota seja enviada.
Contagem, leitura da aprovação e ativação ocorrem na mesma transação Serializable.
Alterações de conteúdo da campanha removem aprovação e, se ACTIVE, levam a
INACTIVE. Adicionar sessões posteriores não remove a aprovação da campanha.

### Inatividade e reconciliação

Uma campanha ACTIVE é inativada quando seu `updatedAt` é estritamente anterior
a `agora - 30 dias` e não há sessão não CANCELLED com `scheduledAt >= cutoff`.
Sessões recentes, no exato cutoff ou futuras mantêm atividade; sessões CANCELLED
não mantêm a campanha ativa. `updatedAt` fornece o baseline de publicação, dando
aproximadamente 30 dias a uma campanha recém-publicada sem sessões. Como não há
`publishedAt`, escritas funcionais posteriores também podem renovar esse baseline;
republicação e reaprovação sem transição não escrevem nem prorrogam a janela.

`CampaignInactivityService` usa um `updateMany` Prisma tipado, idempotente, apenas
ACTIVE → INACTIVE. DRAFT/INACTIVE/ARCHIVED não são alteradas. Executa no startup
e a cada hora via `@nestjs/schedule` (6.1.3, compatível com NestJS 11/CommonJS).
GETs não fazem reconciliação nem escrita. Instâncias evitam sobreposição local;
execuções em múltiplas instâncias são seguras pela condição idempotente.
Ambientes gratuitos que dormem fazem catch-up no startup quando reiniciam;
não há execução enquanto a API dorme. Uma falha gera evento seguro de log e
nova tentativa no próximo ciclo/startup, sem expor detalhes de conexão.

Reconciliação e mutações de Session de Campaign executam leitura e escrita em
transações Serializable, com retry completo e nova avaliação de estado/predicado
em conflito. Se a reconciliação serializar antes da criação/remarcação, a sessão
pode ser persistida na Campaign INACTIVE conforme as regras existentes. Não há
auto-reativação: é necessária publicação explícita, com aprovação e quota.
Nenhum update artificial de `Campaign.updatedAt` é usado como lock.

## Sessões

| Método   | Rota                              | Descrição                                |
| -------- | --------------------------------- | ---------------------------------------- |
| `POST`   | `/campaigns/:campaignId/sessions` | Adiciona sessão à campanha               |
| `GET`    | `/campaigns/:campaignId/sessions` | Lista sessões da campanha                |
| `GET`    | `/sessions/:id`                   | Consulta uma sessão                      |
| `PATCH`  | `/sessions/:id`                   | Altera título ou data de sessão agendada |
| `PATCH`  | `/sessions/:id/status`            | Cancela ou conclui uma sessão            |
| `DELETE` | `/sessions/:id`                   | Remove sessão de campanha sem histórico  |

Exemplo de criação:

```json
{
  "title": "Sessão 01 — A chegada",
  "scheduledAt": "2026-11-14T22:00:00.000Z"
}
```

Regras:

- novas sessões precisam ter data futura;
- somente sessões `SCHEDULED` podem ser alteradas;
- cancelamento exige motivo;
- sessão futura não pode ser concluída;
- a sessão obrigatória de um one-shot não pode ser apagada isoladamente;
- alterações diretas de título, data ou estado da sessão de one-shot retornam
  `ONE_SHOT_SESSION_MANAGED_BY_ONE_SHOT` antes de qualquer escrita;
- todas as mutações do agregado OneShot + Session passam por `OneShotsService`,
  que sincroniza os estados e remove a aprovação anterior ao editar conteúdo.

## One-shots

| Método   | Rota                            | Descrição                                  |
| -------- | ------------------------------- | ------------------------------------------ |
| `POST`   | `/one-shots`                    | Cria one-shot e sua sessão em uma operação |
| `GET`    | `/one-shots/public`             | Lista one-shots aprovados e publicados     |
| `GET`    | `/one-shots/:id`                | Consulta um one-shot gerenciável pelo ator |
| `PATCH`  | `/one-shots/:id`                | Atualiza one-shot e dados de sua sessão    |
| `DELETE` | `/one-shots/:id`                | Remove rascunho sem histórico              |
| `POST`   | `/one-shots/:id/publish`        | Publica um one-shot aprovado               |
| `PATCH`  | `/one-shots/:id/status`         | Cancela ou conclui o one-shot              |
| `PATCH`  | `/admin/one-shots/:id/approval` | Aprova ou rejeita o one-shot               |
| `PATCH`  | `/admin/one-shots/:id/correction` | Corrige sistema/data sob as mesmas quotas |

Exemplo de criação:

```json
{
  "gameSystemId": "id-do-sistema",
  "title": "A Torre Perdida",
  "description": "Aventura fechada para uma única noite.",
  "session": {
    "title": "A Torre Perdida",
    "scheduledAt": "2026-11-14T22:00:00.000Z"
  }
}
```

Estados:

- `DRAFT`: aguardando publicação;
- `SCHEDULED`: aprovado e publicado;
- `CANCELLED`: cancelado com a sessão correspondente;
- `COMPLETED`: concluído com a sessão correspondente.

### Quota global e agenda

O clube pode cadastrar no máximo **5 one-shots por sistema de RPG e mês civil**,
globalmente, sem separação por mestre. O bucket usa `gameSystemId` e o mês de
`Session.scheduledAt` em **America/Maceio**. A consulta usa início inclusivo e
fim exclusivo do mês convertidos para UTC; a persistência continua em instantes
UTC, independentemente do fuso do processo. Por exemplo, `2026-11-01T02:59:59Z`
ainda pertence a outubro no clube; às `03:00:00Z` começa novembro.
Agendamentos de one-shot devem informar timestamp ISO com `Z` ou offset
explícito; horário local sem offset é inválido (`SESSION_DATE_MUST_BE_FUTURE`),
evitando interpretação pelo fuso do servidor.

Todos os estados contam enquanto o registro existir: DRAFT, SCHEDULED,
**CANCELLED** e COMPLETED. Cancelar não libera quota. Exclusão física legítima
de DRAFT sem histórico libera a vaga. Outro sistema ou outro mês tem bucket
independente. Aprovar/publicar não cria uma segunda cobrança de quota.

Na criação, validar mestre, sistema ativo, data futura e janela máxima de
**30 × 24 horas** em relação ao instante atual; o limite exato é permitido,
qualquer valor posterior é rejeitado. Essa janela não se aplica às sessões de
Campaign. A contagem e a criação aninhada OneShot + Session ocorrem atomicamente
na mesma transação Serializable.

### Correção administrativa de sistema/data

O PATCH comum permite título, descrição e título da sessão, removendo aprovação
e devolvendo SCHEDULED a DRAFT. Enviar `gameSystemId` ou `session.scheduledAt`
nesse PATCH retorna `ONE_SHOT_ADMIN_CORRECTION_REQUIRED`, inclusive para um
administrador: a fronteira estrutural é explícita.

`PATCH /admin/one-shots/:id/correction` exige `assertAdministrator`: conta APPROVED
com SystemRole.ADMIN ou DEV; ClubRole.ADMIN isolado não autoriza. O corpo aceita
somente `gameSystemId` e/ou `scheduledAt`, com ao menos um campo:

```json
{
  "gameSystemId": "id-do-sistema",
  "scheduledAt": "2026-11-14T22:00:00.000Z"
}
```

Datas de exemplos devem ser ajustadas ao instante da chamada para respeitar a
janela. A correção valida o sistema e a data efetivos, recalcula o mês, conta
o destino excluindo o próprio registro e atualiza Session + OneShot atomicamente.
Reseta aprovação para PENDING, limpa reviewedById/reviewedAt/reviewNote e devolve
SCHEDULED a DRAFT. CANCELLED/COMPLETED permanecem fechados. **ADMIN/DEV não
bypassam quota nem janela**; a intervenção define quem corrige, não uma exceção.

### Concorrência e erros operacionais

`TableRulesService` centraliza quotas, calendário e janela. Publicação de campanha,
criação e correção estrutural de one-shot usam `$transaction` com Serializable.
Conflitos Prisma `P2034` repetem a operação inteira, incluindo as leituras, até
três tentativas no total. Após esgotamento, retornar 409 `TABLE_CONCURRENT_CHANGE`;
não reaproveitar contagem anterior ou continuar com escrita fora da transação.
Rollback é responsabilidade da transação Prisma. Não há SQL raw, lock de provider
ou dependência de Supabase nessas regras.

Mutações de Campaign e OneShot existentes também leem e validam o estado dentro
da transação Serializable da escrita, evitando decisões baseadas em estado
anterior a uma publicação, edição, encerramento ou correção concorrente. Na
correção de one-shot, a leitura do sistema ativo usa o mesmo TransactionClient
da quota e das atualizações de Session + OneShot. Os retries releem esses dados.

| Código | HTTP | Condição |
| --- | --- | --- |
| `CAMPAIGN_ACTIVE_LIMIT_REACHED` | 409 | Já existem 2 outras campanhas ACTIVE do mestre |
| `ONE_SHOT_MONTHLY_LIMIT_REACHED` | 409 | Já existem 5 outros registros no bucket de destino |
| `ONE_SHOT_SCHEDULE_TOO_FAR` | 400 | Agendamento excede 30 dias |
| `ONE_SHOT_ADMIN_CORRECTION_REQUIRED` | 409 | PATCH comum tenta enviar sistema/data |
| `ONE_SHOT_CORRECTION_EMPTY` | 400 | Correção sem campos estruturais |
| `TABLE_CONCURRENT_CHANGE` | 409 | Três conflitos de serialização consecutivos |

Continuam válidos `SESSION_DATE_MUST_BE_FUTURE`, `ONE_SHOT_CLOSED`,
`ONE_SHOT_WITHOUT_SESSION`, `ADMIN_ROLE_REQUIRED` e os erros de aprovação.

## Aprovação administrativa

Campanhas e one-shots começam com `approvalStatus = PENDING`.

```json
{
  "decision": "APPROVED",
  "note": "Conteúdo revisado."
}
```

Decisões aceitas:

- `APPROVED`;
- `REJECTED`, obrigatoriamente acompanhada de justificativa.

Editar conteúdo de Campaign ou OneShot aprovado redefine aprovação para PENDING
e retira a mesa da listagem pública quando aplicável. Novas sessões de Campaign
não removem aprovação; correção estrutural de OneShot é exclusivamente
administrativa e também remove aprovação. Publicação continua exigindo aprovação
inicial em ambos os agregados.

Aprovação administrativa de Campaign/OneShot e correção administrativa de
OneShot persistem [audit log](audit-log.md) na mesma transação, com requestId e
metadata mínima, sem notas ou conteúdo da mesa. As demais ações de mestre ou
gerenciamento comum não são auditadas por esse contrato.

## Mesas do usuário

`GET /tables/me` retorna duas visões:

- `mastered`: campanhas e one-shots conduzidos pelo usuário;
- `participating`: participações do usuário em sessões.

Isso mantém separadas a função de mestre e a participação como jogador.
Esta rota permanece sem paginação; paginar suas três coleções exige um contrato
próprio e fica como melhoria futura.

## Paginação pública

As listagens públicas aceitam:

- `page`: página iniciando em `1`;
- `limit`: de `1` a `50`, padrão `20`.

A resposta mantém `items` e `meta: { page, limit, total, pages }`. A ordenação é
`updatedAt desc, id desc`, com desempate determinístico entre registros com a
mesma data. As sessões públicas de campanhas usam `scheduledAt asc, id asc`.
Isso estabiliza empates; paginação por offset ainda pode variar sob edições
concorrentes entre requisições.

As queries públicas selecionam somente id, título, descrição, status, sistema de
RPG, `master.profile.displayName` e dados básicos de sessão (id, título, data e
status). Não solicitam reports, sanctionScopes, contagens disciplinares, evidências,
campos administrativos ou identificadores pessoais do mestre. `master.id` foi
removido apenas das projeções públicas, sem consumidor atual no repositório.
As projeções privadas são preservadas.

## Exclusão e preservação de histórico

Exclusão física fica limitada a rascunhos sem participantes, feedbacks,
reports, sanções ou sessões dependentes. Depois que existe histórico, devem ser
usados os estados de arquivamento ou cancelamento.

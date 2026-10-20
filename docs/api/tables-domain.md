# API de campanhas, sessões e one-shots

## Objetivo

O domínio de mesas separa campanhas contínuas de aventuras one-shot:

- uma campanha pertence a um mestre e pode possuir várias sessões;
- um one-shot pertence a um mestre e possui exatamente uma sessão;
- uma sessão pertence a uma campanha ou a um one-shot, nunca aos dois;
- publicação e aprovação administrativa são operações diferentes.

## Contexto autenticado

Rotas públicas continuam acessíveis normalmente. Rotas privadas exigem um
`request.user.id` string não vazia, fornecido exclusivamente por infraestrutura
confiável de autenticação. Esse é o contrato esperado da futura camada de
autenticação; autenticação/JWT ainda não foi implementada.

Enquanto a integração não existir, as rotas privadas falham fechadas com
`401 USER_CONTEXT_REQUIRED`. Nenhum header arbitrário enviado pelo cliente é
tratado como identidade: enviar somente `x-user-id` também retorna 401.
Não existe fallback de produção que converta headers, query, body ou cookies
não validados em `request.user`. Testes podem fornecer contexto por middleware
exclusivamente de teste, sem derivá-lo da entrada HTTP.

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

Exemplo de criação:

```json
{
  "gameSystemId": "id-do-sistema",
  "title": "A Torre Perdida",
  "description": "Aventura fechada para uma única noite.",
  "session": {
    "title": "A Torre Perdida",
    "scheduledAt": "2026-11-21T22:00:00.000Z"
  }
}
```

Estados:

- `DRAFT`: aguardando publicação;
- `SCHEDULED`: aprovado e publicado;
- `CANCELLED`: cancelado com a sessão correspondente;
- `COMPLETED`: concluído com a sessão correspondente.

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

Editar título, descrição, sistema ou sessão de uma mesa aprovada redefine a
aprovação para `PENDING` e retira a mesa da listagem pública.

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

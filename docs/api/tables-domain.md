# API de campanhas, sessões e one-shots

## Objetivo

O domínio de mesas separa campanhas contínuas de aventuras one-shot:

- uma campanha pertence a um mestre e pode possuir várias sessões;
- um one-shot pertence a um mestre e possui exatamente uma sessão;
- uma sessão pertence a uma campanha ou a um one-shot, nunca aos dois;
- publicação e aprovação administrativa são operações diferentes.

## Autenticação temporária

As rotas privadas recebem o identificador do ator no cabeçalho:

```http
x-user-id: id-do-usuario
```

Esse cabeçalho existe somente como fronteira temporária enquanto o módulo de
autenticação não está disponível. Ele permite testar as regras de domínio sem
colocar o identificador do mestre nos DTOs.

O cabeçalho **não é autenticação** e não torna a API segura para exposição
pública. Antes da produção, o decorator `CurrentUserId` deve obter a identidade
validada pelo mecanismo de autenticação, e o cabeçalho não deve ser aceito como
prova de identidade.

## Regras de acesso

- criação exige conta aprovada com papel `MASTER`;
- alterações são permitidas ao mestre responsável ou a um administrador;
- aprovação e rejeição exigem conta administrativa aprovada;
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
- mudanças de estado na sessão de um one-shot atualizam também o one-shot.

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

## Paginação pública

As listagens públicas aceitam:

- `page`: página iniciando em `1`;
- `limit`: de `1` a `50`, padrão `20`.

## Exclusão e preservação de histórico

Exclusão física fica limitada a rascunhos sem participantes, feedbacks,
reports, sanções ou sessões dependentes. Depois que existe histórico, devem ser
usados os estados de arquivamento ou cancelamento.

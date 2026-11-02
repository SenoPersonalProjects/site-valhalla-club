# Feedbacks e presença em sessões

A API registra avaliações de sessões, mestres e jogadores com base na participação
real. Este guia reúne as regras de presença, os contratos HTTP, a privacidade e
os cuidados para aplicar as migrations.

> **Situação:** implementação e revisão local concluídas. Homologação, aplicação
> das migrations no ambiente remoto e PR para `develop` permanecem pendentes.

A entrega inclui o registro de participantes e a chamada no backend para comprovar
a elegibilidade dos feedbacks. Essa ampliação do escopo deve constar no PR e no
ClickUp. A interface de chamada e os fluxos disciplinares ficam fora desta entrega.

## Regras de negócio

### Participação e presença

- O mestre responsável ou ADMIN/DEV inclui contas aprovadas como jogadores.
- A inclusão cria um vínculo `PLAYER/REGISTERED`, sem conceder papel de clube
  ou confirmar presença. Não há autoinscrição.
- A chamada fica disponível a partir do horário agendado da sessão.
- Cada jogador não cancelado precisa receber `ATTENDED` ou `NO_SHOW` antes
  da conclusão. Pendências não são convertidas automaticamente em faltas.
- A conclusão registra o responsável da mesa como `MASTER/ATTENDED`.
- Participações canceladas permanecem no histórico.
- Após a conclusão, somente ADMIN/DEV pode corrigir presença, com motivo.
  Uma mudança é bloqueada se existir qualquer feedback na sessão, inclusive
  privado ou oculto.

O vínculo `SessionParticipant` é único por `(sessionId, userId)`. Os estados
`REGISTERED` e `CONFIRMED` existentes no schema são considerados pendentes de
chamada. O papel da participação representa a atuação naquela sessão.

### Elegibilidade para feedback

Para enviar uma avaliação, a conta do autor precisa estar `APPROVED`, possuir
presença `ATTENDED` na sessão e avaliar uma sessão `COMPLETED`. ADMIN/DEV também
respeita essas condições; um papel de clube não substitui a presença registrada.

| Alvo      | Destinatário                                   | Visibilidade permitida             |
| --------- | ---------------------------------------------- | ---------------------------------- |
| `SESSION` | Ausente ou `null`                              | `PUBLIC`                           |
| `MASTER`  | Participante `MASTER/ATTENDED` da mesma sessão | `PUBLIC` ou `PRIVATE_TO_RECIPIENT` |
| `PLAYER`  | Participante `PLAYER/ATTENDED` da mesma sessão | `PUBLIC` ou `PRIVATE_TO_RECIPIENT` |

Não é permitido avaliar a si mesmo como pessoa. Cada autor pode enviar somente
um feedback por sessão e alvo/tipo. Alterar a visibilidade ou ocultar a avaliação
não libera um novo envio para o mesmo alvo.

### Dados e limites

| Campo                                      | Regra                                                                |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Nota                                       | Inteiro obrigatório de 0 a 10; strings numéricas não são convertidas |
| Comentário                                 | Opcional, até 2.000 caracteres Unicode                               |
| Visibilidade                               | `PUBLIC` por padrão; `null` e valores desconhecidos são rejeitados   |
| Identificadores                            | Strings não vazias de até 128 caracteres, sem NUL                    |
| Motivos administrativos ou de cancelamento | Texto não vazio após trim, até 1.000 caracteres Unicode, sem NUL     |

Comentários são tratados como texto simples. Espaços nas extremidades são
removidos; texto vazio vira `null`. Consumidores devem renderizar o conteúdo
como texto, sem interpretar HTML.

Os DTOs rejeitam campos extras. Identidade, papéis, timestamps, chave interna e
dados de moderação são controlados pela API. NUL também é rejeitado nos
comentários antes de acessar o PostgreSQL.

## Autenticação e permissões

Rotas privadas exigem Bearer JWT e conta `APPROVED`. A identidade vem de
`CurrentUserId`; `x-user-id` e campos enviados no corpo não autenticam o usuário.
Papéis e estado da conta são relidos no banco, no mesmo cliente transacional da
operação, inclusive em cada retry.

Gerenciar a chamada exige o mestre responsável com `ClubRole.MASTER` ou uma conta
com `SystemRole.ADMIN`/`DEV`. Administração técnica não é concedida por
`ClubRole.ADMIN`.

A chamada é privada. Outros jogadores não recebem acesso à lista de presença,
a contatos, à data de nascimento ou a motivos administrativos.

## Participantes e chamada

Todas as rotas desta seção são privadas.

| Método  | Rota                                                     | Operação                                     |
| ------- | -------------------------------------------------------- | -------------------------------------------- |
| `POST`  | `/sessions/:sessionId/participants`                      | Incluir jogador aprovado                     |
| `GET`   | `/sessions/:sessionId/participants`                      | Listar a chamada                             |
| `PATCH` | `/sessions/:sessionId/participants/:userId/attendance`   | Registrar presença/falta ou corrigir chamada |
| `PATCH` | `/sessions/:sessionId/participants/:userId/cancellation` | Cancelar participação                        |

### Inclusão e consulta

A inclusão recebe `{ "userId": "id-do-jogador" }` e retorna `201`. É permitida
somente em sessão `SCHEDULED`. O mestre é registrado automaticamente na conclusão,
sem inclusão manual como jogador. Duplicatas, inclusive de vínculo cancelado,
retornam `409`; reativação de inscrição não está disponível.

A listagem retorna `items` e `meta`. Aceita `page >= 1` e `limit` de 1 a 50,
com padrão 20. A ordenação é `registeredAt asc, id asc`; itens e total usam o
mesmo snapshot `RepeatableRead`.

A projeção contém `id`, `userId`, `role`, `status`, `registeredAt`, `attendedAt`,
`cancelledAt`, `updatedAt` e `user.profile.displayName`.

### Registro e correção de presença

A chamada recebe `{ "status": "ATTENDED" }` ou `{ "status": "NO_SHOW" }` e retorna
`200`. Em sessão agendada, pode ser realizada pelo responsável ou ADMIN/DEV, a
partir do horário previsto. Participação `MASTER` não recebe chamada manual;
`CANCELLED` não pode virar presença ou falta.

Após `COMPLETED`, a operação exige ADMIN/DEV e `reason`. A última justificativa
de mudança efetiva fica em `attendanceCorrectionReason`, campo privado que não
é retornado pela chamada, por `/tables/me`, pelos logs ou pela metadata de auditoria.

Repetir a mesma decisão preserva timestamps e justificativa, mas gera auditoria
com `changed: false`. Mesmo sem mudança, uma correção administrativa exige motivo.

### Cancelamento e conclusão

Cancelar participação recebe `{ "reason": "Motivo do cancelamento" }` e retorna
`200`. Só é permitido em sessão agendada e para jogador ainda sem chamada.
Repetir o cancelamento preserva a primeira decisão. O vínculo não é excluído.

A conclusão segue os endpoints existentes:

- Campanha: `PATCH /sessions/:id/status`.
- One-shot: `PATCH /one-shots/:id/status`.

Ambos exigem chamada completa e respeitam o bloqueio de conclusão antes do
horário agendado. Sessões sem jogadores podem ser concluídas conforme as regras
existentes. Vínculos de mestre incompatíveis são rejeitados.

Presença do mestre, conclusão e auditoria são atômicas. A conclusão de one-shot
mantém `OneShot` e `Session` sincronizados na mesma transação, sem caminho paralelo
para alterar sua sessão.

Em `GET /tables/me`, `mastered` representa propriedade da mesa e `participating`
representa vínculos históricos, inclusive `MASTER` após a conclusão. A projeção
exclui o motivo administrativo de correção.

## Envio de feedback

`POST /sessions/:sessionId/feedbacks` exige Bearer e retorna `201`.

Exemplo de avaliação da sessão:

```json
{
  "targetType": "SESSION",
  "rating": 8,
  "comment": "Boa organização da sessão."
}
```

Exemplo de feedback privado ao mestre:

```json
{
  "targetType": "MASTER",
  "targetUserId": "id-do-mestre",
  "rating": 10,
  "visibility": "PRIVATE_TO_RECIPIENT",
  "comment": "Comentário destinado ao mestre."
}
```

Para avaliar um jogador, use `PLAYER` e o respectivo `targetUserId`.
Autor, sessão, alvo e destinatário são fixados na criação.

A resposta ao autor contém `id`, `authorId`, `sessionId`, `targetType`,
`targetUserId`, `rating`, `comment`, `visibility`, `editableUntil`, `createdAt`
e `updatedAt`. Não inclui perfis, contatos, chave interna ou campos de moderação.

A API define `createdAt` e `editableUntil = createdAt + 24 horas`. A criação
verifica autorização, sessão e participação no mesmo `TransactionClient` com
isolamento `Serializable`. O envio não cria ou altera presenças.

Uma duplicata retorna `409 FEEDBACK_ALREADY_EXISTS`, sem substituir o conteúdo
ou renovar o prazo. Envios comuns não geram evento administrativo, report,
advertência ou sanção.

## Consulta e privacidade

| Método | Rota                                    | Escopo                                        |
| ------ | --------------------------------------- | --------------------------------------------- |
| `GET`  | `/sessions/:sessionId/feedbacks/public` | Público, projeção mínima                      |
| `GET`  | `/sessions/:sessionId/feedbacks`        | Feedbacks enviados ou recebidos pelo titular  |
| `GET`  | `/feedbacks/:id`                        | Detalhe para autor ou destinatário            |
| `GET`  | `/admin/sessions/:sessionId/feedbacks`  | ADMIN/DEV, incluindo privados e ocultos       |
| `GET`  | `/admin/feedbacks/:id`                  | Detalhe administrativo com dados de moderação |

As listas aceitam `page >= 1`, `limit` de 1 a 50 (padrão 20) e `targetType`
opcional. Retornam `items/meta`, ordenados por `createdAt desc, id desc`.
Itens e total usam o mesmo filtro e snapshot `RepeatableRead`. Offset fora do
intervalo suportado e filtros extras são rejeitados.

### Consulta pública

Retorna somente `id`, `targetType`, `rating`, `comment`, `visibility`,
`createdAt` e `updatedAt`. Não identifica autor ou destinatário nem carrega perfis.

Exige feedback `PUBLIC`, sem ocultação, sessão `COMPLETED` e vínculo com
exatamente uma mesa aprovada: campanha `ACTIVE` ou one-shot `COMPLETED`.
Isso permite consultar o histórico da one-shot concluída sem reabrir a mesa ou
alterar a listagem pública existente de one-shots agendadas.

Sessão desconhecida, mesa não publicada e ausência de avaliações públicas
retornam a mesma lista vazia. Totais excluem privados e ocultos. Um token
administrativo não amplia o escopo dessa rota.

### Consulta pessoal e administrativa

A consulta pessoal retorna somente avaliações do próprio autor ou destinadas
a ele, públicas ou privadas, sem ocultos. Estar na mesma sessão não permite
consultar avaliações privadas de terceiros. O histórico pessoal permanece
disponível quando a mesa sai de publicação.

Uma conta aprovada sem relação recebe lista vazia. No detalhe, ID inexistente,
oculto ou de terceiros retorna `404 FEEDBACK_NOT_FOUND`. ADMIN/DEV utiliza as
rotas administrativas para moderação; o acesso pessoal mantém o mesmo escopo.

A projeção pessoal é a da criação. A administrativa acrescenta `hiddenAt`,
`hiddenById` e `moderationReason`, sem `targetKey` ou perfis. Leituras não geram
eventos administrativos.

O comentário é texto livre publicado por escolha do autor. A projeção mínima
não anonimiza seu conteúdo; não inserir dados pessoais de terceiros.

## Edição e ocultação

### Edição pelo autor

`PATCH /feedbacks/:id` recebe pelo menos um dos campos `rating`, `comment` ou
`visibility` e retorna `200` com a projeção pessoal.

```json
{
  "rating": 9,
  "comment": null
}
```

Campos omitidos são preservados. `comment: null`, vazio ou somente espaços
remove o comentário. Autoria, sessão, alvo, destinatário e timestamps são
imutáveis; feedback de sessão continua aceitando somente `PUBLIC`.

Somente o autor aprovado pode editar. Destinatário e ADMIN/DEV não podem
reescrever avaliações de terceiros. Ocultos não podem ser editados, mesmo
dentro do prazo.

A edição exige um instante estritamente anterior a `editableUntil` e a
`createdAt + 24 horas`. A fronteira exata já é somente leitura. Nenhuma edição
renova o prazo, inclusive se o valor persistido tiver sido prorrogado por engano.

Autorização e prazo são conferidos em cada retry. A escrita condicional exige
novamente autoria, ausência de ocultação e prazo válido. Edições não geram
auditoria administrativa nem histórico de versões antigas do comentário.

### Ocultação administrativa

`PATCH /admin/feedbacks/:id/hide` exige ADMIN/DEV aprovado, recebe
`{ "reason": "Motivo da moderação" }` e retorna `200` com a projeção administrativa.

A primeira ocultação grava `hiddenAt`, `hiddenById` e `moderationReason`.
Preserva conteúdo, autoria, alvo, visibilidade, prazo e unicidade. Também é
permitida após o encerramento da janela de edição.

Repetir a operação exige motivo válido, preserva a primeira decisão e registra
`changed: false`. A primeira decisão registra `changed: true`. Ocultação e
auditoria são gravadas na mesma transação `Serializable`.

O feedback sai das consultas públicas e pessoais, incluindo suas contagens.
A administração mantém acesso ao histórico. Ocultar não libera novo envio,
não desbloqueia correção de presença e não permite edição posterior do autor.

Não há exclusão física, restauração ou criação automática de ação disciplinar.

## Auditoria e transações

Os eventos de participação e moderação utilizam a infraestrutura existente:

| Evento                            | Entidade              |
| --------------------------------- | --------------------- |
| `SESSION_PARTICIPANT_ADDED`       | `SESSION_PARTICIPANT` |
| `SESSION_PARTICIPATION_CANCELLED` | `SESSION_PARTICIPANT` |
| `SESSION_ATTENDANCE_RECORDED`     | `SESSION_PARTICIPANT` |
| `SESSION_COMPLETED`               | `SESSION`             |
| `FEEDBACK_HIDDEN`                 | `FEEDBACK`            |

A auditoria registra ator autenticado, Request ID e metadata mínima.
Em `FEEDBACK_HIDDEN`, metadata contém somente `changed` e `sessionId`.
Comentários e motivos não são copiados para auditoria ou logs técnicos.

Mutações usam o mesmo `TransactionClient` da autorização, das leituras e da
auditoria. Uma falha reverte a operação inteira. O helper `TableRulesService`
repete a transação completa até três vezes em conflitos `P2034` ou no conflito
estruturado `DriverAdapterError/cause.kind=TransactionWriteConflict` exposto
pelo adapter no commit. Esgotamento retorna `TABLE_CONCURRENT_CHANGE`.

Essas fronteiras protegem as operações concorrentes de presença/conclusão,
criação/correção de presença e edição/ocultação.

## Banco e migrations

### Unicidade do alvo

A API calcula `targetKey` como `SESSION`, `MASTER:<userId>` ou `PLAYER:<userId>`.
A função `feedbackTarget` centraliza essa regra; o campo não é aceito do cliente
nem retornado nas respostas.

A chave única `(authorId, sessionId, targetKey)` impede duplicatas, inclusive
quando `targetUserId` é nulo. Uma chave composta apenas com o destinatário
nullable não protegeria os feedbacks de sessão. A constraint protege a chave
armazenada; a correspondência entre tipo, destinatário e participação é validada
pela API.

O modelo usa uma chave única comum, preservando a portabilidade lógica para
MySQL. Não depende de índice parcial, trigger ou extensão PostgreSQL. O histórico
SQL de PostgreSQL permanece separado de um futuro histórico MySQL.

### Migrations da entrega

| Migration                                         | Alteração                                                     |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `20261102120000_add_feedback_target_key`          | Adiciona e preenche `targetKey`; exige NOT NULL e unicidade   |
| `20261102123000_add_attendance_correction_reason` | Adiciona o motivo privado de correção em `SessionParticipant` |

O backfill de `targetKey` é transacional. Alvos legados inconsistentes ou
duplicatas abortam a operação inteira, sem apagar ou corrigir dados
automaticamente. Esses casos exigem revisão autorizada antes de nova tentativa,
incluindo tratamento do estado de migration falha pelo fluxo do Prisma.

As migrations foram verificadas em PostgreSQL 16 descartável, com dados
sintéticos. Foram conferidos aplicação em base vazia, backfill, preservação de
histórico, duplicatas concorrentes, rollback de DDL/dados e diff sem divergência
para o schema.

Em homologação, aplicar somente as migrations versionadas e revisadas com
`prisma migrate deploy`, pelo fluxo autorizado do ambiente. Não usar reset em
banco compartilhado ou `prisma db push` em produção.

## Erros de domínio

Entradas HTTP inválidas retornam `400 BAD_REQUEST` pelo ValidationPipe global.
Os códigos abaixo complementam os contratos existentes de autenticação,
autorização e mesas.

| Código                                  | HTTP | Situação                                               |
| --------------------------------------- | ---- | ------------------------------------------------------ |
| `PARTICIPANT_ACCOUNT_NOT_APPROVED`      | 403  | Conta do jogador sem aprovação                         |
| `PARTICIPANT_ALREADY_REGISTERED`        | 409  | Vínculo já existente, inclusive cancelado              |
| `PARTICIPANT_NOT_FOUND`                 | 404  | Participação inexistente                               |
| `PARTICIPANT_ATTENDANCE_INVALID`        | 400  | Resultado diferente de presença/falta                  |
| `PARTICIPATION_CANCELLED`               | 409  | Chamada de participação cancelada                      |
| `PARTICIPATION_ALREADY_REVIEWED`        | 409  | Cancelamento após chamada                              |
| `PARTICIPATION_REASON_REQUIRED`         | 400  | Motivo ausente ou inválido                             |
| `PARTICIPATION_HAS_FEEDBACK`            | 409  | Mudança de presença após feedback                      |
| `SESSION_ATTENDANCE_PENDING`            | 409  | Chamada incompleta na conclusão                        |
| `SESSION_MASTER_PARTICIPATION`          | 409  | Tentativa de gerenciar mestre como jogador             |
| `SESSION_MASTER_PARTICIPATION_CONFLICT` | 409  | Vínculo de mestre incompatível ou concorrente          |
| `FEEDBACK_TARGET_INVALID`               | 400  | Tipo/identificador inválido ou destinatário em SESSION |
| `FEEDBACK_TARGET_USER_REQUIRED`         | 400  | MASTER/PLAYER sem destinatário                         |
| `FEEDBACK_RATING_INVALID`               | 400  | Nota inválida em chamada direta ao serviço             |
| `FEEDBACK_COMMENT_INVALID`              | 400  | Comentário inválido em chamada direta ao serviço       |
| `FEEDBACK_VISIBILITY_INVALID`           | 400  | Visibilidade inválida em chamada direta ao serviço     |
| `FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED`  | 400  | Feedback de sessão privado                             |
| `FEEDBACK_SELF_REVIEW_FORBIDDEN`        | 403  | Autoavaliação de pessoa                                |
| `FEEDBACK_AUTHOR_NOT_ATTENDED`          | 403  | Autor sem presença confirmada                          |
| `FEEDBACK_RECIPIENT_NOT_ELIGIBLE`       | 403  | Destinatário sem presença/papel correspondente         |
| `FEEDBACK_SESSION_NOT_COMPLETED`        | 409  | Sessão não concluída                                   |
| `FEEDBACK_ALREADY_EXISTS`               | 409  | Avaliação duplicada                                    |
| `FEEDBACK_NOT_FOUND`                    | 404  | Inexistente ou indisponível ao titular                 |
| `FEEDBACK_UPDATE_EMPTY`                 | 400  | Nenhum campo mutável informado                         |
| `FEEDBACK_EDIT_WINDOW_CLOSED`           | 409  | Prazo encerrado ou escrita condicional recusada        |
| `FEEDBACK_MODERATION_REASON_REQUIRED`   | 400  | Motivo de ocultação inválido no serviço                |

Também se aplicam `SESSION_NOT_STARTED`, `SESSION_CLOSED`, `SESSION_NOT_FOUND`,
`SESSION_WITHOUT_TABLE`, `USER_NOT_FOUND`, `ACCOUNT_NOT_APPROVED` e
`TABLE_CONCURRENT_CHANGE`. Respostas não expõem SQL, constraints ou conteúdo
de terceiros.

## Validação local

Última revisão: **2026-11-02**.

| Verificação                              | Resultado                                                          |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Build                                    | Aprovado                                                           |
| Testes unitários                         | 591 aprovados                                                      |
| Testes E2E                               | 476 aprovados                                                      |
| ESLint e Prettier                        | Aprovados nos módulos novos, testes e harnesses                    |
| Arquivos TypeScript existentes alterados | Nenhum diagnóstico novo de lint comparado ao HEAD                  |
| PostgreSQL 16 isolado                    | Migrations, fluxos, permissões, concorrência e rollback conferidos |
| HTTP local com JWT e PostgreSQL reais    | Presença, criação, consultas, edição e moderação conferidas        |

Os E2E usam JWT real com doubles de persistência. As verificações com banco real
foram executadas separadamente em bases locais isoladas, com contas fictícias,
sem acessar a conexão externa do projeto.

A revisão de integração também conferiu schema Prisma válido, build de produção
e lint do frontend aprovados e links locais da documentação sem referências a
arquivos ausentes. A landing continua sem consumir a API em runtime. README,
roadmap, arquitetura, setup, banco e métricas foram alinhados ao estado do código,
mantendo a homologação dos novos fluxos como pendente.

A cobertura inclui fronteiras da nota/comentário, NUL, contagem Unicode,
autoavaliação, duplicatas, papéis, privacidade, janela exata de edição,
preservação da primeira moderação e rollback de auditoria. Foram exercitados
conflitos entre inclusão/conclusão, envio/correção de presença e edição/ocultação.

Para repetir os testes versionados em `apps/api`, execute os comandos em sequência:

```sh
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Os arquivos antigos mantêm diagnósticos preexistentes de lint; não houve limpeza
geral fora do escopo. Nenhuma dependência, variável de ambiente ou alteração de
frontend foi necessária. Os helpers locais de verificação ficam fora da entrega.

## Limitações e pendências

### Mestre substituto

A presença automática pressupõe que o responsável da campanha/one-shot conduziu
a sessão. O projeto não representa um responsável individual por sessão e esta
versão não cobre substitutos.

Antes de operar esse cenário, uma melhoria precisa registrar o mestre efetivo
por sessão e autorizar/auditar a substituição. Trocar o dono da campanha inteira
não deve ser usado como atalho. Essa limitação deve constar no PR e no ClickUp.

### Entrega e homologação

- Aplicação das duas migrations no ambiente de homologação: pendente.
- Validação da funcionalidade no Render/PostgreSQL remoto: pendente.
- PR para `develop` e revisão do Tech Lead: pendentes.
- Atualização do ClickUp com escopo ampliado e limitações: pendente.
- Compatibilidade operacional com MySQL: não testada.

A validação local não declara homologação ou implantação em produção.
Interface de chamada, autoinscrição, reativação de vínculos cancelados,
substituição de mestre, versões antigas de comentários, restauração de feedback
e fluxos disciplinares não fazem parte desta entrega.

## Referências

- [Campanhas, sessões e one-shots](tables-domain.md)
- [Autenticação](auth.md)
- [Papéis e autorização](roles-authorization.md)
- [Auditoria administrativa](audit-log.md)
- [Privacidade e LGPD](../privacy/lgpd-fase2.md)

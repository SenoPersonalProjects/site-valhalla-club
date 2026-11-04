# Sanções, restrições, reversões e recursos

Documentação do fluxo de medidas disciplinares administradas pela API, com
escopo, vigência, histórico e até três recursos por advertência ou sanção.

## Resultado implementado

- Criação, listagem e consulta administrativa de sanções, com justificativa,
  validação de origem e escopo.
- Bloqueios de criação de mesas, atividade como mestre e acesso comum,
  conforme o tipo e a vigência da medida.
- Reversão administrativa e expiração, preservando histórico e auditoria.
- Consulta das próprias sanções e advertências, inclusive durante suspensão
  ou expulsão, com autenticação obrigatória.
- Recursos com limite de três por caso, pendência única e avaliação independente
  por ADMIN/DEV; aprovação com reversão atômica da medida contestada.
- Validação local aprovada: 643 testes unitários, 477 E2E e 121 cenários de
  aceitação em 286 requisições HTTP reais.

O campo `isEffective` informa a vigência pelo estado e pelo horário. Os efeitos
automáticos disponíveis e as integrações ausentes estão descritos abaixo.

## Sanções administrativas

Todas exigem Bearer válido e operador ADMIN/DEV aprovado:

- `POST /admin/sanctions`: criação, resposta `201`.
- `GET /admin/sanctions`: listagem paginada, resposta `200`.
- `GET /admin/sanctions/:id`: detalhe administrativo, resposta `200`.

Exemplo de criação temporária, com IDs existentes e data final futura:

```json
{
  "userId": "ID_DO_USUARIO",
  "type": "TABLE_CREATION_RESTRICTION",
  "scopeType": "GENERAL",
  "reason": "Justificativa administrativa da decisão",
  "endsAt": "2030-12-01T18:00:00Z"
}
```

`scopeType` tem padrão `GENERAL`; `startsAt` tem padrão no instante da operação.
Não há criação retroativa nesta versão: início informado deve ser atual ou futuro.
Os timestamps exigem ISO 8601 estrito com `Z` ou offset explícito.
Campos opcionais devem ser omitidos quando ausentes; `null` e strings vazias
são rejeitados. Campos extras ou controlados pelo servidor são recusados.

Limites de entrada: IDs com até 128 caracteres, motivo com até 1.000 e descrição
de escopo com até 500, sem NUL e sem conteúdo vazio. Motivo e descrição recebem
trim antes da validação. Os limites ficam centralizados no módulo.

A listagem aceita filtros exatos `userId`, `type`, `status`, `scopeType`,
`campaignId` e `sessionId`. Paginação: `page >= 1`, `limit` padrão 20 e máximo 50;
offset limitado ao intervalo suportado. Ordenação por criação desc e ID desc.
Itens, total, autorização e instante de referência usam o mesmo snapshot.

O filtro `ACTIVE` inclui sanções futuras ainda não vencidas; `isEffective` será
falso antes do início. `EXPIRED` inclui registros vencidos ainda persistidos como
`ACTIVE`. Leituras não atualizam estado nem gravam eventos.

Listagem omite motivos, descrição livre do escopo, origens e responsáveis.
Detalhe administrativo inclui esses campos da decisão e os dados de reversão
já previstos no schema, sem joins de relato, evidência, perfil ou contatos.

### Duplicação e concorrência da criação

Uma decisão equivalente não vencida retorna `409 SANCTION_ALREADY_EXISTS`.
Compara usuário, operador, tipo, escopo, origem, motivo normalizado e término.
Se o início foi informado, também compara o instante exato; se foi omitido,
considera uma decisão equivalente já iniciada. Sanções revertidas ou expiradas
não impedem uma nova decisão. Outro tipo, escopo, origem, motivo ou prazo
representa uma decisão distinta.

Request ID serve à correlação, sem assumir o papel de chave de idempotência.
A verificação e a gravação usam Serializable, com até três tentativas completas
para conflito de escrita. Revalidam autorização, escopo e origem em cada tentativa.
Não existe unicidade global de report/advertência em `Sanction`.

`SANCTION_CREATED` é gravado na transação da sanção, com `changed`, `type`,
`scopeType`, `hasReport` e `hasWarning`. Falha de auditoria ou commit desfaz toda
a operação. Requisições rejeitadas não deixam evento de criação.

### Erros das sanções

- `400 BAD_REQUEST`: formato, campo extra, enum ou paginação inválidos.
- `400 SANCTION_SCOPE_INVALID`: tipo/escopo ou campos incompatíveis.
- `400 SANCTION_PERIOD_INVALID`: período inválido ou início retroativo.
- `401`: contratos existentes de Bearer, conta e revogação.
- `403 ADMIN_ROLE_REQUIRED`: operador sem administração técnica aprovada.
- `404 USER_NOT_FOUND`, `CAMPAIGN_NOT_FOUND`, `SESSION_NOT_FOUND`,
  `REPORT_NOT_FOUND`, `WARNING_NOT_FOUND` ou `SANCTION_NOT_FOUND`.
- `409 SANCTION_REPORT_NOT_RESOLVED`, `SANCTION_REPORT_TARGET_INVALID` ou
  `SANCTION_REPORT_USER_MISMATCH`.
- `409 SANCTION_WARNING_USER_MISMATCH`, `SANCTION_WARNING_REVERSED` ou
  `SANCTION_ORIGIN_MISMATCH`.
- `409 SANCTION_ALREADY_EXISTS`: decisão equivalente vigente ou futura.
- `409 SANCTION_CONFLICT`: tentativas de escrita concorrente esgotadas.

Nenhum erro expõe relato, motivo recebido, driver, SQL ou credenciais.

## Bloqueios e consultas próprias

A política comum consulta sanções ACTIVE cujo início já ocorreu e cujo término
ainda não ocorreu, ou sem término. Usa o mesmo critério nas rotas privadas e
nas escritas de domínio. Uma sanção futura não antecipa efeito; uma vencida não
mantém bloqueio enquanto aguarda reconciliação. Leituras não alteram histórico.

- Criação de campanha/one-shot: restrições gerais de criação ou de mestre.
- Publicação: restrição de mestre geral ou da campanha/sessão correspondente.
- Criação de sessão de campanha: restrição do mestre geral ou da campanha.
- Edição de título/agenda e conclusão de sessão de campanha: restrição do mestre geral,
  da campanha ou da sessão.
- Conclusão de one-shot: restrição de mestre geral ou de sua própria sessão.

Essas verificações usam o TransactionClient da operação. Publicação e condução
verificam o mestre responsável mesmo se outro ADMIN/DEV solicita a ação.
Restrição de criação isolada permite publicar rascunho existente. Cancelamento,
arquivamento, revisão e correção administrativos preservam as regras anteriores;
nenhuma medida cancela mesa ou substitui mestre automaticamente.
Edição comum de texto de one-shot preserva o retorno ao rascunho/revisão, e a
republicação segue bloqueada quando há restrição aplicável de atividade como
mestre. A data do one-shot é exclusiva da correção administrativa no domínio base.

Suspensão de acesso/expulsão bloqueiam as rotas comuns com
`403 ACCOUNT_SANCTIONED`, inclusive para ADMIN/DEV e tokens antigos.
Restrições de mesas retornam `403 TABLE_SANCTIONED`. Erros não expõem motivo,
ID da decisão ou antecedentes. Papéis e status da conta não são reescritos.

O login exige senha válida e conta APPROVED. As exceções autenticadas ao
bloqueio disciplinar são:

- `GET /account/sanctions` e `GET /account/sanctions/:id`: sanções do titular.
- `GET /account/warnings` e `GET /account/warnings/:id`: advertências do titular.
- `POST /account/appeals`: envio de recurso sobre uma medida própria.
- `GET /account/appeals` e `GET /account/appeals/:id`: recursos do titular.
- `POST /auth/logout`: revogação das versões anteriores do token.

Metadata interna `AllowDisciplinaryAccess` dispensa apenas o bloqueio global
disciplinar nessas rotas; assinatura, validade, versão e estado de conta seguem
obrigatórios. Não há acesso público ou exceção por header do cliente.

Consultas próprias de sanções aceitam `type`, `status`, `page` e `limit`. Usam o
mesmo critério temporal e paginação das consultas administrativas. Não aceitam
`userId`. Detalhe inexistente ou de terceiro retorna `404 SANCTION_NOT_FOUND`,
inclusive para administrador usando a rota própria. A lista omite textos livres;
o detalhe inclui motivo e descrição de escopo pertinentes, sem IDs de origem,
criador/reversor, relatos, evidências ou joins de terceiros.
Os contratos de recursos e consultas de advertências estão detalhados abaixo.

## Base existente e integrações

A base contém autenticação JWT, autorização por SystemRole e ClubRole,
administração de usuários, auditoria, agendamento e domínio de campanhas,
sessões e one-shots.

Os modelos `Warning`, `Report`, `Sanction` e `Appeal` já existem no schema.
Existência de modelo não representa implementação do fluxo de aplicação.

Participação/presença, eventos e outras atividades não possuem fluxo de
inclusão/inscrição integrado nesta base. As restrições correspondentes são
registradas, mas seu bloqueio automático depende desses módulos.

## Permissões e identidade

Aplicação e reversão exigem operador `APPROVED`, com `SystemRole.ADMIN` ou
`SystemRole.DEV`, reutilizando a política administrativa do projeto.
`ClubRole.ADMIN` não concede essa permissão.

Identidade vem do Bearer validado e de `CurrentUserId`. Responsável, revisor,
sequência, estado e timestamps de decisão são determinados pelo servidor.
Headers ou identificadores enviados pelo cliente não substituem autenticação.

As permissões e as condições da operação precisam ser relidas na transação,
inclusive quando uma tentativa é repetida após conflito de concorrência.

## Tipos e efeitos das sanções

### Restrição de criação de mesas

`TABLE_CREATION_RESTRICTION` impede a criação de campanhas e one-shots.
Permite somente escopo `GENERAL`.

### Restrição de participação em mesas

`TABLE_PARTICIPATION_RESTRICTION` registra a restrição de novas inclusões
nas mesas atingidas.
Permite `GENERAL`, `CAMPAIGN` ou `SESSION`.

Não apaga participações anteriores nem modifica presenças históricas. A aplicação
do bloqueio na inclusão depende do fluxo de participação, ausente nesta base.

### Restrição de participação em eventos

`EVENT_PARTICIPATION_RESTRICTION` registra o impedimento de participação em eventos,
com escopo `GENERAL` ou `OTHER` para um evento específico.

O bloqueio automático de inscrições depende de um módulo de eventos. Enquanto
esse fluxo não existir, o efeito específico permanece operacional e humano,
conforme a limitação de integração documentada.

### Restrição de outras atividades do clube

`CLUB_ACTIVITY_RESTRICTION` registra a atividade atingida, com escopo `GENERAL`
ou `OTHER`. A descrição explica a decisão; não funciona como identificador
técnico para autorizar ou bloquear uma atividade.

Qualquer integração automática específica depende de um identificador estável
e do respectivo módulo, ausente nesta implementação.

### Restrição de atividade como mestre

`MASTER_ACTIVITY_RESTRICTION` impede criar, publicar, iniciar ou conduzir mesas
no escopo atingido. Permite `GENERAL`, `CAMPAIGN` ou `SESSION`, conforme a ação
e a existência de um recurso identificável.

A criação de uma mesa nova só pode ser atingida pelo escopo geral; ela ainda não
possui vínculo com campanha/sessão existente. Escopos específicos se aplicam às
ações sobre os recursos correspondentes, incluindo a sessão de um one-shot
quando esse for o recurso atingido.

O papel `MASTER` permanece preservado. Revogar a sanção não concede nem restaura
papéis, evitando desfazer uma alteração administrativa legítima ocorrida depois.

Sessões e mesas existentes não são canceladas nem recebem mestre substituto
automaticamente. Essas providências exigem decisão administrativa própria.

### Suspensão de acesso e expulsão

`ACCOUNT_SUSPENSION` bloqueia as funcionalidades comuns durante o prazo.
`EXPULSION` bloqueia essas funcionalidades por prazo indeterminado.
Ambas permitem somente escopo `GENERAL`.

A sanção não muda o estado de cadastro de `User`. Expulsão continua sendo uma
sanção, sem introduzir um novo `AccountStatus`. O acesso disciplinar limitado
permanece disponível conforme as regras abaixo.

## Validação dos escopos

- `GENERAL`: sem `campaignId`, `sessionId` ou descrição de escopo específico.
- `CAMPAIGN`: exige `campaignId` existente e não aceita `sessionId`.
- `SESSION`: exige `sessionId` existente e não aceita `campaignId`.
- `OTHER`: exige `scopeDescription`; sem `campaignId` ou `sessionId`.

Para campanha e sessão, o identificador representa o alvo técnico; uma descrição
não substitui esse vínculo. O serviço rejeita combinações incompatíveis entre tipo e escopo. Nenhuma restrição específica pode virar geral implicitamente.

`OTHER` não possui identificador de evento/atividade no schema atual. Essa
limitação impede prometer aplicação automática por simples comparação de texto.

## Início, duração e expiração

`startsAt` tem como padrão o instante da aplicação e pode ser agendado para o
futuro. O administrador informa explicitamente a duração, sem dedução por pontos.

Todas as restrições temporárias exigem `endsAt` posterior a `startsAt`.
`EXPULSION` não recebe término. Os instantes são tratados com timezone explícita,
mantendo a comparação por instante no servidor.

Uma sanção produz efeito somente quando:

```text
status = ACTIVE
e startsAt <= agora
e (endsAt não existe ou endsAt > agora)
```

Uma sanção futura pode estar persistida como `ACTIVE`, mas ainda não está vigente.
Uma vencida já não bloqueia, mesmo antes de a reconciliação persistir `EXPIRED`.
A leitura independe da pontualidade do processo periódico.

Se houver mais de uma sanção aplicável, qualquer uma ainda vigente mantém o
bloqueio. Expiração ou reversão de uma medida não encerra as demais.

## Origem e justificativa

Toda criação exige usuário destinatário existente, administrador responsável
e justificativa administrativa. A decisão pode ser independente ou vinculada
a report, advertência ou ambos.

### Report

- Deve existir, estar `RESOLVED` e ter alvo `USER`.
- `reportedUserId` deve corresponder ao usuário sancionado.
- Não copiar relato, autoria ou evidências para respostas e auditoria da sanção.

### Advertência

- Deve existir e pertencer ao mesmo usuário.
- Pode estar ativa ou expirada; expiração preserva o antecedente histórico.
- Advertência `REVERSED` não fundamenta uma nova sanção.
- O vínculo não recalcula pesos nem aplica medidas automaticamente.

### Report e advertência juntos

O report informado deve ser a origem da advertência informada, com o mesmo
usuário destinatário. Não associar ocorrências diferentes por conveniência.

Um antecedente pode fundamentar medidas distintas, cada uma com decisão explícita.
Por isso, `Sanction.reportId` e `Sanction.warningId` não recebem unicidade global.
Pedidos equivalentes são recusados pela verificação de duplicação, sem
impedir decisões distintas.

Reverter um antecedente não reverte automaticamente as sanções relacionadas.
A administração precisa revisar cada decisão e registrar sua justificativa.

## Reversão e preservação de histórico

Implementado em `PATCH /admin/sanctions/:id/reversal`, resposta `200` com o
detalhe administrativo atualizado. Body: `{ "reason": "Justificativa da revisão" }`.
Motivo obrigatório em toda requisição, inclusive repetição: texto simples com
trim, até 1.000 caracteres, sem conteúdo vazio ou NUL. Campos extras, como
responsável, estado e data, são recusados. Não existe reativação ou exclusão.

Somente ADMIN/DEV aprovado pode reverter, com justificativa obrigatória.
Sanção ativa, futura ou expirada pode ser revertida para corrigir uma decisão.
`REVERSED` é terminal nesta versão; não haverá reativação.

Tipo, destinatário, origem, escopo, motivo inicial, início, término e criador
permanecem preservados. A reversão acrescenta responsável, motivo e data sem apagar a decisão.
Repetições preservam a primeira reversão, incluindo seus timestamps.

Gravação e auditoria são atômicas. Nenhuma reversão libera uma operação
enquanto outra medida vigente continuar bloqueando-a.

O serviço relê a autorização e a decisão em transação Serializable. A escrita
condicional aceita somente ACTIVE ou EXPIRED. Uma repetição de REVERSED não
executa UPDATE: preserva responsável, motivo, data de reversão e `updatedAt`.
Registra `SANCTION_REVERSED` com `changed: false`; a primeira alteração registra
`changed: true`. Metadata contém apenas estados persistidos anterior/posterior,
sem texto da decisão. Uma ACTIVE já vencida pode ser revertida diretamente,
sem exigir que o job tenha persistido EXPIRED antes.

Uma suspensão/expulsão vigente também impede o operador administrativo de
reverter decisões, inclusive a própria. Outro ADMIN/DEV autorizado deve agir.
Ao reverter a última sanção global, o JWT já emitido pode voltar às rotas comuns
se ainda for válido e a conta continuar APPROVED. Não há restauração automática
de papel, estado de cadastro ou token revogado.

### Reconciliação da expiração

`SanctionExpirationService` executa um lote na inicialização e a cada minuto.
Cada lote seleciona no máximo 25 sanções ACTIVE com `endsAt <= referência`,
ordenadas por ID, e persiste EXPIRED. Decisões futuras, sem término, já expiradas
ou revertidas não são alteradas. Pendências maiores seguem nos próximos ciclos;
o bloqueio já termina pelo horário, independentemente do tamanho do lote.

A atualização condicional e `SANCTION_EXPIRED` compartilham a transação.
O evento automático tem ator e Request ID nulos e somente
`changed: true`, `fromStatus: ACTIVE`, `toStatus: EXPIRED`. Não cria justificativa
administrativa fictícia nem altera campos de reversão, origem, escopo ou prazos.
Repetição sem mudança não gera outro evento. Falha de auditoria desfaz o lote.

Criação, reversão e reconciliação usam até três tentativas Serializable, com
timeout de 15 segundos por transação. Cada tentativa relê os dados; reversão
relê também as permissões do operador. Uma corrida entre expiração e reversão
não sobrescreve REVERSED. Conflitos esgotados retornam `409 SANCTION_CONFLICT`
nas operações HTTP; o job registra falha técnica genérica e tenta no próximo
ciclo. Um guard local evita sobreposição no mesmo processo; a transação protege
disputas entre processos. Não há endpoint público ou administrativo para
disparar a reconciliação.

Logs da rotina registram somente contagem ou evento de falha, sem IDs, motivos,
credenciais, SQL ou erro do driver. A mudança de estado preserva o histórico;
expiração não equivale a remoção ou anonimização.

## Recursos e definição de caso

Rotas implementadas:

- `POST /account/appeals`: envio pelo titular autenticado, resposta `201`.
- `GET /account/appeals`: lista própria paginada, resposta `200`.
- `GET /account/appeals/:id`: detalhe próprio, resposta `200`.
- `GET /admin/appeals` e `GET /admin/appeals/:id`: consultas por ADMIN/DEV aprovado.
- `PATCH /admin/appeals/:id/review`: avaliação administrativa, resposta `200`.
- `GET /account/warnings` e `GET /account/warnings/:id`: decisões próprias
  existentes, para compreender e contestar advertências.

As rotas próprias mantêm Bearer, versão válida e conta APPROVED, com exceção
somente do bloqueio global disciplinar. Não criam fluxo de emissão de
advertências, gestão de categorias ou de reports.

Exemplo de envio, escolhendo somente um dos dois identificadores:

```json
{
  "sanctionId": "ID_DA_PROPRIA_SANCAO",
  "justification": "Justificativa do pedido de revisão"
}
```

Para advertência, usar `warningId` e omitir `sanctionId`. Ausência de ambos,
presença de ambos, null ou campos controlados pelo servidor são recusados.
Titular, sequência, estado, avaliador e timestamps são definidos pela API.
Justificativa e resposta exigem texto simples com trim, sem vazio/NUL e com
até 1.000 caracteres, reutilizando o limite dos motivos administrativos.

Um caso é uma advertência ou uma sanção individual. Um recurso aponta para
exatamente um desses alvos, nunca para ambos.

O limite é de três recursos por registro. Uma advertência admite três, e cada
sanção vinculada a ela admite seus próprios três. Não existe contador compartilhado
por incidente, report ou usuário.

- Somente o titular da medida pode apresentar o recurso.
- Justificativa obrigatória em cada envio.
- No máximo um `PENDING` por caso.
- Após rejeição, um próximo envio pode usar a sequência seguinte, até três.
- As sequências 1, 2 e 3 permanecem no histórico; rejeição não devolve tentativa.
- Após o terceiro envio, um quarto é bloqueado, inclusive com concorrência.
- Medidas expiradas ainda podem ser contestadas para correção do histórico.
- Medidas já revertidas não recebem novos recursos.
- Recurso pendente não suspende o efeito da sanção.

Contagem, verificação de pendência, atribuição de sequência e gravação são
protegidas pela mesma transação e pelos índices únicos existentes. O histórico
não é apagado para reiniciar a contagem.

O envio usa Serializable com até três tentativas e timeout de 15 segundos.
Cada tentativa relê titular, caso e histórico de recursos; calcula a próxima
sequência pelo maior número existente. A unicidade por caso/sequência e a nova
leitura após conflitos de escrita/unicidade protegem envios simultâneos. Não há
mutex em memória ou contador compartilhado por report.

Listas aceitam `status`, `warningId` ou `sanctionId` e paginação; a administrativa
também aceita `userId`. Os dois alvos não podem ser combinados no filtro. A lista
própria sempre força o titular autenticado e não aceita `userId` no HTTP.
Paginação e ordenação seguem as consultas de sanções. Leituras usam RepeatableRead
para autorização, itens e total, sem gravar eventos.

Listas de recursos omitem justificativa, resposta e avaliador. Detalhe próprio
inclui justificativa, resposta e data de avaliação, sem `reviewedById` ou joins.
Detalhe administrativo inclui também o ID do avaliador. Nenhuma projeção carrega
report, evidências, dados de perfil ou conteúdo de casos relacionados.
Caso/recurso inexistente ou pertencente a terceiro retorna o mesmo `404` nas
rotas próprias, inclusive quando o titular é administrador.

Listagem própria de advertências aceita `status` e paginação. Retorna categoria,
gravidade, componentes históricos dos pesos, ocorrência, validade e timestamps,
sem textos livres. O detalhe acrescenta motivo e dados pertinentes da reversão,
sem `reportId`, criador ou reversor. ACTIVE vencida aparece como EXPIRED, sem
gravação de estado durante a consulta. Isso não implementa o job de advertências.

## Avaliação e decisão do recurso

Body: `{ "decision": "APPROVED", "response": "Resposta administrativa" }`.
Aceita somente APPROVED ou REJECTED; resposta é obrigatória em toda requisição,
inclusive repetição. Não aceita avaliador, datas ou edição do pedido original.

A avaliação exige ADMIN/DEV aprovado diferente de quem aplicou a medida.
O titular não avalia o próprio recurso. É necessário um segundo operador
autorizado; indisponibilidade de avaliador não autoriza ignorar essa regra.

Resposta obrigatória em aprovação e rejeição, com avaliador e data definidos
pelo servidor. Preservar a decisão original em repetições.

Ao aprovar, reverter a medida contestada e registrar a decisão e a auditoria
na mesma transação. Se o alvo é uma advertência, as sanções associadas permanecem
válidas até revisão própria. Se o alvo é uma sanção, as outras medidas permanecem
independentes. Falha de qualquer gravação deve reverter toda a operação.

Ao rejeitar, preservar a medida e encerrar o recurso com resposta registrada.
O próximo envio só é possível se ainda houver tentativa disponível e o alvo
continuar elegível.

Uma repetição da mesma decisão preserva avaliador, data, resposta e `updatedAt`
originais, mesmo com outra resposta ou outro avaliador autorizado; registra
somente `APPEAL_REVIEWED` com `changed: false`. Decisão oposta é bloqueada.
Repetições continuam exigindo papel atual e independência do avaliador.

Se a medida foi revertida manualmente enquanto o recurso estava pendente,
é possível concluir sua análise. Aprovação preserva a reversão já existente;
rejeição não reativa a medida. Em ambos os casos fica registrada a resposta.
Não se permite novo envio para uma medida revertida.

A aprovação de sanção reutiliza a lógica da reversão administrativa, passando
o TransactionClient da avaliação. Aprovação de advertência altera somente seu
estado e metadados de reversão, preservando pesos, validade, origem e criador.
A resposta fundamenta a reversão, sem copiar a justificativa do titular para a
decisão administrativa. Reversão e avaliação geram seus eventos no mesmo commit;
falha na auditoria final desfaz ambas. Nenhuma decisão reativa conta, concede
papel ou invalida/desrevoga tokens por conta própria.

### Erros dos recursos

- `400 BAD_REQUEST`: entrada, campos extras ou paginação inválidos.
- `400 APPEAL_TARGET_INVALID`: falta de alvo ou combinação de advertência/sanção.
- `401`: regras existentes de Bearer, versão e elegibilidade da conta.
- `403 ADMIN_ROLE_REQUIRED` ou `ACCOUNT_SANCTIONED`: avaliação sem acesso vigente.
- `403 APPEAL_INDEPENDENT_REVIEWER_REQUIRED`: avaliador é titular ou aplicador.
- `404 APPEAL_CASE_NOT_FOUND`, `APPEAL_NOT_FOUND` ou `WARNING_NOT_FOUND`.
- `409 APPEAL_PENDING`: já existe análise pendente para o caso.
- `409 APPEAL_LIMIT_REACHED`: tentativas esgotadas.
- `409 APPEAL_CASE_CLOSED`: medida revertida ou caso com recurso já aprovado.
- `409 APPEAL_ALREADY_REVIEWED`: tentativa de trocar uma decisão concluída.
- `409 APPEAL_CASE_INVALID`: vínculo histórico incompatível com o titular.
- `409 APPEAL_CONFLICT`: tentativas de escrita concorrente esgotadas.

Erros não revelam justificativa, resposta, origem, SQL ou dados de terceiros.

## Acesso disciplinar limitado

Suspensão de acesso e expulsão mantêm um caminho autenticado para o próprio
titular consultar decisões pertinentes, enviar/acompanhar recursos e fazer logout.
A senha, assinatura, expiração, versão do token e identidade continuam validadas.
Não usar `@Public()` como atalho de acesso aos dados disciplinares.

O servidor verifica as sanções atuais a cada operação protegida. O efeito atinge também tokens emitidos antes da aplicação. Permissões enviadas pelo
cliente ou uma decisão de interface não liberam as demais rotas.

A suspensão disciplinar não substitui as regras existentes de cadastro e ciclo
de vida: este contrato não aprova contas pendentes, não recupera exclusões nem
libera estados de conta hoje rejeitados pela autenticação.

O titular recebe somente sua decisão, motivo pertinente, escopo, prazos e
respostas dos próprios recursos. Acesso limitado não permite consultar audit log,
casos de terceiros, autor de denúncia, relato ou evidências automaticamente.

O guard aplica essa distinção às consultas próprias de sanções/advertências,
envio/consulta de recursos e logout. A avaliação administrativa continua sendo
rota comum, sem exceção para operador sancionado. A camada central de autorização
também verifica sanções globais para proteger serviços fora da fronteira HTTP.

## Persistência

`Sanction` armazena tipo, estado, escopo, vínculos opcionais com report e
advertência, início/fim, justificativa e responsáveis por criação/reversão.

`Appeal` armazena titular, alvo de advertência ou sanção, sequência,
justificativa, estado, avaliador, data e resposta. Os índices únicos por
`warningId + sequence` e `sanctionId + sequence` protegem a numeração por caso.
Exclusividade do alvo, limite de três e pendência única são validados pela API
na transação.

Os modelos existentes atenderam à implementação, sem alteração de schema,
migrations ou dependências. O domínio usa Prisma, sem tipos nativos, extensões,
triggers ou SQL específico de PostgreSQL acrescentados.

## Resultados da validação

Validação local concluída em **04/11/2026**:

- Build da API aprovado.
- **643 testes unitários e 477 E2E aprovados.**
- Formatação e ESLint das fontes alteradas e dos testes novos aprovados.
- **121 cenários de aceitação aprovados em 286 requisições HTTP reais.**
- Login, aplicação, serviços e PostgreSQL reais, com banco local descartável.
- Scheduler observado no ciclo normal, sem acionamento direto ou relógio simulado.
- Cinco respostas `500` provocadas para comprovar rollback, todas esperadas;
  nenhuma falha inesperada na bateria.

As verificações cobriram tipos, origens, escopos, vigência, autorização,
projeções privadas, reversão, expiração, recursos, limite de três, independência
do avaliador, auditoria e concorrência. Foram confirmados bloqueio de duplicação,
preservação da primeira decisão e rollback integral quando a auditoria falha.

Os resultados esperados e observados de M001 a M121, exemplos de curl e
preparação dos dados estão no [relatório dos testes manuais](sancoes-testes-manuais.md).
API e banco temporários foram encerrados; credenciais, dados e roteiro auxiliar
não foram incluídos no repositório.

## Limitações

- Bloqueios automáticos de participação em mesas, eventos e outras atividades
  dependem dos respectivos módulos. O registro e a validação dessas restrições
  estão disponíveis.
- Consulta e reversão de advertência por recurso não implementam o fluxo de
  emissão de advertências ou de criação/resolução de reports.
- A validação realizada foi local; homologação no Render/Supabase e execução
  em MySQL não foram realizadas.
- A checagem ampla de TypeScript mantém 59 diagnósticos em testes legados,
  sem diagnóstico novo em comparação com a base. O lint dos testes legados
  alterados também não recebeu novas violações. A aprovação de lint acima
  corresponde às fontes alteradas e aos testes novos.

## Referências

- [Autenticação](auth.md)
- [Papéis e autorização](roles-authorization.md)
- [Administração de usuários](admin-users.md)
- [Auditoria administrativa](audit-log.md)
- [Domínio de mesas](tables-domain.md)
- [Privacidade e LGPD](../privacy/lgpd-fase2.md)
- [Testes manuais e resultados](sancoes-testes-manuais.md)
- [Prisma, PostgreSQL e portabilidade](../database/prisma-postgresql-e-portabilidade-mysql.md)

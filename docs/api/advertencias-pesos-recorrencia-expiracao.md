# Advertências, pesos, recorrência e expiração

Contrato da API para registrar advertências, consultar pontuação ativa e preservar
o histórico das decisões administrativas.

> **Situação:** catálogo, provisionamento, criação direta ou vinculada a report,
> consultas administrativas, reversão e política de cálculo implementados e validados
> localmente. A unicidade por report foi conferida em PostgreSQL isolado.
> O job de expiração também está implementado, com lotes e auditoria atômicos.
> Revisão final local concluída. PR, homologação e rollout remoto da migration
> e do catálogo permanecem pendentes.

A implementação parte de `develop` e reutiliza Prisma, autenticação, autorização,
auditoria e agendamento existentes. O PR de feedback/presença permanece independente.

## Escopo e permissões

As operações HTTP exigem Bearer JWT e operador `APPROVED` com
`SystemRole.ADMIN` ou `SystemRole.DEV`, usando `ADMINISTRATOR_REQUIREMENT`.
`ClubRole.ADMIN` não concede administração técnica.

O operador vem de `CurrentUserId`. Estado e permissões são relidos no mesmo
`TransactionClient` da operação, inclusive nos retries. Identidade, pesos,
multiplicadores, número da ocorrência, status e timestamps não são aceitos
do cliente.

Esta entrega inclui catálogo inicial, criação direta ou vinculada a report,
consulta administrativa, pontuação ativa, reversão e expiração.
Não cria reports, sanções, suspensão de conta ou outros efeitos automáticos.
A pessoa advertida precisa existir; a advertência não modifica seu cadastro,
seus papéis ou suas permissões.

## Categorias e gravidade

Categoria descreve o tipo de ocorrência. Gravidade é escolhida explicitamente
pelo administrador e determina peso base e duração. O catálogo inicial não
impõe uma gravidade automática.

| Código           | Categoria                                 |
| ---------------- | ----------------------------------------- |
| `RESPECT`        | Ofensas e desrespeito                     |
| `HARASSMENT`     | Assédio                                   |
| `DISCRIMINATION` | Discriminação                             |
| `SAFETY`         | Ameaças e situações de risco              |
| `COMMITMENTS`    | Descumprimento de compromissos combinados |
| `OTHER`          | Outros, com explicação obrigatória        |

As categorias usam `DisciplinaryCategory`, com IDs cuid() e código estável.
O provisionamento é idempotente: insere categorias ausentes sem apagar,
reativar ou sobrescrever categorias existentes. Categorias adicionais existentes
não serão removidas. A gravidade continua obrigatória no DTO, independentemente
de eventual `defaultSeverity` já cadastrado.

Somente categorias ativas podem ser usadas em novas advertências. A desativação
não altera cálculos de recorrência ou registros históricos já existentes.
A consulta administrativa lista categorias ativas, com projeção de `id`, `code`
e `label`, paginação e autorização dentro da transação. CRUD de categorias fica
fora desta entrega. Iniciar a API não provisiona dados automaticamente.

### Provisionamento do catálogo

Em `apps/api`, após conferir a `DATABASE_URL` do ambiente autorizado e aplicar
as migrations revisadas, executar explicitamente:

```sh
npm run seed:disciplinary-categories
```

O `preseed` gera o Prisma Client e compila pelo build existente. O comando usa
o `PrismaService` diretamente, sem iniciar a aplicação, jobs ou servidor HTTP.
Com o artefato já compilado, o job também pode executar
`node dist/warnings/seed-disciplinary-categories.js`.

O catálogo fica centralizado em `disciplinary-categories.constants.ts`.
`createMany` com `skipDuplicates` usa o código único e os IDs cuid() gerados pelo
Prisma. Categorias novas recebem `active: true` e `defaultSeverity: null`.
O comando informa somente a quantidade criada e não imprime erros do driver ou
credenciais. Não modifica labels, defaults, estado ou timestamps de registros
existentes, inclusive em repetição ou execução concorrente.

Nesta entrega o comando foi testado apenas com bancos locais descartáveis.
Provisionamento em homologação permanece pendente, pelo fluxo do ambiente.

Uma ausência registrada, feedback negativo ou report nunca cria advertência
automaticamente. O administrador analisa o contexto e justifica a decisão.

## Política de cálculo

Pesos, prazos e multiplicadores estão centralizados em
`warning-policy.constants.ts`. `warning-policy.ts` calcula os componentes e
interpreta o estado efetivo, sem consultar o banco ou modificar registros.
Na criação, os valores aplicados serão armazenados na advertência para preservar
a decisão mesmo após alterações futuras dessa política.

| Gravidade  | Peso base | Prazo ativo |
| ---------- | --------- | ----------- |
| `LIGHT`    | 1         | 90 dias     |
| `MODERATE` | 3         | 180 dias    |
| `SEVERE`   | 6         | 365 dias    |

Prazos são contados a partir do instante de criação no servidor, em UTC.
Um dia corresponde a 24 horas; não há arredondamento para o início ou fim do dia.

### Recorrência

Contar somente advertências do mesmo usuário e da mesma categoria com
`status = ACTIVE` e `expiresAt > agora`.

`occurrenceNumber` é essa quantidade mais um, calculada na transação da criação.
Não representa uma sequência vitalícia: expirações e reversões podem reduzir a
quantidade considerada nas criações posteriores.

| Ocorrência no momento da criação | Multiplicador |
| -------------------------------- | ------------- |
| 1ª                               | 1,0           |
| 2ª                               | 1,5           |
| 3ª                               | 2,0           |
| 4ª ou posterior                  | 2,5           |

`effectiveWeight = baseWeight × recurrenceMultiplier`.

O cálculo usa `Prisma.Decimal`, sem arredondamento de pontuação. A soma ativa
é agregada no banco e retorna Decimal, inclusive zero quando não houver
advertências ativas. Não há conversão dos pesos para `number` nem alteração da
precisão global de Decimal. Na serialização JSON, pesos e totais são strings
decimais, como `"3"` ou `"4.5"`. Contadores permanecem números inteiros.

`warning-calculation.ts` recebe o cliente da transação e um instante explícito
para contar recorrências e consultar a soma ativa. O instante é copiado antes
da leitura para que contagem, cálculo e vencimento usem a mesma referência.
Cada chamada relê a quantidade ativa, sem cache de recorrência.

Esses helpers não criam transações, não autenticam nem gravam advertências.
`WarningsService` os integra às rotas com autorização, persistência e auditoria.
A criação usa isolamento `Serializable`, com até três tentativas para conflito
`P2034` ou `DriverAdapterError` com `cause.kind = TransactionWriteConflict`.
O segundo formato ocorre no commit com o adapter PostgreSQL desta versão do
Prisma. A classificação usa o discriminador estruturado, sem inspecionar SQL ou
mensagens. Cada tentativa relê operador, usuário, categoria e recorrência,
captura um novo instante e rollbacka advertência/auditoria se falhar. Outros erros
não provocam retry; esgotamento retorna `409 WARNING_CONFLICT`.

Como proteção técnica, o cálculo rejeita gravidade, estado ou datas inválidas.
A contagem anterior deve ser inteira, não negativa e menor que `2.147.483.647`,
para que a ocorrência seguinte caiba no `Int` do schema. O vencimento calculado
também precisa representar uma data válida.

Duas criações simultâneas para o mesmo usuário/categoria não podem usar
silenciosamente o mesmo cálculo de recorrência. Leitura, cálculo, criação e
auditoria precisam compartilhar a transação, com tratamento de conflitos.

### Histórico preservado

Depois da criação, gravidade, categoria, motivo original, usuário, origem,
pesos, multiplicador, ocorrência, criação e vencimento não são editáveis nesta
versão. Correções de uma decisão usam reversão, sem reescrever seu registro.

Expirar ou reverter uma advertência retira sua contribuição ativa, mas não
recalcula o peso das demais. Uma advertência moderada criada como segunda
ocorrência mantém peso `4.5` mesmo que a anterior deixe de estar ativa.

O total é a soma dos `effectiveWeight` das advertências ainda ativas; não é a
soma de todo o histórico. Categorias diferentes e usuários diferentes são
independentes.

## Criação direta e origem via report

A justificativa administrativa é obrigatória nas duas origens. Ela descreve
a decisão, sem copiar automaticamente o relato, a autoria ou as evidências da denúncia.

### Direta

Sem `reportId`, o operador informa usuário, categoria ativa, gravidade e motivo.
A origem direta não exige nem cria um report.
O usuário precisa existir, mas não precisa estar `APPROVED`: registrar uma decisão
não altera seu status ou seus papéis. O motivo é normalizado com trim, armazenado
como texto simples e não é copiado para logs ou metadata de auditoria.

### Vinculada a report

O vínculo usa o mesmo `POST /admin/warnings`, acrescentando `reportId` ao corpo.
Quando presente:

- O report deve existir e estar `RESOLVED`.
- Reports `OPEN`, `UNDER_REVIEW` e `DISMISSED` são rejeitados.
- O alvo deve ser `USER`, com `reportedUserId` correspondente a `userId`.
- `categoryId` deve corresponder à categoria do report e continuar ativo.
- A criação continua dependendo de ação explícita de ADMIN/DEV.
- Um report não pode originar advertências duplicadas; expiração ou reversão
  não libera sua reutilização nesta versão.

`warning-report.ts` consulta somente `status`, `targetType`, `reportedUserId` e
`categoryId`, no mesmo TransactionClient da criação. Não lê autor, relato,
resolução, evidências ou sessão do report. A advertência não modifica o report,
seu estado ou suas evidências; a justificativa vem explicitamente do operador.
Resolver um report não executa essa criação automaticamente.

A consulta de advertência existente por `reportId` não filtra status. A chave
única do banco protege a concorrência: violação identificada dessa chave retorna
`409 WARNING_REPORT_ALREADY_USED`, sem SQL ou nome da constraint na resposta.
Conflitos de serialização repetem a operação inteira, incluindo elegibilidade e
checagem de uso do report. Erros de outras chaves únicas não são confundidos com
reutilização. Advertência e auditoria rollbackam juntas, permitindo nova tentativa
quando a criação falha antes do commit.

Report `RESOLVED` apenas permite analisar a criação. Não determina a gravidade
e não gera advertência ou sanção automaticamente.

Reports direcionados a `SESSION` ficam fora desse caminho. Não se atribui
responsabilidade automaticamente ao mestre ou aos participantes.

O schema de `Report` existe, mas seu fluxo HTTP ainda não foi implementado na
base analisada. O vínculo foi testado com reports fictícios no banco isolado.
O fluxo completo desde envio até resolução da denúncia depende da task de
reports e deve ser conferido na integração entre as entregas.
Esta task não acrescenta endpoints de reports para contornar essa dependência.

## Contrato HTTP

Todas as rotas abaixo são privadas e administrativas. Consulta de categorias,
criação direta/via report, lista, detalhe, resumo e reversão estão implementados.

| Método  | Rota                                    | Operação                                         |
| ------- | --------------------------------------- | ------------------------------------------------ |
| `GET`   | `/admin/disciplinary-categories`        | Listar categorias ativas                         |
| `POST`  | `/admin/warnings`                       | Criar advertência direta ou vinculada a report   |
| `GET`   | `/admin/warnings`                       | Listar histórico, com filtros                    |
| `GET`   | `/admin/warnings/:id`                   | Consultar detalhe administrativo                 |
| `GET`   | `/admin/users/:userId/warnings/summary` | Consultar pontuação ativa e resumo por categoria |
| `PATCH` | `/admin/warnings/:id/reversal`          | Reverter com justificativa                       |

### Criação

Retorno `201`. Corpo direto:

```json
{
  "userId": "id-do-usuario",
  "categoryId": "id-da-categoria",
  "severity": "MODERATE",
  "reason": "Justificativa da decisão administrativa."
}
```

Para origem via report, acrescentar `reportId`. O cliente não informa status,
pesos, recorrência, vencimento, criador ou dados de reversão.
Exemplo vinculado:

```json
{
  "userId": "id-do-usuario-reportado",
  "categoryId": "id-da-categoria-do-report",
  "reportId": "id-do-report-resolvido",
  "severity": "MODERATE",
  "reason": "Justificativa explícita da decisão administrativa."
}
```

Como limites técnicos dos DTOs, adotar IDs não vazios de até 128 caracteres
e motivos não vazios após trim de até 1.000 caracteres Unicode, sem NUL.
`reportId` é omitido na origem direta; se enviado, deve ser uma string válida.
`severity` é obrigatório; `null`, valores desconhecidos e campos extras são
rejeitados. Motivos são texto simples e não devem ser interpretados como HTML.

### Consultas e projeções

Retorno `200`. Listas usam `PaginationQueryDto`: `page >= 1`, `limit` entre 1 e
50, padrão 20, resposta `items/meta` e offset limitado ao intervalo do banco.
Advertências são ordenadas por `createdAt desc, id desc`; categorias, por
`code asc, id asc`.

A lista de advertências aceita filtros exatos opcionais `userId`, `categoryId`,
`severity` e `status`. Não há busca por motivo, relato ou evidência.
Itens e total usam o mesmo filtro e snapshot, com autorização no mesmo
`TransactionClient`.

A projeção de lista contém IDs da advertência/usuário/categoria, código e nome
da categoria, gravidade, componentes do cálculo, status efetivo, vencimento
e timestamps. Não inclui justificativas nem dados de perfil.

O detalhe e as respostas de criação/reversão acrescentam `reportId`, `reason`,
`createdById`, `reversedById`, `reversedAt` e `reversalReason`. Não fazem join
de report, autor da denúncia, evidências, contatos, nascimento ou credenciais.

O resumo retorna `userId`, `calculatedAt`, quantidade e peso total ativos, além
dos totais por categoria. Usa somente advertências efetivamente ativas e não
deduz sanção, suspensão ou restrição a partir da pontuação.
`categories` contém somente categorias com advertências ativas para esse usuário,
inclusive se o catálogo tiver sido desativado após a criação. A ordenação é
`code asc, id asc`, com projeção de categoria limitada a `id`, `code` e `label`.
Sem advertências ativas, a quantidade é zero, o total é `"0"` e a lista é vazia.

Exemplo de resumo:

```json
{
  "userId": "id-do-usuario",
  "calculatedAt": "2026-11-03T12:00:00.000Z",
  "activeCount": 2,
  "totalActiveWeight": "7.5",
  "categories": [
    {
      "category": {
        "id": "id-da-categoria",
        "code": "RESPECT",
        "label": "Ofensas e desrespeito"
      },
      "activeCount": 2,
      "totalActiveWeight": "7.5"
    }
  ]
}
```

O horário de referência é único por consulta. Um `ACTIVE` com prazo vencido é
apresentado como `EXPIRED` mesmo antes da reconciliação; o filtro por status e
suas contagens usam a mesma interpretação. Não há escrita durante GETs.

Não haverá endpoint público ou de consulta pelo titular nesta entrega. O futuro
retorno ao titular deve respeitar a política de privacidade, sem expor material
de terceiros.

As leituras usam `RepeatableRead`, sem retry automático, com autorização,
projeção, contagens e agregações no mesmo snapshot. Os pesos são somados no
banco, sem conversão para `number`. Categorias, usuários e campos privados não
são buscados além da projeção necessária. IDs inexistentes retornam `404` com
`USER_NOT_FOUND`, `WARNING_NOT_FOUND` ou `DISCIPLINARY_CATEGORY_NOT_FOUND`;
categoria inativa na criação retorna `409 DISCIPLINARY_CATEGORY_INACTIVE`.

Erros específicos do vínculo, sem efeitos parciais:

| HTTP | Código                             | Situação                                                   |
| ---- | ---------------------------------- | ---------------------------------------------------------- |
| 404  | `REPORT_NOT_FOUND`                 | Report inexistente                                         |
| 409  | `WARNING_REPORT_NOT_RESOLVED`      | Estado diferente de `RESOLVED`                             |
| 409  | `WARNING_REPORT_TARGET_INVALID`    | Alvo diferente de `USER` ou sem usuário reportado          |
| 409  | `WARNING_REPORT_USER_MISMATCH`     | Destinatário diferente do usuário reportado                |
| 409  | `WARNING_REPORT_CATEGORY_MISMATCH` | Categoria diferente da categoria do report                 |
| 409  | `WARNING_REPORT_ALREADY_USED`      | Report já vinculado a uma advertência, inclusive histórica |

`reportId` nulo, vazio, somente espaços, com NUL, acima do limite ou de tipo
inválido retorna `400 BAD_REQUEST`; nunca é tratado como omissão para criar uma
advertência direta.

## Reversão

`PATCH /admin/warnings/:id/reversal` retorna `200`, somente para ADMIN/DEV
aprovado, com motivo obrigatório. Corpo:

```json
{
  "reason": "Justificativa da reversão."
}
```

| Origem     | Destino    | Efeito                                                |
| ---------- | ---------- | ----------------------------------------------------- |
| `ACTIVE`   | `REVERSED` | Retira a contribuição ativa                           |
| `EXPIRED`  | `REVERSED` | Registra a reversão histórica; peso ativo já era zero |
| `REVERSED` | `REVERSED` | Preserva a primeira decisão e registra repetição      |

Gravar `reversedById`, `reversedAt` e `reversalReason` na primeira reversão.
Repetições também exigem motivo válido, mas não sobrescrevem ator, motivo,
datas ou valores da primeira decisão.

`REVERSED` é terminal nesta versão. Não há reativação, exclusão física ou
recálculo das advertências posteriores. Operação e auditoria são atômicas.

Criação e reversão compartilham o helper transacional de escrita, com isolamento
Serializable e até três tentativas para os conflitos já descritos. A reversão
relê autorização e advertência em cada tentativa. A primeira decisão faz update
condicional pelo ID e estado persistido; somente status, responsável, data e
motivo de reversão são enviados ao update. `updatedAt` é mantido pelo Prisma.
Sem correspondência no update, retorna `409 WARNING_CONFLICT`, sem evento de sucesso.

A repetição não faz update: preserva também `updatedAt`, exige motivo válido
e registra apenas novo evento de auditoria com `changed: false`. Motivo, estado,
ator ou data enviados em campos extras são rejeitados pelo DTO; somente `reason`
é aceito no corpo. Seu limite Unicode e normalização são os mesmos da criação.

Uma `ACTIVE` já vencida pode ir diretamente para `REVERSED`; o evento usa
`fromStatus: EXPIRED`, conforme o estado efetivo no instante da operação.
Categoria desativada ou alteração posterior no report não bloqueiam a reversão
da decisão histórica. O report continua vinculado e não pode ser reutilizado.
Reverter a primeira de duas moderadas retira seu peso `3`, mantendo o peso `4.5`
da segunda. Não altera conta, papéis, sanções ou conteúdo de report.

Em duas reversões simultâneas, a primeira decisão confirmada é preservada.
A outra operação, após retry quando necessário, retorna essa mesma decisão e
registra repetição. A auditoria identifica o operador de cada request, sem
sobrescrever o responsável armazenado na advertência.

## Expiração

Uma advertência contribui somente quando `status = ACTIVE` e `expiresAt > agora`.
Na fronteira `expiresAt <= agora`, sua contribuição já é zero. Os helpers de
recorrência e soma já aplicam essa condição. A política também fornece filtros
por estado efetivo e interpretação do estado retornado, já reutilizados
nas consultas HTTP, no resumo e na reversão.

`WarningExpirationService` reconcilia `ACTIVE` vencidas para `EXPIRED` no início
da aplicação e a cada hora, pelo `ScheduleModule` existente. Não há endpoint
HTTP para disparar expiração nem dependência nova. Constantes operacionais ficam
em `warning-expiration.constants.ts`:

- Até 25 candidatos por lote, ordenados por `expiresAt asc, id asc`.
- Até quatro lotes por execução, sem varrer indefinidamente o backlog no startup.
- Timeout de 10 segundos por tentativa de transação; até três tentativas nos
  conflitos de escrita já reconhecidos pelo módulo.

Cada execução copia um único instante de referência. Cada lote abre sua própria
transação ReadCommitted, buscando somente IDs com `status = ACTIVE` e
`expiresAt <= referência`. A atualização de cada ID repete os dois predicados;
somente um update efetivo gera `WARNING_EXPIRED`. Outro worker ou uma reversão
que tenha alterado o registro faz o update perder a correspondência, sem evento.
Esse compare-and-update com auditoria atômica dispensa locks ou SQL específicos
de PostgreSQL e impede eventos duplicados entre instâncias.

`run()` ignora sobreposição na mesma instância e libera sua flag ao terminar,
inclusive após falha. `reconcile()` retorna `count`, `batches` e
`batchLimitReached`. O último indicador significa que o limite de lotes foi
consumido; não afirma que ainda existe backlog. O restante será lido no próximo
ciclo ou startup. Páginas de candidatos usam estado atual, sem offset que pudesse
pular registros após expirá-los.

Cada lote é atômico: falha de escrita, auditoria ou commit desfaz todas as suas
transições e eventos. Lotes anteriores já confirmados permanecem íntegros; a
execução seguinte retoma apenas os registros restantes. O processo
não altera `REVERSED`, pesos, motivos ou datas históricas, nem cria sanções.

Se a API dormir no Render, o vencimento continua valendo nas consultas e
cálculos. A execução posterior apenas reconcilia o estado persistido.
Logs técnicos de sucesso contêm somente os três contadores/indicadores acima;
falhas usam `warnings_expiration_reconciliation_failed`, sem IDs, payloads,
motivos, erro do driver ou conexão. A falha é capturada para permitir o startup
e uma tentativa posterior, sem registrar sucesso do lote abortado.

## Auditoria e segurança

O evento `WARNING_CREATED` da entidade `WARNING` está integrado ao `AuditService`
existente, na mesma transação da criação. Metadata contém apenas `changed: true`
e `hasReport`, falso na origem direta e verdadeiro na vinculada. A consulta de audit logs aceita
`entityType=WARNING`, sem join de advertência ou exposição de seu motivo.
`WARNING_REVERSED` também está integrado, com `changed`, `fromStatus` efetivo e
`toStatus: REVERSED`, sem motivo ou conteúdo disciplinar na metadata.
`WARNING_EXPIRED` usa ator e Request ID nulos, com `changed: true`,
`fromStatus: ACTIVE` persistido e `toStatus: EXPIRED`. Esse evento reconcilia o
estado; o peso já deixou de contar pelo vencimento. Não há evento de expiração
para estado já expirado, revertido ou update sem correspondência.

Criação e reversão registram ator autenticado e Request ID. Reversão repetida
registra `changed: false` e a primeira decisão, `changed: true`.
Expiração interna usa ator e Request ID nulos e não cria evento se não houver
transição efetiva.

Metadata é montada explicitamente e limitada a indicadores operacionais
necessários, como mudança/estados e existência de origem via report.
Não copiar motivos, gravidade, pontuação, categoria, dados de denúncia ou
evidências para metadata. O ID da entidade permite a consulta administrativa
autorizada quando necessária.

Logs técnicos não recebem payloads, nomes, justificativas, relatos, senhas,
hashes, tokens, cookies ou URLs de evidência. Respostas de erro seguem o formato
existente, sem detalhes de SQL, constraints ou conteúdo de terceiros.

## Persistência e integração

`Warning` já armazena `baseWeight`, `recurrenceMultiplier`, `effectiveWeight`,
`occurrenceNumber`, status, vencimento e metadados de reversão. Reutilizar esses
campos e as relações existentes.

`Warning` agora declara `@@unique([reportId])`. Um report pode originar uma única
advertência, independentemente de usuário, categoria ou status posterior. Valores
nulos continuam permitindo múltiplas advertências diretas. A relação existente
`Report.warnings` foi preservada; não houve renomeação de campos do report.

A migration `20261103120000_enforce_warning_report_uniqueness` cria o índice
único e remove o antigo índice não único, já coberto pela nova chave. Ambas as
operações estão em uma transação. Duplicatas legadas abortam a aplicação, sem
apagar dados ou perder o índice anterior; sua resolução exige revisão autorizada.
Não alterar migrations aplicadas ou usar reset em banco compartilhado.

O SQL estrutural veio de `prisma migrate diff` contra PostgreSQL 16 descartável,
após `migrate dev --create-only` recusar o terminal não interativo. A migration
foi aplicada por `migrate deploy` no banco isolado; novo diff não encontrou
divergência para o schema. Homologação não foi acessada.

Preservar IDs cuid(), UTC e portabilidade lógica PostgreSQL/MySQL. Não introduzir
dependência, tipo nativo, índice exclusivo de PostgreSQL ou refatoração global
sem necessidade demonstrada. O rollout remoto usa migrations versionadas
revisadas pelo fluxo do ambiente.

Os contratos de auditoria, autorização, privacidade e setup refletem a criação,
consultas, reversão e reconciliação implementadas. A revisão local conferiu as
regras da task, projeções, fronteiras transacionais, seed e migration.

As integrações fora do novo módulo são necessárias à entrega: `AppModule`
registra o módulo de advertências; o contrato de auditoria inclui seus três
eventos; os doubles E2E de app/auth incluem uma consulta vazia de advertências
para o novo job de inicialização. A alteração de schema limita-se à unicidade
por report e à substituição de seu índice redundante. Dependências, lockfiles,
frontend e arquivos de credenciais não fazem parte do diff desta task.

## Critérios de validação

- Catálogo idempotente, sem reativar ou sobrescrever categorias existentes.
- Permissões relidas no banco; `USER` e `ClubRole.ADMIN` sem privilégio técnico.
- Três gravidades, prazos exatos e quatro faixas de recorrência.
- Cálculos decimais, soma ativa e independência por usuário/categoria.
- Expiradas e revertidas fora da recorrência, inclusive na fronteira do horário.
- Snapshot histórico preservado após expiração e reversão de outras advertências.
- Criação direta com motivo e origem via report com todas as correspondências.
- Rejeição de reports não elegíveis e duplicados, também sob concorrência.
- Reversão de ativa/expirada, repetição segura e ausência de reativação.
- Reconciliação após inatividade, múltiplas instâncias e ausência de eventos duplicados.
- Atomicidade com rollback da mutação quando auditoria ou commit falhar.
- Projeções e filtros sem relatos, evidências ou dados privados dispensáveis.
- NUL, limites Unicode, enums, paginação e campos controlados pelo servidor.
- Nenhuma pontuação cria sanção ou altera estado de conta automaticamente.
- Build, unitários/E2E, verificações HTTP e integração PostgreSQL isolada.
- Diff e documentação coerentes, com PR direcionado a `develop`.

### Validações implementadas

Esta task acrescenta 216 testes unitários e 164 E2E, sendo 23 E2E do catálogo e
141 das operações de advertências. Os E2E usam JWT, guards e serviços reais,
substituindo a persistência por doubles. A cobertura inclui:

| Área                | Verificações                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Catálogo            | Seis códigos, provisionamento idempotente, categorias inativas, permissões e paginação    |
| Cálculo             | Gravidades, quatro multiplicadores, prazos UTC, precisão Decimal e pesos históricos       |
| Criação e consultas | Motivo, campos controlados pelo servidor, filtros, projeções, estado efetivo e soma ativa |
| Reports             | Resolução, alvo/categoria correspondentes, chave única e ausência de conteúdo privado     |
| Reversão            | Ativa/expirada, primeira decisão preservada, repetição, permissões atuais e retries       |
| Expiração           | Inicialização/agendamento, lotes, fronteiras de tempo, idempotência, limites e retomada   |
| Atomicidade         | Rollback em falha de escrita, auditoria ou commit, sem eventos de tentativas abortadas    |

A suíte completa passou com 621 testes unitários e 462 E2E. Build e verificações
do módulo e dos arquivos novos foram aprovados; o schema foi validado na preparação da
persistência. O comando npm de provisionamento também foi executado no banco
descartável; sua falha de conexão retorna código 1 e mensagem genérica, sem
expor credenciais.

Verificações separadas em PostgreSQL 16 isolado, com dados fictícios:

- Catálogo vazio recebe seis códigos e IDs cuid(); repetição cria zero registros.
- Personalizações, defaults, categorias inativas/adicionais e timestamps preservados.
- Provisionamento simultâneo sem duplicação.
- Migration aplicada em base vazia e em base com histórico válido, sem alterar pesos.
- Report único, inclusive após reversão; múltiplas advertências sem report permitidas.
- Duplicatas legadas provocam rollback, preservando registros e índice anterior.
- 25 pares de inserções concorrentes: exatamente uma advertência por report.
- 18 verificações HTTP com PostgreSQL e login reais para acesso, projeção mínima,
  paginação, revogação, Request ID e ausência de credenciais nos logs.
- Recorrência isolada por usuário/categoria, descartando expiradas e revertidas.
- Soma ativa e filtros por estado efetivo concordam no limite exato do vencimento,
  sem modificar registros nem auditoria durante a leitura.
- Duas moderadas somam `7.5`; ao expirar ou reverter a primeira, o total passa a
  `4.5`, preservando integralmente os valores da segunda e sua ocorrência original.
- Soma Decimal e serialização preservam valores além da precisão inteira de
  JavaScript, sem conversão para ponto flutuante.
- 24 verificações adicionais com HTTP, login e PostgreSQL reais para criação
  direta, consultas, filtros, privacidade, estados efetivos e auditoria.
- Dez pares de criações HTTP simultâneas: ocorrências `1` e `2`, pesos `1` e
  `1.5`, sem duplicar auditoria de tentativas abortadas.
- Falha de auditoria aborta a criação real; consultas não escrevem estado nem
  eventos e a advertência não modifica o cadastro do destinatário.
- 21 verificações HTTP/PostgreSQL adicionais para vínculo com reports fictícios,
  incluindo relato/evidências preservados, erros de elegibilidade e chave única
  reconhecida pelo adapter instalado.
- Dez pares simultâneos com o mesmo report: uma criação `201`, um conflito `409`
  e exatamente uma advertência/auditoria persistida por report.
- Report continua usado após expiração/reversão da advertência; falha de auditoria
  não consome seu vínculo e permite uma criação posterior válida.
- 17 verificações HTTP/PostgreSQL de reversão: ativa, expirada, repetição sem
  update, impacto no peso, privacidade, papéis atuais e rollback real da auditoria.
- Dez pares de reversões simultâneas: respostas com a mesma decisão preservada,
  um evento `changed: true` e outro `changed: false` por advertência.
- 19 verificações adicionais em PostgreSQL para startup real, limite/retomada de
  lotes, fronteira exata e rollback de um lote após falha na segunda auditoria.
- Dois workers processam 60 registros sem repetir evento. Dez disputas entre
  expiração e reversão terminam em `REVERSED`, preservando a decisão humana.

Nenhuma dependência ou variável de ambiente nova no runtime da API. Os
[resultados dos testes manuais](advertencias-testes-manuais.md) registram 94
verificações aprovadas em PostgreSQL local isolado, com API e JWT reais.
Homologação, provisionamento remoto e compatibilidade operacional com MySQL
permanecem sem validação.
O PostgreSQL temporário desta verificação foi encerrado ao final; não foi usada
a conexão externa configurada no projeto. Os scripts de apoio à preparação e
execução dos testes manuais não integram a entrega. Os testes automatizados e
seus auxiliares permanecem versionáveis no projeto.

Na preparação dos testes manuais, também foram conferidos bloqueios de conexão
externa, criação de contas/reports fictícios, login JWT real, criação HTTP,
estado efetivo, soma ativa e retomada de expiração em 100 + 1 registros.
Nenhuma credencial de homologação foi usada nesses testes.

## Referências

- [Resultados dos testes manuais](advertencias-testes-manuais.md)
- [Autenticação](auth.md)
- [Papéis e autorização](roles-authorization.md)
- [Administração de usuários](admin-users.md)
- [Auditoria administrativa](audit-log.md)
- [Privacidade](../privacy/lgpd-fase2.md)
- [Prisma e migrations](../database/prisma-postgresql-e-portabilidade-mysql.md)

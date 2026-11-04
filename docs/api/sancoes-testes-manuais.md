# Testes de aceitação pela API — sanções e recursos

## Resultado da execução

- Data: **04/11/2026**, das 13:03 às 13:04 em `America/Buenos_Aires`.
- Branch: `back/implementar-sancoes-restricoes-reversoes-recursos`.
- Versão: alterações locais sobre a base `90b0bfa`; ainda sem commit da entrega.
- **121 cenários aprovados, zero reprovados e 286 requisições HTTP reais.**
- Duração aproximada: 66 segundos, incluindo o ciclo real do scheduler.
- Ambiente: Node.js 22.21.1, NestJS 11, Prisma Client 7.10.1 e PostgreSQL 16.3 local.
- Build atualizado da API aprovado antes da execução.

Os cenários manuais foram executados de forma assistida por um roteiro
temporário de aceitação, com chamadas HTTP reais, reproduzíveis por curl ou
Postman. A aplicação utilizou seu AppModule compilado, login com senha/JWT reais
e persistência real, sem substituição de guards, serviços ou banco.

As respostas de erro previstas também representam cenários aprovados: foram
conferidos status, códigos, estado persistido e auditoria, conforme o caso.
As **cinco respostas 500 foram intencionais**, provocadas para comprovar rollback.
Não houve resposta inesperada ou falha da bateria.

Distribuição das 286 respostas, incluindo preparação/autenticação e reversões
de limpeza entre cenários:

- `200`: 97; `201`: 84; `204`: 1.
- `400`: 29; `401`: 8; `403`: 27; `404`: 9; `409`: 26.
- `500`: 5, todas esperadas nos cenários M109 a M113.

## Preparação, isolamento e evidências

Foi criado um banco novo, exclusivo e descartável em `127.0.0.1`, reconstruído
com as migrations versionadas por `prisma migrate deploy`. Nenhuma migration,
schema ou configuração versionada foi alterada.

Os dados eram fictícios: dois ADMINs, um DEV, dois mestres com SystemRole USER
e uma conta com ClubRole ADMIN, todos aprovados. As seis contas autenticaram por
`POST /auth/login`; a senha foi gerada somente para a execução e persistida com hash.

Prisma preparou sistemas, categorias, campanhas, sessões, one-shot, reports e
advertências de teste. Essa preparação foi necessária para cenários cujos
fluxos de emissão ainda não existem nesta base. Não comprova implementação da
API de reports, emissão de advertências ou participação.

Criação de sanções, consultas, reversões, envio de recursos, avaliações e logout
foram exercitados por HTTP. Leituras no banco conferiram histórico, pesos,
quantidade de registros e eventos de auditoria. A expiração foi observada no
scheduler real, sem chamar diretamente o método de reconciliação ou simular relógio.

Nos cenários M109 a M113, constraints temporárias na tabela AuditLog do banco
descartável recusaram eventos específicos. Cada constraint foi removida ao
terminar seu cenário. Foi conferido que a falha desfazia a transação inteira,
inclusive quando ocorria no último evento após a tentativa de reversão.

Logs técnicos foram capturados em memória e confrontados com os marcadores
privados e credenciais fictícias utilizados. Este documento conserva somente
resultados e exemplos com placeholders, sem senhas, JWTs, URLs de conexão,
identificadores reais ou conteúdo de relatos.

O roteiro e as fixtures temporárias ficaram fora do repositório. A API e o
PostgreSQL de teste foram encerrados ao final. Nenhuma conexão de homologação
ou produção foi utilizada.

## Exemplos para repetir os fluxos no CMD

Pré-condições: API compilada em execução com banco isolado, migrations aplicadas,
secrets locais configurados e contas/dados fictícios preparados. Consulte o
[setup local](../setup-local.md) e o [contrato da entrega](sancoes-restricoes-reversoes-recursos.md).
Os exemplos abaixo exigem substituir os placeholders pelos dados desse ambiente.

### Configurar a URL local e autenticar

```bat
set "BASE_URL=http://127.0.0.1:3301"
curl.exe -i -X POST "%BASE_URL%/auth/login" -H "Content-Type: application/json" --data "{\"email\":\"EMAIL_DA_CONTA_DE_TESTE\",\"password\":\"SENHA_LOCAL\"}"
```

Esperado: `200`, com accessToken. Armazene os tokens somente no terminal local:

```bat
set "TOKEN_ADMIN=JWT_LOCAL_DO_APLICADOR"
set "TOKEN_TITULAR=JWT_LOCAL_DO_DESTINATARIO"
set "TOKEN_REVISOR=JWT_LOCAL_DE_OUTRO_ADMIN_OU_DEV"
set "USER_ID=ID_DO_DESTINATARIO_FICTICIO"
set "ENDS_AT=INSTANTE_ISO_FUTURO_COM_Z_OU_OFFSET"
```

TOKEN_REVISOR precisa pertencer a outro operador aprovado, diferente de quem
aplicou a medida e de quem apresentou o recurso. Tokens não devem acompanhar
prints, documentação, PR ou ClickUp.

### Criar e consultar uma sanção

```bat
curl.exe -i -X POST "%BASE_URL%/admin/sanctions" -H "Authorization: Bearer %TOKEN_ADMIN%" -H "Content-Type: application/json" -H "x-request-id: manual-sancao-001" --data "{\"userId\":\"%USER_ID%\",\"type\":\"TABLE_CREATION_RESTRICTION\",\"reason\":\"Justificativa ficticia de teste\",\"endsAt\":\"%ENDS_AT%\"}"
```

Esperado: `201`, com tipo, vigência e responsável definidos corretamente.
Guarde o ID retornado em SANCTION_ID:

```bat
set "SANCTION_ID=ID_RETORNADO_NA_CRIACAO"
curl.exe -i "%BASE_URL%/admin/sanctions/%SANCTION_ID%" -H "Authorization: Bearer %TOKEN_ADMIN%"
curl.exe -i "%BASE_URL%/account/sanctions/%SANCTION_ID%" -H "Authorization: Bearer %TOKEN_TITULAR%"
```

Esperado: `200` nas duas consultas autorizadas. O detalhe próprio omite origens
e IDs dos operadores. Repetir o mesmo pedido de criação vigente retorna
`409 SANCTION_ALREADY_EXISTS`.

### Testar bloqueios e reversão

Para a restrição de criação, tente criar campanha/one-shot com o token do mestre
destinatário e dados válidos. Esperado: `403 TABLE_SANCTIONED`, sem inserção.
Uma restrição de criação isolada continua permitindo `GET /auth/me`.

Para ACCOUNT_SUSPENSION ou EXPULSION, `GET /auth/me` retorna
`403 ACCOUNT_SANCTIONED`; as consultas próprias, recursos e logout permanecem
autenticados e disponíveis. Não alterar User.status para simular essa sanção.

```bat
curl.exe -i "%BASE_URL%/auth/me" -H "Authorization: Bearer %TOKEN_TITULAR%"
curl.exe -i -X PATCH "%BASE_URL%/admin/sanctions/%SANCTION_ID%/reversal" -H "Authorization: Bearer %TOKEN_ADMIN%" -H "Content-Type: application/json" --data "{\"reason\":\"Reversao ficticia de teste\"}"
```

Esperado na reversão: `200`, status REVERSED e histórico preservado. Uma segunda
reversão válida não sobrescreve a primeira. Outra sanção vigente continua
produzindo seu próprio bloqueio.

### Recorrer de uma medida ainda não revertida

Use o ID de outra sanção elegível para este exemplo:

```bat
set "SANCTION_ID=ID_DE_SANCAO_AINDA_NAO_REVERTIDA"
curl.exe -i -X POST "%BASE_URL%/account/appeals" -H "Authorization: Bearer %TOKEN_TITULAR%" -H "Content-Type: application/json" --data "{\"sanctionId\":\"%SANCTION_ID%\",\"justification\":\"Pedido ficticio de revisao\"}"
```

Esperado: `201`, sequência 1 e status PENDING. Para contestar advertência,
substitua sanctionId por warningId; não envie ambos.

```bat
set "APPEAL_ID=ID_RETORNADO_NO_ENVIO"
curl.exe -i "%BASE_URL%/account/appeals/%APPEAL_ID%" -H "Authorization: Bearer %TOKEN_TITULAR%"
curl.exe -i -X PATCH "%BASE_URL%/admin/appeals/%APPEAL_ID%/review" -H "Authorization: Bearer %TOKEN_REVISOR%" -H "Content-Type: application/json" --data "{\"decision\":\"APPROVED\",\"response\":\"Resposta administrativa ficticia\"}"
```

Esperado: consulta `200`; avaliação `200` APPROVED e reversão da medida no mesmo
commit. Para conferir o limite de três, use outro caso: rejeite cada tentativa
com REJECTED e resposta obrigatória antes do próximo envio. As sequências são
1, 2 e 3; o quarto envio retorna `409 APPEAL_LIMIT_REACHED`.

### Conferir a auditoria

```bat
curl.exe -i "%BASE_URL%/admin/audit-logs?entityType=SANCTION&entityId=%SANCTION_ID%" -H "Authorization: Bearer %TOKEN_ADMIN%"
curl.exe -i "%BASE_URL%/admin/audit-logs?entityType=APPEAL&entityId=%APPEAL_ID%" -H "Authorization: Bearer %TOKEN_ADMIN%"
```

Esperado: eventos compatíveis com as operações aceitas, sem copiar motivos,
justificativas ou respostas para metadata. Os cenários completos e respectivos
resultados estão no registro abaixo.

## Registro dos cenários executados

Cada item identifica a condição testada, a expectativa e o resultado observado.
Os cenários de concorrência incluem três pares reais por condição, conforme
registrado em cada item. Os erros 400/401/403/404/409 são recusas esperadas.

### 1. Ambiente — 2 cenários

- **M001 — Banco isolado, migrations e logins reais.**
  Esperado: Schema versionado aplicado; seis logins autenticados.
  Observado: Banco novo com migrations versionadas; seis JWTs obtidos por POST /auth/login. **Aprovado.**

- **M002 — Health público.**
  Esperado: 200 com status ok.
  Observado: 200; status=ok. **Aprovado.**

### 2. Autenticação e autorização — 6 cenários

- **M003 — Bearer obrigatório nas rotas administrativas.**
  Esperado: 401 AUTH_TOKEN_REQUIRED.
  Observado: 401 AUTH_TOKEN_REQUIRED. **Aprovado.**

- **M004 — Header de identidade não autentica.**
  Esperado: 401 com x-user-id isolado.
  Observado: 401; nenhum contexto administrativo criado. **Aprovado.**

- **M005 — Token adulterado recusado.**
  Esperado: 401 AUTH_TOKEN_INVALID.
  Observado: 401 AUTH_TOKEN_INVALID. **Aprovado.**

- **M006 — MASTER sem papel de sistema não aplica sanções.**
  Esperado: 403 ADMIN_ROLE_REQUIRED.
  Observado: 403 ADMIN_ROLE_REQUIRED. **Aprovado.**

- **M007 — ClubRole ADMIN não aplica sanções.**
  Esperado: 403 ADMIN_ROLE_REQUIRED.
  Observado: 403 ADMIN_ROLE_REQUIRED. **Aprovado.**

- **M008 — Usuário comum não acessa recursos administrativos.**
  Esperado: 403 ADMIN_ROLE_REQUIRED.
  Observado: 403 ADMIN_ROLE_REQUIRED. **Aprovado.**

### 3. Criação e validação — 30 cenários

- **M009 — Registro do tipo TABLE_CREATION_RESTRICTION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; término definido. **Aprovado.**

- **M010 — Registro do tipo TABLE_PARTICIPATION_RESTRICTION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; término definido. **Aprovado.**

- **M011 — Registro do tipo EVENT_PARTICIPATION_RESTRICTION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; término definido. **Aprovado.**

- **M012 — Registro do tipo CLUB_ACTIVITY_RESTRICTION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; término definido. **Aprovado.**

- **M013 — Registro do tipo MASTER_ACTIVITY_RESTRICTION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; término definido. **Aprovado.**

- **M014 — Registro do tipo ACCOUNT_SUSPENSION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; término definido. **Aprovado.**

- **M015 — Registro do tipo EXPULSION.**
  Esperado: 201; tipo e período coerentes.
  Observado: 201; ACTIVE; sem término. **Aprovado.**

- **M016 — Motivo ausente.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M017 — Motivo vazio.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M018 — Motivo nulo.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M019 — Motivo acima do limite.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M020 — Metadados controlados pelo servidor.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M021 — Estado injetado.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M022 — Tipo desconhecido.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M023 — Temporaria sem término.**
  Esperado: 400 SANCTION_PERIOD_INVALID.
  Observado: 400 SANCTION_PERIOD_INVALID. **Aprovado.**

- **M024 — Início retroativo.**
  Esperado: 400 SANCTION_PERIOD_INVALID.
  Observado: 400 SANCTION_PERIOD_INVALID. **Aprovado.**

- **M025 — Término anterior ao início.**
  Esperado: 400 SANCTION_PERIOD_INVALID.
  Observado: 400 SANCTION_PERIOD_INVALID. **Aprovado.**

- **M026 — Data sem timezone.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M027 — Expulsao com término.**
  Esperado: 400 SANCTION_PERIOD_INVALID.
  Observado: 400 SANCTION_PERIOD_INVALID. **Aprovado.**

- **M028 — Escopo geral com campanha.**
  Esperado: 400 SANCTION_SCOPE_INVALID.
  Observado: 400 SANCTION_SCOPE_INVALID. **Aprovado.**

- **M029 — Tipo sem suporte a campanha.**
  Esperado: 400 SANCTION_SCOPE_INVALID.
  Observado: 400 SANCTION_SCOPE_INVALID. **Aprovado.**

- **M030 — Escopo OTHER sem descricao.**
  Esperado: 400 SANCTION_SCOPE_INVALID.
  Observado: 400 SANCTION_SCOPE_INVALID. **Aprovado.**

- **M031 — Destinatario inexistente.**
  Esperado: 404 USER_NOT_FOUND.
  Observado: 404 USER_NOT_FOUND. **Aprovado.**

- **M032 — Campanha inexistente.**
  Esperado: 404 CAMPAIGN_NOT_FOUND.
  Observado: 404 CAMPAIGN_NOT_FOUND. **Aprovado.**

- **M033 — Sessão inexistente.**
  Esperado: 404 SESSION_NOT_FOUND.
  Observado: 404 SESSION_NOT_FOUND. **Aprovado.**

- **M034 — Escopo de campanha.**
  Esperado: 201 com escopo preservado.
  Observado: 201; CAMPAIGN. **Aprovado.**

- **M035 — Escopo de sessão.**
  Esperado: 201 com escopo preservado.
  Observado: 201; SESSION. **Aprovado.**

- **M036 — Escopo descritivo de atividade.**
  Esperado: 201 com escopo preservado.
  Observado: 201; OTHER. **Aprovado.**

- **M037 — Escopo descritivo de evento.**
  Esperado: 201 com escopo preservado.
  Observado: 201; OTHER. **Aprovado.**

- **M038 — Decisão equivalente duplicada.**
  Esperado: 201 seguido de 409; um registro e uma auditoria de criação.
  Observado: 201/409; um registro, um SANCTION_CREATED e Request ID correlacionado. **Aprovado.**

### 4. Origens report e advertência — 14 cenários

- **M039 — Report resolvido de usuário.**
  Esperado: 201 com origem preservada.
  Observado: 201; vinculos corretos e antecedentes preservados. **Aprovado.**

- **M040 — Advertência existente.**
  Esperado: 201 com origem preservada.
  Observado: 201; vinculos corretos e antecedentes preservados. **Aprovado.**

- **M041 — Origens correspondentes.**
  Esperado: 201 com origem preservada.
  Observado: 201; vinculos corretos e antecedentes preservados. **Aprovado.**

- **M042 — Advertência expirada como antecedente.**
  Esperado: 201 sem recalculo histórico.
  Observado: 201; advertência original integralmente preservada. **Aprovado.**

- **M043 — Report OPEN recusado.**
  Esperado: 409 SANCTION_REPORT_NOT_RESOLVED.
  Observado: 409 SANCTION_REPORT_NOT_RESOLVED. **Aprovado.**

- **M044 — Report UNDER_REVIEW recusado.**
  Esperado: 409 SANCTION_REPORT_NOT_RESOLVED.
  Observado: 409 SANCTION_REPORT_NOT_RESOLVED. **Aprovado.**

- **M045 — Report DISMISSED recusado.**
  Esperado: 409 SANCTION_REPORT_NOT_RESOLVED.
  Observado: 409 SANCTION_REPORT_NOT_RESOLVED. **Aprovado.**

- **M046 — Report de sessão recusado.**
  Esperado: 409 SANCTION_REPORT_TARGET_INVALID.
  Observado: 409 SANCTION_REPORT_TARGET_INVALID. **Aprovado.**

- **M047 — Report de outro usuário recusado.**
  Esperado: 409 SANCTION_REPORT_USER_MISMATCH.
  Observado: 409 SANCTION_REPORT_USER_MISMATCH. **Aprovado.**

- **M048 — Advertência de outro usuário recusada.**
  Esperado: 409 SANCTION_WARNING_USER_MISMATCH.
  Observado: 409 SANCTION_WARNING_USER_MISMATCH. **Aprovado.**

- **M049 — Advertência revertida recusada como origem.**
  Esperado: 409 SANCTION_WARNING_REVERSED.
  Observado: 409 SANCTION_WARNING_REVERSED. **Aprovado.**

- **M050 — Origens de ocorrencias distintas recusadas.**
  Esperado: 409 SANCTION_ORIGIN_MISMATCH.
  Observado: 409 SANCTION_ORIGIN_MISMATCH. **Aprovado.**

- **M051 — Origem inexistente reportId.**
  Esperado: 404 REPORT_NOT_FOUND.
  Observado: 404 REPORT_NOT_FOUND. **Aprovado.**

- **M052 — Origem inexistente warningId.**
  Esperado: 404 WARNING_NOT_FOUND.
  Observado: 404 WARNING_NOT_FOUND. **Aprovado.**

### 5. Consultas e privacidade — 8 cenários

- **M053 — Lista administrativa paginada e filtrada.**
  Esperado: 200; filtro exato e textos livres omitidos.
  Observado: 200; uma linha na página, campos privados omitidos. **Aprovado.**

- **M054 — Detalhe administrativo autorizado.**
  Esperado: 200; justificativa e vinculos sem relato de report.
  Observado: 200; decisão própria do caso, sem relato/evidencia. **Aprovado.**

- **M055 — Detalhe do titular minimizado.**
  Esperado: 200 sem operadores ou origens.
  Observado: 200; motivo pertinente disponivel, origens e operadores omitidos. **Aprovado.**

- **M056 — Detalhe de terceiro indisponivel na rota própria.**
  Esperado: 404 mesmo para administrador.
  Observado: 404 SANCTION_NOT_FOUND. **Aprovado.**

- **M057 — Titular não troca identidade pelo filtro.**
  Esperado: 400 em userId na consulta própria.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M058 — Filtro administrativo invalido ?limit=51.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M059 — Filtro administrativo invalido ?page=0.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M060 — Filtro administrativo invalido ?status=UNKNOWN.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

### 6. Bloqueios operacionais — 11 cenários

- **M061 — Restrição de criação impede campanha e one-shot.**
  Esperado: 403 TABLE_SANCTIONED; nenhum novo registro.
  Observado: 403/403; contagens inalteradas. **Aprovado.**

- **M062 — Restrição parcial permite acesso comum e publicação existente.**
  Esperado: 200 no me e 201 na publicação.
  Observado: 200/201; restrição de criação não virou bloqueio global. **Aprovado.**

- **M063 — Outro mestre permanece autorizado.**
  Esperado: 201 na criação de campanha.
  Observado: 201; isolamento por usuário. **Aprovado.**

- **M064 — Mestre restrito não publica e ADMIN não contorna.**
  Esperado: 403 para mestre e administrador.
  Observado: 403/403 TABLE_SANCTIONED. **Aprovado.**

- **M065 — Campanha restrita não recebe nova sessão.**
  Esperado: 403 sem inserção.
  Observado: 403; total de sessões preservado. **Aprovado.**

- **M066 — Sessão da campanha restrita não muda titulo nem conclui.**
  Esperado: 403; estado preservado.
  Observado: 403/403; SCHEDULED preservado. **Aprovado.**

- **M067 — Outra campanha continua operavel.**
  Esperado: 201 para nova sessão e 200 na edicao.
  Observado: 201/200; isolamento por campanha. **Aprovado.**

- **M068 — Restrição de sessão não atinge sessão irmã.**
  Esperado: 403 na sessão alvo e 200 na outra.
  Observado: 403/200; isolamento por sessão. **Aprovado.**

- **M069 — Cancelamento administrativo preservado.**
  Esperado: 200 CANCELLED com motivo.
  Observado: 200 CANCELLED. **Aprovado.**

- **M070 — One-shot respeita a restrição de sua sessão.**
  Esperado: 403 na publicação e conclusão; cancelamento continua autorizado.
  Observado: 403/403/200; escopo da sessão aplicado. **Aprovado.**

- **M071 — Restrição geral de mestre bloqueia criação e publicação.**
  Esperado: 403 nas duas operacoes.
  Observado: 403/403; restrição geral efetiva. **Aprovado.**

### 7. Vigência e acesso limitado — 7 cenários

- **M072 — Sanção futura não antecipa bloqueio.**
  Esperado: 200 antes do início.
  Observado: 200 antes e 403 depois do início com o mesmo JWT. **Aprovado.**

- **M073 — Prazo vencido libera acesso antes da reconciliação.**
  Esperado: 403 antes; 200 depois; registro ainda ACTIVE.
  Observado: 403/200; estado persistido ACTIVE, comprovando independencia do job. **Aprovado.**

- **M074 — Sanção global afeta JWT anterior e mantem consultas próprias.**
  Esperado: 403 no me; 200 nas consultas de decisão.
  Observado: 403 no acesso comum; 200 nas decisões próprias. **Aprovado.**

- **M075 — Login sancionado exige senha real e retorna acesso limitado.**
  Esperado: 200 no login; 403 no uso comum.
  Observado: Login real 200; acesso comum 403; senha incorreta 401. **Aprovado.**

- **M076 — Reverter uma medida não remove outra vigente.**
  Esperado: Acesso permanece 403 após primeira reversão.
  Observado: 403; expulsao independente manteve o bloqueio. **Aprovado.**

- **M077 — Logout funciona sob expulsao e revoga o JWT.**
  Esperado: 204 no logout e 401 no token antigo.
  Observado: 204/401; novo login limitado e token antigo não recuperado pela reversão. **Aprovado.**

- **M078 — Acesso limitado não contorna estado da conta.**
  Esperado: 401 quando User esta SUSPENDED.
  Observado: 401/401; regra de elegibilidade preservada. **Aprovado.**

### 8. Reversão e histórico — 3 cenários

- **M079 — Reversão preserva decisão original e repeti-la não sobrescreve.**
  Esperado: 200/200; primeira reversão e updatedAt preservados.
  Observado: 200/200; antecedente preservado; auditoria true/false sem reescrita. **Aprovado.**

- **M080 — Motivo obrigatório mesmo para reversão repetida.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M081 — Usuário sem administracao não reverte.**
  Esperado: 403 ADMIN_ROLE_REQUIRED.
  Observado: 403 ADMIN_ROLE_REQUIRED. **Aprovado.**

### 9. Recursos e revisão — 23 cenários

- **M082 — Recurso sem alvo.**
  Esperado: 400 APPEAL_TARGET_INVALID.
  Observado: 400 APPEAL_TARGET_INVALID. **Aprovado.**

- **M083 — Recurso com dois alvos.**
  Esperado: 400 APPEAL_TARGET_INVALID.
  Observado: 400 APPEAL_TARGET_INVALID. **Aprovado.**

- **M084 — Recurso sem justificativa.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M085 — Identidade e sequência injetadas.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M086 — Apenas titular pode recorrer.**
  Esperado: 404 APPEAL_CASE_NOT_FOUND para terceiro.
  Observado: 404 APPEAL_CASE_NOT_FOUND. **Aprovado.**

- **M087 — Apenas um recurso pendente por caso.**
  Esperado: 409 APPEAL_PENDING.
  Observado: 409 APPEAL_PENDING. **Aprovado.**

- **M088 — Aplicador não avalia o próprio caso.**
  Esperado: 403 APPEAL_INDEPENDENT_REVIEWER_REQUIRED.
  Observado: 403; segundo operador obrigatório. **Aprovado.**

- **M089 — Usuário comum não avalia recursos.**
  Esperado: 403 ADMIN_ROLE_REQUIRED.
  Observado: 403 ADMIN_ROLE_REQUIRED. **Aprovado.**

- **M090 — Avaliação sem resposta.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M091 — Resposta vazia.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M092 — Decisão invalida.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M093 — Avaliador injetado.**
  Esperado: 400 BAD_REQUEST.
  Observado: 400 BAD_REQUEST. **Aprovado.**

- **M094 — Rejeição registra resposta sem reverter advertência.**
  Esperado: 200 REJECTED; advertência ACTIVE.
  Observado: 200 REJECTED; advertência permaneceu ACTIVE. **Aprovado.**

- **M095 — Limite de tres recursos para WARNING.**
  Esperado: Sequências 1,2,3; quarto envio 409.
  Observado: 1,2,3 preservados; 409 APPEAL_LIMIT_REACHED. **Aprovado.**

- **M096 — Limite de tres recursos para SANCTION.**
  Esperado: Sequências 1,2,3; quarto envio 409.
  Observado: 1,2,3 preservados; 409 APPEAL_LIMIT_REACHED. **Aprovado.**

- **M097 — Advertência e sanções ligadas possuem contadores independentes.**
  Esperado: Sequência 1 em cada caso.
  Observado: Tres casos ligados, cada um com sequência 1. **Aprovado.**

- **M098 — Titular administrador tambem não avalia o próprio recurso.**
  Esperado: 403 para titular e aplicador; 200 para terceiro independente.
  Observado: 403/403/200; independencia aplicada tambem a ADMIN. **Aprovado.**

- **M099 — Aprovar advertência preserva pesos e sanção associada.**
  Esperado: 200 APPROVED; warning REVERSED e sanção ACTIVE.
  Observado: APPROVED/REVERSED; pesos historicos intactos; sanção independente ACTIVE. **Aprovado.**

- **M100 — Aprovar sanção reverte somente a medida contestada.**
  Esperado: 200 APPROVED; origem e outra sanção preservadas.
  Observado: Caso aprovado e revertido; outra sanção e advertência preservadas. **Aprovado.**

- **M101 — Avaliação repetida preserva primeiro avaliador e resposta.**
  Esperado: 200 sem UPDATE; decisão oposta 409.
  Observado: 200 idêntico ao primeiro; 409 APPEAL_ALREADY_REVIEWED. **Aprovado.**

- **M102 — Medida revertida fecha novos recursos.**
  Esperado: 409 APPEAL_CASE_CLOSED.
  Observado: 409 APPEAL_CASE_CLOSED. **Aprovado.**

- **M103 — Medida expirada continua contestavel.**
  Esperado: 201 PENDING para advertência EXPIRED.
  Observado: 201 PENDING. **Aprovado.**

- **M104 — Reversão manual durante recurso não e sobrescrita.**
  Esperado: 200 APPROVED; primeira reversão preservada.
  Observado: APPROVED; operador, motivo, data e updatedAt da reversão manual preservados. **Aprovado.**

### 10. Privacidade dos recursos — 4 cenários

- **M105 — Recurso próprio mostra resposta sem expor avaliador.**
  Esperado: 200; campos privados limitados.
  Observado: 200 para titular; avaliador omitido; administrador na rota própria recebeu 404. **Aprovado.**

- **M106 — Lista de recursos omite justificativa e resposta.**
  Esperado: 200 com sumarios minimos e paginacao.
  Observado: 200 com uma linha; textos omitidos; troca de titular recusada com 400. **Aprovado.**

- **M107 — Advertência própria omite report e operadores.**
  Esperado: 200 com pesos historicos, sem origens ou responsaveis.
  Observado: 200; Decimal 4.5 preservado; terceiro recebeu 404. **Aprovado.**

- **M108 — Consulta administrativa de recursos exige permissao.**
  Esperado: 200 para DEV; 403 para papel de clube.
  Observado: 200/403; SystemRole distinto de ClubRole. **Aprovado.**

### 11. Atomicidade e falhas controladas — 5 cenários

- **M109 — Falha real na auditoria de criação desfaz sanção.**
  Esperado: 500; zero sanções e eventos para a decisão.
  Observado: 500; nenhuma inserção parcial. **Aprovado.**

- **M110 — Falha real na auditoria de reversão preserva sanção.**
  Esperado: 500; estado e metadados originais intactos.
  Observado: 500; registro original e auditoria de criação preservados. **Aprovado.**

- **M111 — Falha real no envio não consome tentativa.**
  Esperado: 500; nenhum Appeal persistido.
  Observado: 500 sem registro; novo envio recebeu sequência 1. **Aprovado.**

- **M112 — Falha no último evento desfaz avaliação e reversão de WARNING.**
  Esperado: 500; recurso PENDING e medida original intacta.
  Observado: 500; rollback da medida, da avaliação e do evento de reversão. **Aprovado.**

- **M113 — Falha no último evento desfaz avaliação e reversão de SANCTION.**
  Esperado: 500; recurso PENDING e medida original intacta.
  Observado: 500; rollback da medida, da avaliação e do evento de reversão. **Aprovado.**

### 12. Concorrência — 4 cenários

- **M114 — Criação duplicada simultânea.**
  Esperado: Tres pares com um 201 e um 409; um registro por par.
  Observado: 3 pares; 201/409 em cada; nenhuma duplicação. **Aprovado.**

- **M115 — Terceira tentativa concorrente não gera quarta.**
  Esperado: Tres pares; apenas uma sequência 3 por caso.
  Observado: 3 pares; sequências somente 1,2,3; quarto envio 409. **Aprovado.**

- **M116 — Aprovações simultâneas preservam primeira decisão.**
  Esperado: Tres pares 200/200; uma reversão efetiva por caso.
  Observado: 3 pares; primeira avaliação preservada e apenas uma reversão. **Aprovado.**

- **M117 — Decisões opostas simultâneas não se sobrescrevem.**
  Esperado: Tres pares com uma decisão 200 e outra 409.
  Observado: 3 pares; 200/409 e uma única decisão por recurso. **Aprovado.**

### 13. Reconciliação e integridade final — 4 cenários

- **M118 — Scheduler real persiste EXPIRED e auditoria de sistema.**
  Esperado: EXPIRED no ciclo real; ator nulo e evento único.
  Observado: EXPIRED no scheduler real; um SANCTION_EXPIRED com ator e Request ID nulos. **Aprovado.**

- **M119 — Sanções não alteram status, papéis nem aplicam outras medidas.**
  Esperado: APPROVED e MASTER preservados; sem medidas automaticas adicionais.
  Observado: APPROVED e ClubRole MASTER preservados; total de sanções igual ao de criacoes HTTP explicitas. **Aprovado.**

- **M120 — Logs técnicos e metadata livres de dados privados.**
  Esperado: Sem marcadores privados, senhas, JWTs ou URL do banco.
  Observado: Nenhum marcador privado ou segredo encontrado nos logs capturados ou metadata. **Aprovado.**

- **M121 — Health e rotas publicas preservados ao final.**
  Esperado: 200 sem Bearer.
  Observado: 200/200/200 sem autenticar. **Aprovado.**

## Limitações e conclusão

A bateria foi aprovada para os fluxos presentes nesta base. Ela não declara
homologação no Render/Supabase, compatibilidade operacional com MySQL, teste de
interface ou ensaio de carga.

Restrições de participação em mesas, eventos e outras atividades foram testadas
quanto ao registro e validação de escopos. O bloqueio automático desses fluxos
depende dos módulos ausentes nesta base. Não marcar essa integração como pronta.
Emissão de advertências e criação/resolução de reports também não são cobertas
como fluxos HTTP desta entrega; seus registros foram fixtures de preparação.

O resultado complementa os testes unitários/E2E e as validações por etapa,
preservados no [contrato e revisão da entrega](sancoes-restricoes-reversoes-recursos.md).
Não houve alteração de código de produção para executar esta bateria.

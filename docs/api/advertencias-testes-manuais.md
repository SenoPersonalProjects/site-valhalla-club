# Resultados dos testes manuais de advertências

Registro dos testes executados com dados fictícios em PostgreSQL local.
O contrato está em
[advertências, pesos, recorrência e expiração](advertencias-pesos-recorrencia-expiracao.md).
A validação em homologação permanece separada. Este documento preserva os
resultados; os scripts de preparação e execução usados na bateria não integram
a entrega.

## Resultado da execução local — 03/11/2026

**94 verificações aprovadas; nenhuma falha na execução final.** Execução assistida
por script de apoio no terminal, com requisições HTTP, prova adicional via
`curl.exe` e consultas SQL para conferir persistência. API compilada executada pelo
entrypoint real, JWT obtido por login e PostgreSQL 16 local descartável. Não foram
usados overrides de autenticação, serviços ou banco.

### Ambiente — 5 aprovadas

- Conexões externas bloqueadas e migrations aplicadas por
  `prisma migrate deploy`.
- Seis categorias provisionadas, sem duplicação na repetição do comando.
- Dados fictícios criados e API iniciada.

### Autenticação e acesso — 12 aprovadas

- Quatro logins reais e acesso autorizado para ADMIN/DEV.
- USER e ClubRole ADMIN recebem `403`.
- Ausência de token, `x-user-id` e JWT adulterado recebem `401`.
- Catálogo com campos mínimos e paginação conferidos.

### Criação e pesos — 6 aprovadas

- Leve: peso `1`, prazo de 90 dias.
- Moderada: peso `3`, prazo de 180 dias.
- Grave: peso `6`, prazo de 365 dias.
- Resumo com peso total `10` e criação adicional via curl/DEV confirmados.
- Nenhuma sanção ou alteração de conta aplicada.

### Validações — 19 aprovadas

- Motivo, gravidade, campos extras e report inválidos recusados.
- Registros inexistentes recebem `404`; categoria inativa recebe `409`.
- Tentativas rejeitadas não criam advertência nem evento de auditoria.

### Recorrência — 8 aprovadas

- Pesos sucessivos: `3`, `4.5`, `6`, `7.5` e `7.5`; soma `28.5`.
- Recorrência isolada por usuário e categoria.
- Gravidade diferente conserva a recorrência da mesma categoria.

### Reversão — 9 aprovadas

- Total reduzido de `7.5` para `4.5`, preservando a segunda advertência.
- Repetição por DEV conserva a primeira decisão.
- Permissões, motivo obrigatório e auditoria conferidos.

### Reports — 10 aprovadas

- Origem `RESOLVED` com alvo `USER` aceita.
- Duplicação bloqueada antes e depois da reversão.
- Demais estados, alvo de sessão e divergências de usuário/categoria recusados.

### Consultas e privacidade — 8 aprovadas

- Listagem resumida e detalhe sem conteúdo privado do report.
- Filtros, paginação, Request ID e endpoint de auditoria conferidos.

### Expiração — 6 aprovadas

- Advertência vencida já não pesa enquanto ainda está `ACTIVE` no banco.
- Filtro retorna `EXPIRED`; reinício persiste o estado e gera evento sem ator.
- Novo reinício não duplica o evento.
- Reversão da advertência expirada preserva o histórico.

### Lotes e retomada — 2 aprovadas

- Primeiro reinício processa 100 das 101 vencidas; resumo já tem peso zero.
- Segundo reinício processa a restante.
- Cada registro possui exatamente um evento de expiração.

### Concorrência — 3 aprovadas

- Criação direta: respostas `201/201`, ocorrências 1 e 2, soma `2.5`.
- Mesmo report: respostas `201/409` e apenas uma criação.
- Reversões: respostas `200/200`, decisão única preservada e auditorias
  com `changed: true` e `changed: false`.

### Regressão e logs — 6 aprovadas

- Health, campanhas públicas, one-shots públicas e `auth/me` respondem `200`.
- Logout responde `204`; uso posterior do token recebe `401`.
- Logs e metadados de auditoria não contêm os marcadores privados enviados.

### Ambiente e limites da execução

Os reports e os timestamps passados foram preparados como dados fictícios no banco
isolado. A execução não implementa nem homologa o fluxo HTTP de reports.
Os logs reais foram capturados para verificar ausência de senha, JWT, segredo,
conexão, cookie, motivos, relatos e evidências usados nesta bateria. Esses valores
não fazem parte deste registro.

Não foi necessário modificar código da aplicação para concluir a execução. O
script temporário de apoio não faz parte da entrega. API e PostgreSQL temporários
foram encerrados após os testes; nenhum ambiente compartilhado foi alterado.

Fora desta execução: inspeção visual da landing, espera de uma hora pelo timer,
injeção de falhas de commit/auditoria e validação no Render/Supabase. O
agendamento e os caminhos de falha possuem cobertura automatizada descrita no
[contrato](advertencias-pesos-recorrencia-expiracao.md); os reinícios e o
processamento real em lotes foram exercitados acima.

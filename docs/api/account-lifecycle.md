# Próprio perfil e ciclo de vida da conta

Task `86e39wj1q`. Implementação autenticada sobre o schema existente, sem
migration. Não inclui administração de terceiros, troca de email/senha,
recuperação da exclusão ou anonimização automática. Ver [auth](auth.md),
[autorização](roles-authorization.md) e [privacidade](../privacy/lgpd-fase2.md).

## Identidade e rotas

Todas as operações usam exclusivamente `request.user.id` criado pelo AuthGuard
e entregue por `CurrentUserId`. Não há parâmetro de titular, nem privilégio para
ADMIN/DEV alterar outra conta por essas rotas. Query e headers não mudam o titular;
campos extras no body são rejeitados. Somente contas APPROVED têm acesso HTTP.

| Método | Rota | Resposta |
| --- | --- | --- |
| GET | `/auth/me` | 200; contrato existente da própria sessão/perfil, preservado |
| PATCH | `/account/profile` | 200; `displayName`, `whatsappNumber`, `birthDate` do próprio perfil |
| POST | `/account/deletion-request` | 200; `id`, `status`, `deletionRequestedAt`, `deletionExpiresAt` |

`GET /auth/me` continua retornando `id`, `email`, `status`, `systemRole`,
`clubRoles: [{role}]` e `profile: {displayName, whatsappNumber, birthDate}`.
Não foi criada outra consulta equivalente. Nenhuma dessas respostas busca ou
retorna passwordHash, authVersion, revisor, notas administrativas ou terceiros.

## Campos editáveis

Exemplo sintético de PATCH:

```json
{
  "displayName": "Nome comunitário",
  "whatsappNumber": "+447700900001"
}
```

Pelo menos um campo é necessário. Campos omitidos são preservados; null é
inválido. Nome é trim, não vazio e de até 100 caracteres, sem exigir nome civil.
WhatsApp reutiliza a normalização do cadastro: DDI explícito, E.164, unicidade
no banco, sem presumir Brasil nem afirmar verificação de posse do número.
Conflitos concorrentes P2002 retornam o mesmo erro genérico, sem identificar
qual conta utiliza o contato. Atualizar o próprio número para o mesmo valor é
permitido. A edição também atualiza o timestamp de modificação da conta.

`birthDate` permanece somente leitura: não existe regra aprovada para sua edição.
Email, credenciais, status, roles, versões, auditoria e todos os timestamps de
ciclo de vida também não são editáveis por esse PATCH. Não há nested write
aceito do cliente, nem spread irrestrito do DTO para Prisma.

## Solicitação de exclusão

POST `/account/deletion-request` recebe body `{}`. Não recebe ID ou motivo livre.
Uma única transação:

1. muda APPROVED para DELETION_PENDING por escrita condicional;
2. grava `deletionRequestedAt` e `deletionExpiresAt = solicitação + 90 × 24 horas`;
3. incrementa authVersion atomicamente, invalidando todos os JWTs anteriores;
4. retorna somente a confirmação mínima e as datas ISO UTC.

Não remove User, Profile, contatos, credencial, papéis ou relações históricas.
Não muda ANONYMIZED, SUSPENDED, REJECTED ou PENDING para DELETION_PENDING.
A janela é uma regra de produto, não uma obrigação universal da LGPD.

O próximo request com token antigo retorna `401 AUTH_ACCOUNT_UNAVAILABLE`, pois
o AuthGuard verifica status antes da versão. Login com senha correta retorna
`403 ACCOUNT_DELETION_PENDING`. Não é permitido reutilizar token revogado para
recuperação. Requests que já estavam em execução não são cancelados.

Repetição HTTP com token antigo também recebe 401, sem estender a janela. Duas
solicitações já autenticadas concorrentes, ou repetição interna ao serviço,
retornam a mesma janela original: apenas uma transição/incremento é persistida.
Registro DELETION_PENDING sem timestamps coerentes retorna conflito, sem criar
uma janela substituta. Vencimento não reativa nem anonimiza automaticamente.

## Concorrência e atomicidade

A edição grava condicionalmente a modificação de User apenas se APPROVED e
mantém a mesma transação até atualizar Profile. A exclusão faz seu compare-and-set
na mesma linha de User antes de consultar a confirmação. Assim as duas operações
se coordenam pela escrita real da conta, sem SQL raw ou Serializable por padrão.
Leituras de status anteriores ao guard não autorizam essas escritas.

Se a edição obtém a escrita primeiro, conclui antes da exclusão. Se a exclusão
obtém primeiro, a edição falha sem alterar Profile. Duas edições parciais não
substituem campos omitidos. Um conflito no Profile reverte também a modificação
de User. Não há contagem/versão reaproveitada nem atualização manual de versão
baseada em leitura antiga. Não foram alterados timestamps de Campaign.

Unitários usam doubles com transações, ordenação de escrita e rollback; E2E usa
AuthGuard/JWT reais com repositórios simulados. Concorrência contra PostgreSQL e
futuro MySQL reais ainda requer validação operacional autorizada.

## Recuperação e anonimização pendentes

Não existe no repositório um mecanismo de reautenticação/verificação de
titularidade para DELETION_PENDING: o login bloqueia esse estado e seus tokens
anteriores são inválidos. Não foi criado endpoint de recuperação, bypass de
guard ou identidade por email/header. O prazo de 90 dias é registrado, mas a
recuperação segura permanece pendente. Solicitações de orientação usam o canal
oficial publicado no site; simples contato não equivale a verificação de posse.

Também não foi criado job de anonimização: relações Restrict, textos livres,
disciplina/feedback/audit e cópias externas precisam de política de conservação
e descarte aprovada. Remover apenas email/nome seria insuficiente. Os campos
de ciclo de vida existentes preparam a identificação das solicitações vencidas;
dados não são automaticamente removidos aos 90 dias nesta entrega. Esse débito
deve ser resolvido antes de prometer o fluxo completo de exclusão/anonimização.

## Erros e logs

| HTTP | Código | Situação |
| --- | --- | --- |
| 400 | BAD_REQUEST | DTO inválido, null, campo imutável ou privilegiado |
| 400 | PROFILE_UPDATE_REQUIRED | PATCH sem campos editáveis |
| 400 | INVALID_DISPLAY_NAME / INVALID_WHATSAPP | Validações compartilhadas com cadastro |
| 409 | PROFILE_CONFLICT | Contato indisponível, sem dados de terceiros |
| 404 | PROFILE_NOT_FOUND | Perfil inexistente na edição |
| 401 | AUTH_ACCOUNT_UNAVAILABLE | Conta deixou de estar APPROVED na escrita ou guard |
| 409 | ACCOUNT_DELETION_NOT_ALLOWED | Estado incompatível/inconsistente na chamada ao serviço |
| 404 | USER_NOT_FOUND | Conta inexistente na solicitação ao serviço |

Erros do AuthGuard permanecem inalterados. Nenhum fluxo loga payload de perfil,
contato, nascimento, credencial ou tokens; apenas Request ID, template da rota,
status e duração. O filtro existente sanitiza 500 e rejeições de validação.

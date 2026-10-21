# Cadastro, aprovação e autenticação

Task `86e39whqc`. Implementação da API; não declara deploy ou migration aplicada.
Não inclui administração completa de usuários, guards genéricos de roles,
refresh token, recuperação de senha, OAuth, MFA, cookies ou frontend.

## Rotas e contratos

| Método | Rota | Acesso / resposta |
| --- | --- | --- |
| POST | `/auth/register` | Público; 201 com `id`, `status: PENDING` |
| POST | `/auth/login` | Público; 200 com `accessToken`, `tokenType: Bearer` |
| GET | `/auth/me` | Bearer; dados mínimos da própria sessão |
| POST | `/auth/logout` | Bearer; 204, sem token substituto |
| PATCH | `/admin/users/:id/registration-review` | ADMIN/DEV de sistema APPROVED; revisão inicial |

Também são deliberadamente públicos `GET /`, `GET /health`,
`GET /campaigns/public` e `GET /one-shots/public`. Todas as demais rotas atuais
são privadas por guard global; não dependem da presença de `@CurrentUserId`.

Registro exige `email`, `password`, `displayName`, `whatsappNumber`, `birthDate`.
Email é trim/lowercase. Nome é trim e não pode ficar vazio. WhatsApp exige DDI
explícito (`+` ou prefixo `00`), remove espaços/parênteses/pontos/hífens e valida
o formato E.164 (8 a 15 dígitos, primeiro não zero); não presume Brasil nem valida
posse do número. Email e WhatsApp têm unicidade no banco; inclusive uma corrida
P2002 retorna o mesmo `409 REGISTRATION_CONFLICT`, sem detalhes internos.

Nascimento é uma data civil válida `YYYY-MM-DD`, persistida à meia-noite UTC.
Idade é calculada por ano/mês/dia usando hoje em `America/Maceio`, sem diferenças
ingênuas em milissegundos. Exatamente 18 anos é aceito. Para aniversário em
29/02, a comparação civil considera a idade completa em 01/03 em ano não bissexto.
Menores não entram nesta versão. Não são coletados CPF/RG/endereço/biometria.

User + Profile são criados atomicamente por nested write Prisma. Conta nasce
PENDING, SystemRole.USER e **sem papéis de clube automáticos**, pois não existe
regra vigente de concessão automática de PLAYER. Papéis permanecem cumulativos,
independentes do SystemRole. Nenhum campo de role/status é aceito no cadastro.

Senha usa `bcryptjs` com custo **12** centralizado em `PASSWORD_COST`. Mínimo de
12 caracteres; máximo de 72 bytes UTF-8 para evitar truncamento do bcrypt.
Não há exigência arbitrária de composição nem normalização da senha.
Somente o hash é persistido; ele nunca é retornado.

## Login, JWT e invalidação

Login normaliza email e verifica o hash. Email inexistente e senha incorreta
retornam o mesmo `401 INVALID_CREDENTIALS`, com a mesma mensagem; conta ausente
também percorre uma comparação bcrypt com hash sintético. Somente após validar
a senha é informado o estado impeditivo da conta (`403 ACCOUNT_<STATUS>`):
PENDING, REJECTED, SUSPENDED, DELETION_PENDING ou ANONYMIZED.

`@nestjs/jwt` assina HS256 com claims `sub`, `ver`, `type: access`, `iat` e `exp`.
Não há email, perfil, roles ou disciplina no token. `JWT_SECRET` e
`JWT_EXPIRES_IN` vêm somente do ambiente; não há fallback. Secret exige pelo
menos 32 bytes e deve ser aleatório forte. Expiração aceita inteiro positivo em
segundos ou sufixos `s/m/h/d`. Configuração ausente/inválida impede inicialização.
Trocar o secret invalida os tokens assinados pela chave anterior.

Em cada request privado, o guard valida assinatura/expiração/tipo/claims e consulta
o User atual no banco: precisa ser APPROVED e ter `authVersion` igual a `ver`.
Somente então atribui `request.user = { id }`. Roles do JWT não autorizam nada.
`x-user-id`, cookies, body e query nunca fornecem identidade alternativa.
Status diferente de APPROVED bloqueia imediatamente o próximo request, mesmo
com token ainda não expirado. Requests já em execução não são cancelados.

Logout faz incremento atômico condicional de `User.authVersion`, invalidando
**todos** os tokens anteriores da conta, sem blacklist em memória ou Redis.
Um login posterior emite token com a versão atual. Não há refresh token.

`me` seleciona apenas `id`, `email`, `status`, `systemRole`, `clubRoles.role` e
`profile.displayName/whatsappNumber/birthDate`; não busca hash, versão, revisor,
motivo de suspensão ou dados de terceiros.

## Revisão inicial

Body: `decision: APPROVED | REJECTED`, `note` opcional (obrigatória e não vazia
para REJECTED). Somente SystemRole.ADMIN/DEV com status APPROVED pode revisar;
ClubRole.ADMIN sozinho não autoriza. Verificação do operador, leitura do alvo
e escrita ocorrem na mesma transação. A escrita condicional `status: PENDING`
impede sobrescrever uma decisão concorrente. Não há Serializable desnecessário.

Registra `reviewedById`, `reviewedAt`, `reviewNote`. Uma repetição da mesma decisão
é no-op e preserva metadados; decisões diferentes só são aceitas para PENDING.
Não há reversão de rejeição, suspensão/reativação nem grant/remove MASTER aqui.
Provisionamento inicial de ADMIN/DEV é operacional e controlado, fora do cadastro.

## Erros

| HTTP | Código | Condição |
| --- | --- | --- |
| 400 | `INVALID_WHATSAPP`, `INVALID_BIRTH_DATE`, `ADULT_ACCOUNT_REQUIRED`, `INVALID_PASSWORD`, `INVALID_DISPLAY_NAME` | Validação de cadastro |
| 400 | `REGISTRATION_REJECTION_NOTE_REQUIRED` | Rejeição sem justificativa |
| 409 | `REGISTRATION_CONFLICT` | Email ou WhatsApp duplicado |
| 401 | `INVALID_CREDENTIALS` | Email/senha inválidos |
| 403 | `ACCOUNT_<STATUS>` | Credencial correta, conta não APPROVED |
| 401 | `AUTH_TOKEN_REQUIRED` | Bearer ausente |
| 401 | `AUTH_TOKEN_INVALID` | Formato, assinatura, expiração, claims ou usuário inválidos |
| 401 | `AUTH_TOKEN_REVOKED` | Versão divergente |
| 401 | `AUTH_ACCOUNT_UNAVAILABLE` | Estado atual não permite acesso |
| 403 | `ADMIN_ROLE_REQUIRED` | Operador sem privilégio de sistema aprovado |
| 404 | `USER_NOT_FOUND` | Cadastro alvo inexistente |
| 409 | `REGISTRATION_REVIEW_NOT_PENDING`, `REGISTRATION_REVIEW_CONFLICT` | Estado não revisável ou disputa concorrente |

Validação de DTO também usa o contrato de erro HTTP padronizado da API.
500 não revela detalhes internos. Logging mantém somente metadados seguros e
Request ID; nunca senha/hash, Authorization, JWT/secret, cookies, URL do banco,
nascimento, WhatsApp ou conteúdo disciplinar. Ver [privacidade](../privacy/lgpd-fase2.md).

## Banco e validação

Única mudança de modelo: `User.authVersion Int @default(0)`. Migration nova
`20261021120000_add_user_auth_version` contém somente ADD COLUMN com default 0;
a inicial `20261010072608_init_fase2_domain` permanece intacta. Nenhuma migration
foi aplicada nesta implementação; `migrate dev` não foi executado sem prova de
banco local/isolado. Nunca usar db push. MySQL terá histórico próprio conforme
[portabilidade](../database/portabilidade-postgresql-mysql.md).

E2E de auth usa JWT e bcrypt reais com repositórios simulados; verifica também
Bearer em Campaign/Session/OneShot/Tables. A suíte de domínio anterior tem override
explícito do guard no TestingModule. Não existe middleware de identidade ou
backdoor de produção. Integração contra banco real e aplicação da migration
precisam ser validadas no ambiente autorizado antes do deploy.

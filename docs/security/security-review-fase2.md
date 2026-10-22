# Revisão de segurança da API — Fase 2

Task `86e39wknp`, revisão em 2026-10-22, base `40a6844`.
Revisão estática e testes locais com repositórios simulados. Não declara
pentest de produção, deploy, migrations aplicadas ou fechamento dos riscos abertos.
Não houve acesso de escrita ao banco nem alteração de Render/Supabase.

## Superfície HTTP (31 rotas)

| Método | Rota | Fronteira de acesso |
| --- | --- | --- |
| GET | `/`, `/health` | Públicas |
| POST | `/auth/register`, `/auth/login` | Públicas |
| GET | `/campaigns/public`, `/one-shots/public` | Públicas; projeções públicas no Prisma |
| GET | `/auth/me` | Autenticado; somente a própria conta |
| POST | `/auth/logout` | Autenticado; somente a própria conta |
| GET | `/tables/me` | Autenticado; filtro pelo id autenticado |
| POST | `/campaigns`, `/one-shots` | APPROVED + ClubRole.MASTER |
| GET, PATCH, DELETE | `/campaigns/:id` | Proprietário MASTER ou ADMIN/DEV de sistema |
| POST | `/campaigns/:id/publish` | Proprietário MASTER ou ADMIN/DEV; aprovação e quota |
| PATCH | `/campaigns/:id/status` | Proprietário MASTER ou ADMIN/DEV; transições do domínio |
| GET, PATCH, DELETE | `/one-shots/:id` | Proprietário MASTER ou ADMIN/DEV; estados/histórico |
| POST | `/one-shots/:id/publish` | Proprietário MASTER ou ADMIN/DEV; aprovação |
| PATCH | `/one-shots/:id/status` | Proprietário MASTER ou ADMIN/DEV; transições do domínio |
| GET, POST | `/campaigns/:campaignId/sessions` | Proprietário MASTER ou ADMIN/DEV |
| GET, PATCH, DELETE | `/sessions/:id` | Proprietário da mesa MASTER ou ADMIN/DEV |
| PATCH | `/sessions/:id/status` | Proprietário da mesa MASTER ou ADMIN/DEV |
| PATCH | `/admin/users/:id/registration-review` | APPROVED + SystemRole.ADMIN/DEV; alvo PENDING |
| PATCH | `/admin/campaigns/:id/approval` | APPROVED + SystemRole.ADMIN/DEV |
| PATCH | `/admin/one-shots/:id/approval` | APPROVED + SystemRole.ADMIN/DEV |
| PATCH | `/admin/one-shots/:id/correction` | APPROVED + SystemRole.ADMIN/DEV; quota/janela/estado |

Não há endpoint de GameSystem ou consulta arbitrária de User. Sessões de
OneShot não aceitam mutação direta por SessionsService. Leitura de Session
permanece restrita ao responsável/administrador; participação não concede
gerenciamento da mesa. O agregado OneShot + Session mantém sua fronteira.

## Modelo confirmado

- [Autenticação](../api/auth.md): HS256, assinatura/expiração, validação de
  sub/ver/type/exp e leitura de status/authVersion do banco em cada request.
  Bearer é a única credencial HTTP. Logout incrementa a versão atomicamente.
  Login inexistente e senha incorreta usam INVALID_CREDENTIALS e bcrypt dummy.
- [Autorização](../api/roles-authorization.md): AuthGuard antes de
  AuthorizationGuard; somente request.user.id é utilizado como identidade.
  Roles nunca são confiadas do JWT, headers, body, query ou cookies.
  ADMIN/DEV de sistema não implicam MASTER; ClubRole.ADMIN não é admin técnico.
  Somente APPROVED exerce privilégios, inclusive em chamadas diretas.
- Operações transacionais de publicação, revisão/correção, quotas e mutações
  de Session verificam autorização no TransactionClient da escrita; retries
  Serializable repetem as leituras. A criação simples de Campaign mantém a
  validação de MASTER no serviço antes da escrita; não possui retry.
- DTOs e Prisma data usam campos explícitos; whitelist + forbidNonWhitelisted
  rejeitam proprietário, roles, authVersion, passwordHash e metadados injetados.
- /auth/me consulta somente dados próprios necessários. passwordHash não sai
  em resposta; authVersion só é utilizado internamente e no claim ver.
  Projeções públicas não pedem email, telefone, nascimento, reports ou sanções.
  Respostas privadas de mesas continuam reservadas ao dono/admin; notas da
  própria revisão e contadores de histórico não são respostas públicas.

## Findings e decisões

| ID / severidade | Evidência e impacto | Correção / estado | Teste |
| --- | --- | --- | --- |
| SEC-01 / ALTO | Login/register executavam bcrypt e persistência sem limite de tentativas; brute force, spam e consumo de CPU/DB | **CORRIGIDO**: limites por identidade/origem e agregados por endpoint com @nestjs/throttler | Unitários do tracker; E2E de 429 individual/agregado, spoofing, expiração e isolamento das outras rotas |
| SEC-02 / MÉDIO | ApiExceptionFilter protegia Error comum, mas devolvia message/code de HttpException 5xx; uma falha encapsulada poderia revelar detalhes internos | Corrigido: todo 5xx tem mensagem genérica e código derivado do status, sem payload interno | E2E `sanitizes even HTTP 500 exceptions...`; erro comum/Prisma continua genérico |
| SEC-03 / MÉDIO | 404 padrão ecoava URL/query; logs de erro usavam path arbitrário; validação de propriedade desconhecida e JSON malformado podiam ecoar dados enviados | Corrigido: rota declarada nos logs/envelope, `/[unmatched]` para desconhecidas, 404 genérico e mensagens de validação/parse estáticas | E2E de caminho/query/JSON/property-name; teste de rota parametrizada sem PII nos logs |
| SEC-04 / BAIXO (defesa adicional) | Sanitizador não cobria chaves email/phone/reviewNote/suspensionReason/databasePassword; chamadas atuais não enviam esses campos | Cobertura ampliada, sem afirmar vazamento observado dessas chaves em produção | sanitize-log-data.spec; E2E de logs com credenciais/PII |
| SEC-05 / severidades do registry | Audit inicial: 12 apontamentos (1 critical, 8 high, 2 moderate, 1 low). Proxy-addr crítico exige confiança em sub-redes de proxy; trust proxy está desabilitado. Multer não possui rota de upload; fast-uri está em tooling. Atualizações compatíveis disponíveis | Lockfile atualizado sem major de dependência direta; Prisma/client/adapter atualizados pelo patch 7.10.1, sem mudança de schema | npm ci, build, unit/E2E e npm audit --omit=dev |
| SEC-06 / MÉDIO, débito local | DATABASE_URL local contém opção temporária que desabilita validação do certificado; conexão cifrada não prova identidade do servidor | Não alterada nesta revisão; substituir workaround por CA confiável e verificação completa. Não é recomendação para produção | Inspeção em memória somente do booleano de bypass, sem exibir URL/credenciais |

Nenhum bypass confirmado de autenticação/roles, IDOR ou mass assignment.
E2E cria objetos com MASTER A e comprova negação a MASTER B em leitura,
edição, exclusão, publicação, status e gerenciamento das sessões. Testes de
roles, status, revogação e fronteira transacional permanecem em execução.

## Rate limiting implementado

Guards locais somente em POST /auth/login e /auth/register, usando a
[solução oficial NestJS](https://docs.nestjs.com/security/rate-limiting).

| Endpoint | Individual | Agregado por endpoint/processo |
| --- | --- | --- |
| Login | 5 tentativas / 15 minutos | 60 requests / minuto |
| Register | 3 tentativas / 60 minutos | 20 requests / minuto |

São limites iniciais conservadores para homologação, não resultados de benchmark.
O agregado é verificado primeiro, antes do tracker individual, DTO, bcrypt e
banco: rotacionar email/IP não evita o teto agregado nem gera chaves individuais
ilimitadas depois dele. Requisições inválidas e falhas também contam. As janelas
são móveis; não existe bloqueio permanente nem prolongamento do bloqueio por
tentativas rejeitadas. Excesso retorna 429 RATE_LIMIT_EXCEEDED e mensagem genérica.
Headers de limite/contadores são omitidos; nenhuma informação de conta é revelada.

O [Render documenta que Cloudflare sobrescreve CF-Connecting-IP em serviços públicos](https://render.com/articles/host-pocketbase-on-render).
A confiança nesse header fica restrita ao ambiente `RENDER=true`,
[definido pelo provedor](https://render.com/docs/environment-variables).
Ele precisa ser um único IP válido; ausente/inválido, usa socket.remoteAddress.
Fora do Render, inclusive com header CF forjado, usa somente o socket.
Nunca usa X-Forwarded-For, req.ip ou trust proxy=true. Essa decisão pressupõe o
ingresso público atual; acesso privado/direto ou outro proxy exige nova revisão.

A chave individual usa HMAC-SHA256 com chave aleatória efêmera por processo:
operação + IP + email trim/lowercase + WhatsApp normalizado (somente cadastro).
IPv4 mapeado é normalizado e IPv6 agrupado por /64. Não armazena email, telefone
ou IP em claro nas chaves. O bucket agregado é independente por endpoint e não
depende de identidade. Rotacionar identidades contorna o individual, mas não
o agregado. Um atacante ainda pode consumir a quota agregada e afetar usuários
legítimos: trade-off de disponibilidade a calibrar por métricas.

Storage em memória é adequado à única instância atual; deploy/restart zera
contadores e a chave HMAC. Múltiplas instâncias exigirão Redis/Render Key Value,
contadores compartilhados e uma estratégia comum/segura de chaves HMAC.
Não foram adicionados Redis, lockout de conta ou throttle global da API.
Testes usam relógio controlado, sem sleeps longos; não constituem teste de carga
nem verificação operacional do ingresso do Render.

## Dependências

A origem do lockfile foi recuperada dos comandos da sessão anterior, executados
em apps/api (não foi npm ci):

```
npm update @nestjs/config @nestjs/platform-express @nestjs/common @nestjs/core lodash multer proxy-addr qs body-parser fast-uri mysql2 --ignore-scripts --no-audit --no-fund
npm update prisma @prisma/client @prisma/adapter-pg --ignore-scripts --no-audit --no-fund
```

Nesta rodada foi executado em apps/api:
`npm install @nestjs/throttler@6.7.1 --save-exact --ignore-scripts --no-audit --no-fund`.
Uma invocação inicial na raiz por engano criou manifests/node_modules que não
existiam; esses artefatos foram identificados e removidos integralmente, sem
alterar o projeto da raiz. Não foi executado npm audit fix nem npm update major.
Os bumps não relacionados de exsolve e pkg-types foram revertidos para 1.1.1 e
2.3.3; ambos satisfazem as faixas dos pais. As demais mudanças seguem abaixo.

| Pacote | Antes | Depois | Direto/Transitivo | Motivo |
| --- | --- | --- | --- | --- |
| @nestjs/common, @nestjs/core, @nestjs/platform-express | 11.1.24 | 11.2.7 | Diretos | Alinhamento compatível; platform-express atualiza multer |
| @nestjs/config | 4.0.2 | 4.0.4 | Direto | Atualiza lodash vulnerável |
| prisma | 7.10.0 | 7.10.1 | Direto dev | Patch oficial da cadeia de tooling |
| @prisma/client, @prisma/adapter-pg | 7.10.0 | 7.10.1 | Diretos | Alinhamento com CLI/engine |
| @nestjs/throttler | — | 6.7.1 | Direto novo, exato | SEC-01; peers incluem Nest 11 |
| proxy-addr | 2.0.7 | 2.0.8 | Transitivo | Correção do advisory de trust de proxy |
| lodash (cópia de config) | 4.17.21 | 4.18.1, deduplicado | Transitivo | Corrige advisory; raiz já tinha 4.18.1 |
| multer | 2.1.1 | 2.4.0 | Transitivo | Correção preventiva de advisories |
| body-parser | 2.2.2 | 2.4.0 | Transitivo | Correção de advisory |
| qs | 6.15.2 | 6.16.1 | Transitivo | Correção de parser HTTP |
| fast-uri | 3.1.2 | 3.1.9 | Transitivo | Correção na cadeia Ajv/tooling |
| deepmerge-ts | 7.1.5 | 8.0.2 | Transitivo | Versão exigida pelo patch oficial @prisma/config; corrige DoS |
| mysql2 | 3.15.3 | 3.24.4 | Transitivo | Patch oficial Prisma; corrige advisories do tooling |
| dotenv (cópia de config) | 16.4.7 | 17.4.1 | Transitivo | Dependência oficial de config 4.0.4 |
| dotenv-expand | 12.0.1 | 12.0.3 | Transitivo | Dependência de config atualizado |
| iconv-lite | 0.7.2 | 0.7.3 | Transitivo | Dependência de body-parser atualizado |
| side-channel | 1.1.0 | 1.1.1 | Transitivo | Dependência de qs atualizado |
| content-type (cópia de body-parser) | faixa 1.x compartilhada | 2.1.0 aninhado | Transitivo | Dependência oficial de body-parser 2.4; raiz 1.x permanece |
| sqlstring → sql-escaper | 2.3.3 | 1.5.2 | Transitivo | Substituição oficial na cadeia mysql2 |
| @prisma/client-runtime-utils, config, debug, driver-adapter-utils, engines, fetch-engine, get-platform | 7.10.0 | 7.10.1 | Transitivos | Alinhamento oficial Prisma |
| @prisma/engines-version | 7.10.0-4… | 8.1.0-1… | Transitivo, identificador de build | Exigido por engines/fetch-engine 7.10.1; não é upgrade da CLI/ORM para Prisma 8 |

Nenhuma major direta foi introduzida: Nest permanece 11 e Prisma/CLI/client/adapter
7. As mudanças de major **transitivas** (deepmerge-ts, dotenv, content-type e
identificador de engine) são explícitas e vêm dos manifests oficiais dos patches
selecionados; não se afirma que todo número major do lockfile ficou inalterado.
Também saem dependências obsoletas dos pais: @nuxt/opencollective/consola,
concat-stream/typedarray e denque/seq-queue/sqlstring; flags dev/optional de
dependências compartilhadas são recalculadas. Nenhum pacote direto sem relação
foi adicionado. Nenhum override manual foi criado.

Antes da instalação, os peers de throttler 6.7.1 foram consultados no registry:
common/core aceitam ^11.0.0 e reflect-metadata aceita a versão atual. Engines
aceita ^20.19.0 || ^22.12.0 || >=24.0.0, igual ao projeto; execução local em
Node 24.20.0. Não exige outra versão de TypeScript; build com TS 5.9.3 valida
integração. O pacote fornece suas declarações de tipos.

| Origem do alerta inicial | Aplicabilidade observada | Tratamento |
| --- | --- | --- |
| proxy-addr | Critical no registry, mas exige trust por sub-rede; trust proxy está desligado | Patch compatível aplicado preventivamente |
| multer / platform-express | Sem upload/multipart interceptor na API | Minor compatível aplicado preventivamente |
| lodash / config | Nenhum template, unset/omit ou objeto controlado por HTTP enviado a essas APIs | Patch de config e minor de lodash aplicados |
| body-parser | Hipótese de limit inválido não presente na configuração atual | Minor compatível aplicado |
| qs | Parser de URL-encoded está na superfície HTTP; manter versão vulnerável é evitável, sem exploração reproduzida nesta revisão | Minor compatível aplicado |
| fast-uri | Cadeia de tooling/Ajv, sem fluxo de URL do usuário para SSRF na API atual | Patch compatível aplicado |
| deepmerge-ts / mysql2 / Prisma | Configuração local/CLI; não utilizados com dados de requests HTTP | Corrigidos pelo patch oficial Prisma 7.10.1 |

deepmerge-ts recebe configuração de tooling local, não body HTTP; mysql2 está
na CLI e a aplicação usa adapter-pg/PostgreSQL. Não há import de mysql2 ou
@prisma/config nos controllers/services da API. Não foi provada exploração
HTTP dessas duas origens, mas os alertas conhecidos foram corrigidos pelo
patch compatível, sem justificar sua permanência apenas pela baixa exposição.
Após as atualizações, `npm audit --omit=dev` retorna exit 0 e **0 vulnerabilidades**
conhecidas no snapshot do registry consultado nesta revisão.

## Política de logs, erros e secrets

Logs: somente evento e metadados operacionais, template da rota, status,
duração e Request ID. Não registrar payloads, credenciais, email/telefone/data
de nascimento ou disciplina. Sanitização recursiva é defesa adicional; não
substitui evitar enviar valores sensíveis ao logger. Request ID é correlação
não confiável, nunca prova de identidade. Ver [logging](../observability/metricas-capacidade-fase2.md).

Envelope de erro mantém status/code/message/requestId/timestamp/path. `path`
passa a conter o template declarado (sem parâmetros pessoais) ou `/[unmatched]`.
Erros de validação e parsing têm mensagem genérica; códigos funcionais
explícitos do domínio permanecem. Nenhum 5xx devolve mensagem interna ou stack.

Inspeção de arquivos rastreados encontrou URLs de exemplo e secrets sintéticos
de testes; as ocorrências revisadas de JWT_SECRET são expressões/fixtures.
Nenhum secret real conhecido foi identificado. `.env`/`.env.local` reais são
ignorados; a busca de nomes no histórico local disponível não encontrou esses
arquivos reais versionados. Não cobre objetos inacessíveis, refs remotas não
obtidas ou credenciais fora dos padrões pesquisados. Nenhum histórico foi
reescrito. Ver [ambientes e secrets](../architecture/fase2-ambientes.md).

## Riscos e follow-ups

- Validar operacionalmente o ingresso público e calibrar limites com métricas;
  escala horizontal exige store compartilhado, não múltiplos limiters isolados.
- TLS local permissivo continua como débito temporário, sem alteração de Render.
- Repetir audit periodicamente: ausência de alertas conhecidos não prova ausência
  de vulnerabilidades; não atualizar automaticamente para Prisma 8.
- CORS não está habilitado; nenhum wildcard com credentials. Não há cookies
  de sessão; não foi inventado mecanismo CSRF para cookie. Ao integrar o browser,
  definir allowlist explícita do frontend antes de habilitar CORS.
- Headers gerais (ex.: Helmet), limites de capacidade de listagens privadas e
  proteção distribuída podem ser avaliados em hardening posterior; não foram
  adicionados WAF/SIEM ou novas funcionalidades de produto.
- Reexecutar cenários concorrentes em PostgreSQL/MySQL reais antes de alegar
  validação de banco real; os testes desta task não criam banco/usuários reais.

## Validação desta rodada

- npm ci: concluído; hash SHA-256 do diff binário, status e conteúdo dos arquivos
  novos permaneceu idêntico imediatamente antes/depois. Não alterou o lockfile
  nem gerou alterações adicionais. Este registro documental foi acrescentado depois.
- Prisma validate e generate: passaram; client 7.10.1.
- Build: passou. Unitários: 304 testes / 19 suítes. E2E: 181 testes / 2 suítes.
- npm audit --omit=dev: zero vulnerabilidades. Avisos de depreciação de tooling
  durante npm ci não foram tratados como prova de exploração de runtime.
- git diff --check: passou. Schema, migrations, frontend e arquivos .env intactos.
- Sem commit, push, PR, deploy ou execução de migration.

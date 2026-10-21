# Fase 2 — privacidade, dados e acesso

Tarefa `86e39wg1h`. Especificação de produto/engenharia baseada no
[schema atual](../../apps/api/prisma/schema.prisma), não um parecer jurídico.
Classificações abaixo descrevem exposição e acesso no produto; não constituem
classificação jurídica de dados sensíveis. Bases legais, avisos/termos e prazos
de conservação ainda exigem validação pelos responsáveis, com apoio jurídico
quando necessário. Não se estabelece aqui obrigação legal universal ou prazo
legal específico.

## Estado e princípios

Prisma, schema/migration inicial e domínio base de mesas existem. Cadastro,
revisão inicial e JWT estão implementados no [contrato de auth](../api/auth.md).
Gestão completa de conta/perfil, exclusão, feedback, disciplina e audit log não
devem ser considerados implementados apenas porque seus modelos existem.
As regras abaixo orientam a implementação e seus testes futuros; esta tarefa
não cria endpoints nem jobs de retenção.

- Menores de 18 anos ficam fora da primeira versão autenticada; a futura entrada
  deve validar elegibilidade, sem coletar documentos para isso por padrão.
- Não coletar CPF, RG, biometria ou endereço. Endereço só poderá ser considerado
  após necessidade futura explícita e nova decisão de minimização.
- Não exigir nome civil: `displayName` identifica o membro na comunidade.
- Senha nunca em texto persistido/logado; `passwordHash` nunca é retornado por API.
- Reports, dados disciplinares e evidências não são públicos.
- Selecionar campos mínimos no banco; não buscar dados privados para removê-los
  só depois de montar a resposta pública.
- Ambiente de desenvolvimento usa dados sintéticos. Acesso a banco, exportações
  e backups é restrito e não decorre de ser membro/mestre do clube.

## Inventário e tratamento por grupo

“Público” é somente a projeção deliberadamente publicada. “Privado” é restrito
ao titular ou participantes autorizados conforme a finalidade. “Administrativo”
é restrito à operação/moderação autorizada. Identificadores relacionais também
podem permitir vinculação a pessoas e não equivalem a anonimização.

| Grupo / campos atuais | Finalidade e classificação | Acesso e minimização | Exclusão/anonimização e histórico |
| --- | --- | --- | --- |
| `User.authVersion` | Contador de revogação de JWT; interno ao serviço de autenticação | Consultado pelo guard e incrementado no logout; nunca incluído em respostas | Estado não APPROVED impede acesso; ao implementar exclusão/anonimização, também invalidar credenciais e versões anteriores |
| Conta `User`: `email`, `passwordHash`, `status`, `systemRole`, `createdAt`, `updatedAt` | Identidade, acesso e ciclo de conta; privado/administrativo, hash restrito ao serviço | Titular vê dados próprios necessários, nunca hash; ADMIN/DEV aprovados usam apenas dados necessários à operação | Remover email/hash na anonimização; invalidar credenciais/sessões quando implementadas; conservar chave técnica apenas se relações históricas exigirem, com redução de vinculabilidade |
| Administração da conta: `reviewedById`, `reviewedAt`, `reviewNote`, `suspendedById`, `suspendedAt`, `suspensionReason`, `deletionRequestedAt`, `deletionExpiresAt`, `anonymizedAt` | Aprovação, suspensão e exclusão; administrativo | Operadores autorizados; titular recebe estado/motivo pertinente por fluxo controlado, sem dados de terceiros desnecessários | Conservar somente decisão/metadados necessários; revisar texto livre e identificadores de operadores conforme necessidade histórica |
| `UserClubRole`: `userId`, `role`, `grantedById`, `grantedAt` | Papéis cumulativos de negócio; privado/administrativo | Titular e administração; não publicar concessores ou papéis por conveniência | Remover concessões ativas na anonimização; eventual registro mínimo da decisão depende da necessidade de auditoria |
| `Profile`: `displayName`, `whatsappNumber`, `birthDate`, `userId`, IDs e timestamps | Nome comunitário, identificação no WhatsApp e elegibilidade etária; nome pode ser público na projeção de mesa; número/data são privados | Número normalizado E.164; data tratada conforme contrato do schema; titular e ADMIN/DEV autorizados; mestres não recebem contatos/datas automaticamente | Remover número e data; remover/substituir nome por rótulo neutro quando necessário ao histórico; eliminar metadados dispensáveis |
| `Campaign`, `OneShot`, `Session`: título, descrição, sistema, agenda, status, mestre, revisão, cancelamento e timestamps | Organização das atividades; conteúdo publicado público; rascunhos privados; revisão/motivos administrativos | Público só recebe projeção segura do domínio; dono e administração gerenciam; não inserir contatos/dados disciplinares em descrição/título | Preservar relações necessárias a sessões/participações/casos; remover dados pessoais de texto livre e desassociar identificação pública do titular quando aplicável; não apagar em cascata histórico necessário |
| `SessionParticipant`: usuário/sessão, papel, status, `registeredAt`, `confirmedAt`, `attendedAt`, `cancelledAt`, motivo, `leftAt`, timestamps | Inscrição e presença; privado/operacional | Titular; mestre apenas das sessões sob sua responsabilidade e administração, no mínimo necessário; lista de participantes não se torna pública por padrão | Remover motivo/texto pessoal dispensável; preservar vínculo técnico mínimo ou agregados quando necessário ao histórico da sessão |
| `Feedback`: autor, alvo, sessão, `rating`, `comment`, `visibility`, `editableUntil`, ocultação/moderação e timestamps | Avaliação e moderação; público somente se `PUBLIC` e não oculto; privado se `PRIVATE_TO_RECIPIENT`; moderação administrativa | Autor/destinatário e moderação conforme finalidade; não expor identificação ou notas internas em projeção pública; endpoints ainda pendentes | Revisar comentários para dados de terceiros; remover/anonimizar autoria e texto pessoal quando cabível, preservar avaliação agregada/histórico mínimo justificado |
| `Report`: autor, alvo, sessão, categoria, `description`, status, revisão/resolução, `disclosedById`, `disclosedAt` e timestamps | Apuração e decisão de moderação; administrativo e acesso privado controlado do autor | ADMIN/DEV aprovados no exercício da função; autor acompanha somente retorno autorizado; alvo não recebe relato/autoria/evidências automaticamente; divulgação exige decisão controlada | Preservar integridade do caso e suas relações quando necessário; reduzir identificadores/texto pessoal sem destruir evidência que ainda precise ser conservada; reavaliar necessidade |
| `ReportEvidence`: `reportId`, `url`, `label`, `createdAt` | Subsídio à apuração; administrativo | Acesso restrito ao caso, nunca URL pública por padrão; não coletar material alheio ao fato; schema de URL não garante proteção do conteúdo externo | Eliminar links/cópias e solicitar tratamento na origem sob controle do clube quando dispensáveis; manter somente material justificado; tratar backups/exportações |
| `Warning`: usuário/report/categoria, gravidade, pesos, recorrência, status, motivo, vencimento, criador, reversão e timestamps | Advertência e memória da decisão; administrativo | Administração autorizada; titular recebe decisão pertinente sem material de terceiros; expiração não equivale a apagar histórico | Preservar relações/cálculo necessários à revisão; minimizar identificação e motivos textuais quando possível; sem prazo legal presumido |
| `Sanction`: usuário, report/warning, tipo, escopo de campanha/sessão/outro, motivo, início/fim, status, criador/reversor e timestamps | Aplicação e revisão de restrições; administrativo | Administração; titular recebe decisão/escopo pertinente; mestre recebe somente restrição operacional estritamente necessária, sem dossiê | Conservar histórico necessário e vínculos íntegros; remover identificadores/texto pessoal dispensável; revisar necessidade após encerramento |
| `Appeal`: usuário, warning/sanction, sequência, justificativa, status, revisor, resposta e timestamps | Recurso e revisão da decisão; privado/administrativo | Titular do recurso e administração autorizada; ocultar informações de terceiros | Preservar sequência e decisão enquanto necessárias; revisar justificativas/respostas para minimização e anonimização |
| `AuditLog`: `actorId`, `action`, `entityType`, `entityId`, `requestId`, `metadata`, `createdAt` | Rastreabilidade administrativa futura; administrativo | Somente operadores autorizados, sem endpoint público; metadata mínima e sem cópia de conteúdo sensível | Remover/minimizar ator e correlações pessoais quando possível sem invalidar histórico necessário; não tratar pseudônimo/ID como anonimização completa |
| `GameSystem`, `DisciplinaryCategory` | Catálogos de sistema e classificação; não são perfis pessoais | Sistemas ativos podem ser públicos; categorias disciplinares não exigem exposição pública | Preservar referências usadas pelo histórico; não inserir nomes/relatos pessoais nos rótulos |
| Logs operacionais e relatórios de capacidade | Diagnóstico e dimensionamento; administrativo | Request ID e agregados; sem payloads/segredos; paths podem conter IDs pessoais | Definir retenção operacional antes de exportar; limitar acesso e apagar cópias dispensáveis; não prolongar conservação só por conveniência |

Projeções públicas atuais de mesas não incluem `master.id`, reports,
sanctionScopes, evidências ou campos administrativos. Contrato canônico:
[domínio de mesas](../api/tables-domain.md).

## Matriz de acesso de produto

Esta matriz define limites para futuras funcionalidades, não comprova endpoints
implementados. ADMIN/DEV significam **SystemRole** com conta APPROVED e acesso
compatível com a função exercida. `ClubRole.ADMIN` sozinho não concede privilégios
administrativos de sistema. DEV tem capacidade técnica integral, mas deve operar
com finalidade e minimização; isso não autoriza publicar dados pessoais.

| Dado | Público | Próprio usuário | ADMIN/DEV | Observação |
| --- | --- | --- | --- | --- |
| Mesa aprovada/publicada e nome público do mestre | Projeção mínima | Sim | Gerenciamento autorizado | Sem contatos, revisão ou disciplina |
| Email / WhatsApp / nascimento | Não | Próprios dados por fluxo autenticado | Necessidade operacional | Outros membros/mestres sem acesso automático |
| Hash de senha / secrets | Não | Não via resposta | Não via resposta administrativa | Somente processamento pelo serviço autorizado |
| Status/papéis e revisão de conta | Não | Estado próprio e informação pertinente | Sim, conforme função | Notas/terceiros protegidos |
| Rascunhos e participação/presença | Não por padrão | Próprios vínculos | Sim, conforme função | Mestre acessa somente operação necessária das próprias mesas |
| Feedback público não oculto | Projeção mínima futura | Conforme autoria/alvo | Moderação | PRIVATE_TO_RECIPIENT e notas internas excluídos |
| Feedback privado | Não | Autor/destinatário autorizados | Moderação justificada | Não expor para os demais participantes |
| Report | Não | Autor: acompanhamento controlado | Apuração autorizada | Ser alvo não concede acesso integral |
| Evidência | Não | Somente acesso especificamente autorizado | Apuração autorizada | Não revelar material de terceiros automaticamente |
| Advertência/sanção | Não | Decisão própria pertinente | Moderação autorizada | Mestre só recebe efeito operacional necessário |
| Recurso | Não | Próprio recurso | Revisão autorizada | Proteger dados de terceiros |
| Audit log / logs operacionais | Não | Sem acesso bruto automático | Acesso restrito por finalidade | Solicitação do titular é analisada, sem exportar segredos/terceiros |

## DELETION_PENDING e retenção

A janela de recuperação de **90 dias é regra de produto**, refletida nos campos
do schema; não é obrigação universal da LGPD. Ao solicitar exclusão, o fluxo
futuro marca `DELETION_PENDING`, registra solicitação e vencimento, deixa a conta
indisponível para uso normal e invalida acessos normais. Recuperação exige
verificação de titularidade por fluxo controlado dentro da janela, sem reativação
por header ou contato não verificado. Esse fluxo ainda precisa ser implementado.

Depois da janela, dados sem necessidade de conservação devem ser removidos ou
anonimizados conforme sua natureza e necessidade histórica. Remover email,
hash, WhatsApp e nascimento; neutralizar nome e textos identificáveis; remover
papéis ativos e acessos. Manter apenas relações técnicas/histórico que ainda
tenham finalidade justificada. As relações `Restrict` e obrigatórias do schema
exigem tratamento coordenado, não exclusão cega do usuário. Não alterar schema
ou apagar casos disciplinares para contornar integridade referencial.

Anonimização deve considerar texto livre, URLs, datas e possibilidade de
reidentificação por combinações ou chaves auxiliares. Apenas substituir nome
ou manter ID com tabela de correspondência não comprova anonimização efetiva.
Enquanto houver vinculabilidade, tratar o registro como dado pessoal restrito.

Não há prazo específico aprovado de conservação para disciplina, audit log,
feedbacks, participações ou logs. Responsáveis devem registrar finalidade,
necessidade, acesso, prazo/revisão e critério de descarte antes de operacionalizar
retenção. Expiração de advertência/sanção não equivale automaticamente a eliminar
histórico. Preservar integridade das relações necessárias e minimizar/remover
identificadores sempre que possível, sem inventar prazo legal.

Backups, exportações, logs e evidências em serviços externos também entram no
inventário: limitar acesso, definir expiração e garantir que restauração não
reative contas/dados já tratados. Rotina de exclusão deve ser verificável sem
registrar o conteúdo pessoal eliminado. Políticas finais de backup e descarte
dependem de validação operacional/jurídica; nenhuma rotina foi criada nesta PR.

## Canal do titular e operação

Solicitações devem usar o canal oficial de contato do Valhalla publicado no
[site](https://clubevalhalla.vercel.app/), seção Contato/Footer. O repositório já
registra o contato no [Footer](../../apps/web/src/components/landing/Footer.tsx);
não criar novo email ou exigir envio de relato/documentos em grupo público.
Confirmar titularidade de forma proporcional, encaminhar para responsável
autorizado, registrar apenas metadados mínimos do atendimento e responder por
canal privado. Não publicar pedidos em PRs, ClickUp ou logs.

Pendências para operação autenticada: avisos/bases de tratamento e responsáveis,
políticas de conservação/descarte aprovadas, fluxo de titularidade e atendimento,
controle de idade, autorizações por campo/caso e testes de recuperação,
anonimização, integridade e restauração. São critérios de implementação futura,
não funcionalidades entregues por esta especificação. Regras de secrets e
ambientes: [arquitetura](../architecture/fase2-ambientes.md). Logs e métricas:
[observabilidade](../observability/metricas-capacidade-fase2.md).

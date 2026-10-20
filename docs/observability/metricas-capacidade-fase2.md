# Fase 2 — métricas e critérios de capacidade

Tarefa `86e39whgu`. Especificação de coleta e decisão, sem instrumentação nova.
Não há números de uso, latência, capacidade ou custo medidos nesta documentação.
**Definido para coleta não significa já coletado.** Não existe baseline ou relatório
operacional preenchido no repositório. A arquitetura de referência está em
[ambientes da Fase 2](../architecture/fase2-ambientes.md).

## Fontes atuais e limites

A API emite JSON em stdout/stderr por meio do
[logger estruturado](../../apps/api/src/observability/structured-logger.service.ts).
O [interceptor](../../apps/api/src/observability/http-logging.interceptor.ts) registra
`request_received` e `request_completed`; o
[filtro de erros](../../apps/api/src/observability/api-exception.filter.ts) registra
`request_failed`. Há timestamp, Request ID, método, rota e, nos eventos terminais,
status HTTP e `durationMs`. Isso permite agregação futura de requisições que
chegaram à API, se os logs estiverem disponíveis com cobertura suficiente.

Não há exportador de métricas, dashboard de capacidade, coletor de recursos ou
instrumentação de queries lentas implementados. Retenção/exportação dos logs
Render e acesso a métricas de cada provedor precisam ser confirmados no plano
utilizado. Falhas antes da API, desconexões e eventos sem término podem ficar
fora da amostra: comparar futuramente com medições externas e registrar perdas.
Não confundir tempo dentro da API com latência ponta a ponta ou tempo de startup.

## Catálogo técnico

Frequências abaixo são recomendações de operação, não jobs existentes. “Derivável”
significa que os campos estão no código; extração, agregação e armazenamento do
relatório ainda precisam ser organizados. “Futura” exige instrumentação ou fonte
de provedor a validar. Nenhuma linha contém resultado já coletado.

| Métrica / definição | Finalidade | Fonte e disponibilidade | Frequência recomendada | Decisão de infraestrutura |
| --- | --- | --- | --- | --- |
| Requests por dia | Volume diário da API, separado de health checks | Derivável de eventos terminais; exportação pendente | Agregar diariamente em UTC | Tendência de carga e orçamento |
| Requests por rota e método | Distribuição de trabalho | Derivável; normalizar rotas parametrizadas, sobretudo erros que registram path | Diária e por release | Priorizar rotas caras; evitar escala sem diagnóstico |
| Pico de utilização | Maior taxa de requests em janela fixa de 1 minuto; concorrência separada | Taxa derivável; concorrência ainda sem instrumentação | Diária, preservar janela do pico | Estimar rajadas e necessidade de teste de carga |
| Latência média | Tempo total dividido pelo número de eventos terminais válidos | Derivável de `durationMs`; segmentar sucessos/falhas | Diária por rota; comparar releases | Detectar degradação geral |
| p50 | Mediana das durações válidas | Derivável, sem série consolidada | Diária por rota | Experiência típica e comparação do baseline |
| p95 | Percentil 95 das durações válidas | Derivável; registrar método, tamanho da amostra e cobertura | Diária e nos picos | Cauda de latência e saturação |
| Taxa de erro | 5xx / total terminal; 4xx em série separada | Derivável de status; informar denominador | Diária, e durante incidentes | Separar falha técnica, validação, 401 esperado e sobrecarga |
| Status HTTP | Distribuição por classe e código | Derivável; sem contagem publicada | Diária por rota | Investigar indisponibilidade e mudanças de contrato |
| Cold starts | Tempo de partida e primeira resposta após suspensão, quando observável | Futura: eventos de startup/provedor e medição externa; logs HTTP atuais não bastam | Por ocorrência e resumo semanal | Avaliar impacto do ambiente temporário |
| CPU | Utilização/picos por instância, se disponível | Futura: painel/exportação do provedor a validar | Durante testes e resumo diário | Distinguir CPU de espera por rede/banco |
| Memória | Uso e pico por instância, reinícios por falta de memória | Futura: provedor/processo a validar | Durante testes e resumo diário | Ajustar payloads/concorrência e tamanho da instância |
| Conexões do banco | Ativas, máximo observado e limite efetivo | Futura coleta via painel PostgreSQL/Supabase autorizado | Nos picos e resumo diário | Dimensionar pool e número de instâncias conjuntamente |
| Tamanho do banco | Espaço utilizado, distinguindo dados e índices quando possível | Consulta/painel autorizado; coleta ainda não realizada | Semanal | Planejar armazenamento e backup |
| Crescimento do banco | Variação de tamanho em janelas comparáveis | Depende de snapshots de tamanho ainda inexistentes | Mensal, acompanhar semanalmente | Prever necessidade de capacidade com incerteza explícita |
| Queries lentas | Duração/frequência de consultas por assinatura sem parâmetros pessoais | Futura: estatísticas PostgreSQL, análise autorizada ou instrumentação a decidir | Semanal e por incidente | Otimizar queries/índices antes de escalar |
| Leitura/escrita | Operações ou bytes por unidade de tempo, unidade declarada | Futura: estatísticas do banco/provedor; não inferir só pelo verbo HTTP | Diária nos testes e semanal | Separar pressão de leitura, escrita e I/O |

Para evitar dupla contagem, usar um evento terminal por operação HTTP observada;
`request_received` não é uma segunda requisição. Detectar duplicações na exportação.
Request ID pode ser fornecido pelo cliente e repetido: não é identidade nem chave
global única garantida. Segmentar por ambiente/commit e excluir sondas do tráfego
de produto, mantendo-as em série própria. Não calcular média de percentis diários;
usar amostras ou distribuição agregável da mesma janela. Em amostra pequena,
registrar a limitação em vez de atribuir significância ao p95.

## Métricas de produto relacionadas à capacidade

Somente contagens agregadas, sem exportar identificadores ou conteúdo pessoal.
Os modelos existem no schema, mas isso não comprova fluxo de aplicação pronto.

| Métrica / definição | Finalidade | Fonte e disponibilidade | Frequência recomendada | Decisão de infraestrutura |
| --- | --- | --- | --- | --- |
| Usuários cadastrados, por status | Estoque de contas, separado de usuários ativos | `User`; consulta agregada autorizada possível, ainda sem coleta | Semanal | Crescimento de dados; não equivale a carga simultânea |
| Usuários ativos | Contas distintas com ação autenticada em 30 dias | Futura: autenticação/eventos mínimos; hoje não mensurável de forma confiável | Mensal | Demanda real; não usar cadastro como substituto |
| Campanhas, por status | Estoque e atividade de mesas contínuas | `Campaign`; agregação possível, não coletada | Semanal | Consultas, listagens e histórico |
| One-shots, por status | Volume de aventuras pontuais | `OneShot`; agregação possível, não coletada | Semanal | Picos de agenda e crescimento |
| Sessões, por status e período | Volume operacional e sazonalidade | `Session`; agregação possível, não coletada | Semanal e em eventos | Relacionar agenda a picos reais de requests |
| Participantes | Participações por status e usuários distintos em separado | `SessionParticipant`; schema existente, fluxo ainda pendente | Semanal quando implementado | Cardinalidade das relações e consultas |
| Crescimento mensal aproximado | Comparar snapshots de contas, mesas, sessões, participações e tamanho | Depende de histórico de coleta futuro | Mensal | Cenários de dimensionamento, sem extrapolação como certeza |

“Ativo em 30 dias” é definição de medição proposta, sem implementar regra de
produto de inativação. Crescimento relativo usa `(atual - anterior) / anterior`;
se a base anterior for zero, informar variação absoluta e percentual não aplicável.

## Logs seguros e rastreabilidade

Nunca registrar senha, hash de senha, JWT, Authorization, cookies, tokens,
`DATABASE_URL`, conteúdo integral de reports, advertências, sanções ou evidências
privadas. Não incluir dados pessoais como labels de métricas; agregar e normalizar
rotas antes de compartilhar relatórios. Logs operacionais não substituem audit log.

Usar Request ID/correlation ID para investigar fluxos sem copiar payloads.
Referências da implementação: [Request ID](../../apps/api/src/observability/request-id.middleware.ts)
e [sanitização](../../apps/api/src/observability/sanitize-log-data.ts). A sanitização
existente é defesa adicional, não garantia para qualquer chave/texto: não enviar
segredos ao logger. Aprovar retenção, acesso e exportação conforme
[privacidade](../privacy/lgpd-fase2.md); não criar coleta de conteúdo disciplinar
para medir capacidade.

## Relatório de capacidade

Responsável proposto: Tech Lead consolida; equipe valida fontes e stakeholder
valida prioridades/orçamento. Revisão semanal durante homologação, mensal para
tendência e extraordinária após incidente ou release com mudança de carga.

Modelo a preencher com evidências reais:

```text
Período UTC / ambiente / commits / responsável:
Fontes e data de extração / cobertura / perdas / amostragem:
Estado da coleta: definido | coletado | indisponível (por métrica):
Requests/dia, por rota, pico de 1 minuto e health checks separados:
Latência média, p50, p95, tamanho de amostra e método:
Status HTTP, 5xx/total, 4xx/total e incidentes:
Cold starts / CPU / memória (ou indisponível):
Conexões / tamanho / crescimento / queries lentas / leitura e escrita:
Contas / ativos / campanhas / one-shots / sessões / participantes:
Comparação com período anterior e metas aprovadas:
Gargalo provável, evidência e incertezas:
Otimizações avaliadas, resultado e risco:
Decisão: manter | otimizar e medir | avaliar Railway:
Estimativa futura, premissas de carga, margem e fonte de preço vigente:
Ações / responsável / prazo / próxima revisão:
```

Campos sem medição devem conter “não coletado” ou “indisponível”, nunca zero
por conveniência. Anexar apenas agregados e referências de acesso restrito;
não copiar logs brutos com paths identificáveis ou dados pessoais para PR/ClickUp.

## Critérios de capacidade e adoção futura

Não foram aprovadas metas numéricas de latência/erro/recursos nem preço de
Railway. Definir metas de aceite com Tech Lead/stakeholder após baseline e antes
do teste de capacidade; registrar janela, população, margem e falhas toleradas.
Limites efetivos dos planos devem ser conferidos na ocasião, sem preço fixo aqui.

| Decisão | Evidência exigida |
| --- | --- |
| Continuar no ambiente atual | Metas aprovadas atendidas, margem medida e recuperação validada |
| Otimizar antes de escalar | Gargalo demonstrado em consulta, índice, payload, pool ou padrão de chamadas; medir antes/depois |
| Avaliar Railway | Limitação recorrente do ambiente, cold starts prejudiciais ou requisitos operacionais não atendidos; comparar alternativas e custo vigente |
| Dimensionamento inicial futuro | Perfil de carga medido/reproduzível, pico/concorrência, CPU/memória, pool por instância, I/O, armazenamento, crescimento e margem justificada |

Testes de carga futuros usam dados sintéticos e ambiente autorizado, sem gerar
carga sobre produção por esta tarefa. A decisão Railway/MySQL também exige
ensaio de migração, testes de integração, backup/restauração e plano de rollback.
Pendências: implementar/organizar coleta, obter baseline, aprovar metas e preencher
o primeiro relatório. A especificação não afirma que essas entregas operacionais
já ocorreram.

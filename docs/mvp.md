# MVP Site Valhalla Club

## Status

MVP institucional publicado na **Vercel**, em
[clubevalhalla.vercel.app](https://clubevalhalla.vercel.app/).
Atualização de estado: 02/11/2026. O escopo abaixo preserva a entrega histórica
do MVP; a Fase 2 é uma etapa distinta em desenvolvimento/homologação.

## Escopo entregue

- Hero e navegação;
- apresentação institucional do clube;
- eventos estáticos em carrossel manual;
- Mesas rolando com estado vazio quando não há mesas vigentes;
- envolvidos, contato e Footer;
- identidade visual, responsividade, SEO básico e acessibilidade básica.

## Comportamento atual

- a landing usa conteúdo estático;
- eventos são mantidos no código da landing;
- mesas só são mostradas quando existirem dados vigentes;
- o backend não é necessário para renderizar ou operar a landing pública.

## Fora do escopo do MVP

- login, cadastro e usuários;
- CRUD de mesas, inscrições e painel administrativo;
- pagamentos, calendário e ferramentas específicas de RPG.

## Fase 2 — desenvolvimento e homologação

- autenticação, cadastro e aprovação de contas;
- papéis e perfil;
- campanhas, sessões, one-shots e participações;
- feedback, reports, advertências, sanções e recursos;
- administração e audit log;
- homologação dos fluxos e critérios de capacidade/privacidade.

Já implementados no código: Prisma 7, logging estruturado com Request ID,
autenticação/JWT, autorização, perfil, administração técnica de usuários,
audit log e domínio de Campaign, Session e OneShot. O schema e a migration
inicial da Fase 2 foram aplicados em homologação.

[Participação, chamada e feedback](api/feedbacks-e-presenca.md) estão implementados
e validados localmente na API. As duas migrations dessa entrega, a homologação
dos fluxos e sua interface permanecem pendentes. Reports, advertências, sanções
e recursos continuam modelados sem endpoints de aplicação.

Ambiente de homologação: Vercel / Render Free / Supabase Free (PostgreSQL).
Railway com API NestJS e MySQL é planejamento condicionado à validação, não
produção implantada. Ver [arquitetura](architecture/fase2-ambientes.md),
[capacidade](observability/metricas-capacidade-fase2.md) e
[privacidade](privacy/lgpd-fase2.md).

## Futuro / fora desta etapa

Menores de idade, marketplace de assets/homebrews, pagamentos, fórum, galeria,
enquetes, Google Calendar e ferramentas avançadas de RPG. Não são recursos
implementados nem compromissos de entrega da Fase 2 atual.

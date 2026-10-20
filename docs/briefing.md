# Briefing Inicial do Projeto

Este documento preserva a visão inicial e registra sua evolução. Para o estado operacional do MVP, consulte [mvp.md](mvp.md).

## Contexto e objetivo

O Valhalla Club é uma comunidade de RPG de mesa de Aracaju, Sergipe. O projeto cria o site oficial da comunidade, começando pela landing institucional e evoluindo, em fases posteriores, para recursos de gerenciamento de mesas.

## Estado atual

**Entrega 1 / MVP — publicada na Vercel:** landing institucional com navegação,
Hero, Sobre, Eventos, Mesas rolando, Envolvidos, Contato/Footer, identidade visual,
responsividade, SEO básico e acessibilidade básica. O conteúdo atual é estático.
URL pública: [clubevalhalla.vercel.app](https://clubevalhalla.vercel.app/).

Mesas rolando mostra somente mesas vigentes e apresenta estado vazio quando não há dados ativos.

## Público

Jogadores e mestres de RPG, pessoas interessadas em conhecer a comunidade, participantes de Aracaju e região, organizadores e colaboradores do Valhalla Club.

## Stack e decisões

| Área | Decisão |
| --- | --- |
| Front-end | Next.js, React, TypeScript e Tailwind CSS |
| Back-end | NestJS e TypeScript |
| Banco | PostgreSQL em homologação; Prisma ORM integrado, com portabilidade futura para MySQL |
| Gestão | GitHub e ClickUp |

A camada Prisma 7 está integrada à API com provider PostgreSQL, schema inicial
da Fase 2 e migration inicial aplicada em homologação. Logging estruturado e
Request ID estão implementados, assim como o domínio base de Campaign, Session
e OneShot. Autenticação/JWT não está implementada; outros modelos no schema não
significam fluxos completos disponíveis.

Homologação usa frontend Vercel, API NestJS no Render Free e PostgreSQL hospedado
no Supabase Free. Produção da Fase 2 com API e MySQL no Railway permanece
planejamento, condicionado à homologação, métricas e validação de migração.
Supabase Auth não é a fundação da autenticação; serviços adicionais exigem nova
decisão. Ver [arquitetura e ambientes](architecture/fase2-ambientes.md).

## Equipe e responsabilidades

| Papel | Responsável |
| --- | --- |
| Tech Lead / FullStack | Vinicius Ferreira |
| FullStack | Charles Matias de Oliveira |
| FullStack | Gabriel Bomfim Bispo |
| Design/Figma | Vitor Xavier |
| Stakeholder | Dan |

O time de desenvolvimento atua no modelo fullstack. O Tech Lead orienta decisões
e valida integrações; desenvolvedores contribuem no front-end e back-end;
Vitor Xavier responde por Design/Figma; Dan é o stakeholder e valida prioridades
e informações institucionais.

## Critérios de sucesso do MVP

- marca e informações institucionais apresentadas com clareza;
- navegação e contatos funcionais;
- eventos e envolvidos visíveis;
- landing responsiva, com SEO e acessibilidade básicos;
- código, documentação e publicação organizados para operação do MVP.

## Roadmap

### Fase 2 — em desenvolvimento/homologação

- autenticação, cadastro e aprovação;
- papéis e perfil;
- campanhas, sessões, one-shots e participações;
- feedback, reports, advertências, sanções e recursos;
- administração, audit log e homologação.

### Evoluções posteriores

- menores de idade;
- marketplace de assets/homebrews e pagamentos;
- fórum, galeria e enquetes;
- Google Calendar e ferramentas avançadas de RPG.

Esses itens não fazem parte do escopo histórico do MVP. A Fase 2 tem entregas
parciais, discriminadas em [mvp.md](mvp.md); evoluções posteriores permanecem
fora da etapa atual.

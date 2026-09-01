# Briefing Inicial do Projeto

Este documento preserva a visão inicial e registra sua evolução. Para o estado operacional do MVP, consulte [mvp.md](mvp.md).

## Contexto e objetivo

O Valhalla Club é uma comunidade de RPG de mesa de Aracaju, Sergipe. O projeto cria o site oficial da comunidade, começando pela landing institucional e evoluindo, em fases posteriores, para recursos de gerenciamento de mesas.

## Estado atual

**Entrega 1 / MVP — implementada e homologada:** landing institucional com navegação, Hero, Sobre, Eventos, Mesas rolando, Envolvidos, Contato/Footer, identidade visual, responsividade, SEO básico e acessibilidade básica. O conteúdo atual é estático. A publicação ainda é planejada, não concluída.

Mesas rolando mostra somente mesas vigentes e apresenta estado vazio quando não há dados ativos.

## Público

Jogadores e mestres de RPG, pessoas interessadas em conhecer a comunidade, participantes de Aracaju e região, organizadores e colaboradores do Valhalla Club.

## Stack e decisões

| Área | Decisão |
| --- | --- |
| Front-end | Next.js, React, TypeScript e Tailwind CSS |
| Back-end | NestJS e TypeScript |
| Banco | MySQL; Prisma ORM definido para a fase de dados |
| Gestão | GitHub e ClickUp |

Prisma e MySQL são decisões tomadas, mas Prisma ainda não foi integrado ao código e não há schema ou migrations.

## Equipe e responsabilidades

| Papel | Responsável |
| --- | --- |
| Tech Lead / FullStack | Vinicius Ferreira |
| FullStack | Charles Matias de Oliveira |
| FullStack | Gabriel Bomfim Bispo |
| Stakeholder | Dan |

O time de desenvolvimento atua no modelo fullstack. O Tech Lead orienta decisões e valida integrações; os desenvolvedores contribuem no front-end e back-end conforme a tarefa; o stakeholder valida prioridades e informações institucionais.

## Critérios de sucesso do MVP

- marca e informações institucionais apresentadas com clareza;
- navegação e contatos funcionais;
- eventos e envolvidos visíveis;
- landing responsiva, com SEO e acessibilidade básicos;
- código e documentação organizados para a preparação de produção.

## Roadmap

### Entrega 2+ — futuro

- autenticação e cadastro de usuários;
- perfis de mestre e jogador;
- CRUD e gerenciamento de mesas;
- participação de jogadores e calendário.

### Evoluções posteriores

- mesas pagas e pagamentos;
- integrações e ferramentas de RPG.

Esses itens não fazem parte do MVP atual e não devem ser descritos como funcionalidades existentes.

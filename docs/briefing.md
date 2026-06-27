# Briefing Inicial do Projeto

## Site Valhalla Club

Este documento apresenta o briefing inicial do projeto **Site Valhalla Club**, reunindo objetivo, público-alvo, stack, equipe envolvida e principais entregas programadas.

---

## 1. Contexto

O **Valhalla Club** é um clube de RPG de mesa localizado em Aracaju, Sergipe.

O projeto tem como objetivo criar o site oficial do clube, fortalecendo a presença digital da marca e oferecendo, futuramente, funcionalidades para organização de mesas, divulgação de eventos e integração com ferramentas auxiliares para jogadores e mestres.

---

## 2. Objetivo do projeto

Criar uma plataforma digital para o **Valhalla Club**, começando por uma landing page institucional e evoluindo para um sistema completo de gerenciamento de mesas de RPG.

O projeto deve permitir que o público conheça o clube, acompanhe notícias e eventos, veja informações sobre os envolvidos e, em etapas futuras, possa interagir com mesas, mestres, jogadores e ferramentas relacionadas a sistemas de RPG.

---

## 3. Objetivos específicos

- Apresentar a marca Valhalla Club de forma profissional.
- Divulgar informações institucionais sobre o clube.
- Exibir fundadores, administradores, desenvolvedores e demais envolvidos.
- Criar um portal para notícias e eventos.
- Permitir cadastro e autenticação de usuários.
- Permitir que mestres cadastrem mesas de RPG.
- Permitir que jogadores visualizem e participem de mesas.
- Integrar o sistema com calendário.
- Futuramente, permitir mesas pagas com integração de pagamento.
- Futuramente, integrar ferramentas externas de apoio a sistemas específicos de RPG.

---

## 4. Público-alvo

O público-alvo do projeto inclui:

- Jogadores de RPG de mesa.
- Mestres de RPG.
- Pessoas interessadas em conhecer o Valhalla Club.
- Participantes da comunidade de RPG em Aracaju e região.
- Organizadores de eventos.
- Administradores e fundadores do Valhalla Club.
- Desenvolvedores e colaboradores do projeto.

---

## 5. Stack do projeto

A stack definida para o projeto é:

| Área | Tecnologia |
| --- | --- |
| Front-End | NextJS |
| Back-End | NestJS |
| Banco de Dados | MySQL |
| Versionamento | GitHub |
| Gerenciamento de Projeto | ClickUp |

---

## 6. Estrutura inicial esperada

O projeto deve seguir uma estrutura de monorepo:

```txt
site-valhalla-club/
├─ apps/
│  ├─ web/    # Front-end em NextJS
│  └─ api/    # Back-end em NestJS
├─ docs/      # Documentação do projeto
├─ README.md
└─ .gitignore
```

---

## 7. Equipe

| Papel | Responsável |
| --- | --- |
| Tech Lead / FullStack | Vinicius |
| Back-End / Database | Charles |
| Back-End / Database | Gabriel |
| Front-End / Design | Rafael Barbosa |
| Front-End / Design | Xavs |
| Stakeholder | Dan |

---

## 8. Responsabilidades gerais

### Tech Lead / FullStack

Responsável por orientar tecnicamente o projeto, organizar decisões de arquitetura, revisar entregas, integrar branches e validar o funcionamento geral antes de enviar para produção.

### Back-End / Database

Responsáveis pela API, regras de negócio, autenticação, modelagem do banco de dados, integrações e estrutura de dados do sistema.

### Front-End / Design

Responsáveis pela interface do usuário, identidade visual, responsividade, componentes da landing page e telas futuras do sistema.

### Stakeholder

Responsável por representar os interesses do produto, validar informações institucionais, regras de negócio e prioridades das entregas.

---

## 9. Principais entregas programadas

## Entrega 1 — Landing page institucional

Criar o site inicial do Valhalla Club com foco em apresentação da marca.

### Escopo previsto

- Página inicial com a identidade visual do Valhalla.
- Apresentação da marca.
- Seção sobre o clube.
- Seção com fundadores.
- Seção com administradores.
- Seção com desenvolvedores.
- Portal ou seção de notícias.
- Portal ou seção de eventos.
- Layout responsivo.
- SEO básico.

### Objetivo da entrega

Disponibilizar uma primeira versão pública do site para apresentar o Valhalla Club e centralizar informações importantes sobre o clube, sua equipe, notícias e eventos.

---

## Entrega 2 — Gerenciamento de mesas

Criar funcionalidades para organização e participação em mesas de RPG.

### Escopo previsto

- Sistema de login.
- Cadastro de usuários.
- Perfil de mestre.
- Perfil de jogador.
- Cadastro de mesas por mestres.
- Listagem de mesas disponíveis.
- Entrada de jogadores em mesas.
- Visualização de detalhes da mesa.
- Integração com calendário.

### Objetivo da entrega

Permitir que mestres e jogadores usem o site para organizar mesas de RPG de forma centralizada e prática.

---

## Subentrega 2.1 — Mesas pagas

Adicionar suporte para mesas pagas dentro da plataforma.

### Escopo previsto

- Definição das regras de negócio para mesas pagas.
- Integração com provedor de pagamento.
- Registro de pagamentos.
- Confirmação de inscrição mediante pagamento.
- Exibição de status de pagamento.

### Objetivo da entrega

Permitir que mesas possam ter cobrança associada, possibilitando controle de inscrições pagas dentro do sistema.

---

## Entrega 3 — Integração com ferramentas de RPG

Criar integração ou direcionamento para ferramentas auxiliares de sistemas específicos de RPG.

### Escopo previsto

- Mapeamento de ferramentas externas.
- Cadastro de links ou integrações por sistema de RPG.
- Exibição de ferramentas relacionadas a sistemas específicos.
- Integração com sites auxiliares já existentes.

### Exemplos de ferramentas

- Site auxiliar de Jujutsu.
- Site auxiliar de ShadowDark.
- Futuras ferramentas para outros sistemas.

### Objetivo da entrega

Apoiar mestres e jogadores com ferramentas específicas para diferentes sistemas de RPG, conectando o ecossistema do Valhalla Club a soluções auxiliares.

---

## Subentrega 3.1 — Criação de novos sites auxiliares

Criar novos sites ou ferramentas para auxiliar jogadores e mestres de outros sistemas de RPG.

### Escopo previsto

- Levantamento de sistemas prioritários.
- Definição de template base para ferramentas auxiliares.
- Criação de páginas ou aplicações para sistemas específicos.
- Integração dessas ferramentas com o site principal.

### Objetivo da entrega

Expandir o ecossistema digital do Valhalla Club, oferecendo suporte a diferentes sistemas de RPG usados pela comunidade.

---

## 10. Gerenciamento do projeto

O gerenciamento das tarefas será feito no **ClickUp**.

O Kanban do projeto possui as seguintes etapas:

|    Status    |                    Descrição                         |
| ---          | ---                                                  |
| BackLog      | Ideias, demandas futuras e pedidos dos stakeholders. |
| Pendente     | Tarefas já direcionadas para desenvolvimento.        |
| Em progresso | Tarefas que já estão sendo trabalhadas.              |
| Homologação  | Tarefas prontas para teste e validação.              |
| Concluído    | Tarefas validadas e finalizadas.                     |

---

## 11. Padrão de tarefas

As tarefas devem seguir o padrão:

```txt
[ Stack ] - Descrição clara da tarefa
```

Exemplos:

```txt
[ FrontEnd ] - Criar header da landing page
[ BackEnd ] - Criar endpoint de health check da API
[ Banco de Dados ] - Modelar entidade de mesas
[ Design ] - Criar wireframe da landing page
[ Documentação ] - Criar guia de setup local
```

---

## 12. Fluxo de branches

O projeto usa o seguinte fluxo:

```txt
main    -> produção
develop -> integração, homologação e preparação antes de produção
```

Fluxo esperado:

```txt
front/nome-da-tarefa -> develop -> main
back/nome-da-tarefa  -> develop -> main
db/nome-da-tarefa    -> develop -> main
docs/nome-da-tarefa  -> develop -> main
chore/nome-da-tarefa -> develop -> main
fix/nome-da-correcao -> develop -> main
```

---

## 13. Critérios de sucesso do MVP

A primeira versão relevante do projeto será considerada bem-sucedida quando:

- A landing page estiver publicada ou pronta para publicação.
- A marca Valhalla estiver bem apresentada.
- As principais informações institucionais estiverem disponíveis.
- A equipe e os envolvidos estiverem apresentados.
- Notícias e eventos puderem ser exibidos ou preparados para exibição.
- O projeto estiver organizado no GitHub.
- O fluxo de branches estiver definido.
- O setup local estiver documentado.
- A equipe conseguir contribuir de forma organizada.

---

## 14. Observações finais

Este briefing representa a visão inicial do projeto e pode ser atualizado conforme novas decisões forem tomadas pela equipe e pelos stakeholders.

Mudanças relevantes de escopo, stack, equipe, fluxo de trabalho ou entregas devem ser refletidas neste documento.

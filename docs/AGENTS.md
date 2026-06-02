# AGENTS.md

Este arquivo define orientações para agentes de IA, assistentes de código e colaboradores que forem atuar no projeto **Site Valhalla Club**.

O objetivo é garantir que qualquer contribuição siga o contexto do projeto, a arquitetura definida e os padrões combinados pela equipe.

## Contexto do projeto

O **Valhalla Club** é um clube de RPG de mesa de Aracaju, Sergipe.

O projeto tem como objetivo criar o site oficial do clube, começando por uma landing page institucional e evoluindo para um sistema de gerenciamento de mesas de RPG.

## Stack do projeto

- Front-End: NextJS
- Back-End: NestJS
- Banco de Dados: MySQL
- Versionamento: GitHub
- Gerenciamento de tarefas: ClickUp

## Estrutura esperada do repositório

```txt
site-valhalla-club/
├─ apps/
│  ├─ web/    # Aplicação front-end em NextJS
│  └─ api/    # Aplicação back-end em NestJS
├─ docs/      # Documentação do projeto
├─ README.md
└─ .gitignore
```

## Entregas principais

### 1. Landing page institucional

Site inicial com a identidade visual do Valhalla, apresentando:

- Marca do Valhalla
- História ou descrição do clube
- Fundadores
- Administradores
- Desenvolvedores
- Notícias
- Eventos

### 2. Gerenciamento de mesas

Sistema com:

- Login de usuários
- Cadastro de mesas por mestres
- Participação de jogadores em mesas
- Integração com calendário

### 2.1. Mesas pagas

Evolução futura do sistema com:

- Mesas pagas
- Inscrição mediante pagamento
- Integração com provedor de pagamento

### 3. Integração com ferramentas de RPG

Integração com sites e ferramentas auxiliares para sistemas específicos de RPG.

Exemplos:

- Sistema de Jujutsu
- Sistema de ShadowDark
- Outras ferramentas criadas pela comunidade

## Equipe

- Tech Lead / FullStack: Vinicius
- Back-End / Database: Charles
- Back-End / Database: Gabriel
- Front-End / Design: Rafael Barbosa
- Front-End / Design: Xavs
- Stakeholder: Dan

## Fluxo de branches

O projeto usa o seguinte fluxo:

```txt
main      -> produção
develop   -> integração das features antes de produção
dev-front -> integração da equipe de front-end
dev-back  -> integração da equipe de back-end
```

## Regras de branches

- Não fazer push direto na `main`.
- Não fazer push direto na `develop`.
- Evitar commits diretos em `dev-front` e `dev-back`.
- Cada tarefa do ClickUp deve ter uma branch própria.
- Toda Pull Request deve estar relacionada a uma tarefa.
- A branch da tarefa deve sair da branch da equipe correspondente.

## Exemplos de fluxo

### Front-end

```txt
front/header-landing-page -> dev-front -> develop -> main
```

### Back-end

```txt
back/health-check -> dev-back -> develop -> main
```

### Banco de dados

```txt
db/schema-inicial -> dev-back -> develop -> main
```

### Documentação

```txt
docs/guia-setup-local -> develop -> main
```

### Configuração

```txt
chore/configurar-eslint -> develop -> main
```

## Padrão de nomes de branches

Use nomes claros, curtos e em kebab-case.

### Front-end

```txt
front/nome-da-tarefa
```

Exemplos:

```txt
front/header-landing-page
front/secao-hero
front/tela-login
front/listagem-mesas
```

### Back-end

```txt
back/nome-da-tarefa
```

Exemplos:

```txt
back/health-check
back/modulo-usuarios
back/auth-login
back/modulo-mesas
```

### Banco de dados

```txt
db/nome-da-tarefa
```

Exemplos:

```txt
db/schema-inicial
db/modelagem-usuarios
db/modelagem-mesas
```

### Documentação

```txt
docs/nome-da-tarefa
```

Exemplos:

```txt
docs/guia-setup-local
docs/padrao-branches
```

### Configuração

```txt
chore/nome-da-tarefa
```

Exemplos:

```txt
chore/configurar-eslint
chore/configurar-prettier
chore/configurar-env
```

### Correções

```txt
fix/nome-da-correcao
```

Exemplos:

```txt
fix/responsividade-header
fix/erro-login
fix/bug-listagem-mesas
```

## Padrão de commits

Use commits claros e objetivos.

Formato:

```txt
tipo: descrição da alteração
```

Tipos permitidos:

- `feat`: nova funcionalidade
- `fix`: correção de erro
- `docs`: alteração em documentação
- `chore`: configuração, manutenção ou ajustes internos
- `style`: ajuste visual ou de formatação
- `refactor`: melhoria interna sem alterar comportamento
- `test`: criação ou ajuste de testes

Exemplos:

```txt
feat: criar header da landing page
fix: corrigir responsividade do header
docs: adicionar guia de setup local
chore: configurar eslint no projeto
refactor: reorganizar componentes da landing page
```

## Orientações gerais para agentes

Antes de modificar qualquer código:

1. Entenda a tarefa.
2. Verifique qual parte do projeto será alterada.
3. Mantenha a alteração pequena e focada.
4. Não misture várias tarefas em uma única mudança.
5. Não altere arquivos fora do escopo sem necessidade.
6. Preserve a estrutura definida do projeto.
7. Atualize a documentação quando a mudança impactar setup, arquitetura ou fluxo de uso.

## Orientações para front-end

A aplicação front-end fica em:

```txt
apps/web
```

Use NextJS com TypeScript.

Boas práticas:

- Criar componentes reutilizáveis.
- Separar seções grandes da landing page em componentes próprios.
- Manter nomes de componentes claros.
- Priorizar responsividade.
- Evitar lógica complexa dentro de componentes visuais.
- Usar variáveis e nomes em inglês no código.
- Manter textos institucionais em português.
- Não criar dependências novas sem necessidade.

Exemplos de componentes esperados:

```txt
Header
HeroSection
AboutSection
EventsSection
TeamSection
Footer
```

## Orientações para back-end

A aplicação back-end fica em:

```txt
apps/api
```

Use NestJS com TypeScript.

Boas práticas:

- Organizar funcionalidades por módulos.
- Criar controllers, services e DTOs quando necessário.
- Validar entradas de dados.
- Manter regras de negócio nos services.
- Evitar lógica pesada diretamente nos controllers.
- Usar nomes claros para módulos e entidades.
- Documentar variáveis de ambiente novas.

Exemplos de módulos futuros:

```txt
AuthModule
UsersModule
TablesModule
EventsModule
PaymentsModule
```

## Orientações para banco de dados

O banco definido inicialmente é MySQL.

Boas práticas:

- Não criar alterações de banco sem alinhar com a equipe de back-end.
- Documentar novas entidades e relacionamentos importantes.
- Evitar nomes ambíguos para tabelas e colunas.
- Usar nomes consistentes em inglês no schema.
- Não versionar dados sensíveis ou dumps locais.

Entidades esperadas futuramente:

```txt
User
Role
Table
TablePlayer
Event
Payment
RpgSystem
```

## Variáveis de ambiente

Nunca commitar arquivos reais de ambiente, como:

```txt
.env
.env.local
.env.development
.env.production
```

É permitido commitar arquivos de exemplo:

```txt
.env.example
```

Exemplo de variáveis esperadas:

```env
DATABASE_URL=mysql://usuario:senha@localhost:3306/valhalla
JWT_SECRET=change-me
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Documentação

Arquivos de documentação devem ficar em:

```txt
docs/
```

Documentos importantes:

```txt
docs/setup-local.md
docs/AGENTS.md
docs/CLAUDE.md
```

Sempre atualizar a documentação quando houver mudanças em:

- Setup local
- Variáveis de ambiente
- Estrutura de pastas
- Fluxo de branches
- Comandos de execução
- Arquitetura do projeto

## Critérios antes de finalizar uma tarefa

Antes de considerar uma tarefa pronta:

- O projeto deve rodar localmente.
- O código deve estar dentro do escopo da tarefa.
- Não deve haver arquivos sensíveis commitados.
- A documentação deve ser atualizada, se necessário.
- A branch deve ter nome coerente com a tarefa.
- Os commits devem seguir o padrão definido.
- A Pull Request deve explicar o que foi feito.

## Como rodar o projeto localmente

Consulte o guia:

```txt
docs/setup-local.md
```

## Instrução final

Ao atuar neste projeto, priorize simplicidade, clareza e organização.

O projeto ainda está em fase inicial, então evite complexidade desnecessária. A primeira prioridade é entregar uma base sólida, fácil de entender e fácil de manter pela equipe.

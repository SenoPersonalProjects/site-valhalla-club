# Site Valhalla Club

Repositório oficial do site do **Valhalla Clube**, clube de RPG de mesa de Aracaju, Sergipe.

## Sobre o projeto

O Site Valhalla Club tem como objetivo apresentar a marca Valhalla, divulgar notícias e eventos, exibir informações sobre a equipe e, futuramente, oferecer um sistema de gerenciamento de mesas de RPG.

## Stack

- Front-End: NextJS
- Back-End: NestJS
- Banco de Dados: MySQL
- Versionamento: GitHub
- Gerenciamento de tarefas: ClickUp

## Setup local

Para configurar o projeto localmente, siga o guia:

[Guia de Setup Local](docs/setup-local.md)

## Fluxo de branches

O projeto usa o seguinte fluxo:

- `main`: branch de produção.
- `develop`: branch de integração das features antes de produção.
- `dev-front`: branch de integração da equipe de front-end.
- `dev-back`: branch de integração da equipe de back-end.

## Fluxo de trabalho

1. Toda tarefa deve ser desenvolvida em uma branch própria.
2. Branches de front-end devem sair de `dev-front`.
3. Branches de back-end devem sair de `dev-back`.
4. Branches de banco de dados devem sair de `dev-back`.
5. Branches de documentação ou configuração podem sair de `develop`, salvo orientação diferente do tech lead.
6. Após finalizar uma tarefa, abrir um Pull Request para a branch da equipe.
7. Após reunião ou validação interna, `dev-front` e `dev-back` abrem Pull Request para `develop`.
8. O tech lead testa a `develop`.
9. Se estiver tudo certo, `develop` é enviada para `main`.

## Exemplos de fluxo

### Front-end

```txt
front/header-landing-page -> dev-front -> develop -> main
```

### Back-end

```txt
back/health-check -> dev-back -> develop -> main
```

### Banco de Dados

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

## Padrão de nomes das branches

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

### Banco de Dados

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

O projeto usa commits claros e objetivos, seguindo este padrão:

```txt
tipo: descrição da alteração
```

Tipos mais usados:

- `feat`: nova funcionalidade.
- `fix`: correção de erro.
- `docs`: alteração em documentação.
- `chore`: configuração, manutenção ou ajustes internos.
- `style`: ajustes visuais ou de formatação.
- `refactor`: melhoria interna no código sem alterar comportamento.
- `test`: criação ou ajuste de testes.

Exemplos:

```txt
feat: criar header da landing page
fix: corrigir responsividade do header
docs: adicionar guia de setup local
chore: configurar eslint no projeto
```

## Regras importantes

- Não fazer push direto na `main`.
- Não fazer push direto na `develop`.
- Commits diretos em `dev-front` e `dev-back` devem ser evitados.
- Cada tarefa do ClickUp deve ter uma branch própria.
- Toda Pull Request precisa estar relacionada a uma tarefa do ClickUp.
- Antes de abrir uma Pull Request, o responsável deve rodar o projeto localmente e testar o que foi feito.
- Ao finalizar o desenvolvimento, mover a tarefa no ClickUp para Homologação.
- O merge para `main` só deve ser feito após validação do tech lead.

## Exemplos práticos

### Criando uma branch de front-end

```bash
git checkout dev-front
git pull origin dev-front
git checkout -b front/header-landing-page
```

Depois de desenvolver:

```bash
git add .
git commit -m "feat: criar header da landing page"
git push origin front/header-landing-page
```

Abrir Pull Request:

```txt
front/header-landing-page -> dev-front
```

### Criando uma branch de back-end

```bash
git checkout dev-back
git pull origin dev-back
git checkout -b back/health-check
```

Depois de desenvolver:

```bash
git add .
git commit -m "feat: criar endpoint de health check"
git push origin back/health-check
```

Abrir Pull Request:

```txt
back/health-check -> dev-back
```

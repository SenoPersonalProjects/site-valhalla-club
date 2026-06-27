# Guia de Setup Local

Este guia explica como configurar o ambiente local para rodar o projeto **Site Valhalla Club**.

## Pré-requisitos

Antes de começar, é necessário ter instalado:

- Node.js
- npm
- Git
- VS Code
- MySQL

Também é recomendado ter instalado:

- GitHub Desktop ou GitHub CLI
- Extensões do VS Code para TypeScript, ESLint e Prettier

## 1. Clonar o repositório

Abra o terminal e execute:

```bash
git clone URL_DO_REPOSITORIO
```

Depois, acesse a pasta do projeto:

```bash
cd site-valhalla-club
```

Caso ainda não tenha a URL do repositório, copie no GitHub através do botão **Code**.

## 2. Estrutura do projeto

O projeto está organizado da seguinte forma:

```txt
site-valhalla-club/
├─ apps/
│  ├─ web/    # Front-end em NextJS
│  └─ api/    # Back-end em NestJS
├─ docs/      # Documentação do projeto
└─ README.md
```

## 3. Instalar dependências do front-end

Acesse a pasta do front-end:

```bash
cd apps/web
```

Instale as dependências:

```bash
npm install
```

Depois, volte para a raiz do projeto:

```bash
cd ../..
```

## 4. Instalar dependências do back-end

Acesse a pasta do back-end:

```bash
cd apps/api
```

Instale as dependências:

```bash
npm install
```

Depois, volte para a raiz do projeto:

```bash
cd ../..
```

## 5. Configurar variáveis de ambiente

O projeto usa arquivos `.env` para configurar informações sensíveis e específicas de cada ambiente.

Esses arquivos não devem ser enviados para o GitHub.

Cada aplicação deve ter seu próprio arquivo `.env`.

## 6. Configurar `.env` do front-end

Acesse a pasta do front-end:

```bash
cd apps/web
```

Crie um arquivo chamado:

```txt
.env.local
```

Exemplo inicial:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Depois, volte para a raiz:

```bash
cd ../..
```

## 7. Configurar `.env` do back-end

Acesse a pasta do back-end:

```bash
cd apps/api
```

Crie um arquivo chamado:

```txt
.env
```

Exemplo inicial:

```env
PORT=3001
DATABASE_URL=mysql://usuario:senha@localhost:3306/valhalla
JWT_SECRET=change-me
```

Atenção: altere `usuario`, `senha` e o nome do banco conforme a configuração local do seu MySQL.

Depois, volte para a raiz:

```bash
cd ../..
```

## 8. Configurar banco de dados local

Crie um banco de dados MySQL local para o projeto.

Exemplo:

```sql
CREATE DATABASE valhalla;
```

Caso o projeto use ORM, as instruções de migration devem ser adicionadas aqui posteriormente.

Exemplo futuro com migrations:

```bash
npm run migration:run
```

Exemplo futuro com Prisma:

```bash
npx prisma migrate dev
```

A definição final depende do ORM escolhido pelo time.

## 9. Rodar o front-end localmente

Acesse a pasta do front-end:

```bash
cd apps/web
```

Rode o projeto:

```bash
npm run dev
```

O front-end deve ficar disponível em:

```txt
http://localhost:3000
```

## 10. Rodar o back-end localmente

Em outro terminal, acesse a pasta do back-end:

```bash
cd apps/api
```

Rode o projeto:

```bash
npm run start:dev
```

O back-end deve ficar disponível em:

```txt
http://localhost:3001
```

Caso exista endpoint de health check, teste:

```txt
http://localhost:3001/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "service": "valhalla-api"
}
```

## 11. Rodar front-end e back-end ao mesmo tempo

Abra dois terminais no VS Code.

No primeiro terminal, rode o front-end:

```bash
cd apps/web
npm run dev
```

No segundo terminal, rode o back-end:

```bash
cd apps/api
npm run start:dev
```

URLs esperadas:

```txt
Front-end: http://localhost:3000
Back-end: http://localhost:3001
```

## 12. Problemas comuns

### Porta já está em uso

Se aparecer erro dizendo que a porta já está em uso, verifique se já existe outro processo rodando.

Portas usadas pelo projeto:

```txt
3000 -> front-end
3001 -> back-end
```

### Dependências com erro

Tente apagar `node_modules` e instalar novamente:

```bash
rm -rf node_modules
npm install
```

No Windows, se o comando acima não funcionar, apague a pasta `node_modules` manualmente.

### Arquivo .env não encontrado

Confira se os arquivos foram criados nos lugares corretos:

```txt
apps/web/.env.local
apps/api/.env
```

### API não conecta no banco

Confira:

```txt
- Se o MySQL está rodando
- Se o banco valhalla existe
- Se usuário e senha estão corretos
- Se a DATABASE_URL está correta
```

## 13. Checklist final

Antes de começar uma tarefa, confirme:

```md
- [ ] Repositório clonado.
- [ ] Dependências do front-end instaladas.
- [ ] Dependências do back-end instaladas.
- [ ] `.env.local` do front-end criado.
- [ ] `.env` do back-end criado.
- [ ] Banco de dados local criado.
- [ ] Front-end rodando em `http://localhost:3000`.
- [ ] Back-end rodando em `http://localhost:3001`.
```

# ORM e Estratégia de Conexão com MySQL

## ORM escolhido

O projeto utilizará o Prisma ORM como ferramenta de integração entre a aplicação e o banco de dados MySQL.

## Justificativa

O Prisma foi escolhido por oferecer uma estrutura clara para definição dos modelos do banco de dados, além da experiência que a equipe já possui utilizando essa ferramenta.

Além disso, o Prisma permite centralizar a modelagem do banco no arquivo `schema.prisma`, facilitando a manutenção, a leitura da estrutura das tabelas e a organização do projeto.

Outro ponto é que o Prisma trabalha bem com versionamento de banco de dados, permitindo que alterações estruturais sejam registradas em migrations e acompanhadas pelo Git.

## Banco de dados

O banco de dados definido para o projeto é MySQL.

A conexão com o banco será feita através da variável de ambiente `DATABASE_URL`.

Formato esperado:

```env
DATABASE_URL="mysql://usuario:senha@host:porta/nome_do_banco"
```

A variável real deve ficar no arquivo `.env`, que não deve ser versionado no Git.

Para documentação da configuração, será utilizado o arquivo `.env.example`, contendo apenas valores de exemplo.

## Estratégia de migrations

As alterações estruturais do banco de dados deverão ser feitas utilizando migrations do Prisma.

Em ambiente de desenvolvimento, o fluxo será:

```bash
npx prisma migrate dev --name nome_da_migration
```

Esse comando cria uma nova migration com base nas alterações realizadas no arquivo `schema.prisma`.

Em ambiente de homologação ou produção, o fluxo será:

```bash
npx prisma migrate deploy
```

### Explicação dos comandos 

migrate dev
Cria migration nova + aplica no banco local.
Usado pelo desenvolvedor durante o desenvolvimento.

migrate deploy
Não cria migration nova.
Só aplica migrations já existentes.
Usado em produção.

## Regras definidas

* O Prisma será utilizado como ORM do projeto.
* O banco de dados será MySQL.
* A conexão será configurada usando a variável `DATABASE_URL`.
* O arquivo `.env` não deve ser commitado.
* O arquivo `.env.example` deve conter apenas valores de exemplo.
* Toda alteração estrutural no banco deve passar por migration.
* A pasta de migrations deve ser versionada no Git.
* Não alterar tabelas manualmente em produção.
* Não usar `prisma db push` em produção, pois esse comando aplica o schema diretamente no banco sem criar uma migration versionada.

## Arquivos relacionados

```txt
prisma/schema.prisma
prisma/migrations/
.env
.env.example
docs/database/orm-e-conexao-mysql.md
```

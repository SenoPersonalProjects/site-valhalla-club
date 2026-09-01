# Prisma ORM e conexão com MySQL

## Decisão arquitetural

- Banco definido: **MySQL**.
- ORM definido: **Prisma ORM**.
- Conexão planejada: variável `DATABASE_URL`.
- Alterações estruturais futuras: migrations Prisma versionadas.

Formato planejado de conexão:

```env
DATABASE_URL=mysql://usuario:senha@host:porta/nome_do_banco
```

## Status da implementação

| Item | Estado atual |
| --- | --- |
| Decisão MySQL/Prisma | Definida |
| Dependências Prisma | Não instaladas |
| Integração Prisma na API | Não implementada |
| `prisma/schema.prisma` | Não existe no repositório |
| `prisma/migrations/` | Não existe no repositório |
| Uso pelo MVP público | Não necessário |

A API atual é uma base NestJS com `/` e `/health`; ela não lê `DATABASE_URL` nem implementa autenticação ou entidades.

## Implementação futura

Quando a fase de dados for iniciada, o projeto deve adicionar a dependência e a configuração Prisma, criar `prisma/schema.prisma` e versionar `prisma/migrations/`. Depois disso, o fluxo esperado será criar migrations durante o desenvolvimento e aplicar migrations já versionadas nos ambientes de release.

Não apresentar `npx prisma migrate dev` ou `npx prisma migrate deploy` como comandos disponíveis antes dessa implementação. Não usar `prisma db push` em produção.

## Segurança

O valor real de `DATABASE_URL` deve ficar em `.env`, fora do Git. `.env.example` deve conter somente valores seguros de exemplo.

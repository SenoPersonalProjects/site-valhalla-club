# Preparação de deploy no Netlify

Este documento registra a configuração confirmada para a publicação planejada do MVP. O MVP ainda não está publicado.

## Aplicação e repositório

- repositório: `SenoPersonalProjects/site-valhalla-club`;
- aplicação publicada: `apps/web` (Next.js);
- branch de produção: `main`;
- plataforma: Netlify.

O repositório contém também `apps/api`, mas a landing pública do MVP não depende da API, MySQL ou Prisma em build nem em runtime.

## Configuração do projeto no Netlify

Defina estas opções na configuração do projeto:

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Base directory | `apps/web` |
| Package directory | não definir |
| Build command | `npm run build` |
| Publish directory | `.next` |
| Framework | Next.js (runtime OpenNext gerenciado pelo Netlify) |

`apps/web` é o diretório-base correto porque contém o `package.json`, o `package-lock.json` e o `.nvmrc`. A raiz não possui um `package.json` nem workspaces npm; portanto, não use comandos npm a partir dela para este deploy.

Não é necessário criar `netlify.toml`: essa configuração pode ser feita pela detecção e pela interface do Netlify, sem adicionar configuração duplicada ao repositório.

## Node e instalação

O arquivo [`apps/web/.nvmrc`](../apps/web/.nvmrc) fixa Node.js 24 para o build. Essa versão atende ao mínimo do Next.js 16 (`>= 20.9`) e ao requisito de `eslint-visitor-keys@5.0.1`, transitivo do `eslint-config-next`, que requer `^20.19.0`, `^22.13.0` ou `>= 24`.

O Netlify encontra o `.nvmrc` no Base directory e usa essa versão antes de instalar dependências. Com `package-lock.json` e sem lockfiles de Yarn/pnpm/Bun, a instalação padrão da plataforma é feita por npm. Para a verificação local reprodutível, execute em `apps/web`:

```bash
npm ci
npm run lint
npm run build
```

Não defina `NODE_ENV=production` durante a instalação de validação: isso omite `devDependencies`, incluindo ESLint.

## Variáveis de ambiente

### Obrigatória para produção

| Variável | Valor |
| --- | --- |
| `SITE_URL` | URL HTTPS pública real do site no Netlify |

`SITE_URL` é usada pelo front-end para `metadataBase`, canonical, Open Graph e JSON-LD. Não use valor fictício, `localhost` ou um domínio ainda não criado. O fallback para `VERCEL_PROJECT_PRODUCTION_URL` existe apenas para ambientes Vercel; no Netlify, a ausência de `SITE_URL` faria o código cair para `http://localhost:3000`.

### Opcionais / futuras

As variáveis abaixo permanecem em `.env.example`, mas não são consumidas pela landing pública atual:

- `NEXT_PUBLIC_API_URL` — reservada para integração futura com a API;
- `NEXT_PUBLIC_APP_NAME` — reservada para configuração futura;
- `NEXT_PUBLIC_APP_ENV` — reservada para configuração futura.

Não versionar `.env`, `.env.local`, `.env.production`, tokens, credenciais ou identificadores privados do Netlify.

## Primeira publicação

1. Criar ou conectar o projeto no Netlify ao repositório.
2. Selecionar `main` como Production branch.
3. Configurar o Base directory `apps/web`, o comando de build e o diretório de publicação indicados acima.
4. Obter a URL HTTPS pública gerada para o projeto.
5. Configurar `SITE_URL` com essa URL no ambiente de produção.
6. Executar ou reexecutar o deploy para que os metadados sejam gerados com a URL correta.

Nome do projeto Netlify, URL pública, domínio próprio e ID do site permanecem a confirmar durante essa criação. Não devem ser adicionados ao repositório antes disso.

## Smoke test pós-deploy

- abrir a landing e navegar pelos links internos;
- confirmar o CTA de WhatsApp e os links sociais;
- conferir menu mobile, carrossel e estado vazio de mesas;
- verificar canonical, Open Graph e JSON-LD com a URL HTTPS pública;
- registrar a URL pública final e a data/hora efetiva da release.

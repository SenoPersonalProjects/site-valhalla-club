# Deploy atual do frontend — Vercel

O MVP institucional está publicado em
[clubevalhalla.vercel.app](https://clubevalhalla.vercel.app/) na Vercel. A API não é
dependência de build ou runtime da landing atual. A antiga proposta Netlify é
[legado não operacional](deploy-netlify.md).

## Estratégia do monorepositório

- Repositório: `SenoPersonalProjects/site-valhalla-club`.
- Aplicação: `apps/web`; definir esse diretório como raiz do projeto Vercel.
- Framework: Next.js; manter a integração de build/runtime da plataforma.
- Instalação reprodutível pelo lockfile: `npm ci`.
- Build: `npm run build`; saída gerenciada pela integração Next.js, sem configurar
  export estático ou diretório de publicação manual sem nova decisão.
- Node de referência: versão registrada em `apps/web/.nvmrc`.
- Fluxo do repositório: task → `develop` → `main`; `main` é a branch de produção
  prevista pela governança. Confirmar vínculo no painel antes de publicar.

Não há workspace npm na raiz. Não executar build da API como parte da landing.
Previews e homologação usam configuração separada da produção. Associação de
projeto/time, branches, domínios e permissões deve ser verificada no painel
autorizado; este documento não certifica essas configurações nem cria deploy.

## Variáveis e secrets

Vercel administra as variáveis do frontend por ambiente. `SITE_URL` deve
representar a URL canônica pública de produção para metadata, canonical, Open
Graph e JSON-LD. O layout também consulta `VERCEL_PROJECT_PRODUCTION_URL` como
fallback. Revisar o canonical nos previews; não assumir que uma URL de preview
deve substituir a identidade pública do site.

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME` e `NEXT_PUBLIC_APP_ENV` estão nos
exemplos, mas a landing atual não os consome em runtime. Prefixo `NEXT_PUBLIC_`
significa dado público; nunca conter segredo. Inventário e rotação, apenas nomes:
[arquitetura e ambientes](architecture/fase2-ambientes.md#secrets-e-variáveis-por-aplicação).
Não colocar credenciais de banco ou chaves da API no projeto frontend.

## Verificação e recuperação

Antes de uma release, em `apps/web`, executar `npm ci`, `npm run lint` e
`npm run build`; revisar preview, responsividade, menu, carrosséis, estado vazio
das mesas, links de contato e acessibilidade. Após publicar, conferir HTTP,
conteúdo e assets, canonical, Open Graph e JSON-LD na URL pública e registrar
commit, URL e resultado sem tokens ou logs pessoais.

Se o domínio falhar, comparar URL do deployment e alias/domínio no projeto/time
corretos, verificando build e atribuição; não assumir que todo 404 é falha do
código. Em regressão, responsável autorizado avalia retorno a deployment estável,
valida alias e repete smoke test, sem reescrever histórico Git.

Backend Render/Supabase de homologação e futura produção Railway/MySQL têm
ciclos próprios, descritos na [arquitetura](architecture/fase2-ambientes.md).
Esta consolidação não publica alterações nem modifica infraestrutura.

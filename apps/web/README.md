# Front-end — Site Valhalla Club

Landing institucional do MVP, construída com Next.js 16, React 19, TypeScript, Tailwind CSS 4 e Embla Carousel.

MVP publicado na Vercel: [clubevalhalla.vercel.app](https://clubevalhalla.vercel.app/).
O frontend também integra a arquitetura de homologação da Fase 2, sem tornar
a landing atual dependente da API.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Ambiente

Copie `.env.example` para `.env.local`. As variáveis disponíveis são `SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME` e `NEXT_PUBLIC_APP_ENV`.

`SITE_URL` deve ser a URL HTTPS pública real em produção, pois alimenta metadata, canonical, Open Graph e JSON-LD. A landing atual não consome a API em runtime.

Consulte a [documentação do projeto](../../README.md), o
[setup local](../../docs/setup-local.md), o
[deploy atual na Vercel](../../docs/deploy-vercel.md) e a
[arquitetura da Fase 2](../../docs/architecture/fase2-ambientes.md).
Variáveis do frontend são administradas pela Vercel; nenhuma variável pública
deve conter secrets. Netlify permanece apenas como histórico não operacional.

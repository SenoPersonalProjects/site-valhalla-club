# Front-end — Site Valhalla Club

Landing institucional do MVP, construída com Next.js 16, React 19, TypeScript, Tailwind CSS 4 e Embla Carousel.

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

Consulte a [documentação do projeto](../../README.md), o [setup local](../../docs/setup-local.md) e a [preparação para Netlify](../../docs/deploy-netlify.md).

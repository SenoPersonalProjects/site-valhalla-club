# Preparação de deploy no Netlify

Este documento registra somente o que já está definido para a publicação planejada do MVP. O MVP ainda não está publicado.

## Escopo do deploy

- aplicação: `apps/web`;
- branch de produção: `main`;
- plataforma planejada: Netlify.

Os detalhes operacionais de base directory, comando de build, nome do site e domínio são **a confirmar durante a preparação de produção**.

## Variável necessária

Configure `SITE_URL` com a URL HTTPS pública real do deploy. Não use uma URL fictícia.

Essa variável é usada pelo front-end para `metadataBase`, canonical, Open Graph e JSON-LD. Sem `SITE_URL`, o código pode cair em `http://localhost:3000` quando a variável específica da Vercel também não estiver presente.

## Antes da release

1. Validar o build do front-end.
2. Confirmar a configuração de `SITE_URL`.
3. Publicar `main` após a validação de `develop`.
4. Registrar a configuração real definida no Netlify.

## Smoke test pós-deploy

- abrir a landing e navegar pelos links internos;
- confirmar o CTA de WhatsApp e os links sociais;
- conferir menu mobile, carrossel e estado vazio de mesas;
- verificar canonical, Open Graph e JSON-LD com a URL pública;
- registrar a URL pública final e a data/hora efetiva da release.

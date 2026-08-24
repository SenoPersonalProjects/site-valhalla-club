# Header e Hero da landing page

## Objetivo

Registrar somente a implementação final do Header e do Hero da página inicial do Valhalla Club.

As decisões gerais de cores, tipografia, tokens e direção visual permanecem documentadas no [Design System](design-system.md).

## Alterações implementadas

### Header

O Header passou a oferecer:

- comportamento `sticky` com fundo translúcido, desfoque e destaque visual na borda inferior;
- identificação da marca em duas linhas, com retorno para `#inicio`;
- navegação desktop para `#sobre`, `#eventos` e `#equipe`;
- CTA "Entrar em contato" direcionado para `#contato`;
- menu mobile controlado por estado e exibido abaixo do breakpoint `lg`;
- fechamento do menu ao selecionar a marca, um item de navegação ou o CTA;

### Hero

O conteúdo e o espaço visual provisórios foram substituídos por:

- título "A próxima grande história pode ser a sua.";
- subtítulo "Prepare sua ficha e venha descobrir mundos, desafios e companheiros de aventura.";
- CTA único "Entre para o Valhalla";
- convite para a comunidade no WhatsApp, aberto em uma nova aba.

A arte do Hero é carregada com `next/image`, possui prioridade de carregamento e usa `alt=""` por ser decorativa. Gradientes sobrepostos preservam a leitura do conteúdo e integram a imagem ao fundo da página.

### Responsividade

- O título varia de `36px` no mobile até `72px` em telas grandes.
- O subtítulo utiliza `20px` no mobile e `22px` a partir de `sm`.
- O CTA ocupa a largura disponível no mobile e passa a ter largura automática a partir de `sm`.
- A arte ocupa toda a área no mobile e fica alinhada à direita no desktop, com largura de `72%` em `lg` e `62%` em `xl`.
- A navegação completa aparece a partir de `lg`; abaixo desse breakpoint, é utilizado o menu expansível.

### Estilos compartilhados

Foram adicionadas ao `globals.css`:

- `.valhalla-cut-corners`, responsável pelos cantos recortados de CTAs, itens e controle do menu;
- `.valhalla-cut-corners:focus-visible`, que mantém o contorno de teclado adequado ao recorte;
- `.valhalla-hero`, que compõe o fundo do Hero com gradientes baseados nos tokens do projeto.

## Arquivos da entrega

- `apps/web/src/app/globals.css`
- `apps/web/src/components/landing/Header.tsx`
- `apps/web/src/components/landing/HeroSection.tsx`
- `apps/web/public/images/valhalla-hero-v2.png`

A imagem adicionada possui dimensões de `1672 × 941px`.

## Validação

Execute na pasta `apps/web`:

```bash
npm run lint
npm run build
```

Também devem ser conferidos manualmente:

- navegação pelos links internos;
- abertura, fechamento e links do menu mobile;
- abertura do CTA do WhatsApp em uma nova aba;
- apresentação do Header e do Hero em desktop e mobile.

## Fora do escopo

Esta entrega substitui o conteúdo provisório somente do Header e do Hero. Os conteúdos das seções Sobre, Eventos e Equipe permanecem para tarefas específicas posteriores.

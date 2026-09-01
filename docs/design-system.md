# Design System — Valhalla Club

## Fonte de verdade

Os tokens vivem em `apps/web/src/app/globals.css` e as fontes são configuradas em `apps/web/src/app/layout.tsx`. Componentes devem preferir os tokens semânticos a valores HEX diretos.

## Cores e tokens

| Token | Valor atual | Uso |
| --- | --- | --- |
| `background` | `#0B0D0F` | fundo principal |
| `foreground` | `#F4F7FA` | texto principal |
| `surface` | `#14191D` | seções e cards |
| `surface-elevated` | `#1D2429` | superfícies destacadas |
| `border` | `#2D3940` | bordas e divisores |
| `primary` | `#07B0F2` | CTA, destaque e foco |
| `primary-hover` | `#1AB6D9` | hover primário |
| `secondary` | `#024059` | superfícies secundárias |
| `muted-foreground` | `#A9B4BA` | texto secundário |

`primary-foreground` é `#0B0D0F`; use-o sobre fundos `primary`.

## Tipografia

- `font-sans`: Geist para interface e corpo;
- `font-display`: Cinzel para títulos;
- `font-editorial`: Cormorant Garamond para conteúdo editorial e citações;
- `font-decorative`: MedievalSharp, somente em detalhes pontuais.

## Padrões atuais

- containers usam principalmente `max-w-7xl` e espaçamentos responsivos;
- superfícies usam `background`, `surface` e `surface-elevated`;
- bordas usam `border` e detalhes de marca podem usar `primary` com opacidade;
- `.valhalla-cut-corners` é o recorte reutilizável de CTAs e controles;
- `.valhalla-hero` compõe o fundo do Hero;
- `:focus-visible` global usa `focus` com contorno de 2px;
- `prefers-reduced-motion` remove scroll suave e os componentes usam variantes `motion-reduce` onde há transição.

## Componentes reutilizáveis

- `SectionHeader`: eyebrow, ornamentos, `h2` e descrição; usado em Eventos, Mesas e Envolvidos.
- `HorizontalCarousel`: Embla, setas, indicadores, teclado e foco visível. Não cria clones físicos; usa `slidesInView()` para aplicar `inert` a slides fora da área visível.

`TableCard` é específico de Mesas. A seção possui estado vazio quando não existem dados vigentes.

## Regras

- não remover foco visível sem alternativa equivalente;
- manter contraste, semântica e áreas de toque adequadas;
- começar por telas pequenas e evitar scroll horizontal acidental;
- não criar tokens ou paletas locais sem necessidade recorrente;
- atualizar este documento quando tokens ou componentes reutilizáveis mudarem.

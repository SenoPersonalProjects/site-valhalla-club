# Design System — Valhalla Club

## Objetivo

Registrar a fundação visual oficial utilizada no MVP da landing page do Valhalla Club, orientando as próximas implementações e evitando divergências entre componentes.

A direção visual adotada é **dark fantasy moderna**, utilizando a identidade atual do Valhalla como base.

A interface deve priorizar fundos escuros e grafite, elementos metálicos e destaques em azul, mantendo boa legibilidade e evitando excesso de elementos decorativos.

---

## Paleta da marca

Estas são as cores oficiais derivadas da identidade visual do Valhalla Club.

| Cor | HEX | Uso |
| --- | --- | --- |
| Graphite | `#262526` | Grafite oficial da marca |
| Deep Blue | `#024059` | Azul profundo e superfícies especiais |
| Valhalla Blue | `#07B0F2` | Cor primária e principal destaque |
| Valhalla Cyan | `#1AB6D9` | Hover e destaque secundário |
| Valhalla Steel | `#499CA6` | Tons metálicos e elementos secundários |

O **Valhalla Blue (`#07B0F2`)** é a principal cor de destaque da interface.

Ele deve ser usado principalmente em:

- CTAs;
- links ativos;
- estados de foco;
- tags;
- detalhes visuais;
- elementos que precisam chamar atenção.

O azul não deve ser utilizado de forma excessiva como fundo dominante da página.

---

## Cores funcionais da interface

Além das cores oficiais da marca, a interface utiliza cores neutras para backgrounds, superfícies, bordas e textos.

| Cor | HEX | Uso |
| --- | --- | --- |
| Black | `#0B0D0F` | Fundo principal |
| Surface | `#14191D` | Seções e cards |
| Surface Elevated | `#1D2429` | Cards e elementos destacados |
| Border | `#2D3940` | Bordas e divisores |
| Silver White | `#F4F7FA` | Texto principal |
| Metal Gray | `#A9B4BA` | Texto secundário |

Essas cores são funcionais da interface e não substituem as cores oficiais da marca.

---

## Tokens semânticos

Os componentes devem utilizar preferencialmente tokens semânticos em vez de valores de cor diretamente.

### Background e texto

- `background`
- `foreground`

Exemplo:

```tsx
<main className="bg-background text-foreground">
```

### Superfícies

- `surface`
- `surface-elevated`

Exemplo:

```tsx
<article className="bg-surface border border-border">
```

### Cor primária

- `primary`
- `primary-hover`
- `primary-foreground`

Exemplo:

```tsx
<button className="bg-primary text-primary-foreground hover:bg-primary-hover">
  Entrar em contato
</button>
```

### Cor secundária

- `secondary`
- `secondary-foreground`

### Accent

- `accent`
- `accent-foreground`

### Elementos neutros

- `muted`
- `muted-foreground`
- `border`
- `focus`

---

## Tipografia

A identidade utiliza quatro famílias tipográficas com responsabilidades diferentes.

### Geist

Utilizada para:

- textos de corpo;
- navegação;
- botões;
- labels;
- informações de cards;
- elementos de interface.

Token:

```txt
font-sans
```

Exemplo:

```tsx
<p className="font-sans text-muted-foreground">
  Texto da interface.
</p>
```

---

### Cinzel

Utilizada para:

- títulos principais;
- títulos de seções;
- headings;
- chamadas de impacto relacionadas à identidade.

Token:

```txt
font-display
```

Exemplo:

```tsx
<h1 className="font-display text-foreground">
  Valhalla Club
</h1>
```

---

### Cormorant Garamond

Utilizada para:

- textos editoriais;
- frases de destaque;
- citações;
- apresentações institucionais.

Token:

```txt
font-editorial
```

Exemplo:

```tsx
<p className="font-editorial text-xl text-muted-foreground">
  Uma comunidade onde histórias ganham vida.
</p>
```

---

### MedievalSharp

Fonte decorativa.

Deve ser utilizada apenas em situações pontuais, como:

- pequenos ornamentos;
- elementos temáticos;
- detalhes especiais.

Token:

```txt
font-decorative
```

Não utilizar MedievalSharp em:

- parágrafos;
- menus;
- botões;
- informações importantes;
- textos longos.

---

## Backgrounds e superfícies

A landing utiliza uma hierarquia simples de superfícies.

### Fundo principal

```txt
bg-background
```

Uso:

- Hero;
- áreas principais;
- Footer;
- seções mais escuras.

### Superfície

```txt
bg-surface
```

Uso:

- seções alternadas;
- cards simples.

### Superfície elevada

```txt
bg-surface-elevated
```

Uso:

- cards destacados;
- blocos que precisam de maior separação visual.

Não criar novos tons de fundo diretamente nos componentes sem necessidade.

---

## Bordas

Utilizar preferencialmente:

```txt
border-border
```

Para elementos ligados diretamente à identidade da marca, pode ser utilizado:

```txt
border-primary
border-primary/50
border-primary/30
```

Evitar adicionar valores HEX diretamente nas bordas.

---

## Botões e CTAs

### Botão primário

O botão primário utiliza o Azul Valhalla como fundo.

```tsx
<a
  className="
    rounded-md
    bg-primary
    px-6
    py-3
    font-semibold
    text-primary-foreground
    transition-colors
    hover:bg-primary-hover
  "
>
  Fale conosco
</a>
```

O texto sobre o Azul Valhalla deve utilizar `primary-foreground`, e não branco diretamente.

### Botão secundário

```tsx
<a
  className="
    rounded-md
    border
    border-border
    bg-surface-elevated
    text-foreground
    transition-colors
    hover:border-primary
    hover:text-primary
  "
>
  Ver eventos
</a>
```

---

## Cards

O padrão inicial dos cards utiliza:

```txt
bg-surface
bg-surface-elevated
border-border
text-foreground
text-muted-foreground
```

Exemplo:

```tsx
<article className="rounded-lg border border-border bg-surface p-6">
  <h3 className="font-display text-xl text-foreground">
    Título
  </h3>

  <p className="mt-3 text-muted-foreground">
    Descrição do conteúdo.
  </p>
</article>
```

Cards não devem criar paletas próprias.

---

## Hover e Focus

Elementos interativos devem possuir indicação visual de interação.

O hover deve utilizar principalmente:

```txt
primary
primary-hover
foreground
```

O estado global de foco utiliza a cor:

```txt
focus
```

Nunca remover indicadores de foco sem fornecer uma alternativa visível.

---

## Layout das seções

As principais seções da landing devem utilizar como referência o mesmo limite de largura e os mesmos espaçamentos horizontais:

```txt
max-w-7xl
px-6
sm:px-10
lg:px-12
```

Seções devem evitar containers com larguras arbitrariamente diferentes sem uma justificativa de composição ou conteúdo.

---

## Cabeçalhos de seção

O componente `apps/web/src/components/ui/SectionHeader.tsx` é o padrão para cabeçalhos das seções institucionais.

Sua composição utiliza:

1. eyebrow;
2. losango e linha decorativa;
3. título;
4. descrição;
5. conteúdo empilhado no mobile;
6. título e descrição distribuídos em duas colunas em telas grandes.

Exemplo:

```tsx
<SectionHeader
  eyebrow="Aventuras em andamento"
  title="Mesas rolando"
  description="Conheça as campanhas conduzidas pela comunidade."
  id="mesas-heading"
/>
```

O componente é utilizado em:

- Eventos;
- Mesas;
- Envolvidos.

São exceções, por possuírem composições próprias:

- Hero;
- Sobre;
- Contato/Footer.

---

## Responsividade

- Começar pelo comportamento em telas pequenas.
- Não permitir scroll horizontal acidental.
- Múltiplas colunas devem convergir para uma coluna no mobile.
- Evitar larguras fixas desnecessárias.
- Manter áreas de interação adequadas para toque e outros dispositivos de entrada.
- Carrosséis devem funcionar com toque, teclado e controles visíveis.

---

## Estados de interface

Listas e coleções devem prever um estado vazio:

```tsx
items.length > 0 ? <Content /> : <EmptyState />
```

Estados de loading e error devem ser adicionados quando houver consumo dinâmico de API.

---

## Componentes reutilizáveis

Antes de criar um novo componente, verificar os recursos existentes em `src/components/ui`.

Componentes disponíveis incluem:

- `HorizontalCarousel` — carrossel horizontal reutilizável;
- `SectionHeader` — cabeçalho padrão das seções.

Componentes específicos de domínio, como `TableCard`, podem permanecer próximos da feature que os utiliza.

---

## Regras de implementação

- Evitar HEX hardcoded nos componentes.
- Preferir tokens semânticos.
- Utilizar `font-display` para títulos.
- Utilizar `font-editorial` para textos editoriais e citações.
- Utilizar `font-sans` para interface e corpo.
- Utilizar `font-decorative` apenas em detalhes pontuais.
- Utilizar `primary-foreground` sobre backgrounds `primary`.
- Preferir `border-border` para bordas comuns.
- Novos componentes devem reutilizar a hierarquia de superfícies existente.
- O Azul Valhalla deve funcionar como destaque, e não como cor dominante da página.
- Evitar criar novos tokens sem uma necessidade recorrente.
- Mudanças no design system devem ser refletidas neste documento.

---

## Evitar

Não utilizar:

```tsx
className="bg-[#024059] text-[#F4F7FA] border-[#499CA6]"
```

Preferir:

```tsx
className="bg-secondary text-secondary-foreground border-border"
```

O componente deve conhecer a **função visual** da cor e não seu valor hexadecimal.

---

## Referências visuais

A landing pode utilizar como referência de atmosfera e composição:

- D&D Beyond;
- Critical Role.

As referências servem como inspiração para apresentação de campanhas, comunidade, eventos e atmosfera fantástica.

Não devem ser copiadas diretamente.

---

## Direção visual resumida

O resultado esperado deve transmitir:

- dark fantasy moderna;
- fantasia medieval sem excesso visual;
- atmosfera escura;
- metal e grafite;
- magia e destaques azuis;
- leitura clara;
- componentes modernos;
- identidade própria do Valhalla Club.

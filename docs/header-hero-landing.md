# Header e Hero da landing

Documento específico da implementação atual; cores, tokens e tipografia gerais estão em [design-system.md](design-system.md).

## Header

- sticky, com fundo translúcido e borda de destaque;
- marca com link para `#inicio`;
- navegação desktop para `#sobre`, `#eventos`, `#mesas` e `#equipe`;
- CTA para `#contato`;
- menu mobile abaixo de `lg`.

O botão mobile preserva `aria-controls="mobile-navigation"` e `aria-expanded`. O menu fecha pelo botão, pelos links e por Escape; Escape devolve o foco ao botão.

## Hero

- título: “A próxima grande história pode ser a sua.”;
- CTA “Entre para o Valhalla” para a comunidade de WhatsApp, em nova aba;
- imagem `/images/valhalla-hero-v2.png` carregada por `next/image`;
- arte decorativa com `alt=""` e gradientes para legibilidade.

## Responsividade e validação

O menu completo aparece em `lg`; abaixo disso, o menu expansível é usado. O Hero ajusta tipografia, largura de CTA e posicionamento da arte entre mobile e desktop.

Ao alterar estes componentes, validar links internos, CTA externo, abertura/fechamento do menu mobile, Escape, retorno de foco e foco visível.

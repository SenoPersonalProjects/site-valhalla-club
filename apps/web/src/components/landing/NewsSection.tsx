"use client";

import { useEffect, useRef, useState } from "react";

const STICKY_TOP_OFFSET = 72;

const newsItems = [
  {
    title: "Card de exemplo 01",
    tag: "Categoria",
    description:
      "Resumo provisório para indicar onde entrará uma notícia, evento ou chamada.",
    meta: "01",
  },
  {
    title: "Card de exemplo 02",
    tag: "Categoria",
    description:
      "Resumo provisório para indicar onde entrará uma notícia, evento ou chamada.",
    meta: "02",
  },
  {
    title: "Card de exemplo 03",
    tag: "Categoria",
    description:
      "Resumo provisório para indicar onde entrará uma notícia, evento ou chamada.",
    meta: "03",
  },
  {
    title: "Card de exemplo 04",
    tag: "Categoria",
    description:
      "Resumo provisório para indicar onde entrará uma notícia, evento ou chamada.",
    meta: "04",
  },
];

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function NewsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [sectionHeight, setSectionHeight] = useState<number | null>(null);
  const [translateX, setTranslateX] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const section = sectionRef.current;
      const viewport = viewportRef.current;
      const track = trackRef.current;

      if (!section || !viewport || !track || window.innerWidth < 1024) {
        setSectionHeight(null);
        setTranslateX(0);
        return;
      }

      const sectionTop = section.offsetTop;
      const stickyViewportHeight = Math.max(
        window.innerHeight - STICKY_TOP_OFFSET,
        1,
      );
      const maxTranslate = Math.max(track.scrollWidth - viewport.clientWidth, 0);
      const nextSectionHeight = Math.ceil(stickyViewportHeight + maxTranslate);
      const scrollRange = Math.max(maxTranslate, 1);
      const rawProgress =
        (window.scrollY - sectionTop + STICKY_TOP_OFFSET) / scrollRange;

      setSectionHeight((currentHeight) =>
        Math.abs((currentHeight ?? 0) - nextSectionHeight) > 1
          ? nextSectionHeight
          : currentHeight,
      );
      setTranslateX(clamp(rawProgress) * maxTranslate);
    };

    const requestUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  return (
    <section
      className="border-b border-[#1e1c19] bg-[#0d0b09]"
      id="eventos"
      ref={sectionRef}
      style={sectionHeight ? { height: sectionHeight } : undefined}
    >
      <div className="mx-auto max-w-7xl px-6 py-28 sm:px-10 lg:sticky lg:top-18 lg:flex lg:h-[calc(100vh-72px)] lg:flex-col lg:justify-center lg:px-12 lg:py-0">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
            Eventos e notícias
          </p>
          <h2 className="mt-5 font-serif text-4xl leading-tight text-[#f0ebe0] sm:text-5xl">
            Título provisório para eventos e notícias.
          </h2>
        </div>

        <div
          className="mt-14 overflow-hidden lg:-mx-12 lg:px-12"
          ref={viewportRef}
        >
          <div
            className="grid gap-5 md:grid-cols-2 lg:flex lg:w-max lg:gap-6 lg:will-change-transform"
            ref={trackRef}
            style={{ transform: `translate3d(-${translateX}px, 0, 0)` }}
          >
            {newsItems.map((item, index) => (
              <article
                className="overflow-hidden rounded-lg border border-[#2a2420] bg-[#141210] lg:w-190"
                key={item.title}
              >
                <div className="grid min-h-90 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="relative min-h-64 border-b border-[#2a2420] bg-[#1a1612] lg:border-b-0 lg:border-r">
                    <div className="absolute inset-0 bg-[linear-gradient(#c9a84c06_1px,transparent_1px),linear-gradient(90deg,#c9a84c06_1px,transparent_1px)] bg-size-[36px_36px]" />
                    <div className="absolute inset-6 rounded border border-[#c9a84c]/15" />
                    <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded border border-[#c9a84c]/25 bg-[#c9a84c]/5" />
                    <div className="absolute bottom-8 left-8 rounded border border-[#3a3028] bg-[#0c0a09]/95 px-3 py-2 text-xs font-semibold text-[#8a7d6e]">
                      {item.meta}
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <div className="border-b border-[#2a2420] p-6">
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
                        {item.tag}
                      </p>
                      <h3 className="mt-4 font-serif text-3xl font-semibold text-[#f0ebe0]">
                        {item.title}
                      </h3>
                    </div>
                    <p className="border-b border-[#2a2420] p-6 text-base leading-7 text-[#8a7d6e]">
                      {item.description}
                    </p>
                    <div className="grid grid-cols-3 border-b border-[#2a2420] text-center">
                      {["Info", "Data", "Status"].map((label) => (
                        <div
                          className="border-r border-[#2a2420] p-5 last:border-r-0"
                          key={`${item.title}-${label}`}
                        >
                          <p className="font-serif text-2xl font-semibold text-[#f0ebe0]">
                            {index + 1}
                          </p>
                          <p className="mt-1 text-xs text-[#6a5d50]">
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="p-6">
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#c9a84c]">
                        Observação
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#8a7d6e]">
                        Espaço reservado para detalhes provisórios do card.
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

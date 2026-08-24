"use client";

import useEmblaCarousel from "embla-carousel-react";
import {
  Children,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";

type HorizontalCarouselProps = {
  ariaLabel: string;
  autoplay?: {
    delayMs: number;
  };
  children: ReactNode;
  logicalSlideCount?: number;
  loop?: boolean;
  slideClassName: string;
};

function CarouselArrow({
  direction,
}: {
  direction: "left" | "right";
}) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 transition-transform duration-200 motion-reduce:transition-none group-hover:translate-x-[var(--arrow-shift)]"
      fill="none"
      style={
        {
          "--arrow-shift": direction === "left" ? "-2px" : "2px",
        } as CSSProperties
      }
      viewBox="0 0 24 24"
    >
      <path
        d={
          direction === "left"
            ? "M19 12H5m5-5-5 5 5 5"
            : "M5 12h14m-5-5 5 5-5 5"
        }
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function HorizontalCarousel({
  ariaLabel,
  autoplay,
  children,
  logicalSlideCount,
  loop,
  slideClassName,
}: HorizontalCarouselProps) {
  const slides = Children.toArray(children);

  const itemCount = Math.max(
    1,
    Math.min(logicalSlideCount ?? slides.length, slides.length),
  );

  const logicalSlides = slides.slice(0, itemCount);

  const hasAutoplay = Boolean(autoplay && itemCount > 1);

  /*
   * O loop pode existir independentemente do autoplay.
   *
   * Quando `loop` não é informado, mantemos o comportamento anterior:
   * carrosséis com autoplay também possuem loop.
   *
   * Exemplos:
   *
   * Eventos:
   * autoplay = true
   * loop não informado
   * => loop ativo
   *
   * Mesas:
   * autoplay = false
   * loop = true
   * => loop ativo sem rotação automática
   */
  const shouldLoop = Boolean(
    (loop ?? hasAutoplay) && itemCount > 1,
  );

  const physicalSlides = logicalSlides;

  const [carouselRef, carouselApi] =
    useEmblaCarousel({
      align: "start",
      containScroll: "trimSnaps",
      duration: 42,
      loop: shouldLoop,
      slidesToScroll: 1,
    });

  const [currentSlide, setCurrentSlide] =
    useState(0);

  const [
    canScrollPrevious,
    setCanScrollPrevious,
  ] = useState(false);

  const [
    canScrollNext,
    setCanScrollNext,
  ] = useState(false);

  const [isPlaying, setIsPlaying] =
    useState(hasAutoplay);

  const [isHovered, setIsHovered] =
    useState(false);

  const autoplayIsRunning =
    hasAutoplay &&
    isPlaying &&
    !isHovered;

  useEffect(() => {
    if (!carouselApi) return;

    const updateCarouselState = () => {
      const physicalIndex =
        carouselApi.selectedScrollSnap();

      setCurrentSlide(
        physicalIndex % itemCount,
      );

      setCanScrollPrevious(
        carouselApi.canScrollPrev(),
      );

      setCanScrollNext(
        carouselApi.canScrollNext(),
      );
    };

    carouselApi.on(
      "select",
      updateCarouselState,
    );

    carouselApi.on(
      "reInit",
      updateCarouselState,
    );

    updateCarouselState();

    return () => {
      carouselApi.off(
        "select",
        updateCarouselState,
      );

      carouselApi.off(
        "reInit",
        updateCarouselState,
      );
    };
  }, [carouselApi, itemCount]);

  useEffect(() => {
    if (
      !carouselApi ||
      !autoplayIsRunning
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => {
        carouselApi.scrollNext();
      },
      autoplay?.delayMs ?? 7000,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    autoplay?.delayMs,
    autoplayIsRunning,
    carouselApi,
    currentSlide,
  ]);

  const toggleAutoplay = () => {
    setIsPlaying(
      (playing) => !playing,
    );
  };

  const scrollPrevious = () => {
    carouselApi?.scrollPrev();
  };

  const scrollNext = () => {
    carouselApi?.scrollNext();
  };

  const goToLogicalSlide = (
    index: number,
  ) => {
    carouselApi?.scrollTo(index);
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-roledescription="carrossel"
      className="relative min-w-0 max-w-full"
      onMouseEnter={() =>
        setIsHovered(true)
      }
      onMouseLeave={() =>
        setIsHovered(false)
      }
      role="region"
    >
      <div
        aria-live={
          autoplayIsRunning
            ? "off"
            : "polite"
        }
        className="w-full max-w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        onKeyDown={(event) => {
          if (
            event.key === "ArrowLeft"
          ) {
            event.preventDefault();
            scrollPrevious();
          }

          if (
            event.key === "ArrowRight"
          ) {
            event.preventDefault();
            scrollNext();
          }
        }}
        ref={carouselRef}
        tabIndex={0}
      >
        <ul className="flex w-full touch-pan-y items-stretch gap-4 lg:gap-5">
          {physicalSlides.map(
            (slide, index) => (
              <li
                aria-label={`${
                  (index % itemCount) + 1
                } de ${itemCount}`}
                aria-roledescription="slide"
                className={`flex min-w-0 max-w-full last:mr-4 lg:last:mr-5 ${slideClassName}`}
                key={`carousel-physical-${index}`}
                role="group"
              >
                {slide}
              </li>
            ),
          )}
        </ul>
      </div>

      {itemCount > 1 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
          <div
            aria-label="Selecionar item do carrossel"
            className="flex gap-1.5"
            role="group"
          >
            {logicalSlides.map(
              (slide, index) => (
                <button
                  aria-current={
                    currentSlide === index
                      ? "true"
                      : undefined
                  }
                  aria-label={`Ir para o item ${
                    index + 1
                  }`}
                  className="group flex h-8 w-9 touch-manipulation items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  key={`pagination-${
                    isValidElement(slide)
                      ? (slide.key ?? index)
                      : index
                  }`}
                  onClick={() =>
                    goToLogicalSlide(index)
                  }
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`h-px w-full transition-colors ${
                      currentSlide === index
                        ? "bg-primary"
                        : "bg-border group-hover:bg-primary/50"
                    }`}
                  />
                </button>
              ),
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasAutoplay ? (
              <button
                aria-label={
                  isPlaying
                    ? "Pausar rotação automática"
                    : "Continuar rotação automática"
                }
                className="mr-1 flex min-h-11 touch-manipulation items-center gap-2 rounded px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={
                  toggleAutoplay
                }
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    autoplayIsRunning
                      ? "bg-primary shadow-[0_0_10px_currentColor]"
                      : "bg-muted-foreground"
                  }`}
                />

                {!isPlaying
                  ? "Pausado"
                  : isHovered
                    ? "Pausa no hover"
                    : "Em rotação"}
              </button>
            ) : null}

            <button
              aria-label="Ver item anterior"
              className="group flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-border text-muted-foreground transition-[border-color,color,background-color] hover:border-primary/70 hover:bg-surface-elevated hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-30"
              disabled={
                !canScrollPrevious
              }
              onClick={scrollPrevious}
              type="button"
            >
              <CarouselArrow direction="left" />
            </button>

            <button
              aria-label="Ver próximo item"
              className="group flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-primary/60 text-primary transition-[border-color,color,background-color] hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-30"
              disabled={!canScrollNext}
              onClick={scrollNext}
              type="button"
            >
              <CarouselArrow direction="right" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

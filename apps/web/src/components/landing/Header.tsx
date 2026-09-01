"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { label: "Sobre", href: "#sobre" },
  { label: "Eventos", href: "#eventos" },
  { label: "Mesas", href: "#mesas" },
  { label: "Equipe", href: "#equipe" },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setIsMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent"
      />

      <div className="mx-auto flex min-h-20 max-w-7xl items-center px-5 sm:px-10 lg:px-12">
        <a
          className="group flex items-center gap-3"
          href="#inicio"
          onClick={() => setIsMenuOpen(false)}
        >
          <Image
            alt=""
            className="size-11 shrink-0 object-contain transition-transform group-hover:scale-105 motion-reduce:transform-none sm:size-12"
            height={48}
            quality={90}
            src="/images/valhalla-wolf.png"
            width={48}
          />
          <span>
            <span className="block font-display text-base font-semibold tracking-[0.16em] text-foreground sm:text-lg">
              Valhalla
            </span>
            <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Clube de RPG
            </span>
          </span>
        </a>

        <nav
          aria-label="Navegação principal"
          className="ml-auto hidden items-center gap-6 lg:flex xl:gap-9"
        >
          {navItems.map((item) => (
            <a
              className="group relative py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              href={item.href}
              key={item.href}
            >
              {item.label}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-primary transition-transform group-hover:scale-x-100"
              />
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-8">
          <a
            className="valhalla-cut-corners hidden border border-primary/60 bg-primary/5 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground lg:inline-flex"
            href="#contato"
          >
            Entrar em contato
          </a>

          <button
            aria-controls="mobile-navigation"
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
            className="valhalla-cut-corners grid size-11 place-items-center border border-border bg-surface text-foreground transition-colors hover:border-primary hover:text-primary lg:hidden"
            onClick={() => setIsMenuOpen((current) => !current)}
            ref={menuButtonRef}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              {isMenuOpen ? (
                <path
                  d="m6 6 12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              ) : (
                <path
                  d="M4 7h16M7 12h13M4 17h16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-border/80 bg-background/98 px-5 py-5 shadow-2xl shadow-black/40 sm:px-10 lg:hidden">
          <nav
            aria-label="Navegação em dispositivos móveis"
            className="mx-auto grid max-w-7xl gap-2"
            id="mobile-navigation"
          >
            {navItems.map((item) => (
              <a
                className="valhalla-cut-corners flex items-center border border-border bg-surface/70 px-5 py-4 font-display text-sm tracking-[0.12em] text-foreground transition-colors hover:border-primary/70 hover:text-primary"
                href={item.href}
                key={item.href}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              className="valhalla-cut-corners mt-2 flex items-center justify-center bg-primary px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-primary-foreground transition-colors hover:bg-primary-hover"
              href="#contato"
              onClick={() => setIsMenuOpen(false)}
            >
              Entrar em contato
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

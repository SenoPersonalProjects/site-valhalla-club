const navItems = [
  { label: "Sobre", href: "#sobre" },
  { label: "Eventos", href: "#eventos" },
  { label: "Equipe", href: "#equipe" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:px-10 lg:grid-cols-[1fr_auto_1fr] lg:gap-6 lg:px-12">
        <a
          className="font-display text-base font-semibold tracking-wide text-foreground"
          href="#inicio"
        >
          Valhalla Clube
        </a>

        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-10 lg:flex"
        >
          {navItems.map((item) => (
            <a
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          className="justify-self-end rounded-md border border-primary/50 bg-transparent px-3 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground sm:px-4"
          href="#contato"
        >
          Contato
        </a>
      </div>
    </header>
  );
}

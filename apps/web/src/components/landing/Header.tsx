const navItems = [
  { label: "Sobre", href: "#sobre" },
  { label: "Eventos", href: "#eventos" },
  { label: "Equipe", href: "#equipe" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#2a2420] bg-[#0c0a09]/95 backdrop-blur">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:px-10 lg:grid-cols-[1fr_auto_1fr] lg:gap-6 lg:px-12">
        <a className="font-serif text-base font-semibold text-[#f0ebe0] tracking-wide" href="#inicio">
          Valhalla Clube
        </a>

        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-10 lg:flex"
        >
          {navItems.map((item) => (
            <a
              className="text-sm font-medium text-[#8a7d6e] transition-colors hover:text-[#f0ebe0]"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          className="justify-self-end rounded-md border border-[#3a3028] bg-transparent px-3 py-2 text-sm font-semibold text-[#c9a84c] transition-colors hover:border-[#c9a84c] hover:bg-[#c9a84c] hover:text-[#0c0a09] sm:px-4"
          href="#contato"
        >
          Contato
        </a>
      </div>
    </header>
  );
}

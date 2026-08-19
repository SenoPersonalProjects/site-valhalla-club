const footerLinks = [
  { label: "Sobre", href: "#sobre" },
  { label: "Eventos", href: "#eventos" },
  { label: "Equipe", href: "#equipe" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background" id="contato">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:px-10 md:flex-row md:items-center md:justify-between lg:px-12">
        <p className="font-display text-foreground">Valhalla Clube.</p>

        <nav aria-label="Links do rodapé" className="flex flex-wrap gap-5">
          {footerLinks.map((link) => (
            <a
              className="transition-colors hover:text-primary"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

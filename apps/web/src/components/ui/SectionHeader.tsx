type SectionHeaderProps = {
  description: string;
  eyebrow: string;
  id: string;
  title: string;
};

export function SectionHeader({
  description,
  eyebrow,
  id,
  title,
}: SectionHeaderProps) {
  return (
    <header className="relative grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,0.6fr)] lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-3xl">
        <div className="flex items-center gap-4 text-primary">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.14em] sm:text-base">
            {eyebrow}
          </p>

          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rotate-45 border border-primary"
          />

          <span
            aria-hidden="true"
            className="h-px w-16 bg-primary/40 sm:w-24 lg:w-32"
          />
        </div>

        <h2
          className="mt-4 scroll-mt-24 text-balance font-display text-4xl font-semibold uppercase leading-none tracking-wide text-foreground sm:text-5xl lg:text-6xl"
          id={id}
        >
          {title}
        </h2>
      </div>

      <p className="max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg lg:justify-self-end">
        {description}
      </p>
    </header>
  );
}
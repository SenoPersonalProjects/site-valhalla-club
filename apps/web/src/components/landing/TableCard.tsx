export type TableStatus = "open" | "ongoing" | "closed" | "cancelled";
export type TableArtwork = "portal" | "runes" | "citadel";
export type TableMode = "Online" | "Presencial" | "Híbrida";

export type RpgTable = {
  id: string;
  name: string;
  system: string;
  master: string;
  status: TableStatus;
  description: string;
  mode: TableMode;
  schedule: string;
  frequency: string;
  seats: {
    filled: number;
    total: number;
  };
  tags: readonly string[];
  level?: string;
  artwork: TableArtwork;
  href?: string;
  ctaLabel?: string;
};

const statusStyles: Record<
  TableStatus,
  {
    label: string;
    className: string;
  }
> = {
  open: {
    label: "Vagas abertas",
    className: "border-accent/60 bg-accent/10 text-accent",
  },
  ongoing: {
    label: "Em andamento",
    className: "border-primary/60 bg-primary/10 text-primary",
  },
  closed: {
    label: "Encerrada",
    className: "border-border bg-surface-elevated text-muted-foreground",
  },
  cancelled: {
    label: "Cancelada",
    className: "border-border bg-muted text-muted-foreground",
  },
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function TableIcon({
  name,
  className = "size-5",
}: {
  name: "users" | "mode" | "calendar" | "repeat" | "master";
  className?: string;
}) {
  const commonProps = {
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
  };

  if (name === "users") {
    return (
      <svg {...commonProps}>
        <path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20" />
        <circle cx="10" cy="7.5" r="3.5" />
        <path d="M17 11a3 3 0 0 0 0-6M19 20v-1.5a4 4 0 0 0-2.5-3.7" />
      </svg>
    );
  }

  if (name === "mode") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3c2.1 2.4 3.2 5.4 3.2 9S14.1 18.6 12 21M12 3c-2.1 2.4-3.2 5.4-3.2 9S9.9 18.6 12 21" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...commonProps}>
        <path d="M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
        <path d="M8 12h3M13 12h3M8 16h3M13 16h3" />
      </svg>
    );
  }

  if (name === "repeat") {
    return (
      <svg {...commonProps}>
        <path d="m17 2 3 3-3 3" />
        <path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3" />
        <path d="M20 13v2a4 4 0 0 1-4 4H4" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </svg>
  );
}

function TableArtwork({ variant }: { variant: TableArtwork }) {
  const sharedClassName =
    "absolute inset-0 h-full w-full text-primary opacity-80";

  if (variant === "runes") {
    return (
      <svg
        aria-hidden="true"
        className={sharedClassName}
        fill="none"
        viewBox="0 0 640 360"
      >
        <circle
          cx="320"
          cy="180"
          r="108"
          stroke="currentColor"
          strokeOpacity=".22"
          strokeWidth="2"
        />
        <circle
          cx="320"
          cy="180"
          r="72"
          stroke="currentColor"
          strokeOpacity=".42"
        />
        <path
          d="m320 78 28 48-28 24-28-24 28-48Zm-84 65 34 12-10 35-38-10 14-37Zm168 0-34 12 10 35 38-10-14-37ZM260 242l34-18 26 32-38 22-22-36Zm120 0-34-18-26 32 38 22 22-36Z"
          stroke="currentColor"
          strokeOpacity=".55"
          strokeWidth="2"
        />
        <path
          d="M158 288h324M188 304h264"
          stroke="currentColor"
          strokeOpacity=".14"
        />
      </svg>
    );
  }

  if (variant === "citadel") {
    return (
      <svg
        aria-hidden="true"
        className={sharedClassName}
        fill="none"
        viewBox="0 0 640 360"
      >
        <path
          d="M90 286h460M150 286V176l54-34 42 26 74-76 74 76 42-26 54 34v110"
          stroke="currentColor"
          strokeOpacity=".34"
          strokeWidth="2"
        />
        <path
          d="M246 286V168h148v118M288 286v-70h64v70M320 92v124"
          stroke="currentColor"
          strokeOpacity=".52"
          strokeWidth="2"
        />
        <path
          d="m320 62 12 22-12 18-12-18 12-22Z"
          fill="currentColor"
          fillOpacity=".45"
        />
        <path
          d="M120 286 46 230M520 286l74-56M90 230 28 194M550 230l62-36"
          stroke="currentColor"
          strokeOpacity=".14"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={sharedClassName}
      fill="none"
      viewBox="0 0 640 360"
    >
      <circle
        cx="320"
        cy="180"
        r="116"
        stroke="currentColor"
        strokeOpacity=".18"
        strokeWidth="2"
      />
      <circle
        cx="320"
        cy="180"
        r="84"
        stroke="currentColor"
        strokeOpacity=".35"
      />
      <circle
        cx="320"
        cy="180"
        r="48"
        fill="currentColor"
        fillOpacity=".05"
        stroke="currentColor"
        strokeOpacity=".65"
        strokeWidth="2"
      />
      <path
        d="M320 64v56M320 240v56M204 180h56M380 180h56M238 98l40 40M362 222l40 40M402 98l-40 40M278 222l-40 40"
        stroke="currentColor"
        strokeOpacity=".42"
        strokeWidth="2"
      />
      <path
        d="m320 136 28 44-28 44-28-44 28-44Z"
        fill="currentColor"
        fillOpacity=".18"
        stroke="currentColor"
        strokeOpacity=".75"
        strokeWidth="2"
      />
    </svg>
  );
}

export function TableCard({ table }: { table: RpgTable }) {
  const status = statusStyles[table.status];
  const availableSeats = Math.max(table.seats.total - table.seats.filled, 0);
  const initials = getInitials(table.master);

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-primary/50">
      <div className="relative aspect-[16/9] overflow-hidden border-b border-border bg-surface-elevated">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-br from-secondary/80 via-surface-elevated to-background"
        />
        <div
          aria-hidden="true"
          className="valhalla-grid absolute inset-0 opacity-40"
        />
        <TableArtwork variant={table.artwork} />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-background/80 via-transparent to-transparent"
        />

        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
          <span
            className={`rounded border px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm ${status.className}`}
          >
            {status.label}
          </span>

          <span className="rounded border border-border/80 bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur-sm">
            {availableSeats} {availableSeats === 1 ? "vaga" : "vagas"}
          </span>
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <p className="max-w-[70%] rounded border border-primary/30 bg-background/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary backdrop-blur-sm">
            {table.system}
          </p>

          {table.level ? (
            <p className="rounded border border-border/80 bg-background/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
              {table.level}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-editorial text-2xl font-semibold leading-tight text-balance text-foreground sm:text-3xl">
          {table.name}
        </h3>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-pretty text-muted-foreground sm:text-base">
          {table.description}
        </p>

        {table.tags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Características">
            {table.tags.slice(0, 4).map((tag) => (
              <li
                className="rounded border border-border bg-surface-elevated px-2.5 py-1 text-xs text-muted-foreground"
                key={tag}
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex items-center gap-3 border-t border-border pt-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/30 bg-secondary font-display text-sm font-semibold text-primary">
            {initials || "GM"}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Mestre
            </p>
            <p className="truncate font-semibold text-foreground">
              {table.master}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-y border-border py-5 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-3">
            <dt className="sr-only">Jogadores</dt>
            <TableIcon className="mt-0.5 size-5 shrink-0 text-primary" name="users" />
            <dd>
              <span className="font-semibold text-foreground">
                {table.seats.filled}/{table.seats.total}
              </span>{" "}
              jogadores
            </dd>
          </div>

          <div className="flex min-w-0 items-start gap-3">
            <dt className="sr-only">Modalidade</dt>
            <TableIcon className="mt-0.5 size-5 shrink-0 text-primary" name="mode" />
            <dd>{table.mode}</dd>
          </div>

          <div className="flex min-w-0 items-start gap-3">
            <dt className="sr-only">Dia e horário</dt>
            <TableIcon
              className="mt-0.5 size-5 shrink-0 text-primary"
              name="calendar"
            />
            <dd>{table.schedule}</dd>
          </div>

          <div className="flex min-w-0 items-start gap-3">
            <dt className="sr-only">Periodicidade</dt>
            <TableIcon
              className="mt-0.5 size-5 shrink-0 text-primary"
              name="repeat"
            />
            <dd>{table.frequency}</dd>
          </div>
        </dl>

        <a
          className="valhalla-cut-corners mt-5 inline-flex min-h-12 items-center justify-center border border-primary/60 bg-primary/5 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          href={table.href ?? "#contato"}
        >
          {table.ctaLabel ??
            (table.status === "open" ? "Quero participar" : "Falar com o Valhalla")}
        </a>
      </div>
    </article>
  );
}

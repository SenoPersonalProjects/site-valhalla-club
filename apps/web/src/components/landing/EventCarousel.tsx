"use client";

import Image from "next/image";

import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";

type EventStatus = "open" | "confirmed" | "upcoming" | "completed";
type EventArtwork = "anniversary" | "welcome" | "winter";
type EventCategory = "celebration" | "meeting" | "special";
type EventCardVariant = "featured" | "standard";

export type ClubEvent = {
  id: string;
  name: string;
  date?: string;
  dateLabel?: string;
  time?: string;
  location: string;
  description: string;
  details?: string;
  status: EventStatus;
  category: EventCategory;
  artwork: EventArtwork;
  image?: {
    src: string;
    alt: string;
    position?: "center" | "top";
    fit?: "cover" | "contain";
  };
};

type EventCarouselProps = {
  events: readonly ClubEvent[];
};

const eventDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const statusStyles: Record<
  EventStatus,
  { label: string; className: string }
> = {
  open: {
    label: "Inscrições abertas",
    className: "border-accent/60 bg-accent/5 text-accent",
  },
  confirmed: {
    label: "Confirmado",
    className: "border-primary/60 bg-primary/5 text-primary",
  },
  upcoming: {
    label: "Em breve",
    className: "border-primary/30 bg-primary/5 text-primary",
  },
  completed: {
    label: "Realizado",
    className: "border-border bg-surface-elevated text-muted-foreground",
  },
};

const categoryLabels: Record<EventCategory, string> = {
  celebration: "Celebração",
  meeting: "Encontro do clube",
  special: "Evento especial",
};

function formatEventDate(date: string) {
  const parts = eventDateFormatter.formatToParts(
    new Date(`${date}T12:00:00Z`),
  );
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts
    .find((part) => part.type === "month")
    ?.value.replace(".", "");
  const year = parts.find((part) => part.type === "year")?.value;

  return [day, month, year].filter(Boolean).join(" ");
}

function formatEventTime(time: string) {
  const [hours, minutes] = time.split(":");
  return minutes === "00" ? `${hours}h` : `${hours}h${minutes}`;
}

function EventIcon({
  name,
  className = "h-5 w-5",
}: {
  name: "calendar" | "location";
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

  if (name === "calendar") {
    return (
      <svg {...commonProps}>
        <path d="M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1ZM8 12h3M13 12h3M8 16h3M13 16h3" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function EventArtwork({ variant }: { variant: EventArtwork }) {
  const sharedClassName =
    "absolute inset-0 h-full w-full text-primary opacity-75";

  if (variant === "anniversary") {
    return (
      <svg
        aria-hidden="true"
        className={sharedClassName}
        fill="none"
        viewBox="0 0 640 400"
      >
        <path
          d="M90 310h460M145 310v-95h350v95M185 215v-50h270v50"
          stroke="currentColor"
          strokeOpacity=".28"
          strokeWidth="2"
        />
        <path
          d="M208 310v-70M272 310v-70M368 310v-70M432 310v-70"
          stroke="currentColor"
          strokeOpacity=".18"
        />
        <path
          d="M238 215c0-44 36-80 82-80s82 36 82 80"
          stroke="currentColor"
          strokeOpacity=".55"
          strokeWidth="3"
        />
        <path
          d="m320 79 12 24-12 18-12-18 12-24ZM246 115l9 18-9 14-9-14 9-18ZM394 115l9 18-9 14-9-14 9-18Z"
          fill="currentColor"
          fillOpacity=".42"
        />
        <circle
          cx="320"
          cy="216"
          r="52"
          stroke="currentColor"
          strokeOpacity=".28"
        />
      </svg>
    );
  }

  if (variant === "welcome") {
    return (
      <svg
        aria-hidden="true"
        className={sharedClassName}
        fill="none"
        viewBox="0 0 640 400"
      >
        <circle
          cx="320"
          cy="198"
          r="122"
          stroke="currentColor"
          strokeOpacity=".2"
          strokeWidth="2"
        />
        <circle
          cx="320"
          cy="198"
          r="88"
          stroke="currentColor"
          strokeOpacity=".42"
        />
        <path
          d="m320 112 76 44-16 89-60 42-60-42-16-89 76-44Zm0 0v175m-76-131 136 89m16-89-136 89"
          stroke="currentColor"
          strokeOpacity=".48"
          strokeWidth="2"
        />
        <path
          d="M103 297c40-30 82-45 126-45M411 252c44 0 86 15 126 45"
          stroke="currentColor"
          strokeOpacity=".18"
        />
        <circle cx="160" cy="255" fill="currentColor" r="5" />
        <circle cx="480" cy="255" fill="currentColor" r="5" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={sharedClassName}
      fill="none"
      viewBox="0 0 640 400"
    >
      <path
        d="m74 306 132-148 76 86 84-134 200 196H74Z"
        fill="currentColor"
        fillOpacity=".06"
        stroke="currentColor"
        strokeOpacity=".3"
        strokeWidth="2"
      />
      <path
        d="m110 306 96-108 36 40 40 6M301 214l65-104 64 63"
        stroke="currentColor"
        strokeOpacity=".45"
        strokeWidth="2"
      />
      <path
        d="M267 306v-73l53-38 54 38v73M287 306v-58h67v58M310 306v-34h22v34"
        fill="currentColor"
        fillOpacity=".08"
        stroke="currentColor"
        strokeOpacity=".5"
        strokeWidth="2"
      />
      <path
        d="M459 114v74M439 136h40M474 177l28 31M444 182l-27 31"
        stroke="currentColor"
        strokeOpacity=".35"
      />
    </svg>
  );
}

function EventMedia({
  event,
  variant,
}: {
  event: ClubEvent;
  variant: EventCardVariant;
}) {
  const imagePositionClass =
    event.image?.position === "top" ? "object-top" : "object-center";
  const isContainedArtwork = event.image?.fit === "contain";

  return (
    <div
      className={`relative overflow-hidden border-b border-border bg-surface-elevated ${
        variant === "featured"
          ? "aspect-[16/10] lg:aspect-auto lg:min-h-[24rem] lg:border-b-0 lg:border-r"
          : "aspect-video"
      }`}
    >
      {event.image ? (
        isContainedArtwork ? (
          <>
            <Image
              alt=""
              aria-hidden="true"
              className={`scale-110 object-cover ${imagePositionClass} opacity-35 blur-xl`}
              fill
              sizes={
                variant === "featured"
                  ? "(min-width: 1024px) 45rem, 100vw"
                  : "(min-width: 1024px) 38vw, 100vw"
              }
              src={event.image.src}
            />

            <div
              aria-hidden="true"
              className="absolute inset-0 bg-background/25"
            />

            <Image
              alt={event.image.alt}
              className={`object-contain ${imagePositionClass}`}
              fill
              sizes={
                variant === "featured"
                  ? "(min-width: 1024px) 45rem, 100vw"
                  : "(min-width: 1024px) 38vw, 100vw"
              }
              src={event.image.src}
            />
          </>
        ) : (
          <Image
            alt={event.image.alt}
            className={`object-cover transition-transform duration-700 ease-out motion-reduce:transition-none group-hover:scale-[1.015] ${imagePositionClass}`}
            fill
            sizes={
              variant === "featured"
                ? "(min-width: 1024px) 45rem, 100vw"
                : "(min-width: 1024px) 38vw, 100vw"
            }
            src={event.image.src}
          />
        )
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-secondary/70 via-surface-elevated to-background"
          />
          <div
            aria-hidden="true"
            className="valhalla-grid absolute inset-0 opacity-50"
          />
          <EventArtwork variant={event.artwork} />
        </>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent"
      />
    </div>
  );
}

function EventCard({
  event,
  variant,
}: {
  event: ClubEvent;
  variant: EventCardVariant;
}) {
  const status = statusStyles[event.status];

  return (
    <article
      className={`group h-full min-w-0 overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-primary/50 ${
        variant === "featured"
          ? "grid lg:grid-cols-[minmax(0,1.22fr)_minmax(22rem,0.78fr)]"
          : "flex flex-col"
      }`}
    >
      <EventMedia event={event} variant={variant} />

      <div
        className={`flex min-w-0 flex-1 flex-col ${
          variant === "featured" ? "p-6 sm:p-8 lg:p-9" : "p-4 sm:p-5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {categoryLabels[event.category]}
          </p>
          <p
            className={`w-fit rounded border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide ${status.className}`}
          >
            {status.label}
          </p>
        </div>

        <h3
          className={`line-clamp-2 break-words font-editorial font-semibold leading-[1.08] text-balance text-foreground ${
            variant === "featured"
              ? "mt-7 text-3xl sm:text-4xl lg:text-[2.8rem]"
              : "mt-3 text-xl sm:text-2xl"
          }`}
        >
          {event.name}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-pretty text-muted-foreground sm:text-base">
          {event.description}
        </p>

        <dl
          className={`grid gap-4 border-t border-border text-sm leading-6 text-muted-foreground sm:text-base ${
            variant === "featured"
              ? "mt-auto pt-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
              : "mt-4 pt-4 sm:grid-cols-2"
          }`}
        >
          <div className="flex min-w-0 gap-3">
            <dt className="sr-only">Data</dt>
            <EventIcon
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              name="calendar"
            />
            <dd className="min-w-0">
              {event.date ? (
                <time
                  dateTime={`${event.date}${event.time ? `T${event.time}` : ""}`}
                >
                  {formatEventDate(event.date)}
                  {event.time ? ` · ${formatEventTime(event.time)}` : ""}
                </time>
              ) : (
                event.dateLabel ?? "Data a confirmar"
              )}
            </dd>
          </div>

          <div className="flex min-w-0 gap-3">
            <dt className="sr-only">Local</dt>
            <EventIcon
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              name="location"
            />
            <dd className="min-w-0 line-clamp-2 break-words">
              {event.location}
            </dd>
          </div>
        </dl>

        {event.details ? (
          <details className="group/details mt-3 border-t border-border">
            <summary className="flex min-h-10 cursor-pointer list-none touch-manipulation items-center justify-between gap-4 text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4 focus-visible:ring-offset-surface [&::-webkit-details-marker]:hidden">
              <span>Saiba mais</span>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 transition-[border-color,transform] duration-200 group-open/details:rotate-90 group-hover/details:border-primary motion-reduce:transition-none"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                  <path
                    d="M6 10h8m-3-3 3 3-3 3"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                  />
                </svg>
              </span>
            </summary>
            <p className="pb-2 pt-3 text-sm leading-6 text-pretty text-muted-foreground">
              {event.details}
            </p>
          </details>
        ) : null}
      </div>
    </article>
  );
}

export function EventCarousel({ events }: EventCarouselProps) {
  if (events.length === 0) {
    return (
      <div className="relative mt-10 rounded-lg border border-dashed border-border bg-surface/60 px-6 py-12 text-center lg:mt-12">
        <p className="font-editorial text-2xl font-semibold text-foreground">
          Novos eventos serão anunciados em breve.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhe o Valhalla Club para não perder o próximo encontro.
        </p>
      </div>
    );
  }

  if (events.length === 1) {
    return (
      <div className="relative mt-10 lg:mt-12">
        <EventCard event={events[0]} variant="featured" />
      </div>
    );
  }

  return (
    <div className="relative mt-8">
      <HorizontalCarousel
        ariaLabel="Eventos do Valhalla Club"
        logicalSlideCount={events.length}
        slideClassName="flex-[0_0_100%] lg:flex-[0_0_calc((100%_-_1.25rem)_/_2)]"
      >
        {events.map((event) => (
          <EventCard event={event} key={event.id} variant="standard" />
        ))}
      </HorizontalCarousel>
    </div>
  );
}

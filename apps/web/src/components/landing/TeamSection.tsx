"use client";

import Image from "next/image";
import { useState } from "react";

import { SectionHeader } from "@/components/ui/SectionHeader";

type TeamRole = "leader" | "admin" | "master" | "developer";
type MemberCardVariant = "standard" | "featured";

type TeamMember = {
  id: string;
  name: string;
  title: string;
  primaryRole: TeamRole;
  roles: readonly TeamRole[];
  image?: string;
};

const roleOrder: readonly TeamRole[] = [
  "leader",
  "admin",
  "master",
  "developer",
];

// Fixed fractions keep card widths consistent while flex-wrap centers incomplete rows.
const responsiveMemberCardWidth =
  "sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(20%-0.6rem)]";

const roles: Record<
  TeamRole,
  { label: string; badgeLabel: string }
> = {
  leader: {
    label: "Liderança",
    badgeLabel: "Líder",
  },
  admin: {
    label: "Administradores",
    badgeLabel: "Administrador",
  },
  master: {
    label: "Mestres Oficiais",
    badgeLabel: "Mestre Oficial",
  },
  developer: {
    label: "Desenvolvedores",
    badgeLabel: "Desenvolvedor",
  },
};

const teamMembers: readonly TeamMember[] = [
  {
    id: "daniel",
    name: "Daniel",
    title: "Líder do Valhalla Club",
    primaryRole: "leader",
    roles: ["leader"],
  },
  {
    id: "gabriel-bomfim",
    name: "Gabriel Bomfim",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin", "master", "developer"],
    image: "/team/gabriel-bomfim.webp",
  },
  {
    id: "kaua",
    name: "Kauã",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin"],
  },
  {
    id: "leonardo-barbosa",
    name: "Leonardo Barbosa",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin"],
  },
  {
    id: "jamison",
    name: "Jamison",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin"],
  },
  {
    id: "limas",
    name: "Limas",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin"],
  },
  {
    id: "luiz",
    name: "Luiz",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin"],
  },
  {
    id: "rafael-barbosa",
    name: "Rafael Barbosa",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin", "developer"],
  },
  {
    id: "xavs",
    name: "Xavs",
    title: "Administrador",
    primaryRole: "admin",
    roles: ["admin", "developer"],
  },
  {
    id: "bruna",
    name: "Bruna",
    title: "Administradora",
    primaryRole: "admin",
    roles: ["admin"],
  },
  {
    id: "jhon",
    name: "Jhon",
    title: "Mestre Oficial",
    primaryRole: "master",
    roles: ["master"],
  },
  {
    id: "isaac-artemis",
    name: "Isaac Artemis",
    title: "Mestre Oficial",
    primaryRole: "master",
    roles: ["master"],
  },
  {
    id: "victor-lopes",
    name: "Victor Lopes",
    title: "Mestre Oficial",
    primaryRole: "master",
    roles: ["master"],
  },
  {
    id: "marlon",
    name: "Marlon",
    title: "Mestre Oficial",
    primaryRole: "master",
    roles: ["master"],
  },
  {
    id: "vinicius",
    name: "Vinícius",
    title: "Tech Lead / Full-stack",
    primaryRole: "developer",
    roles: ["developer", "master"],
  },
  {
    id: "charles",
    name: "Charles",
    title: "Back-end / Banco de dados",
    primaryRole: "developer",
    roles: ["developer"],
  },
];

const memberGroups = roleOrder
  .map((role) => ({
    role,
    members: teamMembers.filter((member) => member.primaryRole === role),
  }))
  .filter((group) => group.members.length > 0);

function RoleIcon({
  role,
  className = "h-5 w-5",
}: {
  role: TeamRole;
  className?: string;
}) {
  const commonProps = {
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.6,
    viewBox: "0 0 24 24",
  };

  if (role === "leader") {
    return (
      <svg {...commonProps}>
        <path d="M4 18h16M5.5 15.5 4.5 7l5 3.5L12 5l2.5 5.5 5-3.5-1 8.5h-13Z" />
      </svg>
    );
  }

  if (role === "admin") {
    return (
      <svg {...commonProps}>
        <path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" />
        <path d="M12 7v10" />
      </svg>
    );
  }

  if (role === "master") {
    return (
      <svg {...commonProps}>
        <path d="M3.5 5.5A3.5 3.5 0 0 1 7 4h4.5v16H7a3.5 3.5 0 0 0-3.5 1V5.5ZM20.5 5.5A3.5 3.5 0 0 0 17 4h-4.5v16H17a3.5 3.5 0 0 1 3.5 1V5.5Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
    </svg>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MemberAvatar({
  member,
  variant,
}: {
  member: TeamMember;
  variant: MemberCardVariant;
}) {
  const isFeatured = variant === "featured";
  const imageSize = 96;
  const avatarClassName = isFeatured
    ? "h-16 w-16 rounded-full border border-primary/40 bg-secondary sm:h-24 sm:w-24"
    : "h-14 w-14 rounded-full border border-primary/40 bg-secondary sm:h-24 sm:w-24";

  if (member.image) {
    return (
      <Image
        alt={`Foto de ${member.name}`}
        className={`${avatarClassName} object-cover`}
        height={imageSize}
        quality={90}
        sizes={
          isFeatured
            ? "(min-width: 640px) 96px, 64px"
            : "(min-width: 640px) 96px, 56px"
        }
        src={member.image}
        width={imageSize}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${avatarClassName} flex items-center justify-center font-display text-lg font-semibold text-primary sm:text-2xl`}
    >
      {getInitials(member.name)}
    </div>
  );
}

function MemberCard({
  member,
  variant = "standard",
}: {
  member: TeamMember;
  variant?: MemberCardVariant;
}) {
  const isFeatured = variant === "featured";
  const additionalRoles = member.roles.filter(
    (role) => role !== member.primaryRole,
  );
  const cardClassName = isFeatured
    ? "relative flex w-full max-w-lg items-center gap-3 overflow-hidden rounded-lg border border-primary/40 bg-surface-elevated p-4 transition-colors hover:border-primary sm:min-h-40 sm:gap-5 sm:p-5"
    : `relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface-elevated p-3 transition-colors hover:border-primary/50 sm:min-h-68 sm:flex-col sm:items-center sm:justify-start sm:gap-0 sm:p-5 sm:text-center ${responsiveMemberCardWidth}`;

  return (
    <article className={cardClassName}>
      <div className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-secondary text-primary sm:flex">
        <RoleIcon className="h-4 w-4" role={member.primaryRole} />
      </div>

      <MemberAvatar member={member} variant={variant} />

      <div
        className={`min-w-0 flex-1 ${isFeatured ? "sm:pr-8" : "sm:mt-5 sm:w-full sm:flex-none sm:pr-0"}`}
      >
        <h4
          className="truncate whitespace-nowrap font-display text-base font-semibold text-foreground sm:text-lg"
          title={member.name}
        >
          {member.name}
        </h4>
        <p
          className="mt-1 truncate whitespace-nowrap text-xs leading-5 text-primary sm:mt-1.5 sm:text-sm"
          title={member.title}
        >
          {member.title}
        </p>

        {additionalRoles.length > 0 && (
          <ul
            aria-label={`Outras funções de ${member.name}`}
            className={`mt-2 flex flex-wrap gap-1 sm:mt-3 sm:gap-1.5 ${isFeatured ? "" : "sm:justify-center"}`}
          >
            {additionalRoles.map((role) => (
              <li
                className="rounded-full border border-primary/30 bg-secondary px-2 py-0.5 text-[0.6875rem] leading-4 text-secondary-foreground sm:px-2.5 sm:py-1 sm:text-xs"
                key={role}
              >
                {roles[role].badgeLabel}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function TeamSection() {
  const [openRole, setOpenRole] = useState<TeamRole | null>("leader");

  return (
    <section
      aria-labelledby="equipe-heading"
      className="border-b border-border bg-surface"
      id="equipe"
    >
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-24 sm:px-10 sm:py-28 lg:px-12">
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-32 hidden h-80 w-80 rotate-45 border border-primary/5 lg:block"
          >
            <div className="absolute inset-14 border border-primary/5" />
          </div>

          <SectionHeader
            description="Conheça as pessoas que assumem funções essenciais para fazer o Valhalla Club acontecer."
            eyebrow="Comunidade"
            id="equipe-heading"
            title="Envolvidos"
          />

          <div className="relative mt-10 space-y-3 sm:mt-14 sm:space-y-12">
            {memberGroups.map(({ role, members }) => {
              const isOpen = openRole === role;

              return (
                <section aria-labelledby={`team-role-${role}`} key={role}>
                  <h3 className="scroll-mt-24" id={`team-role-${role}`}>
                    <button
                      aria-controls={`team-role-panel-${role}`}
                      aria-expanded={isOpen}
                      className={`valhalla-cut-corners flex min-h-14 w-full touch-manipulation items-center gap-2 border px-3 py-2.5 text-left transition-[border-color,background-color] focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none sm:hidden ${
                        isOpen
                          ? "border-primary/70 bg-primary/10"
                          : "border-border bg-surface-elevated"
                      }`}
                      onClick={() =>
                        setOpenRole((currentRole) =>
                          currentRole === role ? null : role,
                        )
                      }
                      type="button"
                    >
                      <span className="valhalla-cut-corners flex h-9 w-9 shrink-0 items-center justify-center border border-primary/40 bg-secondary text-primary">
                        <RoleIcon className="h-4 w-4" role={role} />
                      </span>

                      <span className="whitespace-nowrap font-display text-[0.8125rem] font-semibold uppercase tracking-wide text-foreground min-[360px]:text-sm">
                        {roles[role].label}
                      </span>

                      <span
                        aria-hidden="true"
                        className={`h-px min-w-2 flex-1 transition-colors ${
                          isOpen ? "bg-primary/60" : "bg-border"
                        }`}
                      />

                      <span className="valhalla-cut-corners flex h-8 w-8 shrink-0 items-center justify-center border border-primary/30 text-primary">
                        <svg
                          aria-hidden="true"
                          className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
                            isOpen ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </button>

                    <span className="hidden items-center gap-3 sm:flex">
                      <RoleIcon
                        className="h-5 w-5 shrink-0 text-primary"
                        role={role}
                      />
                      <span className="font-display text-lg font-semibold uppercase tracking-wide text-balance text-foreground sm:text-xl">
                        {roles[role].label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-px flex-1 bg-border"
                      />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {members.length}
                      </span>
                    </span>
                  </h3>

                  <div
                    aria-labelledby={`team-role-${role}`}
                    className={`${
                      isOpen ? "mt-3 flex" : "hidden"
                    } ml-4 flex-wrap justify-center gap-2 border-l border-primary/30 pl-3 sm:ml-0 sm:mt-5 sm:flex sm:gap-3 sm:border-l-0 sm:pl-0`}
                    id={`team-role-panel-${role}`}
                    role="region"
                  >
                    {members.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        variant={role === "leader" ? "featured" : "standard"}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";

const footerLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Sobre", href: "#sobre" },
  { label: "Eventos", href: "#eventos" },
  { label: "Equipe", href: "#equipe" },
];

const socialLinks = [
  {
    label: "Instagram",
    ariaLabel: "Abrir o Instagram do Valhalla. Abre em uma nova aba.",
    href: "https://www.instagram.com/valhallaclubrpg/",
  },
  {
    label: "Discord",
    ariaLabel: "Entrar no Discord do Valhalla. Abre em uma nova aba.",
    href: "https://discord.gg/WNeuAEGVX",
  },
];

const whatsappCommunityUrl =
  "https://chat.whatsapp.com/LRez0Uss18tALMr6AHgYDM";

const socialIconPaths = {
  discord:
    "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
  instagram:
    "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
} as const;

type SocialIconName = keyof typeof socialIconPaths;

function SocialIcon({ name }: { name: SocialIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d={socialIconPaths[name]} />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-background" id="contato">
      <section
        aria-labelledby="contato-heading"
        className="relative isolate overflow-hidden border-b border-border"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-30 overflow-hidden"
        >
          <div className="absolute left-1/2 top-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 sm:size-[34rem] lg:size-[38rem]">
            <Image
              alt=""
              className="object-contain opacity-[0.09] sm:opacity-[0.10] lg:opacity-[0.12]"
              fill
              sizes="(min-width: 1024px) 38rem, (min-width: 640px) 34rem, 28rem"
              src="/images/valhalla-footer-emblem.jpeg"
            />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-background/25"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-b from-background/75 via-transparent to-background/85"
        />
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-10 sm:py-24 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
              Entre em contato
              <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
            </p>
            <h2
              className="mx-auto mt-5 max-w-3xl text-balance font-display text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl"
              id="contato-heading"
            >
              As portas do salão estão abertas.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl font-editorial text-xl leading-8 text-muted-foreground sm:text-2xl sm:leading-9">
              Entre na comunidade, acompanhe mesas e eventos ou fale com o
              Valhalla.
            </p>

            <div className="mt-8 flex items-center justify-center gap-3 sm:mt-9 sm:gap-7">
              <a
                aria-label="Entrar para a comunidade do Valhalla no WhatsApp. Abre em uma nova aba."
                className="group grid size-11 shrink-0 place-items-center rounded-full border border-primary/30 bg-surface/70 text-primary transition-colors hover:border-primary hover:bg-surface-elevated sm:inline-flex sm:h-11 sm:w-auto sm:gap-3 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:border-transparent sm:bg-transparent sm:px-2 sm:text-sm sm:font-semibold sm:text-foreground/85 sm:hover:border-primary/50 sm:hover:bg-transparent sm:hover:text-primary"
                href={whatsappCommunityUrl}
                rel="noopener noreferrer"
                target="_blank"
                title="WhatsApp"
              >
                <span className="text-primary transition-transform group-hover:scale-110 motion-reduce:transform-none">
                  <SocialIcon name="whatsapp" />
                </span>
                <span className="hidden sm:inline">WhatsApp</span>
              </a>

              {socialLinks.map((link) => (
                <a
                  aria-label={link.ariaLabel}
                  className="group grid size-11 shrink-0 place-items-center rounded-full border border-primary/30 bg-surface/70 text-primary transition-colors hover:border-primary hover:bg-surface-elevated sm:inline-flex sm:h-11 sm:w-auto sm:gap-3 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:border-transparent sm:bg-transparent sm:px-2 sm:text-sm sm:font-semibold sm:text-foreground/85 sm:hover:border-primary/50 sm:hover:bg-transparent sm:hover:text-primary"
                  href={link.href}
                  key={link.label}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={link.label}
                >
                  <span className="text-primary transition-transform group-hover:scale-110 motion-reduce:transform-none">
                    <SocialIcon
                      name={link.label === "Instagram" ? "instagram" : "discord"}
                    />
                  </span>
                  <span className="hidden sm:inline">{link.label}</span>
                </a>
              ))}
            </div>

            <a
              className="mt-4 inline-flex min-h-9 items-center gap-3 break-words text-sm text-muted-foreground transition-colors hover:text-primary"
              href="mailto:valhallaclubrpg@gmail.com"
            >
              <svg
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
                fill="none"
                viewBox="0 0 24 24"
              >
                <rect
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  width="18"
                  x="3"
                  y="5"
                />
                <path
                  d="m4 7 8 6 8-6"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
              valhallaclubrpg@gmail.com
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-10 lg:px-12">
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 py-8 text-left sm:gap-x-8 md:grid-cols-[auto_1fr] md:items-center lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-10">
          <div className="col-span-2 inline-flex items-center gap-4 justify-self-center md:col-span-1 md:justify-self-start">
            <Image
              alt=""
              className="size-20 shrink-0 object-contain sm:size-24"
              height={96}
              src="/images/valhalla-wolf.png"
              width={96}
            />
            <span>
              <span className="block font-display text-xl font-semibold tracking-[0.14em] text-foreground">
                Valhalla
              </span>
              <span className="mt-1 block text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Clube de RPG
              </span>
              <span className="mt-3 block max-w-sm text-sm leading-6 text-muted-foreground">
                Um salão para todos que querem criar histórias.
              </span>
            </span>
          </div>

          <nav
            aria-label="Navegação do rodapé"
            className="justify-self-start md:justify-self-end lg:justify-self-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Explore o salão
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 md:flex md:flex-wrap md:justify-end md:gap-x-6 lg:justify-center">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <a
                    className="inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <address className="flex justify-self-end gap-3 not-italic md:col-span-2 md:justify-self-center lg:col-span-1 lg:justify-self-end">
            <svg
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
              <circle
                cx="12"
                cy="10"
                r="2.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <span className="text-left">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Onde estamos
              </span>
              <span className="mt-2 block font-display text-sm font-semibold text-foreground">
                Aracaju, Sergipe
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Brasil
              </span>
            </span>
          </address>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border/80 py-5 text-[0.65rem] leading-5 text-muted-foreground sm:text-xs">
          <p>© {new Date().getFullYear()} Valhalla Club RPG de Mesa.</p>
          <a
            aria-label="Voltar ao início"
            className="group grid size-10 shrink-0 place-items-center transition-colors hover:text-foreground sm:inline-flex sm:h-7 sm:w-auto sm:gap-2"
            href="#inicio"
          >
            <span className="hidden sm:inline">Voltar ao início</span>
            <svg
              aria-hidden="true"
              className="size-4 transition-transform group-hover:-translate-y-1 motion-reduce:transform-none"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="m7 11 5-5 5 5M12 6v12"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}

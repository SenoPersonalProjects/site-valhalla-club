import Image from "next/image";

export function HeroSection() {
  return (
    <section
      className="valhalla-hero relative isolate overflow-hidden border-b border-border"
      id="inicio"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-30 overflow-hidden"
      >
        <div className="absolute inset-0 lg:left-auto lg:right-0 lg:w-[72%] xl:w-[62%]">
          <Image
            alt=""
            className="object-cover object-center opacity-30 sm:opacity-40 lg:opacity-80"
            fill
            priority
            sizes="(min-width: 1280px) 62vw, (min-width: 1024px) 72vw, 100vw"
            src="/images/valhalla-hero-v2.png"
          />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-background/55 lg:bg-background/10"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/95 to-background/50 sm:to-background/30 lg:via-background/90 lg:to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-b from-transparent to-background"
      />

      <div className="relative mx-auto flex min-h-[calc(100svh-5rem)] max-w-7xl items-center px-5 py-16 sm:px-10 sm:py-20 lg:px-12 lg:py-24">
        <div className="w-full min-w-0 max-w-3xl">
          <h1 className="max-w-4xl text-balance font-display text-4xl leading-[1.04] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl lg:text-[4rem] xl:text-[4.5rem]">
            A próxima grande história
            <span className="mt-2 block text-primary">pode ser a sua.</span>
          </h1>

          <p className="mt-7 max-w-2xl font-editorial text-xl leading-8 text-muted-foreground sm:text-[1.375rem] sm:leading-8">
            Prepare sua ficha e venha descobrir mundos, desafios e companheiros
            de aventura.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              className="valhalla-cut-corners inline-flex w-full items-center justify-center gap-3 bg-primary px-7 py-4 text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto"
              href="https://chat.whatsapp.com/LRez0Uss18tALMr6AHgYDM"
              rel="noreferrer"
              target="_blank"
            >
              Entre para o Valhalla
              <span aria-hidden="true">→</span>
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}

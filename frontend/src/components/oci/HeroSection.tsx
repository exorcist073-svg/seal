import { BayerDitherHero } from "@/components/hero/BayerDitherHero";

/** High-res source; swap to `/hero-seal-iceberg.jpg` in /public when available */
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=3840&q=88&auto=format";

export function HeroSection() {
  return (
    <section
      id="top"
      data-oci-cursor="on-dark"
      className="relative box-border h-[100dvh] min-h-[100svh] w-full min-w-0 overflow-hidden bg-[#0808b0]"
    >
      <BayerDitherHero
        imageSrc={HERO_IMAGE}
        className="absolute inset-0 z-0 h-full w-full"
      />

      <div
        className="pointer-events-none absolute inset-0 z-10"
        aria-hidden
      >
        <div className="absolute left-[62%] top-0 h-full w-px bg-white/[0.18]" />
        <div className="absolute left-[76%] top-0 h-full w-px bg-white/[0.18]" />
      </div>

      <div className="pointer-events-none relative z-20 h-full min-h-0 w-full">
        <p className="oci-hero-tagline absolute bottom-44 left-6 max-w-[min(100%,28rem)] text-[clamp(17px,1.85vw,24px)] font-light leading-snug text-white md:bottom-auto md:left-[68%] md:top-1/2 md:w-[min(92vw,28%)] md:max-w-none md:-translate-y-1/2 md:pr-6 md:text-right">
          Confidential, verifiable execution for AI agents{" "}
          <span className="whitespace-nowrap">on-chain.</span>
        </p>

        <h1 className="absolute bottom-0 left-0 max-w-[95vw] pb-8 pl-6 font-black text-white md:pb-14 md:pl-10">
          <div className="tracking-[-0.03em] [font-size:clamp(104px,18vw,240px)] leading-[0.9]">
            <span className="oci-hero-line block">SĒAL</span>
            <span className="oci-hero-line oci-hero-line--2 mt-[0.07em] block text-[0.152em] font-black leading-[1.08] tracking-[-0.03em]">
              Secure Enclave Agent Layer
            </span>
          </div>
        </h1>
      </div>
    </section>
  );
}

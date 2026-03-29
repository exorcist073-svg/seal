import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { ScrollReveal } from "./ScrollReveal";

const VISUAL_SRC =
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&q=80";

export function AboutStatsSection() {
  return (
    <section
      id="about"
      data-oci-cursor="on-dark"
      className="bg-[#05058a] py-[120px] text-white md:py-[160px]"
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
          <ScrollReveal>
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#0808b0]">
              <BayerDitherImage
                src={VISUAL_SRC}
                alt="Trusted execution and infrastructure"
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </ScrollReveal>

          <div>
            <div className="grid gap-10 sm:grid-cols-3">
              {[
                { stat: "06", label: "Pipeline stages" },
                { stat: "TEE", label: "Confidential runtime" },
                { stat: "2026", label: "PL Genesis" },
              ].map((item, i) => (
                <ScrollReveal key={item.label} delayMs={i * 50}>
                  <div>
                    <p className="text-[clamp(36px,5vw,64px)] font-black leading-none tracking-[-0.02em]">
                      {item.stat}
                    </p>
                    <p className="mt-3 text-[11px] font-light uppercase tracking-[0.25em] text-white/70">
                      {item.label}
                    </p>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <ScrollReveal delayMs={120} className="mt-12">
              <p className="text-base font-light leading-[1.8] text-white/85">
                SEAL unifies TEE execution, on-chain commitment, encrypted storage, and
                Lit-gated reveal — so agents can be held accountable without exposing
                strategy to the world in real time. Infrastructure, not an app: one
                integration surface for any agent-powered system.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}

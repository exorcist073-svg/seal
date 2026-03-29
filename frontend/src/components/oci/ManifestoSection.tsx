import { ScrollReveal } from "./ScrollReveal";

export function ManifestoSection() {
  return (
    <section className="border-y border-neutral-300 bg-[#f5f5f0] py-[120px] md:py-[140px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <p className="mx-auto max-w-[980px] text-center text-[clamp(28px,4vw,48px)] font-semibold leading-tight tracking-[-0.02em] text-[#05058a]">
            SEAL is the commit–attest–execute–deliver layer for AI agents — protecting
            the full decision–action chain with verifiable, private-by-default behavior
            on-chain.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-12 md:grid-cols-2 md:gap-16 lg:mt-24">
          <ScrollReveal delayMs={80}>
            <p className="text-base font-light leading-[1.8] text-neutral-700">
              AI agents are autonomous economic actors. SEAL gives any system running
              agents a single integration point: attest inputs, reason in a TEE, commit
              before execution, guarantee delivery, and reveal selectively to authorized
              parties.
            </p>
          </ScrollReveal>
          <ScrollReveal delayMs={160}>
            <p className="text-base font-light leading-[1.8] text-neutral-700">
              The architecture is simple to state:{" "}
              <span className="font-semibold text-[#05058a]">
                reason privately, commit publicly, reveal selectively.
              </span>{" "}
              Enforcement lives in the smart contract — no commitment, no execution.
            </p>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

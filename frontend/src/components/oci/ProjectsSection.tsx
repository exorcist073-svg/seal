import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { ScrollReveal } from "./ScrollReveal";

const USE_CASES = [
  {
    name: "DAO treasury",
    category: "Governance",
    src: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&q=80",
  },
  {
    name: "Agent-to-agent",
    category: "Coordination",
    src: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=900&q=80",
  },
  {
    name: "Regulated deployments",
    category: "Audit",
    src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&q=80",
  },
  {
    name: "Autonomous trading",
    category: "Finance",
    src: "https://images.unsplash.com/photo-1611974789855-9c2a0a4756a3?w=900&q=80",
  },
  {
    name: "Credential-proof workflows",
    category: "Access",
    src: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=900&q=80",
  },
];

export function ProjectsSection() {
  return (
    <section id="usecases" className="bg-[#f5f5f0] py-[120px] md:py-[160px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <h2 className="text-[clamp(40px,6vw,80px)] font-black leading-none tracking-[-0.02em] text-[#05058a]">
            Use cases
          </h2>
        </ScrollReveal>

        <div className="mt-12 flex gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {USE_CASES.map((p, i) => (
            <ScrollReveal
              key={p.name}
              delayMs={i * 60}
              className="min-w-[min(85vw,420px)] shrink-0"
            >
              <article
                data-oci-cursor="on-dark"
                className="group relative aspect-[4/5] w-full overflow-hidden bg-[#0808b0]"
              >
                <BayerDitherImage
                  src={p.src}
                  alt={p.name}
                  className="absolute inset-0 h-full w-full origin-center transition-transform duration-300 ease-in-out group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-[#040482]/0 mix-blend-multiply transition-colors duration-300 ease-in-out group-hover:bg-[#040482]/45" />
                <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                    {p.category}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.02em]">{p.name}</p>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

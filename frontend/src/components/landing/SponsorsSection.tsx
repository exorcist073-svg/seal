const sponsors = [
  {
    name: "Lit Protocol",
    body:
      "Decentralized keys for selective reveal and credential vault; multisig fallback for demo reliability.",
  },
  {
    name: "Filecoin / Storacha",
    body:
      "Permanent content-addressed storage for encrypted reasoning blobs and the full audit trail.",
  },
  {
    name: "NEAR Protocol",
    body: "Agent registry with runtime-verified staking; operator credential NFTs for bypass prevention.",
  },
  {
    name: "Flow",
    body: "High-throughput micro-settlement for per-task payments in multi-agent workflows.",
  },
];

export function SponsorsSection() {
  return (
    <section id="sponsors" className="scroll-mt-16 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="seal-section-label">Latest news</p>
        <h2 className="mt-4 max-w-3xl text-6xl font-semibold tracking-tight text-[var(--foreground)] sm:text-7xl">
          Integrations in motion
        </h2>
        <ul className="mt-12 grid gap-3 md:grid-cols-3">
          {sponsors.map((s, i) => (
            <li
              key={s.name}
              className={i === 0 ? "border border-[var(--border-strong)] bg-[var(--accent)] p-6 text-[#ecedff]" : "border border-[var(--border-strong)] bg-[var(--surface)] p-6"}
            >
              <p className={`text-sm ${i === 0 ? "text-[#d8dbff]" : "text-[var(--muted-light)]"}`}>02.0{i + 5}</p>
              <h3 className={`mt-4 text-3xl leading-tight font-medium ${i === 0 ? "text-[#f1f2ff]" : "text-[var(--foreground)]"}`}>{s.name}</h3>
              <p className={`mt-4 text-sm leading-relaxed ${i === 0 ? "text-[#e6e7ff]" : "text-[var(--muted)]"}`}>{s.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

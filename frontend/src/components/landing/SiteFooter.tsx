export function SiteFooter() {
  return (
    <footer className="bg-[var(--surface-alt)] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 border-t border-[var(--border-strong)] pt-12 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="seal-badge w-fit">SĒAL CONSULTANTS INC.</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Secure Enclave Agent Layer — confidential, verifiable execution infrastructure for AI agents
              operating on-chain.
            </p>
          </div>
          <div>
            <p className="seal-section-label">Disclosure</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Production uses AWS Nitro Enclaves or Intel TDX. Hackathon demo may use a mock attestation signer
              that emits correctly structured quotes — disclosed transparently; architecture remains valid.
            </p>
          </div>
          <div>
            <p className="seal-section-label">Stay in touch</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Open-source hackathon build · PL Genesis March 2026
            </p>
          </div>
        </div>
        <p className="mt-12 text-center text-xs uppercase tracking-[0.16em] text-[var(--muted-light)]">
          SĒAL · Secure Enclave Agent Layer · interface mockup
        </p>
      </div>
    </footer>
  );
}

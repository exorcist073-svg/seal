import Link from "next/link";

function CrosshairLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1" />
      <line x1="14" y1="2" x2="14" y2="26" stroke="currentColor" strokeWidth="1" />
      <line x1="2" y1="14" x2="26" y2="14" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

const FOOTER_LINKS = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#usecases", label: "Use cases" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export function SiteFooterOCI() {
  return (
    <footer data-oci-cursor="on-dark" className="bg-[#030350] py-16 text-white">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-12 md:grid-cols-3 md:gap-8">
          <div>
            <div className="flex items-center gap-3">
              <CrosshairLogo />
              <span className="text-[11px] uppercase tracking-[0.22em] text-white/90">
                SĒAL
              </span>
            </div>
            <p className="mt-6 max-w-xs text-sm font-light leading-relaxed text-white/60">
              Secure Enclave Agent Layer — commit, attest, execute, deliver.
            </p>
          </div>

          <nav className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center md:justify-center">
            {FOOTER_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[11px] uppercase tracking-[0.2em] text-white/55 transition-colors duration-300 ease-in-out hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-4 md:items-end">
            <div className="flex gap-6 text-[11px] uppercase tracking-[0.2em] text-white/55">
              <a
                href="https://github.com"
                className="transition-colors duration-300 ease-in-out hover:text-white"
              >
                GitHub
              </a>
              <a href="#" className="transition-colors duration-300 ease-in-out hover:text-white">
                Docs
              </a>
            </div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
              MIT License
            </p>
          </div>
        </div>

        <div className="mt-14 border-t border-white/35 pt-8">
          <p className="text-[11px] tracking-[0.08em] text-white/35">
            © {new Date().getFullYear()} SĒAL — Secure Enclave Agent Layer. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV = [
  { href: "/#pipeline", label: "Pipeline" },
  { href: "/#usecases", label: "Use cases" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" },
];

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

export function DashboardNavbar() {
  const navClass =
    "text-[11px] uppercase tracking-[0.14em] text-white/70 transition-colors duration-300 ease-in-out hover:text-white";

  return (
    <header
      data-oci-cursor="on-dark"
      className="fixed left-0 right-0 top-0 z-[120] bg-[#05058a]"
    >
      <div className="relative mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-5">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-white">
          <CrosshairLogo className="shrink-0" />
          <span className="hidden truncate text-[11px] font-normal uppercase tracking-[0.22em] sm:inline">
            Secure Enclave Agent Layer
          </span>
        </Link>

        <nav
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-10 md:flex"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={navClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="hidden shrink-0 items-center justify-center bg-[#3535f0] px-4 py-2.5 text-[11px] font-normal tracking-[0.08em] text-white md:flex"
          >
            dashboard
          </Link>
          <div className="hidden md:block">
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </div>
    </header>
  );
}


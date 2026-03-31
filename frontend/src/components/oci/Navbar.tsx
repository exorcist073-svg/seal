"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#usecases", label: "Use cases" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export function Navbar() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const navClass =
    "text-[11px] uppercase tracking-[0.14em] text-white/65 transition-colors duration-300 ease-in-out hover:text-white";

  return (
    <>
      <header
        data-oci-cursor="on-dark"
        className={`fixed left-0 right-0 top-0 z-[100] transition-colors duration-300 ease-in-out ${
          solid ? "bg-[#05058a]" : "bg-transparent"
        }`}
      >
        <div className="relative mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-5">
          <Link
            href="#top"
            className="flex min-w-0 items-center gap-3 text-white"
            onClick={() => setOpen(false)}
          >
            <img
              src="/logo_seal.svg"
              alt="SEAL"
              width={28}
              height={28}
              className="shrink-0"
            />
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
              className="hidden shrink-0 items-center justify-center bg-[#3535f0] px-4 py-2.5 text-[11px] font-normal tracking-[0.08em] text-white transition-opacity duration-300 ease-in-out hover:opacity-90 md:flex"
            >
              console
            </Link>
            <button
              type="button"
              className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 md:hidden"
              aria-expanded={open}
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <span className="h-px w-5 bg-white" />
              <span className="h-px w-5 bg-white" />
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div
          data-oci-cursor="on-dark"
          className="fixed inset-0 z-[150] flex flex-col bg-[#2020e8] px-8 py-10 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex justify-end">
            <button
              type="button"
              className="text-[11px] uppercase tracking-[0.2em] text-white/80"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <nav className="mt-16 flex flex-col gap-10" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-4xl font-black uppercase tracking-tight text-white"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}

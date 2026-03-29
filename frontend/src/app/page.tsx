import {
  AboutStatsSection,
  CTASection,
  HeroSection,
  ManifestoSection,
  Navbar,
  ProjectsSection,
  ServicesSection,
  SiteFooterOCI,
} from "@/components/oci";

export default function Home() {
  return (
    <div className="min-h-full w-full min-w-0">
      <Navbar />
      <HeroSection />
      <ManifestoSection />
      <ServicesSection />
      <ProjectsSection />
      <AboutStatsSection />
      <CTASection />
      <SiteFooterOCI />
    </div>
  );
}

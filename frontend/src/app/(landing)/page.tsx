import { Navbar } from "@/components/oci/Navbar";
import { HeroSection } from "@/components/oci/HeroSection";
import { ManifestoSection } from "@/components/oci/ManifestoSection";
import { ServicesSection } from "@/components/oci/ServicesSection";
import { ProjectsSection } from "@/components/oci/ProjectsSection";
import { AboutStatsSection } from "@/components/oci/AboutStatsSection";
import { CTASection } from "@/components/oci/CTASection";
import { SiteFooterOCI } from "@/components/oci/SiteFooterOCI";

export default function Home() {
  return (
    <div className="min-h-full w-full min-w-0 bg-[#f5f5f0] text-[#05058a]">
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

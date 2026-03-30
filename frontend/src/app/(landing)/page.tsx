import {
  SiteHeader,
  Hero,
  ProblemSection,
  SolutionSection,
  PipelineSection,
  ArchitectureSection,
  UseCasesSection,
  SponsorsSection,
  ComparisonSection,
  RevealDemo,
  SiteFooter,
} from "@/components/landing";

export default function Home() {
  return (
    <div className="min-h-full w-full min-w-0">
      <SiteHeader />
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <PipelineSection />
      <ArchitectureSection />
      <UseCasesSection />
      <RevealDemo />
      <SponsorsSection />
      <ComparisonSection />
      <SiteFooter />
    </div>
  );
}

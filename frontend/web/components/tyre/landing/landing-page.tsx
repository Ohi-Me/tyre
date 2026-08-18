"use client";

/**
 * Landing composition — the two-way story:
 *   Hero        drive there booked, drive back paid (light, violet, bento)
 *   LogoMarquee built on India's trusted rails
 *   TickerBanner rotated capability strip
 *   StatsTestimonial proof, not promises
 *   Problem     half of every journey is empty
 *   Product     book / track / pay (three motions)
 *   Marketplace list the way back, someone's already going
 *   FAQ         your questions, answered
 *   CTA         never drive back empty
 *   Contact     let's connect (real lead form, inline)
 *   Footer      credits + language + how it works
 * Voice is not a showcase section — it lives inside the listing flow.
 * Pricing lives on its own page (/pricing), opened from the nav.
 */
import { LandingNav } from "./nav";
import { LandingHero } from "./hero";
import { LogoMarquee } from "./logo-marquee";
import { TickerBanner } from "./ticker-banner";
import { StatsTestimonial } from "./stats-testimonial";
import { ProblemSection } from "./problem-section";
import { FeatureCards } from "./feature-cards";
import { MarketplaceSection } from "./marketplace-section";
import { FaqSection } from "./faq-section";
import { CtaSection } from "./cta-section";
import { ContactSection } from "./contact-section";
import { LandingFooter } from "./footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased tyre-scroll">
      <LandingNav />
      <main>
        <LandingHero />
        <LogoMarquee />
        <TickerBanner />
        <StatsTestimonial />
        <ProblemSection />
        <FeatureCards />
        <MarketplaceSection />
        <FaqSection />
        <CtaSection />
        <ContactSection />
      </main>
      <LandingFooter />
    </div>
  );
}

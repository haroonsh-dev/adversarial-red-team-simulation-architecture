"use client";

import { LandingAnnouncementBar } from "./LandingAnnouncementBar";
import { LandingBackdrop } from "./LandingBackdrop";
import { LandingChallenge } from "./LandingChallenge";
import { LandingComparison } from "./LandingComparison";
import { LandingContactSection } from "./LandingContactSection";
import { LandingCTA } from "./LandingCTA";
import { LandingFAQ } from "./LandingFAQ";
import { LandingFooter } from "./LandingFooter";
import { LandingHero } from "./LandingHero";
import { LandingImpact } from "./LandingImpact";
import { LandingJumpNav } from "./LandingJumpNav";
import { LandingLogoWall } from "./LandingLogoWall";
import { LandingNav } from "./LandingNav";
import { LandingPlatforms } from "./LandingPlatforms";
import { LandingPricing } from "./LandingPricing";
import { LandingSignInRoot } from "./LandingSignInRoot";
import { LandingSolution } from "./LandingSolution";
import { LandingUseCases } from "./LandingUseCases";

export function LandingPage() {
  return (
    <LandingSignInRoot>
      <div className="lp lp--obsidian relative min-h-screen">
        <LandingBackdrop />
        <div className="relative z-10">
          <LandingAnnouncementBar />
          <LandingNav />
          <main id="main-content">
            <LandingHero />
            <LandingJumpNav />
            <LandingLogoWall />
            <LandingChallenge />
            <LandingSolution />
            <LandingPlatforms />
            <LandingUseCases />
            <LandingComparison />
            <LandingImpact />
            <LandingPricing />
            <LandingFAQ />
            <LandingContactSection />
            <LandingCTA />
          </main>
          <LandingFooter />
        </div>
      </div>
    </LandingSignInRoot>
  );
}

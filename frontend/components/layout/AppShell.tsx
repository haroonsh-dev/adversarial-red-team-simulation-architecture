"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopNav from "@/components/layout/TopNav";
import { BackendOfflineBanner } from "@/components/layout/BackendOfflineBanner";
import { SessionInvalidBanner } from "@/components/layout/SessionInvalidBanner";
import { WorkspaceRail } from "@/components/shared/WorkspaceRail";
import { PageContent } from "@/components/shared/PageContent";
import { AppFooter } from "@/components/layout/AppFooter";
import { AmbientCanvas } from "@/components/motion/AmbientCanvas";
import { DashboardMetricsProvider } from "@/lib/context/DashboardMetricsProvider";
import { AppDataProvider } from "@/lib/context/AppDataProvider";
import { cn } from "@/lib/utils";

const CommandPalette = dynamic(() => import("@/components/CommandPalette"), { ssr: false });

/** Client-only app chrome — ambient layer at z-0, UI at z-10. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const redTeam = pathname.startsWith("/red-team");
  const commandCenter = pathname.startsWith("/command-center");

  return (
    <AppDataProvider>
      <DashboardMetricsProvider>
        <div className="relative min-h-screen">
          {!commandCenter ? <AmbientCanvas variant="app" /> : null}
          <div className="platform-shell relative z-10 flex min-h-screen">
            <Sidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <TopNav />
              <main
                id="main-content"
                className={cn(
                  "app-canvas relative flex min-h-0 flex-1 flex-col",
                  commandCenter
                    ? "min-h-full overflow-y-auto p-0"
                    : "overflow-y-auto p-4 md:p-5 lg:p-6"
                )}
              >
                <div
                  className={cn(
                    "mx-auto flex min-h-0 flex-1 flex-col",
                    commandCenter
                      ? "min-h-full w-full max-w-none"
                      : redTeam
                        ? "w-full max-w-[1400px]"
                        : "w-full max-w-[1200px]"
                  )}
                >
                  {!redTeam && !commandCenter ? <WorkspaceRail /> : null}
                  <BackendOfflineBanner />
                  <SessionInvalidBanner />
                  <PageContent className="flex min-h-0 flex-1 flex-col">
                    {children}
                  </PageContent>
                  {!commandCenter ? <AppFooter /> : null}
                </div>
              </main>
            </div>
            <CommandPalette />
          </div>
        </div>
      </DashboardMetricsProvider>
    </AppDataProvider>
  );
}

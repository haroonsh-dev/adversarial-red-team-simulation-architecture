"use client";

import Link from "next/link";
import { LogoIcon, LogoWordmark } from "@/components/shared/Logo";
import {
  filterNavItemsByCapability,
  navSections,
} from "@/lib/navigation";
import { NavItemsList } from "@/components/layout/NavItemsList";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Sidebar() {
  const { identity, capabilities } = useAuthRole();

  const visibleSections = navSections
    .filter((section) => !section.adminOnly || identity.role === "admin")
    .map((section) => ({
      ...section,
      items: filterNavItemsByCapability(section.items, capabilities),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="shell-sidebar sticky top-0 z-40 hidden h-screen w-64 flex-col lg:flex">
      <Link
        href="/command-center"
        className="flex items-center gap-3 border-b border-border px-5 py-4 transition-colors hover:bg-muted/25"
      >
        <LogoIcon size={22} />
        <LogoWordmark size={22} />
      </Link>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1" aria-label="Main navigation">
          {visibleSections.map((section, sectionIndex) => (
            <div
              key={section.label || "primary"}
              className={cn(
                sectionIndex > 0 && "nav-section-block",
                sectionIndex === 0 && "pb-1"
              )}
            >
              {section.label ? <p className="nav-section-label">{section.label}</p> : null}
              <NavItemsList items={section.items} variant="desktop" />
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}

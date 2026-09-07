"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Logo from "@/components/shared/Logo";
import {
  filterNavItemsByCapability,
  navSections,
} from "@/lib/navigation";
import { NavItemsList } from "@/components/layout/NavItemsList";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { Button } from "@/components/ui/button";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { identity, capabilities } = useAuthRole();

  const visibleSections = navSections
    .filter((section) => !section.adminOnly || identity.role === "admin")
    .map((section) => ({
      ...section,
      items: filterNavItemsByCapability(section.items, capabilities),
    }))
    .filter((section) => section.items.length > 0);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // A11y: move focus into the dialog when it opens and restore it on close,
  // so keyboard and screen-reader users are not stranded behind the modal.
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const menuButton = menuButtonRef.current;
    dialog?.focus();
    return () => menuButton?.focus();
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        ref={menuButtonRef}
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
            />
            <motion.aside
              ref={dialogRef}
              tabIndex={-1}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <Logo iconSize={20} />
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
                {visibleSections.map((section) => (
                  <div key={section.label || "primary"} className="mb-6">
                    {section.label ? (
                      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.label}
                      </p>
                    ) : null}
                    <ul className="space-y-0.5">
                      <NavItemsList
                        items={section.items}
                        variant="mobile"
                        onNavigate={() => setOpen(false)}
                      />
                    </ul>
                  </div>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

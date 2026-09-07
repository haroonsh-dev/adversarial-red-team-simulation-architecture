"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Command, Play, FileText, Shield, Crosshair, Rocket } from "lucide-react";
import { navSections, flattenNavItems } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const OPEN_COMMAND_PALETTE = "artsa:open-command-palette";

const actionCommands = [
  { name: "Create API key", href: "/get-started", category: "Admin", icon: Rocket },
  { name: "Integrations", href: "/settings/integrations", category: "Admin", icon: Command },
  { name: "Start a campaign", href: "/red-team/campaigns", category: "Red Team", icon: Play },
  { name: "Open Attack Lab", href: "/red-team/lab", category: "Red Team", icon: Crosshair },
  { name: "View Reports", href: "/reports", category: "Report", icon: FileText },
  { name: "View Activity", href: "/logs", category: "Detect", icon: FileText },
  { name: "Open Sessions", href: "/replay", category: "Investigate", icon: Shield },
  { name: "AI Providers", href: "/admin/providers", category: "Admin", icon: Command },
];

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE));
  }
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const navCommands = useMemo(
    () =>
      navSections.flatMap((section) =>
        flattenNavItems(section.items).map((item) => ({
          name: item.name,
          href: item.href,
          icon: item.icon,
          category: section.label,
        }))
      ),
    []
  );

  const commands = useMemo(() => [...navCommands, ...actionCommands], [navCommands]);

  const filteredCommands = useMemo(
    () =>
      commands.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase())
      ),
    [commands, query]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  const handleSelect = useCallback(
    (href: string) => {
      setIsOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filteredCommands.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filteredCommands[activeIndex]) {
        e.preventDefault();
        handleSelect(filteredCommands[activeIndex].href);
      }
    };
    const open = () => setIsOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE, open);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE, open);
    };
  }, [isOpen, filteredCommands, activeIndex, handleSelect]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-24 backdrop-blur-sm animate-fade-in"
      role="presentation"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            placeholder="Jump to a page or run an action…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-autocomplete="list"
          />
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Close command palette">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={listRef} className="max-h-96 space-y-1 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              No matching commands for &quot;{query}&quot;.
            </p>
          ) : (
            filteredCommands.map((cmd, index) => {
              const Icon = cmd.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={`${cmd.category}-${cmd.href}-${cmd.name}`}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(cmd.href)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors",
                    active ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{cmd.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{cmd.category}</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    ↵
                  </Badge>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3 font-mono text-[11px] text-muted-foreground">
          <span>↑↓ navigate · ↵ open · ESC close</span>
          <span className="flex items-center gap-1">
            <Command className="h-3.5 w-3.5" aria-hidden />K
          </span>
        </div>
      </div>
    </div>
  );
}

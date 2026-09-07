"use client";

import { useState, useEffect, useMemo } from "react";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  ImagePlus,
  Check,
  Save,
  RotateCcw,
  Pencil,
  AlertCircle,
  Loader2,
  Lock,
  Trash2,
  Shield,
  Cpu,
  Radio,
  KeyRound,
  Terminal,
  Sparkles,
  Palette,
} from "lucide-react";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AvatarVisual } from "@/components/profile/AvatarVisual";
import {
  roleLabel,
  ENTERPRISE_AVATAR_COLORS,
  ENTERPRISE_AVATAR_VECTORS,
  parseAvatarValue,
} from "@/lib/profile";
import { toast } from "@/lib/stores/toast";
import { cn } from "@/lib/utils";
import type { Profile } from "./types";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface PersonalInfoSectionProps {
  profile: Profile | null;
  role: string;
  email: string | null;
  displayName: string;
  setDisplayName: (val: string) => void;
  avatar: string | null;
  setAvatar: (val: string | null) => void;
  phone: string;
  setPhone: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
  organization: string;
  setOrganization: (val: string) => void;
  pendingAvatar: { file: File; preview: string } | null;
  setPendingAvatar: (val: { file: File; preview: string } | null) => void;
  clearPendingAvatar: () => void;
  showEditable: boolean;
  editing: boolean;
  setEditing: (val: boolean) => void;
  dirty: boolean;
  savingName: boolean;
  onSaveProfile: () => Promise<void>;
  onResetEdits: () => void;
  initialsLabel: string;
  displayAvatar: string | null;
}

export function PersonalInfoSection({
  profile,
  role,
  email,
  displayName,
  setDisplayName,
  avatar,
  setAvatar,
  phone,
  setPhone,
  location,
  setLocation,
  organization,
  setOrganization,
  pendingAvatar,
  setPendingAvatar,
  clearPendingAvatar,
  showEditable,
  editing,
  setEditing,
  dirty,
  savingName,
  onSaveProfile,
  onResetEdits,
  initialsLabel,
}: PersonalInfoSectionProps) {
  const [dragActive, setDragActive] = useState(false);

  // Parse avatar string directly to determine active color theme & type
  const parsedState = useMemo(() => {
    return parseAvatarValue(avatar);
  }, [avatar]);

  const activeColorId = parsedState.colorId || "color:amber";
  const activeColorObj = useMemo(() => {
    return (
      ENTERPRISE_AVATAR_COLORS.find((c) => c.id === activeColorId) ||
      ENTERPRISE_AVATAR_COLORS[0]
    );
  }, [activeColorId]);

  const hasUploadedFile = Boolean(pendingAvatar);
  const isImageAvatar = hasUploadedFile || parsedState.type === "image";
  const isVectorAvatar = !hasUploadedFile && parsedState.type === "vector" && Boolean(parsedState.vectorId);
  const isMonogramAvatar = !isImageAvatar && !isVectorAvatar;

  // Build live preview avatar string with color tag attached
  const computedDisplayAvatar = useMemo(() => {
    if (pendingAvatar) {
      return `${pendingAvatar.preview}#${activeColorId}`;
    }
    return avatar ? `${avatar.split("#")[0]}#${activeColorId}` : activeColorId;
  }, [pendingAvatar, avatar, activeColorId]);

  // Global Ctrl+S / Cmd+S shortcut to save edits
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && editing && dirty && !savingName) {
        e.preventDefault();
        onSaveProfile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, dirty, savingName, onSaveProfile]);

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Unsupported file format", {
        description: "Please choose a PNG, JPEG, WebP, or GIF image.",
        variant: "error",
      });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast("Image too large", {
        description: "Avatar image must be 2 MB or smaller.",
        variant: "error",
      });
      return;
    }
    setPendingAvatar({ file, preview: URL.createObjectURL(file) });
    setAvatar(`uploaded#${activeColorId}`);
  };

  const handleRemovePhoto = () => {
    clearPendingAvatar();
    setAvatar(activeColorId);
  };

  const handleSelectMonogram = () => {
    clearPendingAvatar();
    setAvatar(activeColorId);
  };

  const handleSelectVectorBadge = (vectorId: string) => {
    clearPendingAvatar();
    setAvatar(`${vectorId}#${activeColorId}`);
  };

  const handleSelectColorTheme = (colorId: string) => {
    if (isImageAvatar) {
      const baseSrc = parsedState.imageSrc || (avatar ? avatar.split("#")[0] : "uploaded");
      setAvatar(`${baseSrc}#${colorId}`);
    } else if (isVectorAvatar && parsedState.vectorId) {
      setAvatar(`${parsedState.vectorId}#${colorId}`);
    } else {
      setAvatar(colorId);
    }
  };

  return (
    <div role="tabpanel" id="panel-general" aria-labelledby="tab-general">
      <DashboardCard
        title="Personal Identity & Details"
        description="Your name, portrait avatar, contact information, and organization."
        icon={<User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        actions={
          showEditable && !editing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(true);
                requestAnimationFrame(() =>
                  document.getElementById("profile-display-name")?.focus()
                );
              }}
              className="gap-1.5 text-xs shadow-xs hover:bg-muted font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Details
            </Button>
          ) : null
        }
      >
        {/* ── View Mode ──────────────────────────────────────────────────────── */}
        {!editing && (
          <div className="space-y-6">
            {/* Identity Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Full Name */}
              <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs transition-all hover:border-border">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Full Name</span>
                </div>
                <p className="mt-2 truncate text-sm font-bold text-foreground">
                  {profile?.display_name || roleLabel(role)}
                </p>
              </div>

              {/* Email Address */}
              <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs transition-all hover:border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Email Address</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                    <Lock className="mr-1 h-2.5 w-2.5" aria-hidden="true" /> Primary
                  </Badge>
                </div>
                <p className="mt-2 truncate font-mono text-xs text-foreground">
                  {email || "—"}
                </p>
              </div>

              {/* Organization */}
              <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs transition-all hover:border-border">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Organization</span>
                </div>
                <p className="mt-2 truncate text-sm font-bold text-foreground">
                  {profile?.organization || "Default Organization"}
                </p>
              </div>

              {/* Phone */}
              <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs transition-all hover:border-border">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Phone Number</span>
                </div>
                <p className="mt-2 truncate text-xs text-foreground font-mono">
                  {profile?.phone || "Not configured"}
                </p>
              </div>

              {/* Location */}
              <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs transition-all hover:border-border">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Location</span>
                </div>
                <p className="mt-2 truncate text-xs text-foreground">
                  {profile?.location || "Not configured"}
                </p>
              </div>

              {/* Role Tier */}
              <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs transition-all hover:border-border">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Clearance Level</span>
                </div>
                <p className="mt-2 truncate text-xs font-bold text-foreground">
                  {roleLabel(role)}
                </p>
              </div>
            </div>

            {/* Quick Helper Banner */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {showEditable ? (
                  <>
                    Need to change your avatar style, color theme, or personal details? Click <strong className="text-foreground">Edit Details</strong> above.
                  </>
                ) : (
                  <>Profile details for this role are managed centrally by the system administrator.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Edit Mode ──────────────────────────────────────────────────────── */}
        {showEditable && editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && !savingName) onSaveProfile();
            }}
            className="space-y-6"
          >
            {/* Professional Avatar Studio */}
            <div className="rounded-xl border border-border/80 bg-card p-5 space-y-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    Avatar & Color Theme Studio
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Switch freely between your name initials, security badges, or local photo, and customize with enterprise color themes.
                  </p>
                </div>
              </div>

              {/* Top: Current Avatar + Upload / Delete Dropzone */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="shrink-0 rounded-2xl border border-border p-0.5">
                  <AvatarVisual
                    avatar={computedDisplayAvatar}
                    label={initialsLabel}
                    size="xl"
                    showStatusIndicator
                    statusOnline
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      handleFileSelect(e.dataTransfer.files?.[0]);
                    }}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4 transition-all",
                      dragActive ? "border-foreground bg-muted shadow-inner" : "border-border/80 bg-muted/20"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        htmlFor="profile-avatar-upload-file"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-button px-3.5 py-2 text-xs font-medium text-button-foreground shadow-xs transition-colors hover:bg-button-hover focus-within:ring-2 focus-within:ring-foreground/15"
                      >
                        <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                        {isImageAvatar ? "Replace Photo" : "Upload Local Photo"}
                      </label>
                      <input
                        id="profile-avatar-upload-file"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          handleFileSelect(file);
                        }}
                      />

                      {/* Prominent Delete Picture Option */}
                      {isImageAvatar && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRemovePhoto}
                          className="h-9 gap-1.5 border-destructive/40 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold shadow-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete Picture
                        </Button>
                      )}
                    </div>

                    <span className="text-[11px] text-muted-foreground font-mono">
                      PNG, JPEG, WebP, or GIF (max 2 MB)
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. Identity Style Choice: Name Letters vs Vector Badges */}
              <div className="border-t border-border/60 pt-4 space-y-2.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Choose Avatar Style:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {/* Name Monogram Option */}
                  <button
                    type="button"
                    onClick={handleSelectMonogram}
                    style={{
                      borderColor: isMonogramAvatar ? activeColorObj.color : undefined,
                      boxShadow: isMonogramAvatar ? activeColorObj.glow : undefined,
                    }}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all",
                      isMonogramAvatar
                        ? "bg-card scale-[1.02]"
                        : "border-border/70 bg-card hover:bg-muted/40"
                    )}
                  >
                    <span
                      style={{
                        backgroundColor: activeColorObj.bg,
                        color: activeColorObj.color,
                        borderColor: activeColorObj.border,
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-mono font-bold shadow-xs"
                    >
                      {initialsLabel.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">Name Initials</p>
                      <p className="truncate text-[10px] text-muted-foreground">Default monogram</p>
                    </div>
                    {isMonogramAvatar && (
                      <span
                        style={{ backgroundColor: activeColorObj.color }}
                        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-foreground shadow-xs"
                      >
                        <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                      </span>
                    )}
                  </button>

                  {/* Vector Badges - Row 1 */}
                  {ENTERPRISE_AVATAR_VECTORS.slice(0, 3).map((vec) => {
                    const isSelected = isVectorAvatar && parsedState.vectorId === vec.id;
                    return (
                      <button
                        key={vec.id}
                        type="button"
                        onClick={() => handleSelectVectorBadge(vec.id)}
                        style={{
                          borderColor: isSelected ? activeColorObj.color : undefined,
                          boxShadow: isSelected ? activeColorObj.glow : undefined,
                        }}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all",
                          isSelected
                            ? "bg-card scale-[1.02]"
                            : "border-border/70 bg-card hover:bg-muted/40"
                        )}
                      >
                        <span
                          style={{
                            backgroundColor: isSelected ? activeColorObj.bg : undefined,
                            color: isSelected ? activeColorObj.color : undefined,
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-foreground shadow-xs"
                        >
                          {vec.id === "vector:shield" && <Shield className="h-4 w-4" aria-hidden="true" />}
                          {vec.id === "vector:cpu" && <Cpu className="h-4 w-4" aria-hidden="true" />}
                          {vec.id === "vector:radar" && <Radio className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-foreground">{vec.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">Security vector</p>
                        </div>
                        {isSelected && (
                          <span
                            style={{ backgroundColor: activeColorObj.color }}
                            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-foreground shadow-xs"
                          >
                            <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Vector Badges - Row 2 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {ENTERPRISE_AVATAR_VECTORS.slice(3).map((vec) => {
                    const isSelected = isVectorAvatar && parsedState.vectorId === vec.id;
                    return (
                      <button
                        key={vec.id}
                        type="button"
                        onClick={() => handleSelectVectorBadge(vec.id)}
                        style={{
                          borderColor: isSelected ? activeColorObj.color : undefined,
                          boxShadow: isSelected ? activeColorObj.glow : undefined,
                        }}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all",
                          isSelected
                            ? "bg-card scale-[1.02]"
                            : "border-border/70 bg-card hover:bg-muted/40"
                        )}
                      >
                        <span
                          style={{
                            backgroundColor: isSelected ? activeColorObj.bg : undefined,
                            color: isSelected ? activeColorObj.color : undefined,
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-foreground shadow-xs"
                        >
                          {vec.id === "vector:lock" && <KeyRound className="h-4 w-4" aria-hidden="true" />}
                          {vec.id === "vector:terminal" && (
                            <Terminal className="h-[18px] w-[18px] stroke-[2.25]" aria-hidden="true" />
                          )}
                          {vec.id === "vector:sparkles" && <Sparkles className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-foreground">{vec.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">Security vector</p>
                        </div>
                        {isSelected && (
                          <span
                            style={{ backgroundColor: activeColorObj.color }}
                            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-foreground shadow-xs"
                          >
                            <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Color Theme Selector (With Dynamic Theme-Colored Checkmarks!) */}
              <div className="border-t border-border/60 pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Color theme {isImageAvatar && <span className="font-normal text-muted-foreground">(border tint)</span>}:
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5" role="radiogroup" aria-label="Color themes">
                  {ENTERPRISE_AVATAR_COLORS.map((color) => {
                    const isSelected = activeColorId === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleSelectColorTheme(color.id)}
                        style={{
                          borderColor: isSelected ? color.color : undefined,
                          boxShadow: isSelected ? color.glow : undefined,
                        }}
                        className={cn(
                          "relative flex items-center gap-2 rounded-xl border-2 p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15",
                          isSelected
                            ? "bg-card scale-[1.03]"
                            : "border-border/70 bg-card hover:bg-muted/40"
                        )}
                      >
                        <span
                          style={{
                            backgroundColor: color.bg,
                            color: color.color,
                            borderColor: color.border,
                            boxShadow: color.glow,
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-mono font-bold shadow-xs"
                        >
                          {initialsLabel.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-[11px] font-bold text-foreground">
                          {color.name}
                        </span>

                        {/* Theme-Colored Checkmark Badge matching the exact selected color! */}
                        {isSelected && (
                          <span
                            style={{ backgroundColor: color.color }}
                            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-foreground shadow-xs"
                          >
                            <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Input Form Fields Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Display Name */}
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="profile-display-name"
                    className="text-xs font-bold text-foreground flex items-center gap-1.5"
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      displayName.length > 40 ? "text-severity-critical font-bold" : "text-muted-foreground"
                    )}
                  >
                    {displayName.length}/48
                  </span>
                </div>
                <Input
                  id="profile-display-name"
                  value={displayName}
                  maxLength={48}
                  placeholder="Your full name"
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1.5 text-xs shadow-xs"
                  aria-required="true"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Your public name across reports, alerts, and incident logs.
                </p>
              </div>

              {/* Email (Read Only) */}
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="profile-email-readonly"
                    className="text-xs font-bold text-foreground flex items-center gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    Email Address
                  </label>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                    <Lock className="mr-1 h-2.5 w-2.5" aria-hidden="true" /> Locked
                  </Badge>
                </div>
                <Input
                  id="profile-email-readonly"
                  value={email || ""}
                  disabled
                  className="mt-1.5 bg-muted/40 font-mono text-xs opacity-75 cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Primary identifier managed by account policy.
                </p>
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="profile-phone"
                  className="text-xs font-bold text-foreground flex items-center gap-1.5"
                >
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Phone Number
                </label>
                <Input
                  id="profile-phone"
                  value={phone}
                  maxLength={255}
                  placeholder="+1 (555) 012-3456"
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  className="mt-1.5 text-xs shadow-xs font-mono"
                />
              </div>

              {/* Location */}
              <div>
                <label
                  htmlFor="profile-location"
                  className="text-xs font-bold text-foreground flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Location / City
                </label>
                <Input
                  id="profile-location"
                  value={location}
                  maxLength={255}
                  placeholder="e.g. San Francisco, CA"
                  onChange={(e) => setLocation(e.target.value)}
                  autoComplete="street-address"
                  className="mt-1.5 text-xs shadow-xs"
                />
              </div>

              {/* Organization */}
              <div className="md:col-span-2">
                <label
                  htmlFor="profile-org"
                  className="text-xs font-bold text-foreground flex items-center gap-1.5"
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Organization / Team
                </label>
                <Input
                  id="profile-org"
                  value={organization}
                  maxLength={255}
                  placeholder="e.g. Security Operations Unit"
                  onChange={(e) => setOrganization(e.target.value)}
                  autoComplete="organization"
                  className="mt-1.5 text-xs shadow-xs"
                />
              </div>
            </div>

            {/* Smart Action Bar with Shortcut Indicator */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
              <div className="flex items-center gap-2 text-xs">
                {dirty ? (
                  <span className="flex items-center gap-1.5 font-medium text-severity-medium" role="status">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Unsaved changes pending (Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Ctrl+S</kbd> to save)
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    All profile details are up to date.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetEdits}
                  disabled={savingName || !dirty}
                  className="gap-1.5 text-xs shadow-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Revert
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={savingName || !dirty}
                  className="gap-1.5 text-xs shadow-xs font-semibold"
                >
                  {savingName ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          </form>
        )}
      </DashboardCard>
    </div>
  );
}

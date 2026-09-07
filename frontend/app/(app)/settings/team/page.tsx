"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  UserCircle2,
  Shield,
  Loader2,
  BadgeCheck,
} from "lucide-react";
import { fetchFromBackend } from "@/lib/api";
import { isOidcEnabled } from "@/lib/oidc";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/stores/toast";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  last_active: string | null;
  auth_method: string;
  added_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  analyst: "Security Analyst",
  redteam: "Red Team Operator",
  readonly: "Read-Only Viewer",
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "analyst" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetchFromBackend<{ members?: TeamMember[]; roles?: string[]; oidc_enabled?: boolean }>(
      "/api/v1/settings/team",
      { silent: true }
    ).then((d) => {
      if (d?.members) setMembers(d.members);
      if (d?.roles) setRoles(d.roles);
      if (d?.oidc_enabled != null) setOidcEnabled(d.oidc_enabled);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const addMember = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast("Missing fields", { description: "Name and email are required.", variant: "error" });
      return;
    }
    setSaving(true);
    const res = await fetchFromBackend<{ status?: string }>("/api/v1/settings/team", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res?.status === "added") {
      toast("Member added", { description: `${form.name} (${form.email})` });
      setForm({ name: "", email: "", role: "analyst" });
      load();
    }
  };

  const updateRole = async (memberId: string, newRole: string) => {
    await fetchFromBackend(`/api/v1/settings/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    load();
  };

  const toggleStatus = async (memberId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    await fetchFromBackend(`/api/v1/settings/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  const removeMember = async (memberId: string) => {
    const res = await fetchFromBackend<{ status?: string }>(`/api/v1/settings/team/${memberId}`, {
      method: "DELETE",
      silent: true,
    });
    if (res?.status === "removed") {
      toast("Member removed", { description: "Team member has been removed." });
      load();
    }
  };

  const oidcClientEnabled = isOidcEnabled() || oidcEnabled;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team & Access"
        description="People, roles, and who can do what."
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Badge variant="info" className="font-mono text-[10px]">{members.length} members</Badge>
            {oidcClientEnabled && (
              <Badge variant="success" className="gap-1 font-mono text-[10px]">
                <BadgeCheck className="h-3 w-3" /> SSO enabled
              </Badge>
            )}
          </div>
        }
      />

      {/* Add Member Form */}
      <DashboardCard
        title="Add team member"
        description={oidcClientEnabled ? "Members can also sign in via OIDC SSO. Manual entries create local accounts." : "Add members manually with role-based access control."}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input placeholder="Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" placeholder="jane@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={addMember} disabled={saving} className="gap-2 w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add member
            </Button>
          </div>
        </div>
      </DashboardCard>

      {/* Members Table */}
      <DashboardCard title="Members" badge={<Shield className="h-4 w-4 text-muted-foreground" />}>
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No team members" description="Add your first team member above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Member</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Auth</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Added</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
                          <UserCircle2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{m.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <select
                        className="h-7 rounded border border-border bg-transparent px-2 text-xs"
                        value={m.role}
                        onChange={(e) => updateRole(m.id, e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="secondary" className="font-mono text-[10px] capitalize">{m.auth_method}</Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <button
                        onClick={() => toggleStatus(m.id, m.status)}
                        className="cursor-pointer"
                        aria-label={`${m.status === "active" ? "Suspend" : "Activate"} ${m.name}`}
                        title={`${m.status === "active" ? "Suspend" : "Activate"} ${m.name}`}
                      >
                        <Badge variant={m.status === "active" ? "success" : "secondary"} className="text-[10px] capitalize">
                          {m.status}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {formatDate(m.added_at)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={() => removeMember(m.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface TeamMemberRowData {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  openTaskCount: number;
}

const ROLE_BADGE: Record<string, string> = {
  Admin: "bg-purple-100 text-purple-700",
  Member: "bg-blue-100 text-blue-700",
  Viewer: "bg-gray-100 text-gray-600",
};

const ROLES = ["Admin", "Member", "Viewer"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TeamMemberRow({ member }: { member: TeamMemberRowData }) {
  const [role, setRole] = useState(member.role);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();

  async function handleRoleChange(newRole: string) {
    const prev = role;
    setRole(newRole);
    setUpdating(true);
    const res = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setUpdating(false);
    if (!res.ok) {
      setRole(prev);
      return;
    }
    router.refresh();
  }

  async function handleRemove() {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    setRemoving(true);
    const res = await fetch(`/api/team/${member.id}`, { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) return;
    router.refresh();
  }

  return (
    <tr className="border-t border-gray-100">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {initials(member.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">{member.name}</div>
            <div className="truncate text-xs text-gray-500">{member.email}</div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[member.role] ?? ROLE_BADGE.Member}`}>
          {member.role}
        </span>
      </td>
      <td className="py-3 pr-4 text-sm text-gray-700">{member.openTaskCount}</td>
      <td className="py-3 pr-4 text-sm text-gray-500">
        {new Date(member.createdAt).toLocaleDateString()}
      </td>
      <td className="py-3 pr-4">
        <select
          value={role}
          disabled={updating || removing}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 text-right">
        <button
          onClick={handleRemove}
          disabled={removing || updating}
          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      </td>
    </tr>
  );
}

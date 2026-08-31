"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/app-ui";

type Role = "owner" | "admin" | "finance" | "developer" | "viewer";
type Member = { id: string; role: string; createdAt: string | Date; userId: string; email: string; name: string | null };

export function MemberManager({ initialMembers, canManage, currentRole }: { initialMembers: Member[]; canManage: boolean; currentRole: string }) {
  const [members, setMembers] = useState(initialMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function changeRole(id: string, role: Role) {
    setBusy(id); setMessage(null);
    try {
      const response = await fetch(`/api/v1/members/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Role update failed");
      setMembers((rows) => rows.map((row) => row.id === id ? { ...row, role } : row));
      setMessage("Member role updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Role update failed"); }
    finally { setBusy(null); }
  }

  async function removeMember(id: string) {
    setBusy(id); setMessage(null);
    try {
      const response = await fetch(`/api/v1/members/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Member removal failed");
      setMembers((rows) => rows.filter((row) => row.id !== id));
      setMessage("Member removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Member removal failed"); }
    finally { setBusy(null); }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Members</h2><p>Role and removal changes are enforced server-side, including last-owner protection.</p></div></div>
    <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th>{canManage ? <th>Actions</th> : null}</tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.name ?? member.email}</strong><br/><small>{member.email}</small></td><td>{canManage ? <select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy === member.id} onChange={(event) => void changeRole(member.id, event.target.value as Role)}>{(["owner", "admin", "finance", "developer", "viewer"] as const).map((role) => <option key={role} value={role} disabled={currentRole !== "owner" && (role === "owner" || role === "admin")}>{role}</option>)}</select> : <StatusBadge status={member.role} />}</td><td>{new Date(member.createdAt).toLocaleDateString()}</td>{canManage ? <td><button type="button" className="button button--ghost" disabled={busy === member.id} onClick={() => void removeMember(member.id)}>Remove</button></td> : null}</tr>)}</tbody></table></div>
    {message ? <div className="app-panel__body"><small role="status">{message}</small></div> : null}
  </section>;
}

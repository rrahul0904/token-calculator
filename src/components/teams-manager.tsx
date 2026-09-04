"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; slug: string; costCenter: string | null; archivedAt: string | null };
type OrgMember = { userId: string; name: string | null; email: string };
type Project = { id: string; name: string };
type TeamMember = { id: string; userId: string; role: string; name: string | null; email: string };
type TeamProject = { id: string; projectId: string; name: string };

export function TeamsManager({ canManage, organizationMembers, projects }: { canManage: boolean; organizationMembers: OrgMember[]; projects: Project[] }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamProjects, setTeamProjects] = useState<TeamProject[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => teams.find((team) => team.id === selectedId) ?? null, [selectedId, teams]);

  const loadTeams = useCallback(async () => {
    const response = await fetch("/api/v1/teams", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      const next = (body?.data ?? []) as Team[];
      setTeams(next);
      setSelectedId((current) => current && next.some((team) => team.id === current) ? current : next[0]?.id ?? null);
    }
  }, []);

  const loadSelected = useCallback(async (id: string | null) => {
    if (!id) { setMembers([]); setTeamProjects([]); return; }
    const [memberResponse, projectResponse] = await Promise.all([
      fetch(`/api/v1/teams/${encodeURIComponent(id)}/members`, { cache: "no-store" }),
      fetch(`/api/v1/teams/${encodeURIComponent(id)}/projects`, { cache: "no-store" }),
    ]);
    const [memberBody, projectBody] = await Promise.all([memberResponse.json().catch(() => null), projectResponse.json().catch(() => null)]);
    if (memberResponse.ok) setMembers(memberBody?.data ?? []);
    if (projectResponse.ok) setTeamProjects(projectBody?.data ?? []);
  }, []);

  useEffect(() => { void loadTeams(); }, [loadTeams]);
  useEffect(() => { void loadSelected(selectedId); }, [loadSelected, selectedId]);

  function updateName(next: string) {
    setName(next);
    if (!slug || slug === name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) setSlug(next.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  async function createTeam() {
    if (!name.trim() || !slug.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/teams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, slug, costCenter: costCenter || null }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Create team failed");
      setName(""); setSlug(""); setCostCenter(""); setMessage("Team created.");
      await loadTeams();
      setSelectedId(body?.data?.id ?? null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Create team failed"); }
    finally { setBusy(false); }
  }

  async function addMember() {
    if (!selectedId || !memberId) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/v1/teams/${encodeURIComponent(selectedId)}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: memberId, role: memberRole }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Add member failed");
      setMemberId(""); setMessage("Team member updated."); await loadSelected(selectedId);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Add member failed"); }
    finally { setBusy(false); }
  }

  async function removeMember(userId: string) {
    if (!selectedId) return;
    const response = await fetch(`/api/v1/teams/${encodeURIComponent(selectedId)}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    setMessage(response.ok ? "Member removed from team." : "Remove member failed.");
    await loadSelected(selectedId);
  }

  async function addProject() {
    if (!selectedId || !projectId) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/v1/teams/${encodeURIComponent(selectedId)}/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Assign project failed");
      setProjectId(""); setMessage("Project assigned to team."); await loadSelected(selectedId);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Assign project failed"); }
    finally { setBusy(false); }
  }

  async function removeProject(project: string) {
    if (!selectedId) return;
    const response = await fetch(`/api/v1/teams/${encodeURIComponent(selectedId)}/projects?projectId=${encodeURIComponent(project)}`, { method: "DELETE" });
    setMessage(response.ok ? "Project removed from team." : "Remove project failed.");
    await loadSelected(selectedId);
  }

  async function updateTeam(patch: Record<string, unknown>) {
    if (!selectedId) return;
    const response = await fetch(`/api/v1/teams/${encodeURIComponent(selectedId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const body = await response.json().catch(() => null);
    setMessage(response.ok ? "Team updated." : body?.error ?? "Update failed");
    await loadTeams();
  }

  async function deleteTeam() {
    if (!selectedId || !selected || !window.confirm(`Delete team ${selected.name}? Project assignments and team memberships will be removed.`)) return;
    const response = await fetch(`/api/v1/teams/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
    setMessage(response.ok ? "Team deleted." : "Delete failed.");
    await loadTeams();
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Teams</h2><p>Teams are real policy, showback and project-attribution scopes—not free-form labels.</p></div></div>
    <div className="app-panel__body app-stack">
      {canManage ? <div className="form-grid"><div className="form-row"><label htmlFor="team-name">Team name</label><input id="team-name" value={name} onChange={(event) => updateName(event.target.value)} placeholder="Platform Engineering" /></div><div className="form-row"><label htmlFor="team-slug">Slug</label><input id="team-slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="platform-engineering" /></div><div className="form-row"><label htmlFor="team-cost-center">Cost center</label><input id="team-cost-center" value={costCenter} onChange={(event) => setCostCenter(event.target.value)} placeholder="R&D-100" /></div><div className="form-actions"><button className="button button--primary" disabled={busy || !name.trim() || !slug.trim()} onClick={() => void createTeam()} type="button">Create team</button></div></div> : null}

      {teams.length ? <div className="form-row"><label htmlFor="team-select">Selected team</label><select id="team-select" value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)}>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}{team.archivedAt ? " (archived)" : ""}</option>)}</select><small>{selected?.costCenter ? `Cost center ${selected.costCenter}` : "No team-level cost center assigned"}</small></div> : <p>No teams yet.</p>}

      {selected ? <>
        <div className="app-grid">
          <div className="app-panel"><div className="app-panel__header"><div><h3>Members</h3><p>Only existing organization members can join a team.</p></div></div><div className="app-panel__body app-stack">{canManage ? <div className="form-actions"><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Choose member</option>{organizationMembers.filter((member) => !members.some((existing) => existing.userId === member.userId)).map((member) => <option key={member.userId} value={member.userId}>{member.name ?? member.email}</option>)}</select><select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="lead">Lead</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button className="button button--ghost" type="button" disabled={!memberId || busy} onClick={() => void addMember()}>Add</button></div> : null}<div className="finding-list">{members.map((member) => <div className="finding" key={member.id}><div className="finding__top"><div><strong>{member.name ?? member.email}</strong><p>{member.email} · {member.role}</p></div>{canManage ? <button className="button button--ghost" type="button" onClick={() => void removeMember(member.userId)}>Remove</button> : null}</div></div>)}</div></div></div>
          <div className="app-panel"><div className="app-panel__header"><div><h3>Projects</h3><p>Project assignment makes team policy and finance attribution deterministic.</p></div></div><div className="app-panel__body app-stack">{canManage ? <div className="form-actions"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose project</option>{projects.filter((project) => !teamProjects.some((existing) => existing.projectId === project.id)).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className="button button--ghost" type="button" disabled={!projectId || busy} onClick={() => void addProject()}>Assign</button></div> : null}<div className="finding-list">{teamProjects.map((project) => <div className="finding" key={project.id}><div className="finding__top"><strong>{project.name}</strong>{canManage ? <button className="button button--ghost" type="button" onClick={() => void removeProject(project.projectId)}>Remove</button> : null}</div></div>)}</div></div></div>
        </div>
        {canManage ? <div className="form-actions"><button className="button button--ghost" type="button" onClick={() => void updateTeam({ archived: !selected.archivedAt })}>{selected.archivedAt ? "Restore team" : "Archive team"}</button><button className="button button--ghost" type="button" onClick={() => void deleteTeam()}>Delete team</button></div> : null}
      </> : null}
      <small role="status">{message}</small>
    </div>
  </section>;
}

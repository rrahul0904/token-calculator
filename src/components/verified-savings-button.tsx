"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VerifiedSavingsButton({ experimentId, canManage, eligible }: { experimentId: string; canManage: boolean; eligible: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!canManage || !eligible) return null;

  async function verify() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/experiments/${encodeURIComponent(experimentId)}/savings-verifications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = await response.json().catch(() => null) as { created?: boolean; data?: { version?: number }; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Verified savings recording failed");
      setMessage(payload?.created === false ? "This evidence snapshot is already recorded." : `Verified savings v${payload?.data?.version ?? ""} recorded.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verified savings recording failed");
    } finally {
      setBusy(false);
    }
  }

  return <div className="form-actions">
    <button className="button button--ghost" type="button" disabled={busy} onClick={() => void verify()}>
      {busy ? "Recording…" : "Record verified savings"}
    </button>
    {message ? <small role="status">{message}</small> : null}
  </div>;
}

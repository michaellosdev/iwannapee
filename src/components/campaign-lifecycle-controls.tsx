"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, LoaderCircle, Trash2 } from "lucide-react";

type CampaignLifecycleControlsProps = {
  campaignId: string;
  status: string;
};

export function CampaignLifecycleControls({ campaignId, status }: CampaignLifecycleControlsProps) {
  const router = useRouter();
  const [working, setWorking] = useState<"stop" | "delete" | "">("");
  const [error, setError] = useState("");
  const canStop = status === "active" || status === "pending_payment";

  async function runAction(action: "stop" | "delete") {
    if (working) return;
    const confirmed = window.confirm(action === "stop"
      ? "Stop this campaign now? It will disappear from sponsored placements immediately. This does not issue a refund."
      : "Delete this campaign from My Promotions? It will stop immediately and be hidden from your dashboard. This does not issue a refund, and payment records are retained.");
    if (!confirmed) return;

    setWorking(action);
    setError("");
    try {
      const response = await fetch("/api/business/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaignId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Campaign could not be updated.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Campaign could not be updated.");
      setWorking("");
    }
  }

  return (
    <div className="business-campaign-control-wrap">
      <div className="business-campaign-controls">
        {canStop ? (
          <button className="button business-campaign-stop" disabled={Boolean(working)} onClick={() => runAction("stop")} type="button">
            {working === "stop" ? <LoaderCircle className="business-payment-resume-spinner" size={16} /> : <CircleStop size={16} />}
            {working === "stop" ? "Stopping…" : "Stop campaign"}
          </button>
        ) : null}
        <button className="button business-campaign-delete" disabled={Boolean(working)} onClick={() => runAction("delete")} type="button">
          {working === "delete" ? <LoaderCircle className="business-payment-resume-spinner" size={16} /> : <Trash2 size={16} />}
          {working === "delete" ? "Deleting…" : "Delete campaign"}
        </button>
      </div>
      {error ? <p className="business-campaign-control-error" role="alert">{error}</p> : null}
      <small className="business-campaign-no-refund">Stopping or deleting a campaign does not issue a refund.</small>
    </div>
  );
}

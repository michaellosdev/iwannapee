"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FlaskConical, Gavel, Megaphone, ShieldCheck, Trash2, UserCog, X } from "lucide-react";

type DashboardData = {
  profiles: Array<{ id: string; display_name: string | null; email: string; role: string; is_moderator: boolean; created_at: string }>;
  restrooms: Array<{ id: string; name: string; address: string; hours: string | null; directions: string | null; access_code: string | null; cover_photo_url: string | null; created_by: string | null; created_at: string; status: string }>;
  updates: Array<{ id: string; restroom_id: string; restroom_name: string; update_type: string; proposed_value: string; created_at: string }>;
  reports: Array<{ id: string; restroom_id: string; restroom_name: string; reason: string; details: string | null; created_at: string }>;
  campaigns: Array<{ id: string; business_name: string; restroom_name: string; address: string; headline: string; offer_text: string; placement_bid_cents: number; status: string; is_test: boolean; starts_at: string | null; ends_at: string | null; created_at: string }>;
};

export function AdminDashboard({ currentUserId, initialData }: { currentUserId: string; initialData: DashboardData }) {
  const router = useRouter();
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [sample, setSample] = useState({
    businessName: "IWANNAPEE Test Cafe",
    restroomName: "Sample sponsored restroom",
    address: "200 N Grand Ave, Los Angeles, CA",
    latitude: "34.0553",
    longitude: "-118.2498",
    headline: "Owner-only placement test",
    offerText: "This sample campaign is visible only to the owner account and never charges Stripe.",
    placementBidCents: "2000",
  });

  async function runAction(action: string, payload: Record<string, unknown>) {
    const key = `${action}:${String(payload.id || "new")}`;
    setWorking(key);
    setNotice("");
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Owner action failed.");
      setNotice(result.message || "Saved.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Owner action failed.");
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="admin-dashboard">
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <section className="admin-section">
        <div className="admin-section-heading"><div><ShieldCheck size={20} /><h2>Restroom approvals</h2></div><span>{initialData.restrooms.length} pending</span></div>
        <div className="admin-grid">
          {initialData.restrooms.map((restroom) => (
            <article className="admin-card" key={restroom.id}>
              {restroom.cover_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Submitted restroom" src={restroom.cover_photo_url} />
              )}
              <small>{new Date(restroom.created_at).toLocaleString()}</small>
              <h3>{restroom.name}</h3><p>{restroom.address}</p>
              <dl><div><dt>Hours</dt><dd>{restroom.hours || "Not supplied"}</dd></div><div><dt>Directions</dt><dd>{restroom.directions || "Not supplied"}</dd></div><div><dt>Code</dt><dd>{restroom.access_code || "None"}</dd></div></dl>
              <div className="admin-actions">
                <button disabled={Boolean(working)} onClick={() => runAction("restroom_status", { id: restroom.id, status: "published" })}><Check size={15} /> Approve</button>
                <button disabled={Boolean(working)} onClick={() => runAction("restroom_status", { id: restroom.id, status: "rejected" })}><X size={15} /> Reject</button>
              </div>
            </article>
          ))}
          {initialData.restrooms.length === 0 && <p className="admin-empty">No restroom submissions are waiting.</p>}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><div><Gavel size={20} /><h2>Corrections & reports</h2></div><span>{initialData.updates.length + initialData.reports.length} open</span></div>
        <div className="admin-grid admin-grid-compact">
          {initialData.updates.map((update) => (
            <article className="admin-card" key={update.id}>
              <small>Suggested {update.update_type}</small><h3>{update.restroom_name}</h3><p>{update.proposed_value}</p>
              <div className="admin-actions"><button onClick={() => runAction("update_status", { id: update.id, status: "accepted" })}><Check size={15} /> Apply</button><button onClick={() => runAction("update_status", { id: update.id, status: "rejected" })}><X size={15} /> Reject</button></div>
            </article>
          ))}
          {initialData.reports.map((report) => (
            <article className="admin-card" key={report.id}>
              <small>Report: {report.reason.replaceAll("_", " ")}</small><h3>{report.restroom_name}</h3><p>{report.details || "No additional detail."}</p>
              <div className="admin-actions"><button onClick={() => runAction("report_status", { id: report.id, status: "resolved" })}><Check size={15} /> Resolve</button><button onClick={() => runAction("report_status", { id: report.id, status: "dismissed" })}><X size={15} /> Dismiss</button></div>
            </article>
          ))}
          {initialData.updates.length + initialData.reports.length === 0 && <p className="admin-empty">No corrections or reports are waiting.</p>}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><div><UserCog size={20} /><h2>User roles</h2></div><span>{initialData.profiles.length} users</span></div>
        <div className="admin-user-list">
          {initialData.profiles.map((profile) => (
            <div key={profile.id}><span><strong>{profile.display_name || profile.email}</strong><small>{profile.email}</small></span><select aria-label={`Role for ${profile.email}`} disabled={profile.id === currentUserId || Boolean(working)} onChange={(event) => runAction("profile_role", { id: profile.id, role: event.target.value })} value={profile.role}><option value="user">User</option><option value="moderator">Moderator</option><option value="owner">Owner</option></select></div>
          ))}
        </div>
      </section>

      <section className="admin-section admin-sample-section">
        <div className="admin-section-heading"><div><FlaskConical size={20} /><h2>Test sponsored placement</h2></div><span>No payment</span></div>
        <p className="admin-section-copy">Creates an active test campaign that only your signed-in owner account can see. Search near its coordinates on the homepage to verify bid order, cards, pins, QR, and promo treatments.</p>
        <div className="admin-sample-form">
          {Object.entries(sample).map(([key, value]) => (
            <label className={key === "offerText" ? "admin-wide" : ""} key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span>{key === "offerText" ? <textarea onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))} value={value} /> : <input onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))} value={value} />}</label>
          ))}
          <button className="button button-primary admin-wide" disabled={Boolean(working)} onClick={() => runAction("sample_create", sample)}><Megaphone size={17} /> Create owner-only sample ad</button>
        </div>
        <div className="admin-campaign-list">
          {initialData.campaigns.map((campaign) => (
            <article key={campaign.id}><div><small>{campaign.is_test ? "TEST" : "PAID"} · {campaign.status} · bid ${(campaign.placement_bid_cents / 100).toFixed(2)}</small><strong>{campaign.business_name} — {campaign.headline}</strong><span>{campaign.address}</span></div>{campaign.is_test && campaign.status === "active" && <button aria-label="Cancel test ad" onClick={() => runAction("sample_cancel", { id: campaign.id })}><Trash2 size={16} /></button>}</article>
          ))}
        </div>
      </section>
    </div>
  );
}

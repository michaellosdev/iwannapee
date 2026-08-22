"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Ban, Check, Eye, FlaskConical, Gavel, Images, MapPin, MessageCircle, Megaphone, ShieldCheck, Trash2, UserCog, X } from "lucide-react";

type AdminRestroom = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  directions: string | null;
  hours: string | null;
  hours_schedule_status: string;
  timezone: string | null;
  weekly_hours: unknown;
  latitude: number;
  longitude: number;
  is_open_now: boolean | null;
  access_code: string | null;
  access_instructions: string | null;
  cover_photo_url: string | null;
  features: string[];
  created_by: string | null;
  created_at: string;
  status: string;
  data_source: string;
  source_url: string | null;
  last_verified_at: string;
};

type DashboardData = {
  profiles: Array<{ id: string; display_name: string | null; email: string; role: string; is_moderator: boolean; created_at: string }>;
  restrooms: AdminRestroom[];
  updates: Array<{ id: string; restroom_id: string; restroom_name: string; update_type: string; proposed_value: string; upvote_count: number; downvote_count: number; created_at: string }>;
  reports: Array<{ id: string; restroom_id: string; restroom_name: string; reason: string; details: string | null; created_at: string }>;
  campaigns: Array<{ id: string; created_by: string; creator_email: string; business_name: string; restroom_name: string; address: string; headline: string; offer_text: string; price_cents: number; placement_bid_cents: number; support_amount_cents: number; status: string; is_test: boolean; stripe_payment_intent_id: string | null; starts_at: string | null; ends_at: string | null; stopped_at: string | null; deleted_at: string | null; refund_requested_at: string | null; payment_refunded_at: string | null; created_at: string }>;
  photos: Array<{ id: string; restroom_id: string; restroom_name: string; review_id: string | null; user_id: string; contributor: string; public_url: string; caption: string | null; status: string; created_at: string }>;
  notes: Array<{ id: string; restroom_id: string; restroom_name: string; parent_id: string | null; user_id: string; contributor: string; body: string; status: string; upvote_count: number; downvote_count: number; created_at: string }>;
};

export function AdminDashboard({ currentUserId, initialData }: { currentUserId: string; initialData: DashboardData }) {
  const router = useRouter();
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedRestroom, setSelectedRestroom] = useState<AdminRestroom | null>(null);
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

  function runConfirmedAction(action: string, payload: Record<string, unknown>, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    void runAction(action, payload);
  }

  return (
    <div className="admin-dashboard">
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <section className="admin-section">
        <div className="admin-section-heading"><div><ShieldCheck size={20} /><h2>Restroom approvals</h2></div><span>{initialData.restrooms.length} pending</span></div>
        <div className="admin-grid">
          {initialData.restrooms.map((restroom) => (
            <article className="admin-card" key={restroom.id}>
              <button className="admin-card-open" onClick={() => setSelectedRestroom(restroom)} type="button">
                {restroom.cover_photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Submitted restroom" src={restroom.cover_photo_url} />
                )}
                <small>{new Date(restroom.created_at).toLocaleString()}</small>
                <h3>{restroom.name}</h3><p>{restroom.address}</p>
                <span><Eye size={14} /> View all details</span>
              </button>
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
        <div className="admin-section-heading"><div><Images size={20} /><h2>Community photos</h2></div><span>{initialData.photos.length} pending</span></div>
        <p className="admin-section-copy">Restroom and review photos stay hidden from the public until you publish them here. Rejected files are removed from Storage.</p>
        <div className="admin-grid">
          {initialData.photos.map((photo) => (
            <article className="admin-card" key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`Community submission for ${photo.restroom_name}`} src={photo.public_url} />
              <small>{photo.review_id ? "Review photo" : "Restroom photo"} · {new Date(photo.created_at).toLocaleString()}</small>
              <h3>{photo.restroom_name}</h3>
              <p>{photo.caption || "No caption."}</p>
              <small>Submitted by {photo.contributor}</small>
              <div className="admin-actions">
                <button disabled={Boolean(working)} onClick={() => runAction("community_photo_status", { id: photo.id, status: "published" })}><Check size={15} /> Publish</button>
                <button disabled={Boolean(working)} onClick={() => runAction("community_photo_status", { id: photo.id, status: "rejected" })}><X size={15} /> Reject</button>
              </div>
            </article>
          ))}
          {initialData.photos.length === 0 && <p className="admin-empty">No community photos are waiting.</p>}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><div><MessageCircle size={20} /><h2>Community notes</h2></div><span>{initialData.notes.length} recent</span></div>
        <div className="admin-grid admin-grid-compact">
          {initialData.notes.map((note) => (
            <article className="admin-card" key={note.id}>
              <small>{note.parent_id ? "Reply" : "Note"} · {note.status} · {new Date(note.created_at).toLocaleString()}</small>
              <h3>{note.restroom_name}</h3>
              <p>{note.body}</p>
              <dl><div><dt>Contributor</dt><dd>{note.contributor}</dd></div><div><dt>Votes</dt><dd>{note.upvote_count} up · {note.downvote_count} down</dd></div></dl>
              <div className="admin-actions">
                {note.status === "published"
                  ? <button disabled={Boolean(working)} onClick={() => runAction("community_note_status", { id: note.id, status: "hidden" })}><X size={15} /> Hide</button>
                  : <button className="admin-restore-action" disabled={Boolean(working)} onClick={() => runAction("community_note_status", { id: note.id, status: "published" })}><Check size={15} /> Restore</button>}
              </div>
            </article>
          ))}
          {initialData.notes.length === 0 && <p className="admin-empty">No community notes have been posted.</p>}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><div><Gavel size={20} /><h2>Corrections & reports</h2></div><span>{initialData.updates.length + initialData.reports.length} open</span></div>
        <div className="admin-grid admin-grid-compact">
          {initialData.updates.map((update) => (
            <article className="admin-card" key={update.id}>
              <small>Suggested {update.update_type} · {update.upvote_count} up · {update.downvote_count} down</small><h3>{update.restroom_name}</h3><p>{update.proposed_value}</p>
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
        <div className="admin-section-heading"><div><FlaskConical size={20} /><h2>Campaign management & test placement</h2></div><span>Admin only</span></div>
        <p className="admin-section-copy">Create an owner-only test placement below. The campaign list retains paid and deleted records for audit; Stop and Delete never refund a payment, while Full refund is an explicit admin-only action.</p>
        <div className="admin-sample-form">
          {Object.entries(sample).map(([key, value]) => (
            <label className={key === "offerText" ? "admin-wide" : ""} key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span>{key === "offerText" ? <textarea onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))} value={value} /> : <input onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))} value={value} />}</label>
          ))}
          <button className="button button-primary admin-wide" disabled={Boolean(working)} onClick={() => runAction("sample_create", sample)}><Megaphone size={17} /> Create owner-only sample ad</button>
        </div>
        <div className="admin-campaign-list">
          {initialData.campaigns.map((campaign) => (
            <article key={campaign.id}>
              <div>
                <small>{campaign.is_test ? "TEST" : "PAID"} · {campaign.deleted_at ? "deleted · " : ""}{campaign.status} · bid ${(campaign.placement_bid_cents / 100).toFixed(2)}</small>
                <strong>{campaign.business_name} — {campaign.headline}</strong>
                <span>{campaign.address} · {campaign.creator_email}</span>
                {campaign.refund_requested_at && !campaign.payment_refunded_at ? <span>Full refund requested · awaiting Stripe webhook confirmation</span> : null}
              </div>
              <div className="admin-campaign-actions">
                {!campaign.deleted_at && (campaign.status === "active" || campaign.status === "pending_payment") ? (
                  <button aria-label="Stop campaign" className="admin-campaign-stop" disabled={Boolean(working)} onClick={() => runConfirmedAction("campaign_stop", { id: campaign.id }, "Stop this campaign immediately? It will no longer appear publicly. No refund will be issued.")}><Ban size={15} /><span>Stop</span></button>
                ) : null}
                {!campaign.deleted_at ? (
                  <button aria-label="Delete campaign" className="admin-campaign-delete" disabled={Boolean(working)} onClick={() => runConfirmedAction("campaign_delete", { id: campaign.id }, "Delete this campaign from the advertiser dashboard? It will be stopped, but no refund will be issued. Payment records will be retained.")}><Trash2 size={15} /><span>Delete</span></button>
                ) : null}
                {!campaign.is_test && campaign.stripe_payment_intent_id && campaign.status !== "refunded" && !campaign.refund_requested_at ? (
                  <button aria-label="Issue full refund" className="admin-campaign-refund" disabled={Boolean(working)} onClick={() => runConfirmedAction("campaign_refund", { id: campaign.id }, "Issue a FULL Stripe refund for this campaign? This is an admin-only, irreversible payment action. The campaign will also be stopped immediately.")}><BadgeDollarSign size={15} /><span>Full refund</span></button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedRestroom && (
        <div className="dialog-backdrop" onMouseDown={() => setSelectedRestroom(null)} role="presentation">
          <section aria-labelledby="admin-restroom-title" aria-modal="true" className="dialog-card dialog-card-wide admin-restroom-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close restroom details" className="icon-button dialog-close" onClick={() => setSelectedRestroom(null)}><X size={20} /></button>
            {selectedRestroom.cover_photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`Submitted photo for ${selectedRestroom.name}`} className="admin-restroom-modal-photo" src={selectedRestroom.cover_photo_url} />
            )}
            <p className="eyebrow">Pending restroom submission</p>
            <h2 id="admin-restroom-title">{selectedRestroom.name}</h2>
            <p className="admin-restroom-modal-address"><MapPin size={15} /> {selectedRestroom.address}</p>
            <dl className="admin-restroom-detail-list">
              <div><dt>Description</dt><dd>{selectedRestroom.description || "Not supplied"}</dd></div>
              <div><dt>Directions</dt><dd>{selectedRestroom.directions || "Not supplied"}</dd></div>
              <div><dt>Hours</dt><dd>{selectedRestroom.hours || "Not supplied"}</dd></div>
              <div><dt>Schedule status</dt><dd>{selectedRestroom.hours_schedule_status.replaceAll("_", " ")}{selectedRestroom.timezone ? ` · ${selectedRestroom.timezone}` : ""}</dd></div>
              <div><dt>Access code</dt><dd>{selectedRestroom.access_code || "None"}</dd></div>
              <div><dt>Access instructions</dt><dd>{selectedRestroom.access_instructions || "Not supplied"}</dd></div>
              <div><dt>Coordinates</dt><dd>{selectedRestroom.latitude.toFixed(6)}, {selectedRestroom.longitude.toFixed(6)} · <a href={`https://www.google.com/maps/search/?api=1&query=${selectedRestroom.latitude},${selectedRestroom.longitude}`} rel="noreferrer" target="_blank">Open map</a></dd></div>
              <div><dt>Current availability</dt><dd>{selectedRestroom.is_open_now === null ? "Calculated from structured hours" : selectedRestroom.is_open_now ? "Open" : "Closed"}</dd></div>
              <div><dt>Features</dt><dd>{selectedRestroom.features.length ? selectedRestroom.features.join(" · ") : "None supplied"}</dd></div>
              <div><dt>Source</dt><dd>{selectedRestroom.data_source}{selectedRestroom.source_url && <> · <a href={selectedRestroom.source_url} rel="noreferrer" target="_blank">View source</a></>}</dd></div>
              <div><dt>Submitted</dt><dd>{new Date(selectedRestroom.created_at).toLocaleString()}</dd></div>
              <div><dt>Contributor ID</dt><dd>{selectedRestroom.created_by || "Imported record"}</dd></div>
            </dl>
            <div className="admin-restroom-modal-actions">
              <button className="button button-secondary" onClick={() => setSelectedRestroom(null)}>Close</button>
              <button className="button button-primary" disabled={Boolean(working)} onClick={() => { void runAction("restroom_status", { id: selectedRestroom.id, status: "published" }); setSelectedRestroom(null); }}><Check size={16} /> Approve restroom</button>
              <button className="button admin-reject-button" disabled={Boolean(working)} onClick={() => { void runAction("restroom_status", { id: selectedRestroom.id, status: "rejected" }); setSelectedRestroom(null); }}><X size={16} /> Reject</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

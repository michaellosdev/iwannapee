"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Ban, Building2, Check, Edit3, Eye, FlaskConical, Gavel, Images, MapPin, MessageCircle, Megaphone, Search, ShieldCheck, Trash2, UserCog, X } from "lucide-react";

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

type AdminBusinessProfile = {
  id: string; restroom_id: string; restroom_name: string; owner_user_id: string; owner_email: string; business_name: string; description: string | null; profile_image_url: string | null; cover_image_url: string | null; website_url: string | null; public_email: string | null; phone: string | null; instagram_url: string | null; facebook_url: string | null; tiktok_url: string | null; promotion_headline: string | null; promotion_offer_text: string | null; promotion_code: string | null; status: string; verified_at: string; updated_at: string;
};

type DashboardData = {
  profiles: Array<{ id: string; display_name: string | null; email: string; role: string; is_moderator: boolean; created_at: string }>;
  restrooms: AdminRestroom[];
  updates: Array<{ id: string; restroom_id: string; restroom_name: string; update_type: string; proposed_value: string; upvote_count: number; downvote_count: number; created_at: string }>;
  reports: Array<{ id: string; restroom_id: string; restroom_name: string; reason: string; details: string | null; created_at: string }>;
  campaigns: Array<{ id: string; created_by: string; creator_email: string; business_name: string; restroom_name: string; address: string; headline: string; offer_text: string; price_cents: number; placement_bid_cents: number; support_amount_cents: number; status: string; is_test: boolean; is_complimentary: boolean; stripe_payment_intent_id: string | null; starts_at: string | null; ends_at: string | null; stopped_at: string | null; deleted_at: string | null; refund_requested_at: string | null; payment_refunded_at: string | null; created_at: string }>;
  photos: Array<{ id: string; restroom_id: string; restroom_name: string; review_id: string | null; user_id: string; contributor: string; public_url: string; caption: string | null; status: string; created_at: string }>;
  notes: Array<{ id: string; restroom_id: string; restroom_name: string; parent_id: string | null; user_id: string; contributor: string; body: string; status: string; upvote_count: number; downvote_count: number; created_at: string }>;
  claims: Array<{ id: string; restroom_id: string; restroom_name: string; claimant_user_id: string; claimant_email: string; business_name: string; claimant_role: string; contact_email: string; business_email: string | null; website_url: string | null; proof_details: string | null; status: string; priority: string; admin_notes: string | null; created_at: string; updated_at: string }>;
  businessProfiles: AdminBusinessProfile[];
  priorities: Array<{ resource_type: string; resource_id: string; priority: string; note: string | null; updated_at: string }>;
};

type AdminTab = "overview" | "claims" | "restrooms" | "photos" | "community" | "campaigns" | "users";

export function AdminDashboard({ currentUserId, initialData }: { currentUserId: string; initialData: DashboardData }) {
  const router = useRouter();
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedRestroom, setSelectedRestroom] = useState<AdminRestroom | null>(null);
  const [selectedBusinessProfile, setSelectedBusinessProfile] = useState<AdminBusinessProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
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

  function priorityFor(resourceType: string, id: string, fallback = "normal") {
    return initialData.priorities.find((item) => item.resource_type === resourceType && item.resource_id === id)?.priority || fallback;
  }

  function visible(resourceType: string, id: string, fields: Array<string | null | undefined>, fallback = "normal") {
    const matchesQuery = !query.trim() || fields.some((field) => field?.toLowerCase().includes(query.trim().toLowerCase()));
    return matchesQuery && (priorityFilter === "all" || priorityFor(resourceType, id, fallback) === priorityFilter);
  }

  function PrioritySelect({ resourceType, id, fallback = "normal" }: { resourceType: string; id: string; fallback?: string }) {
    return <label className="admin-priority"><span>Priority</span><select aria-label="Queue priority" disabled={Boolean(working)} onChange={(event) => void runAction("queue_priority", { resourceType, id, priority: event.target.value })} value={priorityFor(resourceType, id, fallback)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>;
  }

  return (
    <div className="admin-dashboard">
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <div className="admin-queue-toolbar">
        <nav aria-label="Admin dashboard sections" className="admin-tabs">
          {([['overview', 'Overview'], ['claims', 'Claims'], ['restrooms', 'Restrooms'], ['photos', 'Photos'], ['community', 'Community'], ['campaigns', 'Campaigns'], ['users', 'Users']] as Array<[AdminTab, string]>).map(([tab, label]) => <button aria-current={activeTab === tab ? "page" : undefined} key={tab} onClick={() => setActiveTab(tab)} type="button">{label}</button>)}
        </nav>
        <div className="admin-filter-row"><label><Search size={16} /><input aria-label="Search admin queue" onChange={(event) => setQuery(event.target.value)} placeholder="Search names, addresses, emails…" type="search" value={query} /></label><select aria-label="Filter by priority" onChange={(event) => setPriorityFilter(event.target.value)} value={priorityFilter}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div>
      </div>

      {(activeTab === "overview" || activeTab === "claims") && <section className="admin-section">
        <div className="admin-section-heading"><div><Building2 size={20} /><h2>Business claims</h2></div><span>{initialData.claims.length} open</span></div>
        <p className="admin-section-copy">Approve only after proof arrives at iwannapee@proton.me. Approval publishes the profile, ties it to the restroom, and grants one complimentary 7-day placement.</p>
        <div className="admin-grid">
          {initialData.claims.filter((claim) => visible("business_claim", claim.id, [claim.business_name, claim.restroom_name, claim.claimant_email, claim.contact_email, claim.business_email, claim.website_url, claim.proof_details], claim.priority)).map((claim) => <article className="admin-card admin-claim-card" key={claim.id}>
            <div className="admin-card-topline"><small>{claim.status.replaceAll("_", " ")} · {new Date(claim.created_at).toLocaleString()}</small><PrioritySelect fallback={claim.priority} id={claim.id} resourceType="business_claim" /></div>
            <h3>{claim.business_name}</h3><p><strong>{claim.restroom_name}</strong></p>
            <dl><div><dt>Claimant</dt><dd>{claim.claimant_email}</dd></div><div><dt>Role</dt><dd>{claim.claimant_role}</dd></div><div><dt>Business email</dt><dd>{claim.business_email || "Not supplied"}</dd></div><div><dt>Website</dt><dd>{claim.website_url ? <a href={claim.website_url} rel="noreferrer" target="_blank">Open website</a> : "Not supplied"}</dd></div><div><dt>Proof note</dt><dd>{claim.proof_details || "Waiting for emailed proof"}</dd></div><div><dt>Claim ID</dt><dd>{claim.id}</dd></div></dl>
            <div className="admin-actions"><button disabled={Boolean(working)} onClick={() => runConfirmedAction("business_claim_status", { id: claim.id, status: "approved" }, "Verify this claimant and immediately publish the business profile plus its complimentary 7-day placement?")}><Check size={15} /> Verify</button><button disabled={Boolean(working)} onClick={() => runAction("business_claim_status", { id: claim.id, status: "needs_info" })}><MessageCircle size={15} /> Need proof</button><button disabled={Boolean(working)} onClick={() => runConfirmedAction("business_claim_status", { id: claim.id, status: "rejected" }, "Reject this ownership claim?")}><X size={15} /> Reject</button></div>
          </article>)}
          {initialData.claims.filter((claim) => visible("business_claim", claim.id, [claim.business_name, claim.restroom_name, claim.claimant_email], claim.priority)).length === 0 && <p className="admin-empty">No matching business claims are waiting.</p>}
        </div>
        {initialData.businessProfiles.length > 0 ? <div className="admin-business-profile-list"><h3>Verified business profiles</h3>{initialData.businessProfiles.filter((profile) => visible("profile", profile.id, [profile.business_name, profile.restroom_name, profile.owner_email])).map((profile) => <div key={profile.id}><span><strong>{profile.business_name}</strong><small>{profile.restroom_name} · {profile.owner_email}</small></span><div><PrioritySelect id={profile.id} resourceType="profile" /><button className="admin-profile-edit" onClick={() => setSelectedBusinessProfile(profile)}><Edit3 size={13} /> Edit details</button><button onClick={() => runAction("business_profile_status", { id: profile.id, status: profile.status === "verified" ? "suspended" : "verified" })}>{profile.status === "verified" ? "Suspend" : "Restore"}</button></div></div>)}</div> : null}
      </section>}

      {(activeTab === "overview" || activeTab === "restrooms") && <section className="admin-section">
        <div className="admin-section-heading"><div><ShieldCheck size={20} /><h2>Restroom approvals</h2></div><span>{initialData.restrooms.length} pending</span></div>
        <div className="admin-grid">
          {initialData.restrooms.filter((restroom) => visible("restroom", restroom.id, [restroom.name, restroom.address, restroom.description])).map((restroom) => (
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
              <PrioritySelect id={restroom.id} resourceType="restroom" />
              <div className="admin-actions">
                <button disabled={Boolean(working)} onClick={() => runAction("restroom_status", { id: restroom.id, status: "published" })}><Check size={15} /> Approve</button>
                <button disabled={Boolean(working)} onClick={() => runAction("restroom_status", { id: restroom.id, status: "rejected" })}><X size={15} /> Reject</button>
              </div>
            </article>
          ))}
          {initialData.restrooms.length === 0 && <p className="admin-empty">No restroom submissions are waiting.</p>}
        </div>
      </section>}

      {(activeTab === "overview" || activeTab === "photos") && <section className="admin-section">
        <div className="admin-section-heading"><div><Images size={20} /><h2>Community photos</h2></div><span>{initialData.photos.length} pending</span></div>
        <p className="admin-section-copy">Restroom and review photos stay hidden from the public until you publish them here. Rejected files are removed from Storage.</p>
        <div className="admin-grid">
          {initialData.photos.filter((photo) => visible("community_photo", photo.id, [photo.restroom_name, photo.caption, photo.contributor])).map((photo) => (
            <article className="admin-card" key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`Community submission for ${photo.restroom_name}`} src={photo.public_url} />
              <small>{photo.review_id ? "Review photo" : "Restroom photo"} · {new Date(photo.created_at).toLocaleString()}</small>
              <h3>{photo.restroom_name}</h3>
              <p>{photo.caption || "No caption."}</p>
              <small>Submitted by {photo.contributor}</small>
              <PrioritySelect id={photo.id} resourceType="community_photo" />
              <div className="admin-actions">
                <button disabled={Boolean(working)} onClick={() => runAction("community_photo_status", { id: photo.id, status: "published" })}><Check size={15} /> Publish</button>
                <button disabled={Boolean(working)} onClick={() => runAction("community_photo_status", { id: photo.id, status: "rejected" })}><X size={15} /> Reject</button>
              </div>
            </article>
          ))}
          {initialData.photos.length === 0 && <p className="admin-empty">No community photos are waiting.</p>}
        </div>
      </section>}

      {(activeTab === "overview" || activeTab === "community") && <section className="admin-section">
        <div className="admin-section-heading"><div><MessageCircle size={20} /><h2>Community notes</h2></div><span>{initialData.notes.length} recent</span></div>
        <div className="admin-grid admin-grid-compact">
          {initialData.notes.filter((note) => visible("community_note", note.id, [note.restroom_name, note.body, note.contributor])).map((note) => (
            <article className="admin-card" key={note.id}>
              <small>{note.parent_id ? "Reply" : "Note"} · {note.status} · {new Date(note.created_at).toLocaleString()}</small>
              <h3>{note.restroom_name}</h3>
              <p>{note.body}</p>
              <dl><div><dt>Contributor</dt><dd>{note.contributor}</dd></div><div><dt>Votes</dt><dd>{note.upvote_count} up · {note.downvote_count} down</dd></div></dl>
              <PrioritySelect id={note.id} resourceType="community_note" />
              <div className="admin-actions">
                {note.status === "published"
                  ? <button disabled={Boolean(working)} onClick={() => runAction("community_note_status", { id: note.id, status: "hidden" })}><X size={15} /> Hide</button>
                  : <button className="admin-restore-action" disabled={Boolean(working)} onClick={() => runAction("community_note_status", { id: note.id, status: "published" })}><Check size={15} /> Restore</button>}
              </div>
            </article>
          ))}
          {initialData.notes.length === 0 && <p className="admin-empty">No community notes have been posted.</p>}
        </div>
      </section>}

      {(activeTab === "overview" || activeTab === "community") && <section className="admin-section">
        <div className="admin-section-heading"><div><Gavel size={20} /><h2>Corrections & reports</h2></div><span>{initialData.updates.length + initialData.reports.length} open</span></div>
        <div className="admin-grid admin-grid-compact">
          {initialData.updates.filter((update) => visible("restroom_update", update.id, [update.restroom_name, update.update_type, update.proposed_value])).map((update) => (
            <article className="admin-card" key={update.id}>
              <small>Suggested {update.update_type} · {update.upvote_count} up · {update.downvote_count} down</small><h3>{update.restroom_name}</h3><p>{update.proposed_value}</p><PrioritySelect id={update.id} resourceType="restroom_update" />
              <div className="admin-actions"><button onClick={() => runAction("update_status", { id: update.id, status: "accepted" })}><Check size={15} /> Apply</button><button onClick={() => runAction("update_status", { id: update.id, status: "rejected" })}><X size={15} /> Reject</button></div>
            </article>
          ))}
          {initialData.reports.filter((report) => visible("report", report.id, [report.restroom_name, report.reason, report.details])).map((report) => (
            <article className="admin-card" key={report.id}>
              <small>Report: {report.reason.replaceAll("_", " ")}</small><h3>{report.restroom_name}</h3><p>{report.details || "No additional detail."}</p><PrioritySelect id={report.id} resourceType="report" />
              <div className="admin-actions"><button onClick={() => runAction("report_status", { id: report.id, status: "resolved" })}><Check size={15} /> Resolve</button><button onClick={() => runAction("report_status", { id: report.id, status: "dismissed" })}><X size={15} /> Dismiss</button></div>
            </article>
          ))}
          {initialData.updates.length + initialData.reports.length === 0 && <p className="admin-empty">No corrections or reports are waiting.</p>}
        </div>
      </section>}

      {(activeTab === "overview" || activeTab === "users") && <section className="admin-section">
        <div className="admin-section-heading"><div><UserCog size={20} /><h2>User roles</h2></div><span>{initialData.profiles.length} users</span></div>
        <div className="admin-user-list">
          {initialData.profiles.filter((profile) => visible("profile", profile.id, [profile.display_name, profile.email, profile.role])).map((profile) => (
            <div key={profile.id}><span><strong>{profile.display_name || profile.email}</strong><small>{profile.email}</small></span><select aria-label={`Role for ${profile.email}`} disabled={profile.id === currentUserId || Boolean(working)} onChange={(event) => runAction("profile_role", { id: profile.id, role: event.target.value })} value={profile.role}><option value="user">User</option><option value="moderator">Moderator</option><option value="owner">Owner</option></select></div>
          ))}
        </div>
      </section>}

      {(activeTab === "overview" || activeTab === "campaigns") && <section className="admin-section admin-sample-section">
        <div className="admin-section-heading"><div><FlaskConical size={20} /><h2>Campaign management & test placement</h2></div><span>Admin only</span></div>
        <p className="admin-section-copy">Create an owner-only test placement below. The campaign list retains paid and deleted records for audit; Stop and Delete never refund a payment, while Full refund is an explicit admin-only action.</p>
        <div className="admin-sample-form">
          {Object.entries(sample).map(([key, value]) => (
            <label className={key === "offerText" ? "admin-wide" : ""} key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span>{key === "offerText" ? <textarea onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))} value={value} /> : <input onChange={(event) => setSample((current) => ({ ...current, [key]: event.target.value }))} value={value} />}</label>
          ))}
          <button className="button button-primary admin-wide" disabled={Boolean(working)} onClick={() => runAction("sample_create", sample)}><Megaphone size={17} /> Create owner-only sample ad</button>
        </div>
        <div className="admin-campaign-list">
          {initialData.campaigns.filter((campaign) => visible("campaign", campaign.id, [campaign.business_name, campaign.restroom_name, campaign.address, campaign.creator_email, campaign.headline])).map((campaign) => (
            <article key={campaign.id}>
              <div>
                <small>{campaign.is_test ? "TEST" : campaign.is_complimentary ? "FREE LAUNCH" : "PAID"} · {campaign.deleted_at ? "deleted · " : ""}{campaign.status} · bid ${(campaign.placement_bid_cents / 100).toFixed(2)}</small>
                <strong>{campaign.business_name} — {campaign.headline}</strong>
                <span>{campaign.address} · {campaign.creator_email}</span>
                {campaign.refund_requested_at && !campaign.payment_refunded_at ? <span>Full refund requested · awaiting Stripe webhook confirmation</span> : null}
              </div>
              <div className="admin-campaign-actions">
                <PrioritySelect id={campaign.id} resourceType="campaign" />
                {!campaign.deleted_at && (campaign.status === "active" || campaign.status === "pending_payment") ? (
                  <button aria-label="Stop campaign" className="admin-campaign-stop" disabled={Boolean(working)} onClick={() => runConfirmedAction("campaign_stop", { id: campaign.id }, "Stop this campaign immediately? It will no longer appear publicly. No refund will be issued.")}><Ban size={15} /><span>Stop</span></button>
                ) : null}
                {!campaign.deleted_at ? (
                  <button aria-label="Delete campaign" className="admin-campaign-delete" disabled={Boolean(working)} onClick={() => runConfirmedAction("campaign_delete", { id: campaign.id }, "Delete this campaign from the advertiser dashboard? It will be stopped, but no refund will be issued. Payment records will be retained.")}><Trash2 size={15} /><span>Delete</span></button>
                ) : null}
                {!campaign.is_test && !campaign.is_complimentary && campaign.stripe_payment_intent_id && campaign.status !== "refunded" && !campaign.refund_requested_at ? (
                  <button aria-label="Issue full refund" className="admin-campaign-refund" disabled={Boolean(working)} onClick={() => runConfirmedAction("campaign_refund", { id: campaign.id }, "Issue a FULL Stripe refund for this campaign? This is an admin-only, irreversible payment action. The campaign will also be stopped immediately.")}><BadgeDollarSign size={15} /><span>Full refund</span></button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>}

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

      {selectedBusinessProfile && (
        <div className="dialog-backdrop" onMouseDown={() => setSelectedBusinessProfile(null)} role="presentation">
          <section aria-labelledby="admin-business-title" aria-modal="true" className="dialog-card dialog-card-wide admin-business-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close business editor" className="icon-button dialog-close" onClick={() => setSelectedBusinessProfile(null)}><X size={20} /></button>
            <p className="eyebrow">Owner business editor</p><h2 id="admin-business-title">{selectedBusinessProfile.business_name}</h2><p className="admin-section-copy">Tied to {selectedBusinessProfile.restroom_name} · owner {selectedBusinessProfile.owner_email}</p>
            <form className="admin-business-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void runAction("business_profile_update", { id: selectedBusinessProfile.id, businessName: form.get("businessName"), description: form.get("description"), websiteUrl: form.get("websiteUrl"), publicEmail: form.get("publicEmail"), phone: form.get("phone"), instagramUrl: form.get("instagramUrl"), facebookUrl: form.get("facebookUrl"), tiktokUrl: form.get("tiktokUrl"), promotionHeadline: form.get("promotionHeadline"), promotionOfferText: form.get("promotionOfferText"), promotionCode: form.get("promotionCode") }); setSelectedBusinessProfile(null); }}>
              <label>Business name<input defaultValue={selectedBusinessProfile.business_name} maxLength={120} name="businessName" required /></label><label>Public email<input defaultValue={selectedBusinessProfile.public_email || ""} maxLength={254} name="publicEmail" type="email" /></label>
              <label className="admin-wide">Description<textarea defaultValue={selectedBusinessProfile.description || ""} maxLength={1200} name="description" rows={4} /></label><label>Website<input defaultValue={selectedBusinessProfile.website_url || ""} maxLength={500} name="websiteUrl" type="url" /></label><label>Phone<input defaultValue={selectedBusinessProfile.phone || ""} maxLength={40} name="phone" /></label>
              <label>Instagram URL<input defaultValue={selectedBusinessProfile.instagram_url || ""} maxLength={500} name="instagramUrl" type="url" /></label><label>Facebook URL<input defaultValue={selectedBusinessProfile.facebook_url || ""} maxLength={500} name="facebookUrl" type="url" /></label><label>TikTok URL<input defaultValue={selectedBusinessProfile.tiktok_url || ""} maxLength={500} name="tiktokUrl" type="url" /></label>
              <label className="admin-wide">Promotion headline<input defaultValue={selectedBusinessProfile.promotion_headline || ""} maxLength={100} name="promotionHeadline" /></label><label className="admin-wide">Promotion details<textarea defaultValue={selectedBusinessProfile.promotion_offer_text || ""} maxLength={280} name="promotionOfferText" rows={3} /></label><label>Optional promo code<input defaultValue={selectedBusinessProfile.promotion_code || ""} maxLength={40} name="promotionCode" /></label>
              <div className="admin-restroom-modal-actions admin-wide"><button className="button button-secondary" onClick={() => setSelectedBusinessProfile(null)} type="button">Cancel</button><button className="button button-primary" disabled={Boolean(working)} type="submit"><Check size={16} /> Save profile</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

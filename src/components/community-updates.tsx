"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CircleHelp, Clock3, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { CaptchaWidget } from "@/components/captcha-widget";
import { WeeklyHoursEditor } from "@/components/weekly-hours-editor";
import { createHoursSchedule, InvalidHoursSchedule, normalizeHoursSchedule, type HoursSchedule } from "@/lib/hours";

export type CommunityUpdate = {
  id: string;
  type: string;
  value: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  upvotes: number;
  downvotes: number;
  userVote: number;
  isOwn: boolean;
};

type SuggestionType = "hours" | "code" | "access" | "directions" | "description";

const suggestionLabels: Record<SuggestionType, string> = {
  hours: "Hours",
  code: "Access code",
  access: "Access details",
  directions: "Directions",
  description: "Description",
};

const suggestionPlaceholders: Record<Exclude<SuggestionType, "hours">, string> = {
  code: "Example: 2468 or ask the front desk",
  access: "Example: Customers may use it after asking a staff member.",
  directions: "Example: Enter beside the pharmacy and turn left after the elevators.",
  description: "Add a useful detail that is currently missing from this restroom listing.",
};

function relativeTime(value: string) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function CommunityUpdates({
  defaultType,
  updates,
  restroomId,
  user,
  onNeedsAuth,
  onNotify,
  onReload,
}: {
  defaultType: SuggestionType;
  updates: CommunityUpdate[];
  restroomId: string;
  user: User | null;
  onNeedsAuth: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [suggestionType, setSuggestionType] = useState<SuggestionType>(defaultType);
  const [suggestionValue, setSuggestionValue] = useState("");
  const [hoursSchedule, setHoursSchedule] = useState<HoursSchedule>(createHoursSchedule("scheduled"));
  const [captchaReady, setCaptchaReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingVote, setWorkingVote] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [voteOverrides, setVoteOverrides] = useState<Record<string, { userVote: number; upvotes: number; downvotes: number }>>({});

  const localUpdates = updates.map((update) => ({ ...update, ...(voteOverrides[update.id] || {}) }));
  const visibleUpdates = expanded ? localUpdates : localUpdates.slice(0, 3);
  const canSubmit = suggestionType === "hours"
    ? hoursSchedule.mode === "always_open" || hoursSchedule.periods.length > 0
    : suggestionValue.trim().length > 1;

  function openComposer() {
    if (!user) {
      onNeedsAuth();
      return;
    }
    setSuggestionType(defaultType);
    setSuggestionValue("");
    setHoursSchedule(createHoursSchedule("scheduled"));
    setCaptchaReady(false);
    setError("");
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
    setSuggestionValue("");
    setError("");
  }

  async function submitSuggestion() {
    if (suggestionType === "hours") {
      try {
        normalizeHoursSchedule(hoursSchedule, false);
      } catch (validationError) {
        setError(validationError instanceof InvalidHoursSchedule ? validationError.message : "Check the restroom hours.");
        return;
      }
    } else if (suggestionValue.trim().length < 2) {
      setError(`Add the ${suggestionLabels[suggestionType].toLowerCase()}.`);
      return;
    }

    setWorking(true);
    setError("");
    const response = await fetch("/api/community/updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restroomId,
        type: suggestionType,
        value: suggestionType === "hours" ? undefined : suggestionValue.trim(),
        hoursSchedule: suggestionType === "hours" ? hoursSchedule : undefined,
      }),
    });
    const result = (await response.json()) as { error?: string; submitted?: boolean };
    setWorking(false);
    if (!response.ok || !result.submitted) {
      setError(result.error || "We couldn’t save this suggestion.");
      return;
    }
    closeComposer();
    onNotify(`${suggestionLabels[suggestionType]} suggestion posted for community voting`);
    await onReload();
  }

  async function vote(update: CommunityUpdate, nextVote: -1 | 1) {
    if (!user) {
      onNeedsAuth();
      return;
    }
    if (update.isOwn) {
      onNotify("Other community members vote on your suggestion");
      return;
    }
    const value = update.userVote === nextVote ? 0 : nextVote;
    setWorkingVote(update.id);
    const response = await fetch("/api/community/updates/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionId: update.id, value }),
    });
    const result = (await response.json()) as {
      error?: string;
      saved?: boolean;
      userVote?: number;
      upvotes?: number;
      downvotes?: number;
    };
    setWorkingVote("");
    if (!response.ok || !result.saved) {
      onNotify(result.error || "We couldn’t save this vote");
      return;
    }
    setVoteOverrides((current) => ({
      ...current,
      [update.id]: {
        userVote: result.userVote || 0,
        upvotes: result.upvotes || 0,
        downvotes: result.downvotes || 0,
      },
    }));
  }

  return (
    <div className="community-updates">
      <div className="community-section-heading community-updates-heading">
        <div><CircleHelp size={19} /><span><strong>Community details</strong><small>{updates.length} suggestion{updates.length === 1 ? "" : "s"} awaiting review</small></span></div>
        <button onClick={openComposer} type="button">{defaultType === "hours" ? <Clock3 size={15} /> : <Plus size={15} />} {defaultType === "hours" ? "Add hours" : "Suggest info"}</button>
      </div>

      {composerOpen && (
        <div className="community-inline-form community-update-form">
          <div className="community-note-form-heading">
            <strong>Suggest missing information</strong>
            <button aria-label="Close suggestion form" onClick={closeComposer} type="button"><X size={15} /></button>
          </div>
          <p>Your suggestion appears here for community voting and is reviewed before it changes the listing.</p>
          <label>
            <span>What are you adding?</span>
            <select onChange={(event) => {
              setSuggestionType(event.target.value as SuggestionType);
              setError("");
            }} value={suggestionType}>
              {Object.entries(suggestionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {suggestionType === "hours" ? (
            <WeeklyHoursEditor allowUnknown={false} onChange={setHoursSchedule} value={hoursSchedule} />
          ) : (
            <label>
              <span>{suggestionLabels[suggestionType]}</span>
              {suggestionType === "code"
                ? <input maxLength={40} onChange={(event) => setSuggestionValue(event.target.value)} placeholder={suggestionPlaceholders.code} value={suggestionValue} />
                : <textarea maxLength={suggestionType === "description" ? 1000 : 500} onChange={(event) => setSuggestionValue(event.target.value)} placeholder={suggestionPlaceholders[suggestionType]} rows={3} value={suggestionValue} />}
            </label>
          )}
          <CaptchaWidget onVerified={setCaptchaReady} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div><button className="button button-ghost" onClick={closeComposer} type="button">Cancel</button><button className="button button-primary" disabled={!captchaReady || !canSubmit || working} onClick={() => void submitSuggestion()} type="button">{working ? "Posting…" : "Post suggestion"}</button></div>
        </div>
      )}

      {visibleUpdates.map((update) => (
        <article className="community-update" key={update.id}>
          <div className="community-update-heading">
            <span><strong>{suggestionLabels[update.type as SuggestionType] || "Other detail"}</strong><small>{update.displayName} · {relativeTime(update.createdAt)}</small></span>
            <span>{update.isOwn ? "Your suggestion" : "Awaiting review"}</span>
          </div>
          <p>{update.value}</p>
          <div className="community-note-actions">
            <button aria-label={`Upvote ${suggestionLabels[update.type as SuggestionType] || "detail"} suggestion`} className={update.userVote === 1 ? "active" : ""} disabled={workingVote === update.id || update.isOwn} onClick={() => void vote(update, 1)} type="button"><ThumbsUp size={13} /> {update.upvotes}</button>
            <button aria-label={`Downvote ${suggestionLabels[update.type as SuggestionType] || "detail"} suggestion`} className={update.userVote === -1 ? "active down" : ""} disabled={workingVote === update.id || update.isOwn} onClick={() => void vote(update, -1)} type="button"><ThumbsDown size={13} /> {update.downvotes}</button>
          </div>
        </article>
      ))}
      {!composerOpen && updates.length === 0 && <p className="community-empty-copy">No pending suggestions. Add hours, access details, directions, or another missing fact.</p>}
      {updates.length > 3 && <button className="community-read-reviews" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? "Show fewer suggestions" : `Read all ${updates.length} suggestions`}</button>}
    </div>
  );
}

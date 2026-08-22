"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { MessageCircle, Plus, Reply, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { CaptchaWidget } from "@/components/captcha-widget";

export type CommunityNote = {
  id: string;
  parentId: string | null;
  body: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  upvotes: number;
  downvotes: number;
  userVote: number;
  replies: CommunityNote[];
};

function relativeTime(value: string) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function CommunityNotes({
  restroomId,
  notes,
  user,
  onNeedsAuth,
  onNotify,
  onReload,
}: {
  restroomId: string;
  notes: CommunityNote[];
  user: User | null;
  onNeedsAuth: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [voteOverrides, setVoteOverrides] = useState<Record<string, { userVote: number; upvotes: number; downvotes: number }>>({});
  const [expanded, setExpanded] = useState(false);
  const [composerParentId, setComposerParentId] = useState<string | null | undefined>(undefined);
  const [noteBody, setNoteBody] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingVote, setWorkingVote] = useState("");
  const [error, setError] = useState("");

  const localNotes = notes.map((note) => ({
    ...note,
    ...(voteOverrides[note.id] || {}),
    replies: note.replies.map((reply) => ({ ...reply, ...(voteOverrides[reply.id] || {}) })),
  }));

  function openComposer(parentId: string | null) {
    if (!user) {
      onNeedsAuth();
      return;
    }
    setComposerParentId(parentId);
    setNoteBody("");
    setCaptchaReady(false);
    setError("");
  }

  function closeComposer() {
    setComposerParentId(undefined);
    setNoteBody("");
    setError("");
  }

  async function submitNote() {
    const cleanedBody = noteBody.trim();
    if (cleanedBody.length < 2) {
      setError("Write at least two characters.");
      return;
    }
    setWorking(true);
    setError("");
    const response = await fetch("/api/community/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restroomId, parentId: composerParentId || null, body: cleanedBody }),
    });
    const result = (await response.json()) as { error?: string; submitted?: boolean };
    setWorking(false);
    if (!response.ok || !result.submitted) {
      setError(result.error || "We couldn’t post this community note.");
      return;
    }
    const wasReply = Boolean(composerParentId);
    closeComposer();
    onNotify(wasReply ? "Reply posted" : "Community note posted");
    await onReload();
  }

  async function vote(note: CommunityNote, nextVote: -1 | 1) {
    if (!user) {
      onNeedsAuth();
      return;
    }
    const value = note.userVote === nextVote ? 0 : nextVote;
    setWorkingVote(note.id);
    const response = await fetch("/api/community/notes/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: note.id, value }),
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
      [note.id]: {
        userVote: result.userVote || 0,
        upvotes: result.upvotes || 0,
        downvotes: result.downvotes || 0,
      },
    }));
  }

  function renderNote(note: CommunityNote, reply = false) {
    return (
      <article className={reply ? "community-note community-note-reply" : "community-note"} key={note.id}>
        <div className="community-note-heading">
          <span><strong>{note.displayName}</strong><small>{relativeTime(note.createdAt)}</small></span>
          {reply && <span className="community-note-reply-label"><Reply size={11} /> Reply</span>}
        </div>
        <p>{note.body}</p>
        <div className="community-note-actions">
          <button
            aria-label={`Upvote note by ${note.displayName}`}
            className={note.userVote === 1 ? "active" : ""}
            disabled={workingVote === note.id}
            onClick={() => void vote(note, 1)}
            type="button"
          ><ThumbsUp size={13} /> {note.upvotes}</button>
          <button
            aria-label={`Downvote note by ${note.displayName}`}
            className={note.userVote === -1 ? "active down" : ""}
            disabled={workingVote === note.id}
            onClick={() => void vote(note, -1)}
            type="button"
          ><ThumbsDown size={13} /> {note.downvotes}</button>
          {!reply && <button onClick={() => openComposer(note.id)} type="button"><Reply size={13} /> Reply</button>}
        </div>
        {!reply && note.replies.length > 0 && <div className="community-note-replies">{note.replies.map((item) => renderNote(item, true))}</div>}
      </article>
    );
  }

  const visibleNotes = expanded ? localNotes : localNotes.slice(0, 3);
  const totalContributions = localNotes.reduce((total, note) => total + 1 + note.replies.length, 0);

  return (
    <div className="community-notes">
      <div className="community-section-heading community-notes-heading">
        <div><MessageCircle size={19} /><span><strong>Community notes</strong><small>{totalContributions} notes and replies</small></span></div>
        <button onClick={() => openComposer(null)} type="button"><Plus size={15} /> Add note</button>
      </div>

      {composerParentId !== undefined && (
        <div className="community-inline-form community-note-form">
          <div className="community-note-form-heading">
            <strong>{composerParentId ? "Reply to this conversation" : "Share a useful note"}</strong>
            <button aria-label="Close note form" onClick={closeComposer} type="button"><X size={15} /></button>
          </div>
          <p>Share access changes, entrance details, supplies, or other timely information. Keep it respectful and avoid personal information.</p>
          <textarea
            maxLength={600}
            onChange={(event) => setNoteBody(event.target.value)}
            placeholder={composerParentId ? "Add a helpful reply…" : "Example: The restroom is downstairs beside the elevators."}
            rows={3}
            value={noteBody}
          />
          <small>{noteBody.length}/600</small>
          <CaptchaWidget onVerified={setCaptchaReady} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div><button className="button button-ghost" onClick={closeComposer} type="button">Cancel</button><button className="button button-primary" disabled={!captchaReady || working || noteBody.trim().length < 2} onClick={() => void submitNote()} type="button">{working ? "Posting…" : composerParentId ? "Post reply" : "Post note"}</button></div>
        </div>
      )}

      {visibleNotes.map((note) => renderNote(note))}
      {localNotes.length === 0 && <p className="community-empty-copy">No community notes yet. Add a timely detail that could help the next visitor.</p>}
      {localNotes.length > 3 && (
        <button className="community-read-reviews" onClick={() => setExpanded((current) => !current)} type="button">
          {expanded ? "Show fewer notes" : `Read all ${localNotes.length} conversations`}
        </button>
      )}
    </div>
  );
}

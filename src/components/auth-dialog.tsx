"use client";

import { useState } from "react";
import { CheckCircle2, LogIn, Mail, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthDialogProps = {
  open: boolean;
  user: User | null;
  returnTo?: string;
  onClose: () => void;
  onSignedOut: () => void;
};

export function AuthDialog({ open, user, returnTo = "/?submit=1", onClose, onSignedOut }: AuthDialogProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  if (!open) return null;

  function closeDialog() {
    setStatus("idle");
    setError("");
    onClose();
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const supabase = createClient();
    if (!supabase) {
      setError("Add your Supabase URL and anon key to enable magic-link sign in.");
      return;
    }

    setStatus("sending");
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
      },
    });

    if (signInError) {
      setStatus("idle");
      setError(signInError.message);
      return;
    }

    setStatus("sent");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase?.auth.signOut();
    onSignedOut();
    closeDialog();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
      <section
        aria-labelledby="auth-title"
        aria-modal="true"
        className="dialog-card auth-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="icon-button dialog-close" onClick={closeDialog} aria-label="Close sign in">
          <X size={20} />
        </button>

        <div className="dialog-icon"><LogIn size={24} /></div>

        {user ? (
          <>
            <p className="eyebrow">Your account</p>
            <h2 id="auth-title">You’re signed in.</h2>
            <p className="dialog-copy">Posting as <strong>{user.email}</strong></p>
            <button className="button button-secondary button-full" onClick={signOut}>Sign out</button>
          </>
        ) : status === "sent" ? (
          <>
            <div className="success-icon"><CheckCircle2 size={28} /></div>
            <p className="eyebrow">Magic link sent</p>
            <h2 id="auth-title">Check your inbox.</h2>
            <p className="dialog-copy">
              We sent a secure sign-in link to <strong>{email}</strong>. It expires soon, so open it on this device.
            </p>
            <button className="button button-secondary button-full" onClick={closeDialog}>Got it</button>
          </>
        ) : (
          <>
            <p className="eyebrow">Join the community</p>
            <h2 id="auth-title">Sign in without a password.</h2>
            <p className="dialog-copy">We’ll email you a one-time magic link. No password to remember.</p>

            <form className="stack-form" onSubmit={sendMagicLink}>
              <label htmlFor="auth-email">Email address</label>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  autoComplete="email"
                  autoFocus
                  id="auth-email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {!isSupabaseConfigured && (
                <p className="setup-note">Demo mode is active. Add Supabase credentials to send real links.</p>
              )}
              <button className="button button-primary button-full" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Email me a magic link"}
              </button>
            </form>
            <p className="fine-print">By continuing, you agree to keep community information accurate and respectful.</p>
          </>
        )}
      </section>
    </div>
  );
}

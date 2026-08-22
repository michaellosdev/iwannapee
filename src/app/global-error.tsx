"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="global-error">
          <p className="eyebrow">Something went wrong</p>
          <h1>We couldn’t load this restroom search.</h1>
          <p>The error was recorded without your address, access code, email, or precise location.</p>
          <button className="button button-primary" onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}

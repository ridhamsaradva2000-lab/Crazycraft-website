"use client";

import { useRef, useState } from "react";
import { submitNewsletterSignup } from "@/lib/newsletter/actions";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/inquiry/TurnstileWidget";

export function NewsletterSignupForm({ source }: { source: "footer" | "newsletter_page" }) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const widgetRef = useRef<TurnstileWidgetHandle>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!turnstileToken) return;
    setStatus("submitting");

    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement)?.value ?? "";
    const tokenForThisAttempt = turnstileToken;
    setTurnstileToken(null);

    try {
      const result = await submitNewsletterSignup({
        email,
        source,
        turnstileToken: tokenForThisAttempt,
        honeypot,
      });

      if (result.ok) {
        setMessage(result.message);
        setStatus("done");
        return;
      }

      widgetRef.current?.reset();
      setMessage("Something went wrong. Please try again.");
      setStatus("idle");
    } catch {
      widgetRef.current?.reset();
      setMessage("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="rounded-md border border-paper-muted px-3 py-2 font-body text-ink"
        disabled={status === "submitting" || status === "done"}
      />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
      />
      {status !== "done" && (
        <TurnstileWidget
          ref={widgetRef}
          action="newsletter_signup"
          onVerify={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken(null)}
        />
      )}
      {status !== "done" && (
        <button
          type="submit"
          disabled={status === "submitting" || !turnstileToken}
          className="rounded-md bg-brand-900 px-4 py-2 font-body text-white"
        >
          Subscribe
        </button>
      )}
      {message && <p className="font-body text-sm text-ink-muted">{message}</p>}
    </form>
  );
}
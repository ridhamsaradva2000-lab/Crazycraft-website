import Link from "next/link";

export default function ConfirmedPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-paper px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-paper-muted bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-900/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-brand-900"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-2xl font-medium text-brand-900 sm:text-3xl">
          You&rsquo;re subscribed!
        </h1>
        <p className="mt-3 font-body text-sm text-ink-muted sm:text-base">
          Thanks for confirming your subscription to the CrazyCraft newsletter.
        </p>
        <p className="mt-2 font-body text-sm text-ink-muted">
          You&rsquo;ll now receive CrazyCraft product updates, sourcing insights, and news straight to your inbox.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-brand-900 px-5 py-3 font-body text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2 sm:w-auto sm:px-8"
        >
          Go to Homepage
        </Link>
      </div>
    </div>
  );
}
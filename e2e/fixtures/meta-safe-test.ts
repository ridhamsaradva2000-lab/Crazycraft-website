import { test as base, expect } from "@playwright/test";
import { isDeepStrictEqual } from "node:util";

export const FAKE_PIXEL_ID = "999999999999999";

const META_HOSTNAME_PATTERN = /(^|\.)(facebook\.com|facebook\.net)$/i;
const FBEVENTS_URL = "https://connect.facebook.net/en_US/fbevents.js";

const TRANSIENT_CONTEXT_ERROR_PATTERNS = [/execution context was destroyed/i];

function isTransientContextError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_CONTEXT_ERROR_PATTERNS.some((p) => p.test(message));
}

function assertValidGeneration(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid document-generation marker (${context}): ${JSON.stringify(value)}`);
  }
}

interface CallEntry {
  documentId: string;
  args: unknown[];
}

interface CombinedState {
  entries: CallEntry[];
  scriptRequestCount: number;
}

interface MetaGuard {
  snapshot: () => CallEntry[];
  argsSnapshot: () => unknown[][];
  fulfilledScriptRequests: string[];
  unexpectedMetaAttempts: string[];
  harnessErrors: string[];
}

function getCombinedState(guard: MetaGuard): CombinedState {
  return { entries: guard.snapshot(), scriptRequestCount: guard.fulfilledScriptRequests.length };
}

export const test = base.extend<{ metaGuard: MetaGuard }>({
  metaGuard: [
    async ({ context }, use) => {
      const log: CallEntry[] = [];
      const fulfilledScriptRequests: string[] = [];
      const unexpectedMetaAttempts: string[] = [];
      const harnessErrors: string[] = [];

      await context.addInitScript(() => {
        (window as unknown as Record<string, unknown>).__e2eDocGeneration =
          Math.random().toString(36).slice(2) + "-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      });

      await context.exposeBinding("__e2eRecordPixelCall", (_source, entry: CallEntry) => {
        log.push(entry);
      });

      await context.exposeBinding("__e2eRecordHarnessError", (_source, message: string) => {
        harnessErrors.push(message);
      });

      await context.route("**/*", async (route) => {
        const reqUrl = route.request().url();
        let hostname = "";
        try {
          hostname = new URL(reqUrl).hostname;
        } catch {
          // Not an absolute URL (e.g. data:) — not Meta-owned, let through.
        }

        if (!META_HOSTNAME_PATTERN.test(hostname)) {
          await route.continue();
          return;
        }

        if (reqUrl === FBEVENTS_URL) {
          fulfilledScriptRequests.push(reqUrl);
          await route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: `
              (function () {
                var docId = window.__e2eDocGeneration;
                if (typeof docId !== "string" || docId.length === 0) {
                  if (window.__e2eRecordHarnessError) {
                    window.__e2eRecordHarnessError(
                      "fbevents.js executed but window.__e2eDocGeneration was missing or invalid: " + String(docId)
                    );
                  }
                  return;
                }
                if (window.fbq && window.fbq.__crazycraftOwned) {
                  window.fbq.callMethod = function () {
                    var args = Array.prototype.slice.call(arguments);
                    window.__e2eRecordPixelCall({ documentId: docId, args: args });
                  };
                }
              })();
            `,
          });
          return;
        }

        unexpectedMetaAttempts.push(reqUrl);
        await route.abort();
      });

      const guard: MetaGuard = {
        snapshot: () => log.map((e) => ({ documentId: e.documentId, args: [...e.args] })),
        argsSnapshot: () => log.map((e) => [...e.args]),
        fulfilledScriptRequests,
        unexpectedMetaAttempts,
        harnessErrors,
      };

      await use(guard);

      expect(unexpectedMetaAttempts, `Unexpected Meta network requests: ${JSON.stringify(unexpectedMetaAttempts)}`).toEqual([]);
      expect(harnessErrors, `Harness errors detected: ${JSON.stringify(harnessErrors)}`).toEqual([]);
    },
    { auto: true },
  ],
});

export async function getDocumentGeneration(page: import("@playwright/test").Page): Promise<string> {
  const value = await page.evaluate(() => (window as unknown as Record<string, unknown>).__e2eDocGeneration);
  assertValidGeneration(value, "read from page");
  return value;
}

export async function readCurrentDocumentGeneration(page: import("@playwright/test").Page): Promise<string> {
  let result: string | null = null;
  await expect
    .poll(async () => {
      try {
        result = await getDocumentGeneration(page);
        return true;
      } catch (err) {
        if (isTransientContextError(err)) return false;
        throw err;
      }
    })
    .toBe(true);
  assertValidGeneration(result, "readCurrentDocumentGeneration result");
  return result;
}

export async function waitForNewDocument(
  page: import("@playwright/test").Page,
  previousGeneration: string,
  performAction: () => Promise<void>
): Promise<string> {
  assertValidGeneration(previousGeneration, "waitForNewDocument input");

  let newGeneration: string | null = null;

  await Promise.all([
    expect
      .poll(async () => {
        try {
          const current = await getDocumentGeneration(page);
          newGeneration = current;
          return current;
        } catch (err) {
          if (isTransientContextError(err)) return previousGeneration;
          throw err;
        }
      })
      .not.toBe(previousGeneration),
    performAction(),
  ]);

  assertValidGeneration(newGeneration, "waitForNewDocument result");
  return newGeneration;
}

const DEFAULT_STABILITY_MS = 250;
const DEFAULT_POLL_INTERVAL_MS = 50;
const DEFAULT_TIMEOUT_MS = 10_000;

async function waitForStableMatch<T>(
  getCandidate: () => T,
  matcher: (candidate: T) => boolean,
  stabilityMs: number = DEFAULT_STABILITY_MS,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let trackedCandidate: T | null = null;
  let trackedSince: number | null = null;

  for (;;) {
    const candidate = getCandidate();
    const matches = matcher(candidate);

    if (matches) {
      const isSameAsTracked = trackedCandidate !== null && isDeepStrictEqual(candidate, trackedCandidate);
      if (isSameAsTracked) {
        if (Date.now() - (trackedSince as number) >= stabilityMs) {
          return trackedCandidate as T;
        }
      } else {
        trackedCandidate = candidate;
        trackedSince = Date.now();
      }
    } else {
      trackedCandidate = null;
      trackedSince = null;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `waitForStableMatch timed out after ${timeoutMs}ms — no candidate remained matching and unchanged for ${stabilityMs}ms`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function waitStableCombined(
  guard: MetaGuard,
  matcher: (state: CombinedState) => boolean,
  stabilityMs: number = DEFAULT_STABILITY_MS
): Promise<CombinedState> {
  return waitForStableMatch(() => getCombinedState(guard), matcher, stabilityMs);
}

export async function waitStableSnapshot(
  getSnapshot: () => CallEntry[],
  matcher: (snap: CallEntry[]) => boolean,
  stabilityMs: number = DEFAULT_STABILITY_MS
): Promise<CallEntry[]> {
  return waitForStableMatch(getSnapshot, matcher, stabilityMs);
}

export { expect };
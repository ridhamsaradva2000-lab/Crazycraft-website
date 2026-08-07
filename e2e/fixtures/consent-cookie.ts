import type { BrowserContext } from "@playwright/test";

function makeConsentCookieValue(marketing: boolean): string {
  const decision = { version: 1, marketing, decidedAt: new Date().toISOString() };
  return encodeURIComponent(JSON.stringify(decision));
}

export async function setConsentCookie(context: BrowserContext, baseURL: string, marketing: boolean) {
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: "crazycraft_consent",
      value: makeConsentCookieValue(marketing),
      domain: url.hostname,
      path: "/",
      sameSite: "Lax",
      secure: false,
    },
  ]);
}
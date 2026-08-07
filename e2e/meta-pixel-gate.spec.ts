import { test, expect, waitStableCombined } from "./fixtures/meta-safe-test";
import { setConsentCookie } from "./fixtures/consent-cookie";

async function getPixelState(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { __crazycraftMetaPixelState?: unknown }).__crazycraftMetaPixelState);
}

test.describe("Meta Pixel gate — closed states", () => {
  test("unset consent: closed state, banner visible, no request", async ({ context, metaGuard, baseURL }) => {
    const page = await context.newPage();
    await page.goto(baseURL!);

    await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
    expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq)).toBe("undefined");
    await expect.poll(async () => getPixelState(page)).toMatchObject({
      scriptStatus: "idle",
      initializedPixelId: null,
      consentGranted: false,
      desiredConsent: false,
      desiredPixelId: null,
      permanentlyDisabled: false,
    });

    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);
  });

  test("rejected consent: closed state, banner hidden, no request", async ({ context, metaGuard, baseURL }) => {
    await setConsentCookie(context, baseURL!, false);
    const page = await context.newPage();
    await page.goto(baseURL!);

    await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
    await expect.poll(async () => getPixelState(page)).toMatchObject({
      scriptStatus: "idle",
      initializedPixelId: null,
      consentGranted: false,
      desiredConsent: false,
      desiredPixelId: null,
      permanentlyDisabled: false,
    });

    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);
  });

  test("accepted consent, missing Pixel ID: gate never opens", async ({ context, metaGuard, baseURL }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(baseURL!);

    await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
    expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq)).toBe("undefined");
    await expect.poll(async () => getPixelState(page)).toMatchObject({
      scriptStatus: "idle",
      initializedPixelId: null,
      consentGranted: false,
      desiredConsent: false,
      desiredPixelId: null,
      permanentlyDisabled: false,
    });

    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);
  });
});
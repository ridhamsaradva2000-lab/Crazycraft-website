import { test, expect, waitStableCombined } from "./fixtures/meta-safe-test";
import { setConsentCookie } from "./fixtures/consent-cookie";

async function getPixelState(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => (window as unknown as { __crazycraftMetaPixelState?: unknown }).__crazycraftMetaPixelState
  );
}

test.describe("Meta Pixel gate - closed states", () => {
  test("unset consent: delayed modal requires a decision and keeps tracking closed", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    const page = await context.newPage();
    await page.goto(baseURL!);

    const consentDialog = page.getByRole("dialog", { name: "Get a Better Experience" });

    await expect(consentDialog).toBeHidden();
    expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq)).toBe(
      "undefined"
    );
    await expect.poll(async () => getPixelState(page)).toMatchObject({
      scriptStatus: "idle",
      initializedPixelId: null,
      consentGranted: false,
      desiredConsent: false,
      desiredPixelId: null,
      permanentlyDisabled: false,
    });

    await page.waitForTimeout(7_000);
    await expect(consentDialog).toBeHidden();
    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);

    await expect(consentDialog).toBeVisible({ timeout: 8_000 });
    await expect(
      consentDialog.getByRole("button", { name: "Reject Non-Essential Cookies" })
    ).toBeVisible();
    await expect(consentDialog.getByRole("button", { name: "Accept Cookies" })).toBeVisible();

    expect(await consentDialog.evaluate((dialog) => dialog.matches(":modal"))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    expect(await consentDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
      true
    );

    await page.keyboard.press("Escape");
    await expect(consentDialog).toBeVisible();

    await page.mouse.click(2, 2);
    await expect(consentDialog).toBeVisible();

    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);

    await consentDialog.getByRole("button", { name: "Reject Non-Essential Cookies" }).click();
    await expect(consentDialog).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");

    const consentCookie = (await context.cookies(baseURL!)).find(
      (cookie) => cookie.name === "crazycraft_consent"
    );
    expect(consentCookie).toBeDefined();
    if (!consentCookie) throw new Error("Expected crazycraft_consent cookie after rejection.");

    const storedDecision = JSON.parse(decodeURIComponent(consentCookie.value)) as {
      version?: unknown;
      marketing?: unknown;
    };
    expect(storedDecision).toMatchObject({ version: 1, marketing: false });

    await page.reload();
    await expect(consentDialog).toBeHidden();
    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);
  });

  test("rejected consent: closed state, dialog hidden, no request", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, false);
    const page = await context.newPage();
    await page.goto(baseURL!);

    await expect(page.getByRole("dialog", { name: "Get a Better Experience" })).toBeHidden();
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

  test("accepted consent, missing Pixel ID: gate never opens", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(baseURL!);

    await expect(page.getByRole("dialog", { name: "Get a Better Experience" })).toBeHidden();
    expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq)).toBe(
      "undefined"
    );
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

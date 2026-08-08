import { isDeepStrictEqual } from "node:util";
import {
  test,
  expect,
  waitStableCombined,
  getDocumentGeneration,
  readCurrentDocumentGeneration,
  FAKE_PIXEL_ID,
} from "./fixtures/meta-safe-test";
import { setConsentCookie } from "./fixtures/consent-cookie";

const INITIAL_SEQUENCE = [
  ["init", FAKE_PIXEL_ID],
  ["consent", "grant"],
  ["track", "PageView"],
];

test.describe("Meta Pixel — tracking behavior", () => {
  test("first accept: exact init/grant/PageView sequence", async ({ context, metaGuard, baseURL }) => {
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const consentDialog = page.getByRole("dialog", { name: "Get a Better Experience" });
    await expect(consentDialog).toBeVisible({ timeout: 15_000 });
    await consentDialog.getByRole("button", { name: "Accept Cookies" }).click();
    await expect(consentDialog).toBeHidden();

    const consentCookie = (await context.cookies(baseURL!)).find(
      (cookie) => cookie.name === "crazycraft_consent"
    );
    expect(consentCookie).toBeDefined();
    if (!consentCookie) throw new Error("Expected crazycraft_consent cookie after acceptance.");

    const storedDecision = JSON.parse(decodeURIComponent(consentCookie.value)) as {
      version?: unknown;
      marketing?: unknown;
    };
    expect(storedDecision).toMatchObject({ version: 1, marketing: true });
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");

    await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
  });

  test("marketing A -> B -> A: two additional PageViews, same document throughout, no extra script request", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    const baselineLen = initial.entries.length;
    const baselineScriptCount = initial.scriptRequestCount;
    const originalDocumentId = await getDocumentGeneration(page);

    const header = page.locator("header");

    await Promise.all([page.waitForURL(/\/about$/), header.getByRole("link", { name: "About", exact: true }).click()]);

    const afterAbout = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(baselineLen);
      const [firstAdded] = added;
      return (
        added.length === 1 &&
        firstAdded !== undefined &&
        isDeepStrictEqual(firstAdded.args, ["track", "PageView"]) &&
        firstAdded.documentId === originalDocumentId &&
        s.scriptRequestCount === baselineScriptCount
      );
    });
    expect(await getDocumentGeneration(page)).toBe(originalDocumentId);
    const afterAboutLen = afterAbout.entries.length;

    await Promise.all([page.waitForURL(/\/products$/), page.goBack()]);

    const settled = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(baselineLen);
      return (
        added.length === 2 &&
        isDeepStrictEqual(added.map((e) => e.args), [
          ["track", "PageView"],
          ["track", "PageView"],
        ]) &&
        added.every((e) => e.documentId === originalDocumentId) &&
        s.scriptRequestCount === baselineScriptCount
      );
    });

    expect(await getDocumentGeneration(page)).toBe(originalDocumentId);
    const addedEntries = settled.entries.slice(baselineLen);
    expect(addedEntries.every((e) => e.documentId === originalDocumentId)).toBe(true);
    expect(afterAboutLen).toBe(baselineLen + 1);
  });

  test("ProductFilters Apply: document-aware full-reload re-initialization", async ({ context, metaGuard, baseURL }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    const baselineLen = initial.entries.length;
    const scriptCountBefore = initial.scriptRequestCount;
    const oldDocumentId = await getDocumentGeneration(page);

    // ProductFilters' Apply button submits a plain native
    // <form method="get" action="/products"> with no client-side
    // onSubmit handler — a genuine browser GET navigation whenever the
    // resulting URL differs from the current one, but NOT guaranteed to
    // be observably distinguishable if every field is left at its
    // current (empty) default, since the submitted URL can then be
    // identical to the current one. Filling the search field first
    // guarantees the submitted URL genuinely changes
    // (/products?q=vase), so this test exercises Apply doing real,
    // meaningful work — not a no-op click.
    const searchInput = page.getByLabel("Search products", { exact: true });
    await searchInput.fill("vase");
    await Promise.all([
      page.waitForURL((url) => new URLSearchParams(url.search).get("q") === "vase"),
      page.getByRole("button", { name: /apply/i }).click(),
    ]);

    // The URL is now confirmed to have genuinely changed. Whether that
    // corresponds to a new document is OBSERVED here via
    // readCurrentDocumentGeneration (which does not require a change
    // and will not time out either way), not blindly assumed — this
    // reflects actual application behavior rather than a hard-coded
    // expectation, even though a plain native form submission is
    // architecturally always a full reload in every current browser.
    const newDocumentId = await readCurrentDocumentGeneration(page);
    const isNewDocument = newDocumentId !== oldDocumentId;

    if (isNewDocument) {
      const settled = await waitStableCombined(metaGuard, (state) => {
        const added = state.entries.slice(baselineLen);
        return (
          state.scriptRequestCount === scriptCountBefore + 1 &&
          added.length === 3 &&
          added.every((e) => e.documentId === newDocumentId) &&
          isDeepStrictEqual(added.map((e) => e.args), INITIAL_SEQUENCE)
        );
      });

      const addedEntries = settled.entries.slice(baselineLen);
      expect(addedEntries.every((e) => e.documentId === newDocumentId)).toBe(true);
      expect(addedEntries.some((e) => e.documentId === oldDocumentId)).toBe(false);
      expect(addedEntries.map((e) => e.args)).toEqual(INITIAL_SEQUENCE);
      expect(settled.scriptRequestCount).toBe(scriptCountBefore + 1);
    } else {
      // No current application code performs a same-document
      // client-side interception of this native form submission — this
      // branch exists so the test reflects observed reality rather than
      // an assumption. If it were ever legitimately same-document, the
      // correct behavior is exactly one fresh PageView for the new URL,
      // no re-init, and no additional script request.
      const settled = await waitStableCombined(metaGuard, (state) => {
        const added = state.entries.slice(baselineLen);
        const [firstAdded] = added;
        return (
          state.scriptRequestCount === scriptCountBefore &&
          added.length === 1 &&
          firstAdded !== undefined &&
          firstAdded.documentId === oldDocumentId &&
          isDeepStrictEqual(firstAdded.args, ["track", "PageView"])
        );
      });
      const addedEntries = settled.entries.slice(baselineLen);
      expect(addedEntries.length).toBe(1);
      expect(settled.scriptRequestCount).toBe(scriptCountBefore);
    }
  });

  test("query-string client navigation via Pagination (skipped if unavailable)", async ({ context, metaGuard, baseURL }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    const baselineLen = initial.entries.length;
    const baselineScriptCount = initial.scriptRequestCount;
    const originalDocumentId = await getDocumentGeneration(page);

    const nextLink = page.getByRole("link", { name: "Next →", exact: true });
    if ((await nextLink.count()) === 0) {
      test.skip(true, "Pagination not rendered (totalPages <= 1 for current data) — query-string navigation not exercisable");
      return;
    }

    const hrefBefore = page.url();
    await nextLink.click();
    await page.waitForURL((url) => url.toString() !== hrefBefore);

    const settled = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(baselineLen);
      const [firstAdded] = added;
      return (
        added.length === 1 &&
        firstAdded !== undefined &&
        isDeepStrictEqual(firstAdded.args, ["track", "PageView"]) &&
        s.scriptRequestCount === baselineScriptCount
      );
    });

    expect(await getDocumentGeneration(page)).toBe(originalDocumentId);
    expect(settled.entries.slice(baselineLen).every((e) => e.documentId === originalDocumentId)).toBe(true);
  });

  test("reject on /privacy sends exactly one revoke, then suppresses further events", async ({ context, metaGuard, baseURL }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/privacy`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    const startLen = initial.entries.length;
    const scriptCountBeforeReject = initial.scriptRequestCount;
    const currentDocumentId = await getDocumentGeneration(page);

    await page.getByRole("button", { name: "Reject non-essential" }).click();

    const afterRevoke = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(startLen);
      const [firstAdded] = added;
      return (
        added.length === 1 &&
        firstAdded !== undefined &&
        isDeepStrictEqual(firstAdded.args, ["consent", "revoke"]) &&
        firstAdded.documentId === currentDocumentId &&
        s.scriptRequestCount === scriptCountBeforeReject
      );
    });

    const afterRevokeLen = afterRevoke.entries.length;
    const scriptCountAfterRevoke = afterRevoke.scriptRequestCount;

    // The real Header renders "Products" as a BUTTON that opens
    // ProductDropdown. The real dropdown link is exactly:
    // <Link href="/products" role="menuitem">All Products</Link> —
    // an explicit, deterministic menuitem role, used directly here with
    // no fallback selector.
    const header = page.locator("header");
    await header.getByRole("button", { name: "Products", exact: true }).click();
    const allProductsMenuItem = page.getByRole("menuitem", { name: "All Products", exact: true });
    await Promise.all([page.waitForURL(/\/products$/), allProductsMenuItem.click()]);

    await waitStableCombined(
      metaGuard,
      (s) => s.entries.length === afterRevokeLen && s.scriptRequestCount === scriptCountAfterRevoke
    );
  });

  test("re-accept on /privacy: grant then one fresh PageView, no re-init, no new script request", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/privacy`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    const coldLoadScriptCount = initial.scriptRequestCount;
    const preRejectLen = initial.entries.length;
    const currentDocumentId = await getDocumentGeneration(page);

    await page.getByRole("button", { name: "Reject non-essential" }).click();
    const afterRevoke = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(preRejectLen);
      const [firstAdded] = added;
      return (
        added.length === 1 &&
        firstAdded !== undefined &&
        isDeepStrictEqual(firstAdded.args, ["consent", "revoke"]) &&
        firstAdded.documentId === currentDocumentId &&
        s.scriptRequestCount === coldLoadScriptCount
      );
    });

    const startLen = afterRevoke.entries.length;

    await page.getByRole("button", { name: "Accept marketing" }).click();
    const afterReaccept = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(startLen);
      return (
        added.length === 2 &&
        isDeepStrictEqual(added.map((e) => e.args), [
          ["consent", "grant"],
          ["track", "PageView"],
        ]) &&
        added.every((e) => e.documentId === currentDocumentId) &&
        s.scriptRequestCount === coldLoadScriptCount
      );
    });

    const addedEntries = afterReaccept.entries.slice(startLen);
    expect(addedEntries.some((e) => e.args[0] === "init")).toBe(false);
    expect(afterReaccept.scriptRequestCount).toBe(coldLoadScriptCount);
  });

  test("marketing exit via header Buyer Login: baseline-delta, document-identity-verified branching", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    const oldDocumentId = await getDocumentGeneration(page);
    const baselineLen = initial.entries.length;
    const scriptCountBefore = initial.scriptRequestCount;

    await Promise.all([
      page.waitForURL(/\/login/),
      page.locator("header").getByRole("link", { name: "Buyer Login", exact: true }).click(),
    ]);

    const newDocumentId = await readCurrentDocumentGeneration(page);
    const isSameDocument = newDocumentId === oldDocumentId;

    const settled = await waitStableCombined(metaGuard, (state) => {
      const added = state.entries.slice(baselineLen);
      if (isSameDocument) {
        const [firstAdded] = added;
        return (
          added.length === 1 &&
          firstAdded !== undefined &&
          firstAdded.documentId === oldDocumentId &&
          firstAdded.args[0] === "consent" &&
          firstAdded.args[1] === "revoke" &&
          state.scriptRequestCount === scriptCountBefore
        );
      }
      const revokesAdded = added.filter((e) => e.args[0] === "consent" && e.args[1] === "revoke");
      const nonRevokeAdded = added.filter((e) => !(e.args[0] === "consent" && e.args[1] === "revoke"));
      return (
        nonRevokeAdded.length === 0 &&
        revokesAdded.length <= 1 &&
        revokesAdded.every((e) => e.documentId === oldDocumentId) &&
        added.every((e) => e.documentId !== newDocumentId) &&
        state.scriptRequestCount === scriptCountBefore
      );
    });

    const addedEntries = settled.entries.slice(baselineLen);

    if (isSameDocument) {
      expect(addedEntries).toEqual([{ documentId: oldDocumentId, args: ["consent", "revoke"] }]);
    } else {
      expect(addedEntries.every((e) => e.documentId !== newDocumentId)).toBe(true);
      expect(addedEntries.length).toBeLessThanOrEqual(1);
      if (addedEntries.length === 1) {
        expect(addedEntries[0]).toEqual({ documentId: oldDocumentId, args: ["consent", "revoke"] });
      }
    }

    expect(settled.scriptRequestCount).toBe(scriptCountBefore);
    expect(metaGuard.unexpectedMetaAttempts).toEqual([]);
  });

  test("Lead conversion helper: sends one deduplicated Lead with explicit eventID after accepted consent", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const initial = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );

    const eventId = "11111111-1111-4111-8111-111111111111";
    const accepted = await page.evaluate((id) => {
      const tracker = (
        window as unknown as { __crazycraftTrackMetaLead?: (eventId: string) => boolean }
      ).__crazycraftTrackMetaLead;
      return tracker?.(id) ?? false;
    }, eventId);

    expect(accepted).toBe(true);

    const afterLead = await waitStableCombined(metaGuard, (s) => {
      const added = s.entries.slice(initial.entries.length);
      return (
        added.length === 1 &&
        isDeepStrictEqual(added[0]?.args, ["track", "Lead", {}, { eventID: eventId }]) &&
        s.scriptRequestCount === 1
      );
    });

    const duplicateAccepted = await page.evaluate((id) => {
      const tracker = (
        window as unknown as { __crazycraftTrackMetaLead?: (eventId: string) => boolean }
      ).__crazycraftTrackMetaLead;
      return tracker?.(id) ?? false;
    }, eventId);

    expect(duplicateAccepted).toBe(true);
    await waitStableCombined(
      metaGuard,
      (s) => s.entries.length === afterLead.entries.length && s.scriptRequestCount === 1
    );
  });

  test("Lead conversion helper: rejected consent cannot queue or send a Lead", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, false);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const accepted = await page.evaluate(() => {
      const tracker = (
        window as unknown as { __crazycraftTrackMetaLead?: (eventId: string) => boolean }
      ).__crazycraftTrackMetaLead;
      return tracker?.("22222222-2222-4222-8222-222222222222") ?? false;
    });

    expect(accepted).toBe(false);
    await waitStableCombined(metaGuard, (s) => s.entries.length === 0 && s.scriptRequestCount === 0);
  });

  test("accepted-cookie cold load: sequence and script request stabilize together, exactly once", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    await expect(page.getByRole("dialog", { name: "Get a Better Experience" })).toBeHidden();
    const settled = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1
    );
    expect(settled.scriptRequestCount).toBe(1);
  });

  test("React Strict Mode: sequence + script count stabilize together, no duplicate init/grant, mountCount settles at 1", async ({
    context,
    metaGuard,
    baseURL,
  }) => {
    await setConsentCookie(context, baseURL!, true);
    const page = await context.newPage();
    await page.goto(`${baseURL}/products`);

    const settled = await waitStableCombined(
      metaGuard,
      (s) => isDeepStrictEqual(s.entries.map((e) => e.args), INITIAL_SEQUENCE) && s.scriptRequestCount === 1,
      400
    );

    expect(settled.entries.filter((e) => e.args[0] === "init")).toHaveLength(1);
    expect(settled.entries.filter((e) => e.args[0] === "consent" && e.args[1] === "grant")).toHaveLength(1);
    expect(settled.scriptRequestCount).toBe(1);

    const state = await page.evaluate(
      () => (window as unknown as { __crazycraftMetaPixelState?: { mountCount?: number } }).__crazycraftMetaPixelState
    );
    expect(state?.mountCount).toBe(1);
  });
});
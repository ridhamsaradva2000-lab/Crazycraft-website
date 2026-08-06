import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { ProductDropdown } from "@/components/layout/ProductDropdown";
import { NAV_LINKS, SITE_NAME } from "@/lib/constants";
import { getPublishedCategories } from "@/lib/catalog/data";
import { getBuyerProfile } from "@/lib/auth/session";

export async function Header() {
  // Categories and the current buyer session are fetched in parallel — a
  // failure in either one degrades gracefully rather than breaking the
  // whole header: an empty category list simply omits the dropdown
  // contents (still links to /products directly), and a session lookup
  // failure/absence just shows the logged-out "Buyer Login" link.
  //
  // getBuyerProfile() specifically, not getCurrentUser() — an admin who
  // happens to be logged in while browsing the public site shares the
  // same `authenticated` Postgres role as a buyer, so a bare
  // getCurrentUser() check can't distinguish them; this header's account
  // link should only ever mean "my buyer account," and correctly falls
  // back to "Buyer Login" for a logged-in admin with no buyers row.
  const [{ categories }, buyer] = await Promise.all([getPublishedCategories(), getBuyerProfile()]);
  const isLoggedIn = Boolean(buyer);
  const accountHref = (isLoggedIn ? "/dashboard" : "/login") as Route;

  return (
    <header className="sticky top-0 z-50 border-b border-paper-muted bg-paper/95">
      <Container className="flex h-16 items-center justify-between">
        <Link href={"/" as Route} className="font-display text-xl text-brand-900">
          {SITE_NAME}
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) =>
            link.label === "Products" ? (
             <ProductDropdown
  key={link.href}
  categories={categories}
/>
            ) : (
              <Link
                key={link.href}
                href={link.href as Route}
                className="rounded-md px-3 py-2 font-body text-sm text-ink hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href={accountHref}
            className="font-body text-sm text-ink hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {isLoggedIn ? "My Account" : "Buyer Login"}
          </Link>
          <Link
            href={"/contact" as Route}
            className="rounded-md bg-brand-700 px-4 py-2 font-body text-sm font-medium text-white hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            Request Quote
          </Link>
        </div>

        <MobileMenu categories={categories} isLoggedIn={isLoggedIn} accountHref={accountHref} />
      </Container>
    </header>
  );
}

import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { SITE_NAME } from "@/lib/constants";
import { getPublishedCategories } from "@/lib/catalog/data";

const COMPANY_LINKS: { label: string; href: Route }[] = [
  { label: "About", href: "/about" },
  { label: "Why Us", href: "/why-us" },
  { label: "Sustainability", href: "/sustainability" },
  { label: "Certifications", href: "/certifications" },
  { label: "Factory Tour", href: "/factory-tour" },
];

export async function Footer() {
  // Server Component — this year is computed once during server
  // rendering and never re-executed on the client (Server Components
  // don't hydrate/re-run in the browser at all), so there is no
  // hydration-mismatch risk here regardless of the viewer's own
  // timezone or clock.
  const currentYear = new Date().getFullYear();
  const { categories } = await getPublishedCategories();

  return (
    <footer className="border-t border-paper-muted bg-paper-muted">
      <Container className="py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div>
            <h2 className="font-display text-sm font-medium text-brand-900">Products</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href={"/products" as Route} className="font-body text-sm text-ink-muted hover:text-brand-700">
                  All Products
                </Link>
              </li>
              {categories.slice(0, 5).map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}` as Route}
                    className="font-body text-sm text-ink-muted hover:text-brand-700"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-medium text-brand-900">Company</h2>
            <ul className="mt-3 space-y-2">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-body text-sm text-ink-muted hover:text-brand-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-medium text-brand-900">Get in Touch</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href={"/contact" as Route} className="font-body text-sm text-ink-muted hover:text-brand-700">
                  Request a Quote
                </Link>
              </li>
              <li>
                <Link href={"/contact" as Route} className="font-body text-sm text-ink-muted hover:text-brand-700">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-medium text-brand-900">Buyer Account</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href={"/login" as Route} className="font-body text-sm text-ink-muted hover:text-brand-700">
                  Buyer Login
                </Link>
              </li>
              <li>
                <Link href={"/register" as Route} className="font-body text-sm text-ink-muted hover:text-brand-700">
                  Create an Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-paper-muted pt-6">
          <p className="font-body text-xs text-ink-muted">
            © {currentYear} {SITE_NAME}. All rights reserved.
          </p>
          <p className="mt-2 max-w-3xl font-body text-xs text-ink-muted">
            Product specifications, minimum order quantities, and lead times are provided for
            planning purposes and are confirmed per order. Availability of compliance, product, or
            export documentation depends on the specific product and destination — see our{" "}
            <Link href={"/certifications" as Route} className="underline hover:text-brand-700">
              Certifications
            </Link>{" "}
            page for details.
          </p>
    <p className="mt-2 font-body text-xs text-ink-muted">
      <Link href={"/privacy" as Route} className="underline hover:text-brand-700">
        Privacy &amp; cookie choices
      </Link>
    </p>
  </div>
      </Container>
    </footer>
  );
}

import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ConsentProvider } from "@/lib/consent/ConsentProvider";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { MetaPixel } from "@/components/consent/MetaPixel";

// Deliberately synchronous — no cookies(), no other request-time
// Dynamic API. ConsentProvider is a Client Component, but wrapping
// already-rendered Server Component children (Header, page content,
// Footer) in it does not convert them to client code — only
// ConsentProvider's own logic, and anything under it that itself opts
// into "use client" (like ConsentBanner), runs client-side.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConsentProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <ConsentBanner />
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
      </div>
    </ConsentProvider>
  );
}
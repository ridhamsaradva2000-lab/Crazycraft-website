import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

/**
 * `tone` is required, deliberately — the previous version defaulted to
 * an "outline" variant styled for a dark background (white border/text),
 * and every call site relied on that one default. The buyer dashboard's
 * white header used the same default, rendering a near-invisible
 * white-on-white button. Requiring each call site to state which header
 * it's on makes that class of bug impossible to reintroduce silently.
 */
export function SignOutButton({ tone }: { tone: "light-header" | "dark-header" }) {
  if (tone === "dark-header") {
    return (
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="outline"
         className="whitespace-nowrap border-white/30 px-3 py-2 text-xs leading-none text-white hover:bg-white/10 sm:px-4 sm:text-sm"
        >
          Sign out
        </Button>
      </form>
    );
  }

  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline">
        Sign out
      </Button>
    </form>
  );
}

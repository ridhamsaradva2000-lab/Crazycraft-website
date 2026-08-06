"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, magicLinkSchema, type LoginInput, type MagicLinkInput } from "@/lib/validations/auth";
import { signInBuyerAction, sendMagicLinkAction, signInWithGoogleAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError, FormError, FormSuccess } from "@/components/ui/FormError";

export function BuyerLoginForm({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [serverError, setServerError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const passwordForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const magicLinkForm = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  function onPasswordSubmit(input: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signInBuyerAction(input, redirectTo);
      // On success, signInBuyerAction redirects server-side and this
      // component unmounts — reaching here means it failed.
      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  function onMagicLinkSubmit(input: MagicLinkInput) {
    setServerError(null);
    setMagicLinkSent(false);
    startTransition(async () => {
      const result = await sendMagicLinkAction(input, redirectTo);
      if (result.error) {
        setServerError(result.error);
      } else {
        setMagicLinkSent(true);
      }
    });
  }

  function onGoogleClick() {
    setServerError(null);
    startTransition(async () => {
      const result = await signInWithGoogleAction(redirectTo);
      // Success redirects server-side to Google; reaching here means it failed.
      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <div>
      <FormError message={serverError} />

      {mode === "password" ? (
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} noValidate>
          <div className="mb-4">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...passwordForm.register("email")}
            />
            <FieldError message={passwordForm.formState.errors.email?.message} />
          </div>

          <div className="mb-6">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...passwordForm.register("password")}
            />
            <FieldError message={passwordForm.formState.errors.password?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setServerError(null);
              setMode("magic-link");
            }}
            className="mt-4 w-full text-center font-body text-sm text-brand-700 hover:underline"
          >
            Sign in with an email link instead
          </button>
        </form>
      ) : (
        <form onSubmit={magicLinkForm.handleSubmit(onMagicLinkSubmit)} noValidate>
          <FormSuccess
            message={magicLinkSent ? "Check your email for a sign-in link." : null}
          />
          <div className="mb-6">
            <Label htmlFor="magic-email">Email</Label>
            <Input
              id="magic-email"
              type="email"
              autoComplete="email"
              {...magicLinkForm.register("email")}
            />
            <FieldError message={magicLinkForm.formState.errors.email?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Sending…" : "Send sign-in link"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setServerError(null);
              setMode("password");
            }}
            className="mt-4 w-full text-center font-body text-sm text-brand-700 hover:underline"
          >
            Sign in with a password instead
          </button>
        </form>
      )}

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-paper-muted" />
        <span className="font-body text-xs text-ink-muted">or</span>
        <div className="h-px flex-1 bg-paper-muted" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogleClick}
        disabled={isPending}
      >
        Continue with Google
      </Button>

      <p className="mt-6 text-center font-body text-sm text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-brand-700 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}

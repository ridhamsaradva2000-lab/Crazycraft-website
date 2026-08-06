"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buyerRegisterSchema, BUSINESS_TYPE_LABELS, type BuyerRegisterInput } from "@/lib/validations/auth";
import { signUpBuyerAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FieldError, FormError, FormSuccess } from "@/components/ui/FormError";

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<BuyerRegisterInput>({
    resolver: zodResolver(buyerRegisterSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      companyName: "",
      businessType: "importer",
      country: "",
      phone: "",
      website: "",
    },
  });

  function onSubmit(input: BuyerRegisterInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signUpBuyerAction(input);
      // On success with immediate session, signUpBuyerAction redirects
      // server-side and this component unmounts.
      if (result.error) {
        setServerError(result.error);
      } else if (result.needsEmailConfirmation) {
        setNeedsEmailConfirmation(true);
      }
    });
  }

  if (needsEmailConfirmation) {
    return (
      <FormSuccess message="Check your email to confirm your account and finish setting up your buyer profile." />
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />

      <div className="mb-4">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        <FieldError message={form.formState.errors.email?.message} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...form.register("confirmPassword")}
          />
          <FieldError message={form.formState.errors.confirmPassword?.message} />
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="companyName">Company name</Label>
        <Input id="companyName" {...form.register("companyName")} />
        <FieldError message={form.formState.errors.companyName?.message} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="businessType">Business type</Label>
          <Select id="businessType" {...form.register("businessType")}>
            {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <FieldError message={form.formState.errors.businessType?.message} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" {...form.register("country")} />
          <FieldError message={form.formState.errors.country?.message} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" type="tel" {...form.register("phone")} />
          <FieldError message={form.formState.errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" type="url" placeholder="https://" {...form.register("website")} />
          <FieldError message={form.formState.errors.website?.message} />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>

      <p className="mt-6 text-center font-body text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

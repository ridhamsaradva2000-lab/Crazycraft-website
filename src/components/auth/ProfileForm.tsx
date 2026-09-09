"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buyerProfileSchema, BUSINESS_TYPE_LABELS, type BuyerProfileInput } from "@/lib/validations/auth";
import { updateBuyerProfileAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { CountryAutocomplete } from "@/components/auth/CountryAutocomplete";
import { Select } from "@/components/ui/Select";
import { FieldError, FormError, FormSuccess } from "@/components/ui/FormError";
import type { BuyerProfile } from "@/lib/auth/session";

export function ProfileForm({ profile }: { profile: BuyerProfile | null }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<BuyerProfileInput>({
    resolver: zodResolver(buyerProfileSchema),
    defaultValues: {
      companyName: profile?.companyName ?? "",
      businessType: (profile?.businessType as BuyerProfileInput["businessType"]) ?? "importer",
      country: profile?.country ?? "",
      phone: profile?.phone ?? "",
      website: profile?.website ?? "",
    },
  });


  function onSubmit(input: BuyerProfileInput) {
    setServerError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBuyerProfileAction(input);
      if (result.error) {
        setServerError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form
  onSubmit={form.handleSubmit(onSubmit, () => {
    setSaved(false);
    setServerError(null);
  })}
  noValidate
>
      <FormError message={serverError} />
      <FormSuccess message={saved ? "Profile updated." : null} />

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
<Controller
                name="country"
                control={form.control}
                render={({ field, fieldState }) => (
                  <CountryAutocomplete
                    id="country"
                    label="Country"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

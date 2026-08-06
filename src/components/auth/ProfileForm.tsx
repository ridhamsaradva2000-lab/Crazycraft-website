"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buyerProfileSchema, BUSINESS_TYPE_LABELS, type BuyerProfileInput } from "@/lib/validations/auth";
import { updateBuyerProfileAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FieldError, FormError, FormSuccess } from "@/components/ui/FormError";
import type { BuyerProfile } from "@/lib/auth/session";
import { getNames } from "country-list";

const COUNTRY_NAMES = getNames();
export function ProfileForm({ profile }: { profile: BuyerProfile | null }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
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
const countryQuery = form.watch("country").trim();

const filteredCountries =
  countryQuery.length >= 2
    ? COUNTRY_NAMES.filter((countryName) =>
        countryName.toLowerCase().startsWith(countryQuery.toLowerCase()),
      )
    : [];

const countryField = form.register("country");
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
        <div className="relative">
  <Label htmlFor="country">Country</Label>

  <Input
    id="country"
    autoComplete="country-name"
    placeholder="Type at least 2 letters"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={isCountryOpen}
    aria-controls="profile-country-suggestions"
    {...countryField}
    onChange={(event) => {
      countryField.onChange(event);
      setIsCountryOpen(event.target.value.trim().length >= 2);
    }}
    onFocus={() => {
      setIsCountryOpen(countryQuery.length >= 2);
    }}
    onBlur={(event) => {
      countryField.onBlur(event);

      window.setTimeout(() => {
        setIsCountryOpen(false);
      }, 150);
    }}
  />

  {isCountryOpen && countryQuery.length >= 2 && (
    <div
      id="profile-country-suggestions"
      role="listbox"
      className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-md border border-paper-muted bg-white py-1 shadow-lg"
    >
      {filteredCountries.length > 0 ? (
        filteredCountries.map((countryName) => (
          <button
            key={countryName}
            type="button"
            role="option"
            className="block w-full px-3 py-2 text-left font-body text-sm text-ink hover:bg-paper-muted focus:bg-paper-muted focus:outline-none"
            onMouseDown={(event) => {
              event.preventDefault();

              form.setValue("country", countryName, {
                shouldDirty: true,
                shouldValidate: true,
              });

              setIsCountryOpen(false);
            }}
          >
            {countryName}
          </button>
        ))
      ) : (
        <p className="px-3 py-2 font-body text-sm text-ink-muted">
          No matching country
        </p>
      )}
    </div>
  )}

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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import {
  inquiryFormSchema,
  BUSINESS_TYPE_LABELS,
  MOQ_FAMILIARITY_LABELS,
  TIMELINE_LABELS,
  INCOTERM_LABELS,
  type InquiryFormInput,
} from "@/lib/validations/inquiry";
import { submitInquiryAction } from "@/lib/inquiries/actions";
import { clientEnv } from "@/lib/env.client";
import { useConsent } from "@/lib/consent/ConsentProvider";
import { isValidMetaPixelId } from "@/lib/meta/pixel-config";
import { trackMetaLead } from "@/components/consent/MetaPixel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FieldError, FormError, FormSuccess } from "@/components/ui/FormError";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/inquiry/TurnstileWidget";
import { getNames } from "country-list";
const COUNTRY_NAMES = getNames();

function readBrowserCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!item) return undefined;

  const raw = item.slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
const STAGE_1_FIELDS = ["name", "email", "country", "businessType", "message"] as const;
const STAGE_2_FIELDS = [
  "companyName",
  "companyWebsite",
  "linkedinUrl",
  "volumeRange",
  "moqFamiliarity",
  "timeline",
] as const;

export function InquiryForm({
  productId,
  productName,
}: {
  productId?: string;
  productName?: string;
}) {
  const searchParams = useSearchParams();
  const { decision, hasChecked } = useConsent();
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  // A fresh id per page load — not a persistent cross-session visitor
  // id. Proper persistent first-party visitor tracking is a Module 7
  // (Meta Pixel/CAPI) concern; this is a reasonable, clearly-scoped
  // simplification for the rate-limiting and attribution fields this
  // form already sends.
  const visitorId = useMemo(() => crypto.randomUUID(), []);

  const form = useForm<InquiryFormInput>({
  resolver: zodResolver(inquiryFormSchema),
  mode: "onChange",
  defaultValues: {
      name: "",
      email: "",
      country: "",
      businessType: "importer",
      message: "",
      companyName: "",
      companyWebsite: "",
      linkedinUrl: "",
      volumeRange: "",
      shippingCountry: "",
      privateLabelRequired: false,
      wantsSample: false,
      honeypot: "",
      turnstileToken: "",
      productId,
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
  const {
    formState: { errors },
  } = form;

  const stageErrorCount = Object.keys(errors).length;

  useEffect(() => {
    if (stageErrorCount > 0) {
      errorSummaryRef.current?.focus();
    }
  }, [stageErrorCount]);

  async function goToStage2() {
    const valid = await form.trigger(STAGE_1_FIELDS);
    if (valid) setStage(2);
  }

  async function goToStage3() {
    const valid = await form.trigger(STAGE_2_FIELDS);
    if (valid) setStage(3);
  }

  function goBack() {
    setStage((s) => (s === 3 ? 2 : 1));
  }

  function onSubmit(values: InquiryFormInput) {
    setServerError(null);

    if (!turnstileToken) {
      setServerError("Please complete the verification check above before submitting.");
      return;
    }

    const utmSource = searchParams.get("utm_source") ?? undefined;
    const utmMedium = searchParams.get("utm_medium") ?? undefined;
    const utmCampaign = searchParams.get("utm_campaign") ?? undefined;

    // Derived at event time (this function only ever runs in response to
    // an actual submit event, never during render) rather than stored in
    // state set from an effect — window/document are always available
    // here since this whole component is a Client Component.
    const landingPage =
      typeof window !== "undefined" ? window.location.pathname : undefined;
    const referrer =
      typeof document !== "undefined" && document.referrer ? document.referrer : undefined;

    const marketingTrackingEnabled =
      hasChecked &&
      decision?.marketing === true &&
      isValidMetaPixelId(clientEnv.NEXT_PUBLIC_META_PIXEL_ID);

    const fbp = marketingTrackingEnabled ? readBrowserCookie("_fbp") : undefined;
    const fbc = marketingTrackingEnabled ? readBrowserCookie("_fbc") : undefined;

    startTransition(async () => {
      const result = await submitInquiryAction({
        ...values,
        productId,
        turnstileToken,
        visitorId,
        landingPage,
        referrer,
        utmSource,
        utmMedium,
        utmCampaign,
        // First/last touch attribution both mirror the current session's
        // UTM values for now — proper first-touch persistence across
        // sessions is a Module 7 concern (a durable first-party cookie),
        // not something this form can establish on its own.
        firstTouchSource: utmSource,
        firstTouchMedium: utmMedium,
        firstTouchCampaign: utmCampaign,
        lastTouchSource: utmSource,
        lastTouchMedium: utmMedium,
        lastTouchCampaign: utmCampaign,
        fbp,
        fbc,
      });

      if (result.error) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof InquiryFormInput, { message });
          }
        }
        // The token that was just submitted may have already been
        // consumed by Cloudflare's siteverify (single-use) or rejected
        // outright — either way it must not be silently resubmitted on
        // the next attempt. Reset the widget itself and clear both places
        // the token is tracked.
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        form.setValue("turnstileToken", "", { shouldValidate: true });
        return;
      }

      if (result.metaEventId) {
        trackMetaLead(result.metaEventId);
      }

      setIsSuccess(true);
    });
  }

  if (isSuccess) {
    return (
      <FormSuccess message="Thank you — your inquiry has been received. Our export team will be in touch shortly." />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
      noValidate
      aria-label="Request a quote"
    >
      {productName && (
        <p className="mb-4 font-body text-sm text-ink-muted">
          Inquiring about: <span className="font-medium text-ink">{productName}</span>
        </p>
      )}

      <p className="mb-6 font-body text-sm text-ink-muted" aria-live="polite">
        Step {stage} of 3
      </p>

      {stageErrorCount > 0 && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 rounded-md border border-clay/30 bg-clay/5 px-4 py-3 font-body text-sm text-clay"
        >
          <p className="mb-1 font-medium">Please fix the following before continuing:</p>
         <ul className="list-inside list-disc">
  {Object.entries(errors).map(([field, err]) => {
    const fieldLabels: Record<string, string> = {
      name: "Full name",
      email: "Business email",
      country: "Country",
      businessType: "Business type",
      message: "Product interest / requirement",
      companyName: "Company name",
      volumeRange: "Estimated order volume",
      moqFamiliarity: "Importing experience",
      timeline: "Timeline",
      shippingCountry: "Shipping country",
      incotermPreference: "Incoterm preference",
    };

    return (
      <li key={field}>
        {fieldLabels[field] ?? field} — {err?.message?.toString()}
      </li>
    );
  })}
</ul>
        </div>
      )}

      <FormError message={serverError} />

      {/* Honeypot — invisible to sighted users and skipped by screen
          readers (aria-hidden + not keyboard-reachable), but present in
          the DOM for basic bots that fill every field indiscriminately.
          Positioned off-screen rather than display:none, since some
          bots specifically skip display:none fields. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}
      >
        <label htmlFor="company-website-confirm">Leave this field blank</label>
        <input
          id="company-website-confirm"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...form.register("honeypot")}
        />
      </div>

      {/* ── Stage 1 ──────────────────────────────────────────────────── */}
      <fieldset hidden={stage !== 1}>
        <legend className="sr-only">Step 1: your details</legend>

        <div className="mb-4">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" {...form.register("name")} />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="mb-4">
          <Label htmlFor="email">Business email</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
         <div className="relative">
  <Label htmlFor="country">Country</Label>

  <Input
    id="country"
    autoComplete="new-password"
    placeholder="Type at least 2 letters"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={isCountryOpen}
    aria-controls="country-suggestions"
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
      id="country-suggestions"
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

  <FieldError message={errors.country?.message} />
</div>
          <div>
            <Label htmlFor="businessType">Business type</Label>
            <Select id="businessType" {...form.register("businessType")}>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <FieldError message={errors.businessType?.message} />
          </div>
        </div>

        <div className="mb-6">
          <Label htmlFor="message">Product interest / requirement</Label>
          <textarea
            id="message"
            rows={4}
            placeholder="e.g. Blue pottery dinnerware sets for a boutique hotel chain"
            className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            {...form.register("message")}
          />
          <FieldError message={errors.message?.message} />
        </div>
      </fieldset>

      {/* ── Stage 2 ──────────────────────────────────────────────────── */}
      <fieldset hidden={stage !== 2}>
        <legend className="sr-only">Step 2: company details</legend>

        <div className="mb-4">
          <Label htmlFor="companyName">Company name</Label>
          <Input id="companyName" {...form.register("companyName")} />
          <FieldError message={errors.companyName?.message} />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="companyWebsite">Company website</Label>
            <Input id="companyWebsite" type="url" placeholder="https://" {...form.register("companyWebsite")} />
            <FieldError message={errors.companyWebsite?.message} />
          </div>
          <div>
            <Label htmlFor="linkedinUrl">LinkedIn company page</Label>
            <Input id="linkedinUrl" type="url" placeholder="https://" {...form.register("linkedinUrl")} />
            <FieldError message={errors.linkedinUrl?.message} />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="volumeRange">Estimated order volume</Label>
            <Input id="volumeRange" placeholder="e.g. 500-1000 units" {...form.register("volumeRange")} />
            <FieldError message={errors.volumeRange?.message} />
          </div>
          <div>
            <Label htmlFor="moqFamiliarity">Importing experience</Label>
            <Select
              id="moqFamiliarity"
              {...form.register("moqFamiliarity", {
                setValueAs: (v) => (v === "" ? undefined : v),
              })}
            >
              <option value="">Select…</option>
              {Object.entries(MOQ_FAMILIARITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <FieldError message={errors.moqFamiliarity?.message} />
          </div>
          <div>
            <Label htmlFor="timeline">Timeline</Label>
            <Select
              id="timeline"
              {...form.register("timeline", {
                setValueAs: (v) => (v === "" ? undefined : v),
              })}
            >
              <option value="">Select…</option>
              {Object.entries(TIMELINE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <FieldError message={errors.timeline?.message} />
          </div>
        </div>
      </fieldset>

      {/* ── Stage 3 ──────────────────────────────────────────────────── */}
      <fieldset hidden={stage !== 3}>
        <legend className="sr-only">Step 3: shipping and customization</legend>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="shippingCountry">Shipping destination / port</Label>
            <Input id="shippingCountry" {...form.register("shippingCountry")} />
            <FieldError message={errors.shippingCountry?.message} />
          </div>
          <div>
            <Label htmlFor="incotermPreference">Incoterm preference</Label>
            <Select
              id="incotermPreference"
              {...form.register("incotermPreference", {
                setValueAs: (v) => (v === "" ? undefined : v),
              })}
            >
              <option value="">Select…</option>
              {Object.entries(INCOTERM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <FieldError message={errors.incotermPreference?.message} />
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <input
            id="privateLabelRequired"
            type="checkbox"
            className="h-4 w-4 rounded border-paper-muted"
            {...form.register("privateLabelRequired")}
          />
          <Label htmlFor="privateLabelRequired" className="mb-0">
            I&apos;m interested in OEM / private label
          </Label>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <input
            id="wantsSample"
            type="checkbox"
            className="h-4 w-4 rounded border-paper-muted"
            {...form.register("wantsSample")}
          />
          <Label htmlFor="wantsSample" className="mb-0">
            I&apos;d also like to request a sample
          </Label>
        </div>
      </fieldset>

      <div className="mb-6">
        <TurnstileWidget
          ref={turnstileRef}
          action={clientEnv.NEXT_PUBLIC_TURNSTILE_ACTION}
          onVerify={(token) => {
            setTurnstileToken(token);
            form.setValue("turnstileToken", token, { shouldValidate: true });
          }}
          onExpire={() => {
            setTurnstileToken(null);
            form.setValue("turnstileToken", "", { shouldValidate: true });
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {stage > 1 && (
            <Button type="button" variant="outline" onClick={goBack} disabled={isPending}>
              Back
            </Button>
          )}
        </div>
       <div className="flex gap-3">
  {stage === 1 && (
    <Button
      type="button"
      onClick={goToStage2}
      disabled={isPending}
    >
      Next: Company details
    </Button>
  )}

  {stage === 2 && (
    <Button
      type="button"
      onClick={goToStage3}
      disabled={isPending}
    >
      Next: Shipping details
    </Button>
  )}

  {stage === 3 && (
    <Button type="submit" disabled={isPending}>
      {isPending ? "Submitting..." : "Submit inquiry"}
    </Button>
  )}
</div>
      </div>
    </form>
  );
}

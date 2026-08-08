import { z } from "zod";
import { getNames } from "country-list";
const COUNTRY_NAMES = new Map(
  getNames().map((name) => [name.toLowerCase(), name]),
);

/**
 * Stage 1 — always required, low-friction. Matches submit_inquiry()'s
 * required-field checks exactly (name/email/country/business_type).
 */
export const inquiryStage1Schema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  email: z.string().trim().min(1, "Required").max(320, "Email is too long").email("Enter a valid email address"),
 country: z
  .string()
  .trim()
  .min(1, "Required")
  .max(100)
  .refine(
    (value) => COUNTRY_NAMES.has(value.toLowerCase()),
    { message: "Enter a valid country" },
  )
  .transform(
    (value) => COUNTRY_NAMES.get(value.toLowerCase()) ?? value,
  ),
  businessType: z.enum([
    "importer",
    "wholesaler",
    "distributor",
    "retail_chain",
    "interior_designer",
    "hotel_buyer",
    "gift_chain",
    "museum_store",
    "oem_private_label",
    "other",
  ]),
  message: z
    .string()
    .trim()
    .min(1, "Tell us what you're interested in")
    .max(2000, "Please keep this under 2000 characters"),
});
export type InquiryStage1Input = z.infer<typeof inquiryStage1Schema>;

/**
 * Stage 2 — optional, incentivized ("get a faster, more accurate
 * quote"). Filling ANY of these is what advances qualification_stage to
 * 2 server-side (submit_inquiry() derives this itself — nothing here
 * sends a stage number directly).
 */
export const inquiryStage2Schema = z.object({
  companyName: z.string().trim().max(200).min(1, "Required"),
  companyWebsite: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || /^https?:\/\/.+/.test(val), {
      message: "Website must start with http:// or https://",
    }),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || /^https?:\/\/.+/.test(val), {
      message: "LinkedIn URL must start with http:// or https://",
    }),
  volumeRange: z.string().trim().max(100) .min(1, "Required"),
  moqFamiliarity: z.enum(
  ["first_time_importer", "regular_importer"],
  { error: "Required" },
),
  timeline: z.enum(["immediate", "one_to_three_months", "just_researching"]).optional(),
});
export type InquiryStage2Input = z.infer<typeof inquiryStage2Schema>;

/**
 * Stage 3 — high-intent only. Filling ANY of these advances
 * qualification_stage to 3 server-side.
 */
export const inquiryStage3Schema = z.object({
  shippingCountry: z.string().trim().max(100).optional().or(z.literal("")),
  incotermPreference: z.enum(["fob", "cif", "exw", "other"]).optional(),
  privateLabelRequired: z.boolean().optional(),
  wantsSample: z.boolean().optional(),
});
export type InquiryStage3Input = z.infer<typeof inquiryStage3Schema>;

/**
 * The full combined shape submitted to the server action regardless of
 * which stage the user stopped at — Stage 2/3 fields are simply absent
 * (undefined) if the user submitted early. This mirrors submit_inquiry()
 * deriving qualification_stage from field presence, not a caller-supplied
 * stage number.
 */
export const inquiryFormSchema = inquiryStage1Schema
  .extend(inquiryStage2Schema.shape)
  .extend(inquiryStage3Schema.shape)
  .extend({
    productId: z.string().uuid().optional(),
    honeypot: z.string().max(200).optional(), // must stay empty; see submit_inquiry()
    turnstileToken: z.string().min(1, "Verification failed — please try again").max(2048),
    // Every field below is browser-controlled metadata (UTM params,
    // referrer, attribution IDs) that the Server Action receives as
    // plain strings — and a Server Action can be invoked directly
    // (bypassing the visible form entirely), so these bounds are a real
    // server-side control, not just a formality that happens to match
    // what the UI sends. Lengths are chosen generously for their actual
    // content (UTM values and IDs are normally short; referrer/landing
    // page are full URLs and get more room) while still ruling out
    // arbitrarily large payloads.
    visitorId: z.string().trim().max(100).optional(),
    utmSource: z.string().trim().max(255).optional(),
    utmMedium: z.string().trim().max(255).optional(),
    utmCampaign: z.string().trim().max(255).optional(),
    referrer: z.string().trim().max(2048).optional(),
    landingPage: z.string().trim().max(2048).optional(),
    firstTouchSource: z.string().trim().max(255).optional(),
    firstTouchMedium: z.string().trim().max(255).optional(),
    firstTouchCampaign: z.string().trim().max(255).optional(),
    lastTouchSource: z.string().trim().max(255).optional(),
    lastTouchMedium: z.string().trim().max(255).optional(),
    lastTouchCampaign: z.string().trim().max(255).optional(),
    fbp: z.string().trim().max(255).optional(),
    fbc: z.string().trim().max(255).optional(),
  });
export type InquiryFormInput = z.infer<typeof inquiryFormSchema>;

export const BUSINESS_TYPE_LABELS: Record<InquiryStage1Input["businessType"], string> = {
  importer: "Importer",
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  retail_chain: "Retail Chain",
  interior_designer: "Interior Designer",
  hotel_buyer: "Hotel Buyer",
  gift_chain: "Gift Chain",
  museum_store: "Museum Store",
  oem_private_label: "OEM / Private Label Buyer",
  other: "Other",
};

export const MOQ_FAMILIARITY_LABELS: Record<NonNullable<InquiryStage2Input["moqFamiliarity"]>, string> = {
  first_time_importer: "First-time importer",
  regular_importer: "Regular importer",
};

export const TIMELINE_LABELS: Record<NonNullable<InquiryStage2Input["timeline"]>, string> = {
  immediate: "Immediate",
  one_to_three_months: "1–3 months",
  just_researching: "Just researching",
};

export const INCOTERM_LABELS: Record<NonNullable<InquiryStage3Input["incotermPreference"]>, string> = {
  fob: "FOB",
  cif: "CIF",
  exw: "EXW",
  other: "Other",
};

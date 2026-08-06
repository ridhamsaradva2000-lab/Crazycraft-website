import { z } from "zod";
import { getNames } from "country-list";

const COUNTRY_NAMES = new Map(
  getNames().map((name) => [name.toLowerCase(), name]),
);

/**
 * Shared across buyer and admin login — the underlying mechanism is the
 * same Supabase Auth call (email + password against auth.users). What
 * differs is which page calls it and what happens after a session exists
 * (see src/lib/auth/actions.ts and the two login pages).
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const magicLinkSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
});
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

/**
 * Mirrors exactly the columns Module 2's grants migration allows a buyer
 * to INSERT on their own row (id, company_name, business_type, country,
 * phone, website) — nothing here can smuggle an admin-controlled field,
 * since the database wouldn't accept it even if this schema allowed it.
 */
export const buyerRegisterSchema = z
  .object({
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
    companyName: z.string().trim().min(1, "Company name is required").max(200),
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
    country: z
  .string()
  .trim()
  .min(1, "Country is required")
  .max(100)
  .refine(
    (value) => COUNTRY_NAMES.has(value.toLowerCase()),
    { message: "Enter a valid country" },
  )
  .transform(
    (value) => COUNTRY_NAMES.get(value.toLowerCase()) ?? value,
  ),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    website: z
      .string()
      .trim()
      .max(300)
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || /^https?:\/\/.+/.test(val), {
        message: "Website must start with http:// or https://",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type BuyerRegisterInput = z.infer<typeof buyerRegisterSchema>;

/**
 * Buyer profile edit — same column set as registration minus email/password
 * (those are Supabase Auth concerns, not buyers-table concerns) and minus
 * confirmPassword. Matches the grants migration's buyers UPDATE column
 * list exactly (verified and created_at are never editable here).
 */
export const buyerProfileSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
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
  country: z
  .string()
  .trim()
  .min(1, "Country is required")
  .max(100)
  .refine(
    (value) => COUNTRY_NAMES.has(value.toLowerCase()),
    { message: "Enter a valid country" },
  )
  .transform(
    (value) => COUNTRY_NAMES.get(value.toLowerCase()) ?? value,
  ),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  website: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || /^https?:\/\/.+/.test(val), {
      message: "Website must start with http:// or https://",
    }),
});
export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;

export const BUSINESS_TYPE_LABELS: Record<BuyerRegisterInput["businessType"], string> = {
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

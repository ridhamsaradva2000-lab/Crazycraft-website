-- 20260725120000_create_enums.sql
-- All Postgres enums used across the schema, defined once here so every
-- table references the same type instead of ad-hoc text + CHECK constraints.

create type business_type as enum (
  'importer', 'wholesaler', 'distributor', 'retail_chain',
  'interior_designer', 'hotel_buyer', 'gift_chain', 'museum_store',
  'oem_private_label', 'other'
);

create type admin_role as enum ('super_admin', 'editor', 'sales');

create type product_status as enum ('draft', 'published', 'archived');

create type blog_status as enum ('draft', 'scheduled', 'published');

create type inquiry_type as enum ('product', 'general', 'sample', 'partnership', 'quote');

-- Shared by inquiries and quote_requests — Nurturing prevents long-cycle
-- B2B leads being marked Lost prematurely.
create type lead_status as enum ('new', 'contacted', 'quoted', 'nurturing', 'won', 'lost');

create type moq_familiarity as enum ('first_time_importer', 'regular_importer');

create type purchase_timeline as enum ('immediate', 'one_to_three_months', 'just_researching');

create type incoterm as enum ('fob', 'cif', 'exw', 'other');

-- Outbox pattern for Meta CAPI reliability.
create type capi_event_status as enum ('pending', 'sent', 'failed');

-- Sample request workflow.
create type sample_status as enum (
  'requested', 'approved', 'payment_pending', 'paid',
  'processing', 'shipped', 'delivered', 'cancelled'
);

create type payment_status as enum ('unpaid', 'paid', 'waived', 'refunded');

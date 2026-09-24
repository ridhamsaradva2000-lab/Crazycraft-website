-- =========================================================================
-- Admin Email Reply feature: idempotency support for manual outbound
-- messages (quotation/negotiation/follow_up/general).
--
-- Purely additive. No ALTER to any existing column. No RLS/grant changes:
-- email_messages already grants INSERT/UPDATE to service_role at the
-- table level, which covers this new column with no separate GRANT
-- statement needed.
--
-- client_dedupe_key is populated by the compose UI (one fresh value per
-- form mount/reset, via crypto.randomUUID()) and passed through to the
-- server action. Typed as uuid (not text) so the database itself
-- enforces valid UUID format -- rejecting any malformed, empty-string,
-- or oversized value before it can ever reach the unique index below,
-- consistent with how every other identifier column in this schema
-- (inquiry_id, conversation_id, etc.) is typed, rather than trusting
-- application-layer validation alone. The generated TypeScript type for
-- a uuid column is still `string`, so this adds no client-side
-- complexity.
--
-- The partial unique index guarantees at the database level that two
-- submissions carrying the same key can never both create a row -- a
-- network retry or double form-submission fails on the constraint
-- rather than sending a duplicate email. Rows that never set this
-- column (the existing acknowledgement path, and any other future
-- writer that doesn't need this protection) are entirely unaffected --
-- NULL values are excluded from the unique index.
-- =========================================================================

alter table public.email_messages
  add column client_dedupe_key uuid null;

create unique index email_messages_client_dedupe_key_unique
  on public.email_messages (client_dedupe_key)
  where client_dedupe_key is not null;
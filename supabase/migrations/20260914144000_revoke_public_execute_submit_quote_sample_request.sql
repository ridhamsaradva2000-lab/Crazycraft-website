-- Phase 1 remediation: close the confirmed anonymously-reachable,
-- unguarded write-capable RPC exposure on submit_quote_request() and
-- submit_sample_request(), identified during the September 2026 deep
-- RLS/security review of csp-enforced-preview.
--
-- Scope: EXECUTE privilege revocation only.
-- - No function signature change
-- - No function body change
-- - No RLS policy change
-- - No service_role grant added
--
-- Neither function has a confirmed application caller as of this
-- migration (static source trace across csp-enforced-preview). If a
-- real quote/sample submission feature is built later, it will call a
-- privileged server-only path -- never direct anon/authenticated Data
-- API access -- per Phase 2 design.

revoke execute on function
  public.submit_quote_request(
    text, text, text, text, text, text, text, text,
    text, text, text, text, text, text, uuid, jsonb
  ),
  public.submit_sample_request(
    text, text, text, text, text, uuid, integer, uuid
  )
from PUBLIC, anon, authenticated;
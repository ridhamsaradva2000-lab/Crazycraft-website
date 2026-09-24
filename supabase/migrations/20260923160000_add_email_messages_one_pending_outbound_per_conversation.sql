-- =========================================================================
-- Admin Email Reply feature:
-- At most one unresolved outbound pending email may exist per conversation.
-- This database constraint closes the different-dedupe-key concurrency race.
-- =========================================================================

create unique index email_messages_one_pending_outbound_per_conversation
  on public.email_messages (conversation_id)
  where direction = 'outbound' and status = 'pending';
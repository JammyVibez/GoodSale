-- =============================================================================
-- 015 — resync id sequences
-- Bulk tooling (the launch catalog seeder) deletes and re-inserts rows. If a
-- table's id sequence has drifted behind max(id) — which happens when rows were
-- ever written with explicit ids — the next insert collides on the primary key
-- ("duplicate key value violates unique constraint"). This helper realigns every
-- relevant sequence with the rows that actually exist.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resync_id_sequences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl text;
  seq text;
  max_id bigint;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles', 'businesses', 'products', 'reviews', 'review_replies', 'orders',
    'escrows', 'messages', 'chat_rooms', 'notifications', 'delivery_jobs',
    'delivery_partners', 'auctions', 'bids', 'safe_meet_locations',
    'safe_meet_meetups', 'product_bundles', 'sponsored_ads', 'featured_listings',
    'announcements', 'wallets', 'wallet_transactions', 'audit_logs',
    'business_subscriptions', 'verified_plus_subscriptions',
    'payment_transactions', 'invoices', 'refunds', 'withdrawal_requests',
    'payment_logs', 'good_points_transactions', 'referrals', 'follower_relations',
    'reports', 'service_areas', 'disputes', 'identity_verifications', 'calls',
    'message_reactions'
  ]
  LOOP
    BEGIN
      EXECUTE format('SELECT max(id) FROM public.%I', tbl) INTO max_id;
      seq := pg_get_serial_sequence('public.' || tbl, 'id');
      IF seq IS NOT NULL THEN
        PERFORM setval(seq, greatest(coalesce(max_id, 0), 1), coalesce(max_id, 0) > 0);
      END IF;
    EXCEPTION WHEN others THEN
      -- Table absent or has no id sequence — nothing to realign.
      NULL;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resync_id_sequences() TO service_role;

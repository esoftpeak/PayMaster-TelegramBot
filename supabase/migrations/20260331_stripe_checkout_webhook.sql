-- Step 2: Stripe Checkout (setup mode) + webhook completion.
-- Run in Supabase SQL Editor if you already applied the base schema.

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS stripe_webhook_signing_secret text;

ALTER TABLE public.linked_cards
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE INDEX IF NOT EXISTS linked_cards_stripe_checkout_session_id_idx
  ON public.linked_cards (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- PayMaster — initial schema for Supabase (PostgreSQL)
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Requires: pgcrypto (enabled by default on Supabase)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. merchants — multi-tenant gateway credentials and display settings
-- ---------------------------------------------------------------------------
CREATE TABLE public.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  gateway text NOT NULL CHECK (gateway IN ('stripe', 'square')),
  stripe_secret_key text,
  stripe_publishable_key text,
  square_application_id text,
  square_access_token text,
  delay_between_operations_ms integer NOT NULL DEFAULT 0 CHECK (delay_between_operations_ms >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX merchants_active_idx ON public.merchants (is_active) WHERE is_active = true;

COMMENT ON TABLE public.merchants IS 'Acquirer credentials and per-merchant delays; protect with RLS + service role only.';

-- ---------------------------------------------------------------------------
-- 2. linked_cards — card-on-file / zero-auth verification results
-- ---------------------------------------------------------------------------
CREATE TABLE public.linked_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  gateway text NOT NULL CHECK (gateway IN ('stripe', 'square')),
  gateway_customer_id text NOT NULL,
  gateway_payment_method_id text,
  auth_status text NOT NULL DEFAULT 'pending'
    CHECK (auth_status IN ('pending', 'verified', 'failed')),
  auth_amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  cvc_check text,
  decline_code text,
  gateway_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX linked_cards_merchant_id_idx ON public.linked_cards (merchant_id);
CREATE INDEX linked_cards_created_at_idx ON public.linked_cards (created_at DESC);

COMMENT ON TABLE public.linked_cards IS 'Saved customers/cards after SetupIntent or Square card attach; stores normalized diagnostics.';

-- ---------------------------------------------------------------------------
-- 3. payment_transactions — direct charges and gateway responses
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  gateway text NOT NULL CHECK (gateway IN ('stripe', 'square')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'requires_action')),
  gateway_payment_id text,
  decline_code text,
  cvc_check text,
  square_errors jsonb,
  gateway_raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_transactions_merchant_id_idx ON public.payment_transactions (merchant_id);
CREATE INDEX payment_transactions_created_at_idx ON public.payment_transactions (created_at DESC);
CREATE INDEX payment_transactions_status_idx ON public.payment_transactions (status);

COMMENT ON TABLE public.payment_transactions IS 'One row per charge attempt; amounts in smallest currency unit.';

-- ---------------------------------------------------------------------------
-- 4. bot_admin_users — Telegram identities allowed to use the admin bot
-- ---------------------------------------------------------------------------
CREATE TABLE public.bot_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL UNIQUE,
  telegram_username text,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bot_admin_users_active_idx ON public.bot_admin_users (telegram_user_id) WHERE is_active = true;

COMMENT ON TABLE public.bot_admin_users IS 'Allowlisted Telegram user ids (private chat id) for /commands.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchants_set_updated_at
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER linked_cards_set_updated_at
  BEFORE UPDATE ON public.linked_cards
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — backend uses service_role only; block public API by default
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_admin_users ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: only service_role (bypasses RLS) should access from Node.

-- Favorite games catalog for the survey + funnel users.favorite_game_id
-- Run once against an existing database (Supabase SQL editor or psql).

CREATE TABLE IF NOT EXISTS public.favorite_games (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_games_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT favorite_games_name_unique UNIQUE (name)
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS favorite_game_id uuid REFERENCES public.favorite_games (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_favorite_game_id
  ON public.users (favorite_game_id)
  WHERE favorite_game_id IS NOT NULL;

ALTER TABLE public.favorite_games ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'favorite_games'
      AND policyname = 'deny_anon_all_favorite_games'
  ) THEN
    CREATE POLICY deny_anon_all_favorite_games
      ON public.favorite_games AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.favorite_games FROM PUBLIC;
REVOKE ALL ON TABLE public.favorite_games FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.favorite_games TO service_role;

INSERT INTO public.favorite_games (name, sort_order) VALUES
  ('Juwa', 10),
  ('Fire Kirin', 20),
  ('Orion Stars', 30),
  ('Game Vault', 40),
  ('Ultra Panda', 50),
  ('Milky Way', 60),
  ('Cash Frenzy', 70)
ON CONFLICT (name) DO NOTHING;

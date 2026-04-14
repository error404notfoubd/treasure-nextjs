-- Informational survey answer: display name only (no FK requirement for new submissions).
-- Existing rows with favorite_game_id can be backfilled for display.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS favorite_game text;

UPDATE public.users u
SET favorite_game = fg.name
FROM public.favorite_games fg
WHERE u.favorite_game_id IS NOT NULL
  AND u.favorite_game_id = fg.id
  AND (u.favorite_game IS NULL OR u.favorite_game = '');

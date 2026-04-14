-- Grant dashboard editors+ permission to manage the survey favorite_games catalog.

INSERT INTO public.role_permission_grants (permission_key, role) VALUES
  ('manage_games_list', 'editor'),
  ('manage_games_list', 'admin'),
  ('manage_games_list', 'owner')
ON CONFLICT DO NOTHING;

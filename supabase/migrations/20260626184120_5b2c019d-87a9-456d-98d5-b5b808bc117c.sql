INSERT INTO public.holding_members (holding_id, auth_user_id, role)
VALUES
  ('0a0655c6-b2b1-4607-a949-311cb8fb9f77','c17c8f10-098f-454d-a353-79141524ddc5','holding_viewer'),
  ('0a0655c6-b2b1-4607-a949-311cb8fb9f77','42977669-2143-4924-a527-0016a7bc59bb','holding_viewer'),
  ('0a0655c6-b2b1-4607-a949-311cb8fb9f77','5c1a8560-91ec-4687-99df-933c845f41a6','holding_viewer')
ON CONFLICT (holding_id, auth_user_id) DO NOTHING;
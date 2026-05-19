INSERT INTO public.product_modifier_groups (product_id, group_id, sort_order)
SELECT v.pid::uuid, v.gid::uuid, 1 FROM (VALUES
  ('44cd1b06-c207-479b-b44a-55553ed277af','e9763cf9-8f30-4b95-a365-52dfd78a3f93'),
  ('beb09610-9f95-4184-bb28-9ede6f5c84e2','e9763cf9-8f30-4b95-a365-52dfd78a3f93'),
  ('c2183188-5bfc-4e27-883e-d39374a744ea','0e996c04-c4a5-43ff-83ef-31cab8516045')
) AS v(pid,gid)
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_modifier_groups pmg
  WHERE pmg.product_id=v.pid::uuid AND pmg.group_id=v.gid::uuid
);
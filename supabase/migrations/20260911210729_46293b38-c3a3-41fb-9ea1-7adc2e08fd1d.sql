DO $mig$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_receipt_command_v1';

  v_src := replace(v_src,
    'v_has_alloc := (jsonb_typeof(v_payload->''allocations'') = ''array''
                  AND jsonb_array_length(v_payload->''allocations'') > 0);',
    'v_has_alloc := COALESCE(jsonb_typeof(v_payload->''allocations'') = ''array''
                  AND jsonb_array_length(v_payload->''allocations'') > 0, false);');

  v_src := replace(v_src,
    'v_use_engine := (NOT v_has_alloc)
                  AND public.is_command_flag_enabled_v1(v_owner, ''posting.receipt_v1'');',
    'v_use_engine := COALESCE((NOT v_has_alloc)
                  AND public.is_command_flag_enabled_v1(v_owner, ''posting.receipt_v1''), false);');

  v_src := replace(v_src,
    '''allocations'', COALESCE(v_rpc->''allocations'', ''null''::jsonb),',
    '''allocations'', COALESCE(v_rpc->''allocations'', ''null''::jsonb),
    ''shadow'', COALESCE(v_shadow, ''null''::jsonb),');

  IF position('COALESCE(jsonb_typeof' in v_src) = 0 THEN
    RAISE EXCEPTION 'patch anchor not found';
  END IF;

  EXECUTE v_src;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.create_receipt_command_v1(jsonb) FROM anon;

-- remove temporary diagnostic probes
DROP FUNCTION IF EXISTS public.s3a_probe_shadow(uuid,uuid,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.s3a_probe2(uuid,uuid,jsonb,jsonb,uuid,uuid,uuid);
REVOKE ALL ON public.crm_contacts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_contacts FROM authenticated;
GRANT SELECT ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
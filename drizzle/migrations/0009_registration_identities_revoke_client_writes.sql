REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.registration_identities FROM authenticated;
REVOKE ALL ON public.registration_identities FROM anon;
-- has_role: harden search path (body already fully qualified)
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = '';

-- PayPal plan mapping: Super Admin-only reads (service role bypasses RLS)
DROP POLICY IF EXISTS "Authenticated read plan mapping" ON public.paypal_plans;
CREATE POLICY "Super admins read plan mapping" ON public.paypal_plans
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Contact messages: validated public insert
DROP POLICY IF EXISTS "Anyone can send a contact message" ON public.contact_messages;
CREATE POLICY "Anyone can send a valid contact message" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    name = pg_catalog.btrim(name)
    AND pg_catalog.char_length(name) BETWEEN 1 AND 100
    AND name !~ '[[:cntrl:]]'
    AND email = pg_catalog.lower(pg_catalog.btrim(email))
    AND pg_catalog.char_length(email) BETWEEN 3 AND 255
    AND email ~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+\.[^[:space:][:cntrl:]@]+$'
    AND (subject IS NULL OR (
      subject = pg_catalog.btrim(subject)
      AND pg_catalog.char_length(subject) BETWEEN 1 AND 150
      AND subject !~ '[[:cntrl:]]'))
    AND message = pg_catalog.btrim(message)
    AND pg_catalog.char_length(message) BETWEEN 1 AND 2000
    AND message !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  );
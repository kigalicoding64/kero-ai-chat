CREATE TABLE public.kero_provider_settings (
 id text PRIMARY KEY CHECK (id = 'global'),
 active_provider text NOT NULL DEFAULT 'nvidia' CHECK (active_provider IN ('nvidia', 'gemini')),
 nvidia_key_encrypted text,
 gemini_key_encrypted text,
 gemini_model text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT ALL ON public.kero_provider_settings TO service_role;
REVOKE ALL ON public.kero_provider_settings FROM anon, authenticated;
ALTER TABLE public.kero_provider_settings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.kero_provider_settings IS 'Server-only encrypted provider credentials and global choice. No browser access; server functions verify admin role before changes.';
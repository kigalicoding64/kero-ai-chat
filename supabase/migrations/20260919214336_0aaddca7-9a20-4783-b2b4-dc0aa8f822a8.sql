CREATE TABLE public.whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL UNIQUE,
  label text,
  verification_code text,
  code_expires_at timestamptz,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  auto_reply boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_numbers TO authenticated;
GRANT ALL ON public.whatsapp_numbers TO service_role;
ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own whatsapp numbers" ON public.whatsapp_numbers
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_whatsapp_numbers_updated_at BEFORE UPDATE ON public.whatsapp_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_name text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (number_id, contact_phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own whatsapp conversations" ON public.whatsapp_conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  wa_message_id text UNIQUE,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received',
  error text,
  provider_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_conversation_idx ON public.whatsapp_messages (conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own whatsapp messages" ON public.whatsapp_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
-- Migration : appareils enregistrés pour les notifications push (Firebase Cloud
-- Messaging), déclenchables depuis le dashboard admin. Un appareil est identifié
-- par device_id (UUID généré et persisté côté client, pas par utilisateur) car
-- l'app fonctionne aussi pour des visiteurs non connectés (tore.html, app-home.html
-- sont utilisables sans compte) — user_id est renseigné quand une session membre
-- existe au moment de l'enregistrement, mais n'est jamais requis.

CREATE TABLE IF NOT EXISTS push_devices (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id     TEXT NOT NULL UNIQUE,
    fcm_token     TEXT NOT NULL,
    platform      TEXT,
    user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);

ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_devices_service_role" ON push_devices;
CREATE POLICY "push_devices_service_role" ON push_devices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE push_devices IS
    'Un appareil (mobile app Capacitor) par ligne, avec son token FCM courant. '
    'Écrit/lu uniquement via /api/admin (action=register-device côté client, '
    'action=send-notification côté dashboard) — jamais d''accès direct client, '
    'donc aucune policy anon/authenticated.';

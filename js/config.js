/**
 * SafeBand – Konfiguration
 *
 * Der Publishable Key ist öffentlich und darf im Browser stehen. Er allein gibt
 * keinen Zugriff auf Daten: RLS und die SECURITY-DEFINER-Funktionen in der
 * Datenbank entscheiden, was tatsächlich herausgegeben wird.
 *
 * Zu finden unter Project Settings → API Keys → Publishable key.
 * Der Secret Key (sb_secret_…) gehört NIEMALS hierher – er umgeht RLS.
 */

const SUPABASE_URL = "https://tqwzrmbcoomkpygozrai.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable__mgJCDbNYaXNwKt6EvneJA_p4jFH8XC";

/**
 * Version der Datenschutzerklärung. Wird bei jeder Einwilligung mitgespeichert,
 * damit später nachweisbar ist, welchem Text der Kunde zugestimmt hat.
 * Bei inhaltlichen Änderungen an datenschutz.html hochzählen.
 */
const PRIVACY_POLICY_VERSION = "2026-08-06";

/**
 * Domain für die Kurz-URL auf dem NFC-Chip.
 *
 * Leer lassen, solange es keine feste Produktionsdomain gibt: die Basis wird
 * dann aus der gerade geöffneten Adresse abgeleitet und stimmt damit lokal
 * ebenso wie auf jeder Vercel-Adresse.
 *
 * Auf "https://safeband.ch" setzen, sobald die Domain live ist und auf das
 * Deployment zeigt. Erst ab diesem Moment dürfen Chips beschrieben werden:
 * sie werden schreibgeschützt, ihre URL lässt sich danach nicht mehr ändern.
 */
const BAND_URL_ORIGIN = "";

/** Basis der Kurz-URL, die auf den NFC-Chip geschrieben wird. */
const BAND_URL_BASE = `${BAND_URL_ORIGIN || window.location.origin}/n`;

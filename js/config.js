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
const PRIVACY_POLICY_VERSION = "2026-08-06.2";

/**
 * Domain für die Kurz-URL auf dem NFC-Chip.
 *
 * Fest verdrahtet, weil beschriebene Chips gesperrt werden und ihre Adresse
 * sich danach nicht mehr ändern lässt. Ohne diesen Wert würde die Basis aus
 * der gerade geöffneten Seite abgeleitet – wer das Panel einmal über eine
 * Vorschau-Adresse öffnet, brennt eine tote URL dauerhaft auf die Bänder.
 *
 * "www" ist Absicht: safeband.ch leitet dorthin um, und ein Umweg weniger
 * heisst im Notfall eine Fehlerquelle weniger.
 */
const BAND_URL_ORIGIN = "https://www.safeband.ch";

/** Basis der Kurz-URL, die auf den NFC-Chip geschrieben wird. */
const BAND_URL_BASE = `${BAND_URL_ORIGIN || window.location.origin}/n`;

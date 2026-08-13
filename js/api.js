/**
 * SafeBand – Zugriff auf die Datenbank
 *
 * Alle Aufrufe gehen über RPC-Funktionen. Es gibt bewusst keine direkten
 * Tabellenzugriffe aus dem Browser, damit Kontaktdaten die Datenbank nicht
 * versehentlich verlassen können.
 */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const CATEGORY_LABELS = {
  kind: "Kind",
  senior: "Senior / ältere Person",
  pflege: "Pflege / Betreuung",
};

function bandUrl(code) {
  return `${BAND_URL_BASE}/${code.toUpperCase()}`;
}

function manageUrl(token) {
  return `${window.location.origin}/verwalten.html?t=${token}`;
}

/** Wirft die Fehlermeldung der Datenbank weiter, damit sie im UI landet. */
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// --- Öffentlich -------------------------------------------------------------

async function fetchPublicProfile(code) {
  const rows = unwrap(await sb.rpc("get_public_profile", { p_code: code }));
  return rows && rows.length ? rows[0] : null;
}

async function createOrder(payload) {
  return unwrap(await sb.rpc("create_order", { payload }));
}

async function createProfile(payload) {
  return unwrap(
    await sb.rpc("create_profile", {
      payload: { ...payload, policy_version: PRIVACY_POLICY_VERSION },
    })
  );
}

async function sendHelperMessage(code, { helperName, location, message }) {
  return unwrap(
    await sb.rpc("submit_helper_message", {
      p_code: code,
      p_helper_name: helperName || null,
      p_location: location,
      p_message: message,
    })
  );
}

// --- Selbstverwaltung per Token ---------------------------------------------

async function fetchProfileByToken(token) {
  return unwrap(await sb.rpc("get_profile_by_token", { p_token: token }));
}

async function updateProfileByToken(token, payload) {
  return unwrap(await sb.rpc("update_profile_by_token", { p_token: token, payload }));
}

async function setProfileActiveByToken(token, active) {
  return unwrap(
    await sb.rpc("set_profile_active_by_token", { p_token: token, p_active: active })
  );
}

// --- Admin ------------------------------------------------------------------

async function adminSignIn(email, password) {
  return unwrap(await sb.auth.signInWithPassword({ email, password }));
}

async function adminSignOut() {
  await sb.auth.signOut();
}

async function adminSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function isAdmin() {
  try {
    return unwrap(await sb.rpc("is_admin")) === true;
  } catch {
    return false;
  }
}

async function generateBands(count, batch) {
  return unwrap(await sb.rpc("generate_bands", { p_count: count, p_batch: batch || null }));
}

async function fetchPendingProfiles() {
  return unwrap(await sb.rpc("pending_profiles"));
}

async function assignBand(code, profileId) {
  return unwrap(await sb.rpc("assign_band", { p_code: code, p_profile_id: profileId }));
}

async function setBandStatus(code, status) {
  return unwrap(await sb.rpc("set_band_status", { p_code: code, p_status: status }));
}

async function deleteBand(code) {
  return unwrap(await sb.rpc("delete_band", { p_code: code }));
}

async function fetchBandStats() {
  return unwrap(await sb.rpc("band_stats"));
}

async function fetchBands({ status, search } = {}) {
  return unwrap(
    await sb.rpc("list_bands", {
      p_status: status || null,
      p_search: search || null,
      p_limit: 200,
    })
  );
}

async function fetchOrders({ search } = {}) {
  return unwrap(await sb.rpc("list_orders", { p_search: search || null, p_limit: 200 }));
}

/**
 * SafeBand – Selbstverwaltung über den Token aus der Bestätigungs-E-Mail
 *
 * Der Token ersetzt hier ein Benutzerkonto. Deshalb steht die Seite auf
 * noindex/no-referrer, damit er nicht über Suchmaschinen oder den Referer
 * nach aussen gelangt.
 */

const manageToken = new URLSearchParams(window.location.search).get("t");

const loadingEl = document.getElementById("loading");
const invalidEl = document.getElementById("invalid");
const invalidDetail = document.getElementById("invalid-detail");
const appEl = document.getElementById("manage-app");
const form = document.getElementById("manage-form");
const submitBtn = document.getElementById("manage-submit");
const toggleBtn = document.getElementById("toggle-active");

let isActive = true;

if (manageToken) {
  load();
} else {
  showInvalid();
}

async function load() {
  let profile;
  try {
    profile = await fetchProfileByToken(manageToken);
  } catch (err) {
    // Ein abgebrochener Request ist kein ungültiger Link – sonst löschen Leute
    // ihre E-Mail, weil sie den Link für kaputt halten.
    if (isNetworkError(err)) {
      showInvalid(
        "Wir konnten den Server gerade nicht erreichen. Bitte prüfe deine Verbindung und lade die Seite neu.",
        "Keine Verbindung"
      );
    } else {
      showInvalid(err.message);
    }
    return;
  }

  fill("first-name", profile.first_name);
  fill("last-name", profile.last_name);
  fill("category", profile.category);
  fill("public-note", profile.public_note);
  fill("medical-note", profile.medical_note);
  fill("contact-name", profile.contact_name);
  fill("contact-phone", profile.contact_phone);
  fill("contact-email", profile.contact_email);
  document.getElementById("contact-call-public").checked = Boolean(profile.contact_call_public);

  document.getElementById("band-code").textContent =
    profile.band_code || "wird beim Versand verknüpft";

  isActive = profile.active;
  renderStatus();

  loadingEl.classList.add("hidden");
  appEl.classList.remove("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide("manage-error");
  hide("manage-success");

  submitBtn.disabled = true;
  submitBtn.textContent = "Wird gespeichert …";

  try {
    await updateProfileByToken(manageToken, {
      first_name: value("first-name"),
      last_name: value("last-name"),
      category: value("category"),
      public_note: value("public-note"),
      medical_note: value("medical-note"),
      contact_name: value("contact-name"),
      contact_phone: value("contact-phone"),
      contact_email: value("contact-email"),
      contact_call_public: document.getElementById("contact-call-public").checked,
    });
    show("manage-success", "Änderungen gespeichert.");
  } catch (err) {
    show("manage-error", err.message || "Speichern fehlgeschlagen.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Änderungen speichern";
  }
});

toggleBtn.addEventListener("click", async () => {
  const confirmed = isActive
    ? confirm("Armband wirklich sperren? Helfer sehen dann keine Daten mehr.")
    : true;
  if (!confirmed) return;

  toggleBtn.disabled = true;
  try {
    await setProfileActiveByToken(manageToken, !isActive);
    isActive = !isActive;
    renderStatus();
  } catch (err) {
    show("manage-error", err.message || "Änderung fehlgeschlagen.");
  } finally {
    toggleBtn.disabled = false;
  }
});

function renderStatus() {
  const badge = document.getElementById("band-active");
  badge.textContent = isActive ? "Aktiv" : "Gesperrt";
  badge.className = isActive ? "badge badge-ok" : "badge badge-off";
  toggleBtn.textContent = isActive ? "Armband sperren" : "Armband wieder freigeben";
}

function fill(id, val) {
  document.getElementById(id).value = val || "";
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function show(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove("hidden");
}

function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

function showInvalid(detail, title) {
  loadingEl.classList.add("hidden");
  if (title) document.getElementById("invalid-title").textContent = title;
  if (detail) invalidDetail.textContent = detail;
  invalidEl.classList.remove("hidden");
}

function isNetworkError(err) {
  return /failed to fetch|networkerror|load failed/i.test(err.message || "");
}

/**
 * SafeBand – Notfallseite
 *
 * Wird über /n/CODE aufgerufen (siehe Rewrite in netlify.toml / vercel.json)
 * und lädt nur die öffentlich freigegebenen Felder. Kontaktdaten werden
 * absichtlich nicht ausgeliefert – die Benachrichtigung läuft serverseitig.
 */

const bandCode = new URLSearchParams(window.location.search).get("id");

const loadingEl = document.getElementById("loading");
const notFoundEl = document.getElementById("not-found");
const notFoundDetail = document.getElementById("not-found-detail");
const profileSection = document.getElementById("profile-section");
const contactForm = document.getElementById("contact-form");
const contactSubmit = document.getElementById("contact-submit");
const contactError = document.getElementById("contact-error");
const successEl = document.getElementById("contact-success");

if (bandCode) {
  loadProfile(bandCode);
} else {
  showNotFound();
}

async function loadProfile(code) {
  let profile;
  try {
    profile = await fetchPublicProfile(code);
  } catch (err) {
    // Wer hier landet, steht womöglich vor einem Notfall – hier hilft keine
    // technische Fehlermeldung, sondern der Hinweis auf die Notrufnummer.
    showNotFound(
      /failed to fetch|networkerror|load failed/i.test(err.message || "")
        ? "Die Daten konnten nicht geladen werden. Bitte prüfen Sie die Internetverbindung und laden Sie die Seite neu."
        : err.message
    );
    return;
  }

  if (!profile) {
    showNotFound();
    return;
  }

  loadingEl.classList.add("hidden");
  profileSection.classList.remove("hidden");

  document.getElementById("info-name").textContent = profile.first_name;
  document.getElementById("info-category").textContent =
    CATEGORY_LABELS[profile.category] || profile.category;
  document.getElementById("info-note").textContent =
    profile.public_note || "Kein zusätzlicher Hinweis.";

  const medicalRow = document.getElementById("info-medical-row");
  if (profile.medical_note) {
    document.getElementById("info-medical").textContent = profile.medical_note;
    medicalRow.classList.remove("hidden");
  } else {
    medicalRow.classList.add("hidden");
  }

  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    notifyContacts(code);
  });
}

async function notifyContacts(code) {
  contactError.classList.add("hidden");
  contactSubmit.disabled = true;
  contactSubmit.textContent = "Wird gesendet …";

  try {
    await sendHelperMessage(code, {
      helperName: document.getElementById("helper-name").value.trim(),
      location: document.getElementById("helper-location").value.trim(),
      message: document.getElementById("helper-message").value.trim(),
    });
    contactForm.classList.add("hidden");
    successEl.classList.remove("hidden");
  } catch (err) {
    contactError.textContent = err.message || "Senden fehlgeschlagen. Bitte erneut versuchen.";
    contactError.classList.remove("hidden");
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.textContent = "Notfallkontakt benachrichtigen";
  }
}

function showNotFound(detail) {
  loadingEl.classList.add("hidden");
  if (detail) notFoundDetail.textContent = detail;
  notFoundEl.classList.remove("hidden");
}

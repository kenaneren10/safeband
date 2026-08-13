/**
 * SafeBand – Notfallseite
 *
 * Wird über /n/CODE aufgerufen (siehe Rewrite in netlify.toml / vercel.json).
 * Ausgeliefert wird nur, was der Kunde freigegeben hat: Name und Nummer des
 * Notfallkontakts kommen ausschliesslich mit ausdrücklicher Freigabe mit,
 * sonst gibt die Datenbank beide Felder gar nicht erst heraus.
 */

/**
 * Der Code steckt je nach Aufrufweg an unterschiedlicher Stelle: Netlify und
 * Vercel schreiben /n/CODE serverseitig auf /notfall.html?id=CODE um, dabei
 * bleibt die im Browser sichtbare Adresse aber /n/CODE – ohne Query-String.
 * window.location.search ist in dem Fall leer, deshalb zusätzlich aus dem
 * Pfad lesen, falls kein "id"-Parameter da ist.
 */
function getBandCode() {
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  if (fromQuery) return fromQuery;

  const match = window.location.pathname.match(/\/n\/([A-Za-z0-9]{8})\/?$/);
  return match ? match[1] : null;
}

const bandCode = getBandCode();

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

  showIfPresent("note-card", "info-note", profile.public_note);
  showIfPresent("medical-card", "info-medical", profile.medical_note);
  showContactCall(profile);

  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    notifyContacts(code);
  });
}

/** Blendet eine Karte nur ein, wenn dazu überhaupt etwas hinterlegt ist. */
function showIfPresent(cardId, textId, value) {
  if (!value) return;
  document.getElementById(textId).textContent = value;
  document.getElementById(cardId).classList.remove("hidden");
}

function showContactCall(profile) {
  const intro = document.getElementById("contact-intro");

  if (!profile.contact_phone) {
    intro.textContent =
      "Die Telefonnummer der Angehörigen ist nicht öffentlich hinterlegt. " +
      "Über dieses Formular erreichen Sie die Notfallkontakte trotzdem.";
    return;
  }

  const button = document.getElementById("call-contact");
  button.href = `tel:${profile.contact_phone.replace(/[^\d+]/g, "")}`;
  button.classList.remove("hidden");

  document.getElementById("call-contact-number").textContent = profile.contact_phone;
  if (profile.contact_name) {
    document.getElementById("call-contact-label").textContent = `${profile.contact_name} anrufen`;
  }

  intro.textContent =
    "Falls niemand ans Telefon geht, hinterlassen Sie hier eine Nachricht.";
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
    contactSubmit.textContent = "Nachricht senden";
  }
}

function showNotFound(detail) {
  loadingEl.classList.add("hidden");
  if (detail) notFoundDetail.textContent = detail;
  notFoundEl.classList.remove("hidden");
}

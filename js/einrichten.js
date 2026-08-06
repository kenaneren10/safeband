/**
 * SafeBand – Bestellformular nach dem Kauf
 *
 * Legt das Notfallprofil an. Das physische Band wird erst beim Verpacken
 * zugeordnet, deshalb gibt es hier keine Armband-ID einzugeben.
 */

const setupForm = document.getElementById("setup-form");
const setupResult = document.getElementById("setup-result");
const setupError = document.getElementById("setup-error");
const setupSubmit = document.getElementById("setup-submit");
const manageUrlEl = document.getElementById("result-manage-url");
const manageLinkEl = document.getElementById("result-manage-link");
const copyBtn = document.getElementById("copy-url-btn");

if (setupForm) {
  prefillOrderRef();

  setupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const payload = {
      order_ref: value("order-ref"),
      first_name: value("first-name"),
      category: value("category"),
      public_note: value("public-note"),
      medical_note: value("medical-note"),
      contact_name: value("contact-name"),
      contact_phone: value("contact-phone"),
      contact_email: value("contact-email"),
      consent_privacy: document.getElementById("consent-privacy").checked,
      consent_health: document.getElementById("consent-health").checked,
      consent_call: document.getElementById("consent-call").checked,
    };

    if (payload.medical_note && !payload.consent_health) {
      showError(
        "Für den medizinischen Hinweis brauchen wir deine ausdrückliche Einwilligung. " +
          "Bitte setze das Häkchen oder lösche das Feld."
      );
      return;
    }

    setLoading(true);
    try {
      const result = await createProfile(payload);
      showResult(result.manage_token);
    } catch (err) {
      showError(err.message || "Speichern fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(manageUrlEl.textContent).then(() => {
      copyBtn.textContent = "Kopiert!";
      setTimeout(() => {
        copyBtn.textContent = "Kopieren";
      }, 2000);
    });
  });
}

/**
 * Der Shop hängt die Bestellnummer nach der Zahlung an die Weiterleitung an.
 * Fehlt sie, ist die Seite vermutlich direkt aufgerufen worden – dann erklären
 * wir kurz, wohin sie gehört, statt das Formular zu sperren.
 */
function prefillOrderRef() {
  const ref = new URLSearchParams(window.location.search).get("bestellung");
  if (ref) {
    document.getElementById("order-ref").value = ref;
    return;
  }
  document.getElementById("order-notice").classList.remove("hidden");
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setLoading(loading) {
  setupSubmit.disabled = loading;
  setupSubmit.textContent = loading ? "Wird übermittelt …" : "Daten übermitteln";
}

function showError(message) {
  setupError.textContent = message;
  setupError.classList.remove("hidden");
  setupError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
  setupError.classList.add("hidden");
}

function showResult(manageToken) {
  const url = manageUrl(manageToken);
  manageUrlEl.textContent = url;
  manageLinkEl.href = url;

  setupForm.classList.add("hidden");
  setupResult.classList.remove("hidden");
  setupResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

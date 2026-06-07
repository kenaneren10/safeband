/**
 * SafeBand – Notfallseite
 */

const params = new URLSearchParams(window.location.search);
const bandId = params.get("id");

const loadingEl = document.getElementById("loading");
const notFoundEl = document.getElementById("not-found");
const profileSection = document.getElementById("profile-section");
const contactForm = document.getElementById("contact-form");
const successEl = document.getElementById("contact-success");
const successDetail = document.getElementById("contact-success-detail");

if (bandId) {
  loadProfile(bandId);
} else {
  showNotFound();
}

function loadProfile(id) {
  const profile = getProfile(id);

  if (!profile) {
    showNotFound();
    return;
  }

  loadingEl.classList.add("hidden");
  profileSection.classList.remove("hidden");

  document.getElementById("info-name").textContent = profile.firstName;
  document.getElementById("info-category").textContent =
    CATEGORY_LABELS[profile.category] || profile.category;
  document.getElementById("info-note").textContent =
    profile.publicNote || "Kein zusätzlicher Hinweis.";

  const medicalRow = document.getElementById("info-medical-row");
  if (profile.medicalNote) {
    document.getElementById("info-medical").textContent = profile.medicalNote;
    medicalRow.classList.remove("hidden");
  } else {
    medicalRow.classList.add("hidden");
  }

  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendContact(profile);
  });
}

function sendContact(profile) {
  const helperName = document.getElementById("helper-name").value.trim();
  const location = document.getElementById("helper-location").value.trim();
  const message = document.getElementById("helper-message").value.trim();

  saveMessage(profile.id, {
    helperName: helperName || "Anonym",
    location,
    message,
    notifiedContact: profile.contactName,
  });

  contactForm.classList.add("hidden");
  successEl.classList.remove("hidden");
  successDetail.textContent = ` (${profile.contactName} wurde benachrichtigt)`;
}

function showNotFound() {
  loadingEl.classList.add("hidden");
  notFoundEl.classList.remove("hidden");
}

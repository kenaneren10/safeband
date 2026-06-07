/**
 * SafeBand – Armband einrichten
 */

const setupForm = document.getElementById("setup-form");
const setupResult = document.getElementById("setup-result");
const resultUrl = document.getElementById("result-url");
const resultLink = document.getElementById("result-link");
const copyBtn = document.getElementById("copy-url-btn");
const qrContainer = document.getElementById("qr-code");

if (setupForm) {
  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const profile = {
      id: document.getElementById("band-id").value.trim(),
      firstName: document.getElementById("first-name").value.trim(),
      category: document.getElementById("category").value,
      publicNote: document.getElementById("public-note").value.trim(),
      medicalNote: document.getElementById("medical-note").value.trim(),
      contactName: document.getElementById("contact-name").value.trim(),
      contactPhone: document.getElementById("contact-phone").value.trim(),
      contactEmail: document.getElementById("contact-email").value.trim(),
      createdAt: new Date().toISOString().split("T")[0],
    };

    if (getProfile(profile.id) && profile.id.toUpperCase() !== "DEMO01") {
      const overwrite = confirm(
        `Ein Profil mit der ID "${profile.id.toUpperCase()}" existiert bereits. Überschreiben?`
      );
      if (!overwrite) return;
    }

    saveProfile(profile);
    showResult(profile.id);
  });

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(resultUrl.textContent).then(() => {
      copyBtn.textContent = "Kopiert!";
      setTimeout(() => {
        copyBtn.textContent = "Kopieren";
      }, 2000);
    });
  });
}

function showResult(bandId) {
  const url = getNotfallUrl(bandId);
  resultUrl.textContent = url;
  resultLink.href = url;
  setupResult.classList.remove("hidden");
  setupResult.scrollIntoView({ behavior: "smooth", block: "start" });
  renderQrCode(url);
}

function renderQrCode(url) {
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  qrContainer.innerHTML = `<img src="${qrApiUrl}" alt="QR-Code für ${url}" width="200" height="200">`;
}

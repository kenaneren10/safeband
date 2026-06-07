/**
 * SafeBand – Navigation, Kontaktformular, Smooth Scroll
 */

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initContactForm();
  initSmoothScroll();
});

function initMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (!toggle || !navLinks) return;

  toggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initContactForm() {
  const form = document.getElementById("contact-form");
  const success = document.getElementById("contact-success");

  if (!form || !success) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const entry = {
      name: document.getElementById("contact-name").value.trim(),
      email: document.getElementById("contact-email").value.trim(),
      message: document.getElementById("contact-message").value.trim(),
      date: new Date().toISOString(),
    };

    const stored = JSON.parse(localStorage.getItem("safeband-contact") || "[]");
    stored.push(entry);
    localStorage.setItem("safeband-contact", JSON.stringify(stored));

    form.reset();
    success.classList.remove("hidden");
    success.textContent = "Danke! Ihre Nachricht wurde im Prototyp lokal gespeichert.";
    success.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (!targetId || targetId === "#") return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      const headerOffset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

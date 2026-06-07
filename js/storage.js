/**
 * SafeBand – Datenspeicher (Prototyp mit localStorage)
 */

const STORAGE_KEY = "safeband-profiles";
const MESSAGES_KEY = "safeband-messages";

const CATEGORY_LABELS = {
  kind: "Kind",
  senior: "Senior / ältere Person",
  pflege: "Pflege / Betreuung",
};

const DEMO_PROFILES = [
  {
    id: "DEMO01",
    firstName: "Luca",
    category: "kind",
    publicNote: "Spricht Deutsch und Albanisch. Bitte ruhig ansprechen.",
    medicalNote: "Keine bekannten Allergien.",
    contactName: "Anna Müller (Mutter)",
    contactPhone: "+41 79 123 45 67",
    contactEmail: "anna.mueller@beispiel.ch",
    createdAt: "2026-05-01",
  },
  {
    id: "DEMO02",
    firstName: "Helene",
    category: "senior",
    publicNote: "Spricht Deutsch. Bitte geduldig und deutlich ansprechen.",
    medicalNote: "Diabetes – bei Unwohlsein sofort Angehörige informieren.",
    contactName: "Sonnenhof Pflegeheim",
    contactPhone: "+41 44 123 45 67",
    contactEmail: "notfall@sonnenhof.ch",
    createdAt: "2026-05-01",
  },
];

function initDemoProfile() {
  const profiles = getAllProfiles();
  let changed = false;
  DEMO_PROFILES.forEach((demo) => {
    if (!profiles[demo.id]) {
      profiles[demo.id] = { ...demo };
      changed = true;
    }
  });
  if (changed) saveAllProfiles(profiles);
}

function getAllProfiles() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveAllProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function getProfile(bandId) {
  const profiles = getAllProfiles();
  return profiles[bandId.toUpperCase()] || null;
}

function saveProfile(profile) {
  const profiles = getAllProfiles();
  profile.id = profile.id.toUpperCase();
  profiles[profile.id] = profile;
  saveAllProfiles(profiles);
  return profile;
}

function saveMessage(bandId, message) {
  const messages = getMessages();
  messages.push({
    id: Date.now().toString(),
    bandId: bandId.toUpperCase(),
    ...message,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

function getMessages() {
  try {
    const data = localStorage.getItem(MESSAGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function getNotfallUrl(bandId) {
  const base = window.location.href.replace(/[^/]*$/, "");
  return `${base}notfall.html?id=${encodeURIComponent(bandId.toUpperCase())}`;
}

initDemoProfile();

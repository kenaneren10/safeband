/**
 * SafeBand – interne Verwaltung
 *
 * Alles dreht sich um die Bänder-Übersicht: Codes produzieren (+-Button),
 * Bänder direkt in der Zeile einer offenen Bestellung zuteilen, sperren,
 * freigeben oder löschen.
 *
 * Beschrieben werden die Chips am iPhone mit „NFC Tools“, deshalb ist die
 * Tabelle auf Kopieren ausgelegt. Web NFC (Chrome auf Android) kann dasselbe
 * direkt im Browser und wird zusätzlich angeboten, wo es der Browser hergibt.
 */

const NFC_AVAILABLE = "NDEFReader" in window;

let lastBatch = [];
let pendingProfiles = [];

const STATUS_LABELS = {
  unassigned: "Auf Lager",
  assigned: "Im Einsatz",
  disabled: "Gesperrt",
};

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initProducePanel();
  initOverview();
  initOrders();
  initGenerate();
  restoreSession();
});

// --- Anmeldung --------------------------------------------------------------

function initLogin() {
  const form = document.getElementById("login-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide("login-error");
    try {
      await adminSignIn(
        document.getElementById("login-email").value.trim(),
        document.getElementById("login-password").value
      );
      await enterApp();
    } catch (err) {
      showMessage("login-error", err.message || "Anmeldung fehlgeschlagen.");
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await adminSignOut();
    window.location.reload();
  });
}

async function restoreSession() {
  if (await adminSession()) await enterApp();
}

async function enterApp() {
  if (!(await isAdmin())) {
    await adminSignOut();
    showMessage("login-error", "Dieses Konto hat keine Verwaltungsrechte.");
    return;
  }

  const session = await adminSession();
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("admin-app").classList.remove("hidden");
  document.getElementById("logout-btn").classList.remove("hidden");

  const userEl = document.getElementById("admin-user");
  userEl.textContent = session.user.email;
  userEl.classList.remove("hidden");

  await loadPendingProfiles();
  await Promise.all([loadStats(), loadOverview(), loadOrders()]);
  showNfcSupport();
}

function initProducePanel() {
  document.getElementById("produce-toggle").addEventListener("click", () => {
    document.getElementById("produce-panel").classList.toggle("hidden");
  });
}

async function loadStats() {
  const stats = (await fetchBandStats()) || {};

  document.getElementById("stats").innerHTML = Object.keys(STATUS_LABELS)
    .map(
      (key) => `
        <div class="stat-card">
          <span class="stat-value">${stats[key] || 0}</span>
          <span class="stat-label">${STATUS_LABELS[key]}</span>
        </div>`
    )
    .join("");
}

// --- Übersicht --------------------------------------------------------------

function initOverview() {
  document.getElementById("overview-refresh").addEventListener("click", loadOverview);
  document.getElementById("overview-status").addEventListener("change", loadOverview);
  document.getElementById("overview-scan-btn").addEventListener("click", scanToSearch);

  // Tippen ohne Enter soll die Liste nicht bei jedem Zeichen neu laden.
  let timer;
  document.getElementById("overview-search").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadOverview, 300);
  });
}

async function loadOverview() {
  hide("overview-error");

  const table = document.getElementById("overview-table");
  const empty = document.getElementById("overview-empty");

  const rawSearch = document.getElementById("overview-search").value.trim();

  let bands;
  try {
    bands = await fetchBands({
      status: document.getElementById("overview-status").value,
      search: normalizeCode(rawSearch) || rawSearch,
    });
  } catch (err) {
    showMessage("overview-error", err.message || "Übersicht konnte nicht geladen werden.");
    return;
  }

  table.classList.toggle("hidden", bands.length === 0);
  empty.classList.toggle("hidden", bands.length > 0);

  document.getElementById("overview-rows").innerHTML = bands.map(overviewRow).join("");

  document.querySelectorAll("#overview-rows .copy-btn").forEach((btn) => {
    const row = btn.closest("tr");
    btn.addEventListener("click", () =>
      copyUrl(bandUrl(row.dataset.code), row.querySelector(".write-status"))
    );
  });

  document.querySelectorAll("#overview-rows .status-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleBandStatus(btn.closest("tr")));
  });

  document.querySelectorAll("#overview-rows .delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteBandRow(btn.closest("tr")));
  });

  document.querySelectorAll("#overview-rows .assign-btn").forEach((btn) => {
    btn.addEventListener("click", () => assignBandRow(btn.closest("tr")));
  });
}

function overviewRow(band) {
  const owner = band.first_name
    ? `${escapeHtml(band.first_name)}${
        band.order_ref ? ` <small>${escapeHtml(band.order_ref)}</small>` : ""
      }`
    : "<span class='muted'>–</span>";

  const since = band.assigned_at || band.created_at;
  const locked = band.status === "disabled";
  const deletable = band.status !== "assigned";

  return `
    <tr data-code="${band.code}" data-status="${band.status}" data-has-profile="${Boolean(band.first_name)}">
      <td><code>${band.code}</code></td>
      <td><span class="badge ${badgeClass(band.status)}">${STATUS_LABELS[band.status] || band.status}</span></td>
      <td>${owner}</td>
      <td class="date-cell">${new Date(since).toLocaleDateString("de-CH")}</td>
      <td class="action-cell">
        ${band.status === "unassigned" ? `<div class="action-row">${assignControlHtml()}</div>` : ""}
        <div class="action-row">
          <button type="button" class="btn btn-secondary btn-sm copy-btn">URL kopieren</button>
          <button type="button" class="btn btn-secondary btn-sm status-btn">${locked ? "Freigeben" : "Sperren"}</button>
          ${deletable ? '<button type="button" class="btn btn-secondary btn-sm delete-btn">Löschen</button>' : ""}
          <span class="write-status"></span>
        </div>
      </td>
    </tr>`;
}

function assignControlHtml() {
  if (!pendingProfiles.length) {
    return "<span class='muted'>Keine offene Bestellung</span>";
  }

  const options = pendingProfiles
    .map((p) => {
      const label = `${p.order_ref || "ohne Nummer"} – ${p.first_name} (${CATEGORY_LABELS[p.category] || p.category})`;
      return `<option value="${p.id}">${escapeHtml(label)}</option>`;
    })
    .join("");

  return `
    <select class="assign-select">${options}</select>
    <button type="button" class="btn btn-primary btn-sm assign-btn">Zuteilen</button>`;
}

async function assignBandRow(row) {
  const code = row.dataset.code;
  const profileId = row.querySelector(".assign-select").value;
  const btn = row.querySelector(".assign-btn");

  btn.disabled = true;

  try {
    await assignBand(code, profileId);
    await loadPendingProfiles();
    await Promise.all([loadOverview(), loadStats()]);
  } catch (err) {
    showMessage("overview-error", err.message || "Zuteilen fehlgeschlagen.");
    btn.disabled = false;
  }
}

function badgeClass(status) {
  if (status === "assigned") return "badge-ok";
  if (status === "disabled") return "badge-off";
  return "badge-stock";
}

/**
 * Beim Freigeben zurück in den Zustand vor der Sperre: Bänder mit Profil
 * sind wieder im Einsatz, unbenutzte liegen wieder im Lager.
 */
async function toggleBandStatus(row) {
  const code = row.dataset.code;
  const locked = row.dataset.status === "disabled";
  const hasProfile = row.dataset.hasProfile === "true";

  if (!locked && !confirm(`Band ${code} sperren? Die Notfallseite zeigt danach keine Daten mehr.`)) {
    return;
  }

  const btn = row.querySelector(".status-btn");
  btn.disabled = true;

  try {
    await setBandStatus(code, locked ? (hasProfile ? "assigned" : "unassigned") : "disabled");
    await Promise.all([loadOverview(), loadStats()]);
  } catch (err) {
    showMessage("overview-error", err.message || "Änderung fehlgeschlagen.");
    btn.disabled = false;
  }
}

async function deleteBandRow(row) {
  const code = row.dataset.code;

  if (!confirm(`Band ${code} endgültig löschen? Das lässt sich nicht rückgängig machen.`)) {
    return;
  }

  const btn = row.querySelector(".delete-btn");
  btn.disabled = true;

  try {
    await deleteBand(code);
    await Promise.all([loadOverview(), loadStats()]);
  } catch (err) {
    showMessage("overview-error", err.message || "Löschen fehlgeschlagen.");
    btn.disabled = false;
  }
}

// --- Bestellungen ------------------------------------------------------------

function initOrders() {
  document.getElementById("orders-refresh").addEventListener("click", loadOrders);

  let timer;
  document.getElementById("orders-search").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadOrders, 300);
  });
}

async function loadOrders() {
  hide("orders-error");

  const table = document.getElementById("orders-table");
  const empty = document.getElementById("orders-empty");

  let orders;
  try {
    orders = await fetchOrders({ search: document.getElementById("orders-search").value.trim() });
  } catch (err) {
    showMessage("orders-error", err.message || "Bestellungen konnten nicht geladen werden.");
    return;
  }

  table.classList.toggle("hidden", orders.length === 0);
  empty.classList.toggle("hidden", orders.length > 0);

  document.getElementById("orders-rows").innerHTML = orders.map(orderRow).join("");
}

function orderRow(order) {
  return `
    <tr>
      <td><code>${escapeHtml(order.order_ref)}</code></td>
      <td>${escapeHtml(order.name)}</td>
      <td>${escapeHtml(order.street)}<br><small>${escapeHtml(order.zip)} ${escapeHtml(order.city)}</small></td>
      <td>${escapeHtml(order.email)}</td>
      <td class="date-cell">${new Date(order.created_at).toLocaleDateString("de-CH")}</td>
      <td><span class="badge ${order.has_profile ? "badge-ok" : "badge-stock"}">${
        order.has_profile ? "Hinterlegt" : "Ausstehend"
      }</span></td>
    </tr>`;
}

// --- Produktion (+-Panel in der Übersicht) -----------------------------------

function initGenerate() {
  document.getElementById("generate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hide("generate-error");

    const btn = document.getElementById("generate-btn");
    btn.disabled = true;
    btn.textContent = "Wird erzeugt …";

    try {
      lastBatch = await generateBands(
        Number(document.getElementById("gen-count").value),
        document.getElementById("gen-batch").value.trim()
      );
      renderBatch(lastBatch);
      await Promise.all([loadStats(), loadOverview()]);
    } catch (err) {
      showMessage("generate-error", err.message || "Erzeugen fehlgeschlagen.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Codes erzeugen";
    }
  });

  document.getElementById("download-csv").addEventListener("click", downloadCsv);
}

function renderBatch(codes) {
  document.getElementById("batch-rows").innerHTML = codes
    .map(
      (code) => `
        <tr data-code="${code}">
          <td><code>${code}</code></td>
          <td class="url-cell"><code>${bandUrl(code)}</code></td>
          <td class="action-cell">
            <div class="action-row">
              <button type="button" class="btn btn-secondary btn-sm copy-btn">URL kopieren</button>
              ${
                NFC_AVAILABLE
                  ? '<button type="button" class="btn btn-secondary btn-sm write-btn">Auf Chip schreiben</button>'
                  : ""
              }
              <span class="write-status"></span>
            </div>
          </td>
        </tr>`
    )
    .join("");

  document.getElementById("band-url-base").textContent = `${BAND_URL_BASE}/…`;
  document.getElementById("batch-result").classList.remove("hidden");

  document.querySelectorAll("#batch-rows .copy-btn").forEach((btn) => {
    const row = btn.closest("tr");
    btn.addEventListener("click", () =>
      copyUrl(bandUrl(row.dataset.code), row.querySelector(".write-status"))
    );
  });

  document.querySelectorAll(".write-btn").forEach((btn) => {
    btn.addEventListener("click", () => writeTag(btn.closest("tr")));
  });
}

/**
 * Legt die URL des Bandes in die Zwischenablage, damit sie in NFC Tools nur
 * noch eingefügt werden muss. Abtippen wäre die wahrscheinlichste Fehlerquelle
 * im ganzen Ablauf – ein vertippter Code landet gesperrt auf dem Chip.
 */
async function copyUrl(url, status) {
  if (await copyText(url)) {
    status.textContent = "Kopiert";
    status.className = "write-status ok";
    return;
  }

  // Die URL-Spalte ist auf dem Handy ausgeblendet, deshalb hier mit ausgeben:
  // ohne sie liesse sich die Adresse gar nicht von Hand übernehmen.
  status.textContent = `Kopieren ging nicht. Adresse: ${url}`;
  status.className = "write-status error";
}

/**
 * Erst die Clipboard-API, dann die Auswahl-Variante. Die API wirft je nach
 * Browser und Fensterfokus, und ein einzelner Versuch würde bedeuten, dass die
 * Adresse abgetippt werden muss – genau die Fehlerquelle, die der Knopf
 * verhindern soll.
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* weiter zur Auswahl-Variante */
  }

  try {
    return copyViaSelection(text);
  } catch {
    return false;
  }
}

/** Rückfalllösung ohne Clipboard-API: Text auswählen und kopieren lassen. */
function copyViaSelection(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);

  const copied = document.execCommand("copy");
  field.remove();
  return copied;
}

function showNfcSupport() {
  document.getElementById("nfc-support").textContent = NFC_AVAILABLE
    ? "Dieser Browser kann Chips direkt beschreiben – alternativ zur Anleitung unten."
    : "Chips werden mit „NFC Tools“ beschrieben – Anleitung unterhalb der Tabelle.";

  if (NFC_AVAILABLE) document.getElementById("overview-scan-btn").classList.remove("hidden");
}

/**
 * Schreibt die URL auf den Chip und sperrt ihn anschliessend dauerhaft, damit
 * niemand das Band eines Kindes umschreiben kann.
 */
async function writeTag(row) {
  const code = row.dataset.code;
  const status = row.querySelector(".write-status");
  const btn = row.querySelector(".write-btn");

  btn.disabled = true;
  status.textContent = "Band an das Handy halten …";
  status.className = "write-status";

  try {
    const writer = new NDEFReader();
    await writer.write({ records: [{ recordType: "url", data: bandUrl(code) }] });

    // makeReadOnly ist nicht in jedem Browser vorhanden – das Schreiben soll
    // trotzdem als Erfolg gelten, dann muss eben manuell gesperrt werden.
    let locked = false;
    if (typeof writer.makeReadOnly === "function") {
      try {
        await writer.makeReadOnly();
        locked = true;
      } catch {
        locked = false;
      }
    }

    status.textContent = locked ? "Geschrieben und gesperrt" : "Geschrieben (nicht gesperrt!)";
    status.className = locked ? "write-status ok" : "write-status warn";
  } catch (err) {
    status.textContent = err.message || "Schreiben fehlgeschlagen";
    status.className = "write-status error";
  } finally {
    btn.disabled = false;
  }
}

function downloadCsv() {
  const rows = [["code", "url"], ...lastBatch.map((code) => [code, bandUrl(code)])];
  const csv = rows.map((r) => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `safeband-codes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadPendingProfiles() {
  pendingProfiles = await fetchPendingProfiles();
}

/** Liest den Code aus der URL, die auf dem Chip steht, und filtert die Übersicht darauf. */
async function scanToSearch() {
  const status = document.getElementById("overview-scan-status");

  if (!NFC_AVAILABLE) {
    status.textContent = "Scannen geht nur in Chrome auf Android – Code bitte in die Suche einfügen.";
    return;
  }

  status.textContent = "Band an das Handy halten …";

  try {
    const reader = new NDEFReader();
    await reader.scan();

    reader.onreading = ({ message }) => {
      const code = extractCode(message);
      if (!code) {
        status.textContent = "Kein SafeBand-Code auf diesem Chip gefunden.";
        return;
      }
      document.getElementById("overview-search").value = code;
      status.textContent = `Gelesen: ${code}`;
      loadOverview();
    };

    reader.onreadingerror = () => {
      status.textContent = "Chip konnte nicht gelesen werden.";
    };
  } catch (err) {
    status.textContent = err.message || "Scannen fehlgeschlagen.";
  }
}

function extractCode(message) {
  const decoder = new TextDecoder();

  for (const record of message.records) {
    if (record.recordType !== "url" && record.recordType !== "absolute-url") continue;

    const code = normalizeCode(decoder.decode(record.data));
    if (code) return code;
  }
  return null;
}

/**
 * Nimmt den blossen Code ebenso wie die komplette Adresse, die Safari nach dem
 * Scannen in der Adresszeile stehen hat. Einfügen ist beim Verpacken schneller
 * als acht Zeichen abzutippen – und ein Tippfehler ordnet im schlimmsten Fall
 * das Band einer fremden Person zu.
 */
function normalizeCode(input) {
  const value = String(input || "").trim();
  const fromUrl = value.match(/(?:\/n\/|[?&]id=)([A-Z0-9]{8})/i);

  if (fromUrl) return fromUrl[1].toUpperCase();
  return /^[A-Z0-9]{8}$/i.test(value) ? value.toUpperCase() : null;
}

// --- Kleinkram --------------------------------------------------------------

function showMessage(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove("hidden");
}

/** Kundeneingaben landen per innerHTML in der Tabelle und müssen entschärft werden. */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}

function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

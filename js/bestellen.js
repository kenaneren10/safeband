/**
 * SafeBand – Bestellseite (Demo-Shop)
 *
 * Im Rahmen der Schulprojektarbeit gibt es keinen Zahlungsdienstleister, die
 * Bestellung landet aber echt in der Datenbank: Name, Adresse und E-Mail
 * gehen an create_order, das serverseitig eine eindeutige Bestellnummer
 * erzeugt. So sieht die Verwaltung die Bestellung auch dann, wenn der Käufer
 * die Notfalldaten nie hinterlegt.
 */

const UNIT_PRICE = 29.9;
const SHIPPING = 3.5;

const orderForm = document.getElementById("order-form");
const orderView = document.getElementById("order-view");
const orderResult = document.getElementById("order-result");
const orderError = document.getElementById("order-error");
const orderSubmit = document.getElementById("order-submit");
const setupLinkEl = document.getElementById("result-setup-link");

if (orderForm) {
  renderTotals();

  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    orderError.classList.add("hidden");

    const payload = {
      name: value("order-name"),
      street: value("order-street"),
      zip: value("order-zip"),
      city: value("order-city"),
      email: value("order-email"),
      consent: document.getElementById("order-consent").checked,
    };

    setLoading(true);
    try {
      const result = await createOrder(payload);
      showConfirmation(result.order_ref);
    } catch (err) {
      showError(err.message || "Bestellung fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
  });
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setLoading(loading) {
  orderSubmit.disabled = loading;
  orderSubmit.textContent = loading ? "Wird übermittelt …" : "Kostenpflichtig bestellen";
}

function showError(message) {
  orderError.textContent = message;
  orderError.classList.remove("hidden");
  orderError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderTotals() {
  document.getElementById("sum-subtotal").textContent = chf(UNIT_PRICE);
  document.getElementById("sum-shipping").textContent = chf(SHIPPING);
  document.getElementById("sum-total").textContent = chf(UNIT_PRICE + SHIPPING);
}

function chf(amount) {
  return "CHF " + amount.toFixed(2);
}

function showConfirmation(orderRef) {
  setupLinkEl.href = "einrichten.html?bestellung=" + encodeURIComponent(orderRef);

  orderView.classList.add("hidden");
  orderResult.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

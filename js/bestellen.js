/**
 * SafeBand – Bestellseite (Demo-Shop)
 *
 * Im Rahmen der Schulprojektarbeit gibt es keinen Zahlungsdienstleister: Die
 * Bestellnummer entsteht im Browser und die Adressdaten verlassen die Seite nicht.
 * Einzig die Bestellnummer wird an das Einrichtungsformular weitergereicht.
 */

const UNIT_PRICE = 29.9;
const SHIPPING = 3.5;

const orderForm = document.getElementById("order-form");
const orderView = document.getElementById("order-view");
const orderResult = document.getElementById("order-result");
const orderError = document.getElementById("order-error");
const orderRefEl = document.getElementById("result-order-ref");
const setupLinkEl = document.getElementById("result-setup-link");
const copyRefBtn = document.getElementById("copy-ref-btn");

if (orderForm) {
  renderTotals();

  orderForm.addEventListener("submit", (e) => {
    e.preventDefault();
    orderError.classList.add("hidden");
    showConfirmation(generateOrderRef());
  });

  copyRefBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(orderRefEl.textContent).then(() => {
      copyRefBtn.textContent = "Kopiert!";
      setTimeout(() => {
        copyRefBtn.textContent = "Kopieren";
      }, 2000);
    });
  });
}

/** Fünfstellig wie im echten Shop, damit sie sich abtippen lässt. */
function generateOrderRef() {
  return "SB-" + (10000 + Math.floor(Math.random() * 90000));
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
  orderRefEl.textContent = orderRef;
  setupLinkEl.href = "einrichten.html?bestellung=" + encodeURIComponent(orderRef);

  orderView.classList.add("hidden");
  orderResult.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * SafeBand – Bestellseite (Demo-Shop)
 *
 * Im Rahmen der Schulprojektarbeit gibt es keinen Zahlungsdienstleister: Die
 * Bestellnummer entsteht im Browser und die Adressdaten verlassen die Seite nicht.
 * Einzig die Bestellnummer wird an das Einrichtungsformular weitergereicht.
 */

const UNIT_PRICE = 29.9;
const SHIPPING = 3.5;
const FREE_SHIPPING_FROM = 60;

const orderForm = document.getElementById("order-form");
const orderView = document.getElementById("order-view");
const orderResult = document.getElementById("order-result");
const orderError = document.getElementById("order-error");
const quantityInput = document.getElementById("order-quantity");
const orderRefEl = document.getElementById("result-order-ref");
const setupLinkEl = document.getElementById("result-setup-link");
const copyRefBtn = document.getElementById("copy-ref-btn");

if (orderForm) {
  updateTotals();
  quantityInput.addEventListener("input", updateTotals);

  orderForm.addEventListener("submit", (e) => {
    e.preventDefault();
    orderError.classList.add("hidden");

    const quantity = clampedQuantity();
    if (!quantity) {
      showError("Bitte gib eine Menge zwischen 1 und 10 an.");
      return;
    }

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

function clampedQuantity() {
  const quantity = Number.parseInt(quantityInput.value, 10);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) return null;
  return quantity;
}

function updateTotals() {
  const quantity = clampedQuantity() || 1;
  const subtotal = quantity * UNIT_PRICE;
  const shipping = subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING;

  document.getElementById("sum-quantity").textContent = String(quantity);
  document.getElementById("sum-subtotal").textContent = chf(subtotal);
  document.getElementById("sum-shipping").textContent =
    shipping === 0 ? "gratis" : chf(shipping);
  document.getElementById("sum-total").textContent = chf(subtotal + shipping);
}

function chf(amount) {
  return "CHF " + amount.toFixed(2);
}

function showError(message) {
  orderError.textContent = message;
  orderError.classList.remove("hidden");
}

function showConfirmation(orderRef) {
  orderRefEl.textContent = orderRef;
  setupLinkEl.href = "einrichten.html?bestellung=" + encodeURIComponent(orderRef);

  orderView.classList.add("hidden");
  orderResult.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

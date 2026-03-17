let hyper;
let unifiedCheckout;

async function initialize() {
  try {
    const configResp = await fetch("http://localhost:3000/config");
    const { publishableKey } = await configResp.json();

    const resp = await fetch("http://backend:3000/create-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 1400,
        user_id: "11111111-1111-1111-1111-111111111111",
        host_id: "22222222-2222-2222-2222-222222222222"
      }),
    });

    const data = await resp.json();
    console.log("RESPONSE:", data);

    const { bookingId, clientSecret } = data;
    hyper = Hyper(publishableKey);

    const elements = hyper.elements({ clientSecret });

    unifiedCheckout = elements.create("payment");
    unifiedCheckout.mount("#payment-element");

    document.getElementById("checkout-card").dataset.bookingId = bookingId;

  } catch (err) {
    console.error("Initialization failed:", err);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  console.log("LOOOCATION: ", window.location.origin)
  const { error, status } = await hyper.confirmPayment({
    elements: unifiedCheckout,
    confirmParams: {
      return_url: window.location.origin + "/payment-complete.html",
    },
    redirect: "always",
  });
  
  if (error) {
    document.getElementById("payment-message").textContent =
      error.message || "Payment failed. Please try again.";
  }
}

document
  .getElementById("checkout-card")
  .addEventListener("submit", handleSubmit);

initialize();
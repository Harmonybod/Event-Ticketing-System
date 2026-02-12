// frontend/back_officer/add_customer.js

const API = "http://localhost:5000";

// Normalize phone to E.164
function normalizePhone(phone) {
  if (!phone) return null;
  phone = phone.trim().replace(/[\s()-]/g, "");
  if (!phone.startsWith("+")) return null;
  if (!/^\+[0-9]{6,15}$/.test(phone)) return null;
  return phone;
}

document.getElementById("addCustomerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const rawPhone = document.getElementById("phone_number").value;
  const name = document.getElementById("name").value.trim();
  const msg = document.getElementById("message");

  msg.innerText = "";

  const phone_number = normalizePhone(rawPhone);
  if (!phone_number) {
    msg.style.color = "red";
    msg.innerText = "Phone must be international format (e.g. +251912345678)";
    return;
  }

  if (!name) {
    msg.style.color = "red";
    msg.innerText = "Name is required.";
    return;
  }

  try {
    const response = await fetch(`${API}/customers/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number, name })
    });

    const result = await response.json();
    msg.style.color = result.success ? "green" : "red";
    msg.innerText = result.message;

  } catch (err) {
    msg.style.color = "red";
    msg.innerText = "Request failed: " + err.message;
  }
});

document.getElementById("resetBtn").addEventListener("click", () => {
  document.getElementById("phone_number").value = "";
  document.getElementById("name").value = "";
  document.getElementById("message").innerText = "";
});

const video = document.getElementById('video');
const popup = document.getElementById('popup');
const lastDecoded = document.getElementById('lastDecoded');
const custName = document.getElementById('custName');
const custPhone = document.getElementById('custPhone');

let stream = null;
let scanning = false;
let raf = null;

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

document.getElementById('startBtn').onclick = startCamera;
document.getElementById('stopBtn').onclick = stopCamera;
document.getElementById('manualBtn').onclick = () => {
  const v = document.getElementById('manual').value.trim();
  if (v) verifyHash(v);
};

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = stream;
    scanning = true;
    tick();
  } catch (err) {
    alert("Camera error: " + err.message);
  }
}

function stopCamera() {
  scanning = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (raf) cancelAnimationFrame(raf);
}

function tick() {
  if (!scanning) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      stopCamera();
      lastDecoded.textContent = code.data;
      verifyHash(code.data);
      return;
    }
  }
  raf = requestAnimationFrame(tick);
}

async function verifyHash(hash) {
  try {
    const res = await fetch("/api/tickets/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashkey: hash })
    });

    const j = await res.json();

    if (!j.success) throw new Error(j.message);

    if (j.customer) {
      custName.textContent = j.customer.name;
      custPhone.textContent = j.customer.phone;
    }

    if (j.status === "valid") {
      showPopup("Confirmed", "ok", "✔", j.message);
    } else if (j.status === "used") {
      showPopup("Already Used", "used", "↺", j.message);
    } else {
      showPopup("Invalid", "bad", "✖", j.message);
    }

  } catch (err) {
    alert("Verification failed: " + err.message);
  }
}

function showPopup(title, style, symbol, text) {
  popup.className = style;
  popup.innerHTML = `
    <div class="big">${symbol}</div>
    <strong>${title}</strong>
    <div style="margin-top:8px">${text}</div>
  `;
  popup.style.display = "block";
  setTimeout(() => popup.style.display = "none", 3500);
}

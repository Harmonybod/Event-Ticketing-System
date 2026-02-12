document.getElementById('loginBtn').addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const msg = document.getElementById('msg');
  
    msg.innerText = 'Logging in...';
  
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  
    const data = await res.json();
  
    if (data.success) {
      window.location.href = 'index.html';
    } else {
      msg.innerText = data.message || 'Login failed';
    }
  });
  
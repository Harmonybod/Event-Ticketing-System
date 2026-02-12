const API = 'http://localhost:5000'; 
const perPage = 20;
let currentPage = 1;
let currentQuery = '';

async function fetchCustomers(page = 1, q = '') {
    const url = `${API}/customers?limit=${perPage}&page=${page}&search=${encodeURIComponent(q)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

// New function to handle deletion
async function deleteCustomer(phone) {
    const confirmed = confirm(
      "Are you sure you want to delete this customer?\nThis action cannot be undone."
    );

    if (!confirmed) return;

    try {
        const resp = await fetch(`/customers/${encodeURIComponent(phone)}`, {
            method: 'DELETE'
        });

        const data = await resp.json();

        if (data.success) {
            alert("Customer deleted successfully.");
            loadPage(currentPage);
        } else {
            alert("Delete failed: " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Server error: " + err.message);
    }
}


function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function renderTable(customers, page, total, per) {
    const tbody = document.getElementById('customersTbody');
    tbody.innerHTML = '';
    const start = (page - 1) * per + 1;

    customers.forEach((c, idx) => {
        const tr = document.createElement('tr');
        
        // Added the delete button column
        // We use c.id (assuming your database returns an 'id' field)
        tr.innerHTML = `
            <td>${start + idx}</td>
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.phone_number)}</td>
            <td>
                <button 
                    onclick="deleteCustomer('${c.phone_number}')"
                    style="background-color: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                    Delete
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPager(page, total, per);
}

function renderPager(page, total, per) {
    const pager = document.getElementById('pager');
    pager.innerHTML = '';
    const pages = Math.ceil(total / per);

    for (let i = 1; i <= pages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        if (i === page) btn.classList.add('active');
        btn.onclick = () => loadPage(i);
        pager.appendChild(btn);
    }
}

async function loadPage(page = 1) {
    try {
        currentPage = page;
        const data = await fetchCustomers(page, currentQuery);
        if (!data.success) {
            alert('Error: ' + (data.message || 'Failed'));
            return;
        }
        renderTable(data.customers, data.page, data.total, data.perPage);
    } catch (err) {
        console.error(err);
        alert('Failed to load customers: ' + err.message);
    }
}

document.getElementById('searchBtn').addEventListener('click', () => {
    currentQuery = document.getElementById('searchInput').value.trim();
    loadPage(1);
});

document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        currentQuery = e.target.value.trim();
        loadPage(1);
    }
});

loadPage(1);
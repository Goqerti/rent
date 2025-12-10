// ==========================================
//              HESABAT.JS – FINAL AND FIXED
// ==========================================

// Serverin ünvanını təyin edirik
const BASE_URL = "http://localhost:3001";

// --- API Wrapper ---
async function apiGet(url) {
    try {
        // Sorğunun tam ünvanını təyin edirik
        const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
        
        const res = await fetch(fullUrl);
        const text = await res.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            // Server 500 xətası verib HTML qaytarırsa
            throw new Error("Server yanlış cavab qaytardı (JSON gözlənilirdi).");
        }

        if (!res.ok) {
            throw new Error(data.error || JSON.stringify(data));
        }

        return data;
    } catch (err) {
        console.error("API GET ERROR:", err);
        // Network xətası zamanı aydın mesaj veririk
        if (err.message.includes('Failed to fetch')) {
             throw new Error(`Serverlə əlaqə qurulmadı. Zəhmət olmasa server.js-in terminalda işlədiyinə əmin olun (node server.js).`);
        }
        throw err;
    }
}

// --- DOM Elements ---
const carSelect = document.getElementById("carSelect");
// FIX: ID-lər "hesabat.html" faylına uyğunlaşdırıldı: from, to, btnLoad
const fromInput = document.getElementById("from"); 
const toInput = document.getElementById("to");     
const loadBtn = document.getElementById("btnLoad"); 
const summaryBox = document.getElementById("summary");
// FIX: Table body selectorları HTML-dəki table ID-lərinə uyğunlaşdırıldı
const resTableBody = document.querySelector("#resTable tbody"); 
const expTableBody = document.querySelector("#expTable tbody"); 
const fineTableBody = document.querySelector("#fineTable tbody");

// ==========================
//  1) Bütün Maşınların Yüklənməsi
// ==========================
async function loadCars() {
    try {
        const cars = await apiGet("/api/cars");

        carSelect.innerHTML = `<option value="">Maşın seçin...</option>`;

        cars.forEach(car => {
            const opt = document.createElement("option");
            opt.value = car.id;
            opt.textContent = `${car.brand} ${car.model} (${car.plate})`;
            carSelect.appendChild(opt);
        });
    } catch (err) {
        // Network xətası zamanı aydın mesaj
        alert(`Maşın siyahısı yüklənmədi: ${err.message}`);
        console.error("Load Cars Error:", err);
    }
}

// ==========================
//  2) HESABATI YÜKLƏ
// ==========================
if(loadBtn) {
    loadBtn.addEventListener("click", loadReport);
}

async function loadReport() {
    const carId = carSelect.value;
    const from = fromInput.value;
    const to = toInput.value;

    if (!carId) {
        alert("⚠ Zəhmət olmasa maşın seçin!");
        return;
    }

    summaryBox.innerHTML = `Yüklənir...`;
    if(resTableBody) resTableBody.innerHTML = "";
    if(expTableBody) expTableBody.innerHTML = "";
    if(fineTableBody) fineTableBody.innerHTML = "";

    try {
        const data = await apiGet(
            `/api/reports/car-full?id=${carId}&from=${from}&to=${to}`
        );

        renderSummary(data.summary);
        renderReservations(data.reservations);
        renderExpenses(data.expenses);
        renderFines(data.fines);

    } catch (err) {
        console.error("Report load error:", err);
        summaryBox.innerHTML = `<span style="color:red;">Hesabat yüklənə bilmədi! Xəta: ${err.message}</span>`;
    }
}

// ==========================
//  3) Ümumi XÜLASƏ
// ==========================
function renderSummary(sum) {
    if (!sum) {
        summaryBox.innerHTML = `<b>Hesabat tapılmadı.</b>`;
        return;
    }

    summaryBox.innerHTML = `
        <div class="summary-card" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; background:#f9f9f9; padding:15px; border-radius:8px;">
            <div><b>Cəmi Gəlir:</b> ${sum.totalIncome.toFixed(2)} AZN</div>
            <div><b>Ödənilib:</b> ${sum.totalPaid.toFixed(2)} AZN</div>
            <div><b>Borc:</b> ${sum.totalDebt.toFixed(2)} AZN</div>
            <div><b>Xərc:</b> ${sum.totalExpenses.toFixed(2)} AZN</div>
            <div><b>Ödənilmiş Cərimə:</b> ${sum.totalFines.toFixed(2)} AZN</div>
            <div style="grid-column: span 2; border-top:1px solid #ddd; padding-top:5px; margin-top:5px;">
                <b>Xalis Mənfəət:</b> <span style="color:${sum.profit >= 0 ? "green" : "red"}; font-size:1.2em;">
                    ${sum.profit.toFixed(2)} AZN
                </span>
            </div>
        </div>
    `;
}

// ==========================
//  4) REZERVASİYA CƏDVƏLİ
// ==========================
function renderReservations(list) {
    if(!resTableBody) return;
    resTableBody.innerHTML = "";

    if (!list || list.length === 0) {
        resTableBody.innerHTML = `<tr><td colspan="5">Məlumat yoxdur</td></tr>`;
        return;
    }

    list.forEach(r => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${r.startAt?.substring(0, 10) || "-"}</td>
            <td>${r.endAt?.substring(0, 10) || "-"}</td>
            <td>${r.totalIncome.toFixed(2)} AZN</td>
            <td>${r.paid.toFixed(2)} AZN</td>
            <td>${r.debt.toFixed(2)} AZN</td>
        `;

        resTableBody.appendChild(tr);
    });
}

// ==========================
//  5) XƏRCLƏR CƏDVƏLİ
// ==========================
function renderExpenses(list) {
    if(!expTableBody) return;
    expTableBody.innerHTML = "";

    if (!list || list.length === 0) {
        expTableBody.innerHTML = `<tr><td colspan="3">Xərc yoxdur</td></tr>`;
        return;
    }

    list.forEach(e => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${e.when?.substring(0, 10) || e.createdAt?.substring(0,10) || "-"}</td>
            <td>${e.title}</td>
            <td>${e.amount.toFixed(2)} AZN</td>
        `;

        expTableBody.appendChild(tr);
    });
}

// ==========================
//  6) CƏRİMƏ CƏDVƏLİ
// ==========================
function renderFines(list) {
    if(!fineTableBody) return;
    fineTableBody.innerHTML = "";

    if (!list || list.length === 0) {
        fineTableBody.innerHTML = `<tr><td colspan="3">Cərimə yoxdur</td></tr>`;
        return;
    }

    list.forEach(f => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${f.date}</td>
            <td>${f.amount.toFixed(2)} AZN</td>
            <td>${f.isPaid ? (f.amountPaid || f.amount).toFixed(2) + " AZN" : "Ödənilməyib"}</td>
        `;

        fineTableBody.appendChild(tr);
    });
}

// İlk olaraq maşınları yüklə
loadCars();
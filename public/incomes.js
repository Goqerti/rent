document.addEventListener('DOMContentLoaded', () => {
    // API ünvanı
    const API_URL = '/api/incomes';

    // HTML elementlərini seçirik
    const form = document.getElementById('incomeForm');
    const tableBody = document.querySelector('#incomesTable tbody');
    const totalIncomesEl = document.getElementById('totalIncomes');
    const monthFilter = document.getElementById('monthFilter');
    const dayFilter = document.getElementById('dayFilter');

    // Filterlərin dəyişməsini izləyən funksiyalar
    monthFilter.addEventListener('change', () => {
        if (monthFilter.value) {
            dayFilter.value = ''; // Gün filterini təmizləyir
            loadIncomes({ month: monthFilter.value });
        } else {
            loadIncomes();
        }
    });

    dayFilter.addEventListener('change', () => {
        if (dayFilter.value) {
            monthFilter.value = ''; // Ay filterini təmizləyir
            loadIncomes({ day: dayFilter.value });
        } else {
            setDefaultMonth();
            loadIncomes({ month: monthFilter.value });
        }
    });

    // Serverdən mədaxil məlumatlarını yükləyir
    async function loadIncomes({ month, day } = {}) {
        try {
            const params = new URLSearchParams();
            if (month) params.append('month', month);
            if (day) params.append('day', day);
            
            const response = await fetch(`${API_URL}?${params.toString()}`);
            if (!response.ok) throw new Error('Məlumatları yükləmək mümkün olmadı');

            const data = await response.json();
            renderTable(data.items);
            totalIncomesEl.textContent = `${(data.total || 0).toFixed(2)} AZN`;
        } catch (error) {
            console.error('Mədaxil yüklənərkən xəta:', error);
            tableBody.innerHTML = '<tr><td colspan="5">Məlumatları yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // Cədvəli yeni məlumatlarla doldurur
    function renderTable(items) {
        tableBody.innerHTML = '';
        if (!items || items.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5">Bu filter üzrə heç bir mədaxil tapılmadı.</td></tr>';
            return;
        }
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.date}</td>
                <td>${item.source}</td>
                <td>${item.description}</td>
                <td>${(item.amount || 0).toFixed(2)} AZN</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-id="${item.id}">Sil</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Yeni mədaxil formasını təsdiqlədikdə
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            source: document.getElementById('source').value,
            description: document.getElementById('description').value,
            amount: document.getElementById('amount').value,
            date: document.getElementById('date').value
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Mədaxil əlavə edilmədi');
            
            form.reset();
            // Cədvəli yeniləyirik
            loadIncomes({ month: monthFilter.value, day: dayFilter.value });
        } catch (error) {
            console.error('Mədaxil əlavə edərkən xəta:', error);
            alert('Mədaxil əlavə edərkən xəta baş verdi.');
        }
    });

    // Silmə düyməsinə kliklədikdə
    tableBody.addEventListener('click', async (e) => {
        if (e.target.matches('.btn-danger')) {
            const id = e.target.dataset.id;
            if (confirm('Bu mədaxili silməyə əminsiniz?')) {
                try {
                    const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Mədaxil silinmədi');
                    // Cədvəli yeniləyirik
                    loadIncomes({ month: monthFilter.value, day: dayFilter.value });
                } catch (error) {
                    console.error('Mədaxil silinərkən xəta:', error);
                    alert('Mədaxil silinərkən xəta baş verdi.');
                }
            }
        }
    });

    // Ay filterinə cari ayı təyin edir
    function setDefaultMonth() {
        const today = new Date();
        const year = today.getFullYear();
        const month = ('0' + (today.getMonth() + 1)).slice(-2);
        monthFilter.value = `${year}-${month}`;
    }

    // Səhifənin ilkin yüklənməsi
    function init() {
        setDefaultMonth();
        loadIncomes({ month: monthFilter.value });
    }

    init();
});
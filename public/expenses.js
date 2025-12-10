document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('expenseForm');
    const tableBody = document.querySelector('#expensesTable tbody');
    const totalExpensesEl = document.getElementById('totalExpenses');
    const monthFilter = document.getElementById('monthFilter');
    const dayFilter = document.getElementById('dayFilter');

    // Filterlərin dəyişməsini izləyir
    monthFilter.addEventListener('change', () => {
        if (monthFilter.value) {
            dayFilter.value = ''; // Digər filteri təmizləyir
            loadExpenses({ month: monthFilter.value });
        } else {
            loadExpenses(); // Filter boşdursa hamısını göstər
        }
    });

    dayFilter.addEventListener('change', () => {
        if (dayFilter.value) {
            monthFilter.value = ''; // Digər filteri təmizləyir
            loadExpenses({ day: dayFilter.value });
        } else {
            setDefaultMonth(); // Filter boşdursa cari ayı göstər
            loadExpenses({ month: monthFilter.value });
        }
    });

    // Serverdən xərcləri yükləyir
    async function loadExpenses({ month, day } = {}) {
        try {
            const params = new URLSearchParams();
            if (month) params.append('month', month);
            if (day) params.append('day', day);
            
            const response = await fetch(`/api/admin-expenses?${params.toString()}`);
            if (!response.ok) throw new Error('Məlumatları yükləmək mümkün olmadı');

            const data = await response.json();
            renderTable(data.items);
            totalExpensesEl.textContent = `${(data.total || 0).toFixed(2)} AZN`;
        } catch (error) {
            console.error('Xərclər yüklənərkən xəta:', error);
            tableBody.innerHTML = '<tr><td colspan="4">Məlumatları yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // Cədvəli məlumatlarla doldurur
    function renderTable(expenses) {
        tableBody.innerHTML = '';
        if (!expenses || expenses.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Bu filter üzrə heç bir xərc tapılmadı.</td></tr>';
            return;
        }
        expenses.forEach(expense => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(expense.when || expense.createdAt).toLocaleDateString('az-AZ')}</td>
                <td>${expense.title}</td>
                <td>${(expense.amount || 0).toFixed(2)} AZN</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-id="${expense.id}">Sil</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Forma təsdiqləndikdə
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const expenseData = {
            title: document.getElementById('title').value,
            amount: document.getElementById('amount').value,
            when: document.getElementById('when').value,
        };

        try {
            const response = await fetch('/api/admin-expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expenseData)
            });
            if (!response.ok) throw new Error('Xərc əlavə edilmədi');
            
            form.reset();
            setDefaultMonth();
            loadExpenses({ month: monthFilter.value });
        } catch (error) {
            console.error('Xərc əlavə edərkən xəta:', error);
            alert('Xərc əlavə edilərkən xəta baş verdi.');
        }
    });

    // Silmə düyməsinə kliklədikdə
    tableBody.addEventListener('click', async (e) => {
        if (e.target.matches('button.btn-danger')) {
            const id = e.target.dataset.id;
            if (confirm('Bu xərci silməyə əminsiniz?')) {
                try {
                    const response = await fetch(`/api/admin-expenses/${id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Xərc silinmədi');
                    loadExpenses({ month: monthFilter.value, day: dayFilter.value });
                } catch (error) {
                    console.error('Xərc silinərkən xəta:', error);
                    alert('Xərc silinərkən xəta baş verdi.');
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

    // İlkin yükləmə
    function init() {
        setDefaultMonth();
        loadExpenses({ month: monthFilter.value });
    }

    init();
});
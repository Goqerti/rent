document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('expenseForm');
    const tableBody = document.querySelector('#expensesTable tbody');
    const totalExpensesEl = document.getElementById('totalExpenses');
    
    // Forma və filterlər üçün elementlər
    const carIdSelect = document.getElementById('carId');
    const monthFilter = document.getElementById('monthFilter');
    const dayFilter = document.getElementById('dayFilter');
    const carFilter = document.getElementById('carFilter');

    let allCars = [];

    // Filterlərin dəyişməsini izləyən funksiya
    function handleFilterChange() {
        const filters = {
            carId: carFilter.value
        };

        if (dayFilter.value) {
            monthFilter.value = ''; // Ay filterini təmizlə
            filters.day = dayFilter.value;
        } else if (monthFilter.value) {
            dayFilter.value = ''; // Gün filterini təmizlə
            filters.month = monthFilter.value;
        }
        
        loadExpenses(filters);
    }

    monthFilter.addEventListener('change', handleFilterChange);
    dayFilter.addEventListener('change', handleFilterChange);
    carFilter.addEventListener('change', handleFilterChange);

    // Serverdən xərcləri yükləyir
    async function loadExpenses({ month, day, carId } = {}) {
        try {
            const params = new URLSearchParams();
            if (month) params.append('month', month);
            if (day) params.append('day', day);
            if (carId) params.append('carId', carId);
            
            const response = await fetch(`/api/car-expenses?${params.toString()}`);
            if (!response.ok) throw new Error('Məlumatları yükləmək mümkün olmadı');

            const data = await response.json();
            renderTable(data.items);
            totalExpensesEl.textContent = `${(data.total || 0).toFixed(2)} AZN`;
        } catch (error) {
            console.error('Xərclər yüklənərkən xəta:', error);
            tableBody.innerHTML = '<tr><td colspan="5">Məlumatları yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // Cədvəli məlumatlarla doldurur
    function renderTable(expenses) {
        tableBody.innerHTML = '';
        if (!expenses || expenses.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5">Bu filter üzrə heç bir xərc tapılmadı.</td></tr>';
            return;
        }
        expenses.forEach(expense => {
            const car = allCars.find(c => c.id === expense.carId) || {};
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(expense.when || expense.createdAt).toLocaleDateString('az-AZ')}</td>
                <td>${car.brand || ''} ${car.model || ''} (${car.plate || 'N/A'})</td>
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
            carId: carIdSelect.value,
            title: document.getElementById('title').value,
            amount: document.getElementById('amount').value,
            when: document.getElementById('when').value,
        };

        try {
            const response = await fetch('/api/car-expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expenseData)
            });
            if (!response.ok) throw new Error('Xərc əlavə edilmədi');
            
            form.reset();
            handleFilterChange(); // Filterlərə uyğun cədvəli yenilə
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
                    const response = await fetch(`/api/car-expenses/${id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Xərc silinmədi');
                    handleFilterChange(); // Cədvəli yenilə
                } catch (error) {
                    console.error('Xərc silinərkən xəta:', error);
                    alert('Xərc silinərkən xəta baş verdi.');
                }
            }
        }
    });

    // Maşınları select-lərə yükləyir
    async function loadCars() {
        try {
            const response = await fetch('/api/cars');
            allCars = await response.json();
            
            // Hər iki select-i doldurur
            [carIdSelect, carFilter].forEach(select => {
                // mövcud optionsları təmizlə (ilk option xaric)
                while(select.options.length > 1) {
                    select.remove(1);
                }
                allCars.forEach(car => {
                    const option = document.createElement('option');
                    option.value = car.id;
                    option.textContent = `${car.brand} ${car.model} (${car.plate})`;
                    select.appendChild(option);
                });
            });
        } catch(error) {
            console.error("Maşınları yükləmək alınmadı:", error);
        }
    }

    // Ay filterinə cari ayı təyin edir
    function setDefaultMonth() {
        const today = new Date();
        const year = today.getFullYear();
        const month = ('0' + (today.getMonth() + 1)).slice(-2);
        monthFilter.value = `${year}-${month}`;
    }

    // İlkin yükləmə
    async function init() {
        await loadCars();
        setDefaultMonth();
        loadExpenses({ month: monthFilter.value });
    }

    init();
});
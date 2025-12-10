document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    // Tablar arasında keçid üçün məntiq
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Bütün tabları qeyri-aktiv edirik
            tabs.forEach(item => item.classList.remove('active'));
            // Kliklənən tabı aktiv edirik
            tab.classList.add('active');
            
            // Hədəf məzmun blokunu tapırıq
            const target = document.getElementById(tab.dataset.tab);
            
            // Bütün məzmun bloklarını gizlədirik
            tabContents.forEach(content => content.classList.remove('active'));
            // Hədəf məzmun blokunu göstəririk
            target.classList.add('active');
        });
    });

    // API sorğuları üçün köməkçi obyekt
    const api = {
        get: (url) => fetch(url).then(res => {
            if (!res.ok) throw new Error(`API sorğusu uğursuz oldu: ${url}`);
            return res.json();
        })
    };

    // 1. Maşın Populyarlığı Qrafiki
    async function createCarPopularityChart() {
        try {
            const chartData = await api.get('/api/reports/car-popularity');
            const ctx = document.getElementById('carPopularityChart').getContext('2d');
            
            new Chart(ctx, {
                type: 'pie', // Diaqram növü: dairəvi
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Rezervasiya Sayı',
                        data: chartData.data,
                        backgroundColor: [
                            'rgba(30, 111, 255, 0.8)',
                            'rgba(255, 99, 132, 0.8)',
                            'rgba(255, 206, 86, 0.8)',
                            'rgba(75, 192, 192, 0.8)',
                            'rgba(153, 102, 255, 0.8)',
                            'rgba(255, 159, 64, 0.8)',
                            'rgba(40, 199, 111, 0.8)'
                        ],
                        borderColor: '#ffffff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: false
                        }
                    }
                }
            });

        } catch (error) {
            console.error("Populyarlıq qrafiki yaradıla bilmədi:", error);
        }
    }

    // 2. Maşın Mənfəəti Cədvəli
    async function loadCarProfitability() {
        const tableBody = document.querySelector('#profitabilityTable tbody');
        try {
            const reportData = await api.get('/api/reports/car-profitability');
            tableBody.innerHTML = '';
            if (reportData.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4">Məlumat tapılmadı.</td></tr>';
                return;
            }
            reportData.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.carName}</td>
                    <td>${item.totalRevenue.toFixed(2)} AZN</td>
                    <td>${item.totalExpense.toFixed(2)} AZN</td>
                    <td><b>${item.profit.toFixed(2)} AZN</b></td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) {
            console.error("Maşın mənfəəti hesabatı yüklənə bilmədi:", error);
            tableBody.innerHTML = '<tr><td colspan="4">Hesabatı yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // 3. Ən Yaxşı Müştərilər Cədvəli
    async function loadBestCustomers() {
        const tableBody = document.querySelector('#bestCustomersTable tbody');
        try {
            const reportData = await api.get('/api/reports/best-customers');
            tableBody.innerHTML = '';
            if (reportData.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3">Məlumat tapılmadı.</td></tr>';
                return;
            }
            reportData.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.customerName}</td>
                    <td>${item.rentalCount}</td>
                    <td><b>${item.totalRevenue.toFixed(2)} AZN</b></td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) {
            console.error("Ən yaxşı müştərilər hesabatı yüklənə bilmədi:", error);
            tableBody.innerHTML = '<tr><td colspan="3">Hesabatı yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // 4. Maşın Doluluğu Cədvəli
    async function loadOccupancy() {
        const tableBody = document.querySelector('#occupancyTable tbody');
        try {
            const data = await api.get('/api/reports/occupancy');
            tableBody.innerHTML = '';
            if (!data.report || data.report.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3">Məlumat tapılmadı.</td></tr>';
                return;
            }
            data.report.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.carName}</td>
                    <td>${item.rentedDays} / ${data.daysInMonth} gün</td>
                    <td><b>${item.occupancyPercentage}%</b></td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) { 
            console.error("Doluluq hesabatı yüklənə bilmədi:", error); 
            tableBody.innerHTML = '<tr><td colspan="3">Hesabatı yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // 5. Ümumi Statistika
    async function loadGeneralStats() {
        try {
            // Ortalama müddət
            const durationData = await api.get('/api/reports/average-duration');
            document.getElementById('avgDuration').textContent = `${durationData.averageDuration || 0} gün`;

            // Marka üzrə gəlir
            const brandData = await api.get('/api/reports/revenue-by-brand');
            const tableBody = document.querySelector('#revenueByBrandTable tbody');
            tableBody.innerHTML = '';
            if (brandData.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="2">Məlumat tapılmadı.</td></tr>';
                return;
            }
            brandData.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>${item.brand}</b></td>
                    <td>${item.totalRevenue.toFixed(2)} AZN</td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) { 
            console.error("Ümumi statistika yüklənə bilmədi:", error); 
        }
    }


    // Səhifə yüklənəndə bütün hesabatları çağırırıq
    function init() {
        createCarPopularityChart();
        loadCarProfitability();
        loadBestCustomers();
        loadOccupancy();
        loadGeneralStats();
    }

    init();
});
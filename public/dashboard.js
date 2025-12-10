document.addEventListener('DOMContentLoaded', () => {
    dayjs.extend(window.dayjs_plugin_utc);
    dayjs.extend(window.dayjs_plugin_timezone);

    const carsInUseEl = document.getElementById('carsInUse');
    const carsDueEl = document.getElementById('carsDue');
    const carsFreeEl = document.getElementById('carsFree');
    const todaysRevenueEl = document.getElementById('todaysRevenue');
    const dueTodayTableBody = document.querySelector('#dueTodayTable tbody');
    const startingTodayTableBody = document.querySelector('#startingTodayTable tbody');
    
    const fmtTime = (dt) => { try { return dayjs(dt).format('HH:mm'); } catch(e) { return '-'; } }

    async function loadDashboardStats() {
        try {
            const response = await fetch('/api/dashboard-stats');
            if (!response.ok) throw new Error('Statistika yüklənmədi');
            
            const stats = await response.json();

            // Statistik kartları doldururuq
            carsInUseEl.textContent = stats.carsInUse;
            carsDueEl.textContent = stats.carsDueForReturn;
            carsFreeEl.textContent = stats.freeCars;
            todaysRevenueEl.textContent = `${(stats.todaysRevenue || 0).toFixed(2)} AZN`;

            // "Bu gün qaytarılmalı" cədvəlini doldururuq
            dueTodayTableBody.innerHTML = '';
            if (stats.dueTodayList && stats.dueTodayList.length > 0) {
                stats.dueTodayList.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${r.car.brand || ''} ${r.car.model || ''} (${r.car.plate || ''})</td>
                        <td>${r.customer.firstName || ''} ${r.customer.lastName || ''}</td>
                        <td>${fmtTime(r.endAt)}</td>
                    `;
                    dueTodayTableBody.appendChild(tr);
                });
            } else {
                dueTodayTableBody.innerHTML = '<tr><td colspan="3">Bu gün qaytarılmalı maşın yoxdur.</td></tr>';
            }

            // "Bu gün başlayan" cədvəlini doldururuq
            startingTodayTableBody.innerHTML = '';
            if (stats.startingTodayList && stats.startingTodayList.length > 0) {
                stats.startingTodayList.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${r.car.brand || ''} ${r.car.model || ''} (${r.car.plate || ''})</td>
                        <td>${r.customer.firstName || ''} ${r.customer.lastName || ''}</td>
                        <td>${fmtTime(r.startAt)}</td>
                    `;
                    startingTodayTableBody.appendChild(tr);
                });
            } else {
                startingTodayTableBody.innerHTML = '<tr><td colspan="3">Bu gün başlayan rezervasiya yoxdur.</td></tr>';
            }

        } catch (error) {
            console.error(error);
        }
    }

    loadDashboardStats();
});
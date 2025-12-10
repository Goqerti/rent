document.addEventListener('DOMContentLoaded', () => {
    dayjs.extend(window.dayjs_plugin_utc);
    dayjs.extend(window.dayjs_plugin_timezone);

    const API = {
        getReservation: (id) => `/api/reservations/${id}`,
        updateReservationDay: (id) => `/api/reservations/day/${id}`
    };

    // Elementlər
    const calendarGrid = document.querySelector('.calendar-grid');
    const currentMonthYearEl = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const sidePanel = document.getElementById('sidePanel');
    const panelTitle = document.getElementById('panelTitle');
    const panelHelpText = document.getElementById('panelHelpText');
    const dayEditorForm = document.getElementById('dayEditorForm');
    
    const dayStatusEl = document.getElementById('dayStatus');
    const dayPriceEl = document.getElementById('dayPrice');
    const dayPaidAmountEl = document.getElementById('dayPaidAmount');
    const dayNotesEl = document.getElementById('dayNotes');
    const applyToAllSelectedEl = document.getElementById('applyToAllSelected');
    const multiSelectOptions = document.getElementById('multiSelectOptions');

    const summarySection = document.getElementById('summarySection');
    const summaryCarEl = document.getElementById('summaryCar');
    const summaryCustomerEl = document.getElementById('summaryCustomer');
    const summaryExpectedEl = document.getElementById('summaryExpected');
    const summaryPaidEl = document.getElementById('summaryPaid');
    const summaryRemainingEl = document.getElementById('summaryRemaining');

    let currentMoment = dayjs().tz('Asia/Baku');
    let reservation = null; // Hazırkı rezervasiyanın bütün məlumatları
    let selectedDays = []; // Seçilmiş günlərin (tarixlərin) massivi

    // URL-dən rezervasiya ID-sini götürürük
    const reservationId = new URLSearchParams(window.location.search).get('id');
    if (!reservationId) {
        alert('Rezervasiya ID-si tapılmadı!');
        return;
    }

    async function fetchReservation() {
        try {
            const res = await fetch(API.getReservation(reservationId));
            if (!res.ok) throw new Error('Rezervasiya məlumatları yüklənə bilmədi');
            reservation = await res.json();
            
            // Təqvimi ilk dəfə rezervasiyanın başlama ayına görə qururuq
            if (reservation.days && reservation.days.length > 0) {
                currentMoment = dayjs.tz(reservation.days[0].date, 'Asia/Baku');
            }
            
            // Serverdən maşın və müştəri məlumatlarını alırıq (bunlar V2-yə hələ əlavə edilməyib)
            // Gələcəkdə bu məlumatlar birbaşa GET /api/reservations/:id-dən gəlməlidir
            const [carRes, customerRes] = await Promise.all([
                 fetch(`/api/cars`).then(res => res.json()),
                 fetch(`/api/customers`).then(res => res.json())
            ]);
            const car = carRes.find(c => c.id === reservation.carId) || {};
            const customer = customerRes.find(c => c.id === reservation.customerId) || {};
            
            reservation.carName = `${car.brand || ''} ${car.model || ''} (${car.plate || ''})`;
            reservation.customerName = `${customer.firstName || ''} ${customer.lastName || ''}`;

            renderCalendar(currentMoment);
            updateSummary();

        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    }

    function renderCalendar(date) {
        currentMonthYearEl.textContent = date.format('MMMM YYYY');
        const oldCells = document.querySelectorAll('.day-cell');
        oldCells.forEach(cell => cell.remove());

        const month = date.month();
        const year = date.year();
        const firstDayOfMonth = dayjs.tz(`${year}-${month + 1}-01`, 'Asia/Baku').day();
        const daysInMonth = date.daysInMonth();
        const dayOffset = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);

        for (let i = 0; i < (daysInMonth + dayOffset); i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'day-cell';

            if (i >= dayOffset) {
                const dayNumber = i - dayOffset + 1;
                const currentDate = dayjs.tz(`${year}-${month + 1}-${dayNumber}`, 'Asia/Baku').format('YYYY-MM-DD');
                
                dayCell.dataset.date = currentDate;
                dayCell.innerHTML = `<div class="day-number">${dayNumber}</div>`;
                
                const dayData = reservation.days.find(d => d.date === currentDate);

                if (dayData) {
                    dayCell.innerHTML += `<div class="day-price">${dayData.price} AZN</div>`;
                    const dot = document.createElement('div');
                    dot.className = `day-status-dot dot-${dayData.status}`;
                    dayCell.appendChild(dot);
                    dayCell.title = `Ödənilib: ${dayData.paid} AZN`;
                    dayCell.style.cursor = 'pointer';

                    dayCell.addEventListener('click', (e) => {
                        handleDayClick(e, dayCell, currentDate, dayData);
                    });
                } else {
                    dayCell.style.backgroundColor = "#f9fafb"; // Ayın boş günləri
                }
            }
            calendarGrid.appendChild(dayCell);
        }
    }

    function handleDayClick(e, cell, date, data) {
        if (!data) {
            clearSelection();
            updateSidePanel();
            return;
        }

        if (e.shiftKey || e.ctrlKey) {
            const index = selectedDays.indexOf(date);
            if (index > -1) {
                selectedDays.splice(index, 1);
                cell.classList.remove('selected');
            } else {
                selectedDays.push(date);
                cell.classList.add('selected');
            }
        } else {
            clearSelection();
            selectedDays = [date];
            cell.classList.add('selected');
        }
        
        updateSidePanel();
    }
    
    function clearSelection() {
        selectedDays = [];
        document.querySelectorAll('.day-cell.selected').forEach(c => c.classList.remove('selected'));
    }

    function updateSidePanel() {
        if (selectedDays.length === 0) {
            sidePanel.classList.remove('show');
            panelHelpText.style.display = 'block';
            return;
        }
        
        sidePanel.classList.add('show');
        panelHelpText.style.display = 'none';

        if (selectedDays.length === 1) {
            const date = selectedDays[0];
            const data = reservation.days.find(d => d.date === date);
            panelTitle.textContent = dayjs(date).format('DD MMMM YYYY');
            
            dayStatusEl.value = data.status;
            dayPriceEl.value = data.price;
            dayPaidAmountEl.value = data.paid;
            dayNotesEl.value = data.notes || '';
            multiSelectOptions.style.display = 'none';
            applyToAllSelectedEl.checked = false;
        } else {
            panelTitle.textContent = `${selectedDays.length} gün seçilib`;
            multiSelectOptions.style.display = 'block';
            dayEditorForm.reset();
        }
    }

    function updateSummary() {
        if (!reservation) {
            summarySection.style.display = 'none';
            return;
        }
        
        summarySection.style.display = 'block';
        summaryCarEl.textContent = reservation.carName || '';
        summaryCustomerEl.textContent = reservation.customerName || '';

        const { totalPrice, amountPaid } = reservation;
        const remaining = totalPrice - amountPaid;
        
        summaryExpectedEl.textContent = `${totalPrice.toFixed(2)} AZN`;
        summaryPaidEl.textContent = `${amountPaid.toFixed(2)} AZN`;
        summaryRemainingEl.textContent = `${remaining.toFixed(2)} AZN`;
    }

    dayEditorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const applyToAll = applyToAllSelectedEl.checked && selectedDays.length > 1;
        const targetDays = applyToAll ? selectedDays : [selectedDays[0]];

        const daysToUpdate = targetDays.map(date => {
            const dayData = reservation.days.find(d => d.date === date);
            
            // Qismən ödənişi düzgün hesablamaq üçün
            let newPaidAmount = dayData.paid;
            if(dayPaidAmountEl.value !== "") {
                 // Əgər tək gün seçilibsə, dəyəri birbaşa yaz
                 // Əgər çoxlu gün seçilibsə, hər günə bu məbləği əlavə et (bu məntiq dəyişə bilər)
                 newPaidAmount = Number(dayPaidAmountEl.value);
            }
            
            return {
                date: date,
                status: dayStatusEl.value || dayData.status,
                price: (dayPriceEl.value !== "") ? Number(dayPriceEl.value) : dayData.price,
                paid: newPaidAmount,
                notes: dayNotesEl.value || dayData.notes
            };
        });
        
        try {
            const res = await fetch(API.updateReservationDay(reservationId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daysToUpdate })
            });

            if (!res.ok) throw new Error('Dəyişiklik yadda saxlanılmadı');
            
            reservation = await res.json();
            
            renderCalendar(currentMoment);
            clearSelection();
            updateSidePanel();
            updateSummary();

        } catch (error) {
            alert(error.message);
        }
    });

    prevMonthBtn.addEventListener('click', () => {
        currentMoment = currentMoment.subtract(1, 'month');
        renderCalendar(currentMoment);
    });
    nextMonthBtn.addEventListener('click', () => {
        currentMoment = currentMoment.add(1, 'month');
        renderCalendar(currentMoment);
    });

    // İlkin yükləmə
    fetchReservation();
});
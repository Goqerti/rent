document.addEventListener('DOMContentLoaded', () => {
    // Day.js plaginlərini yoxlayıb əlavə edirik
    if (typeof dayjs !== 'undefined') {
        if (window.dayjs_plugin_utc) dayjs.extend(window.dayjs_plugin_utc);
        if (window.dayjs_plugin_timezone) dayjs.extend(window.dayjs_plugin_timezone);
    } else {
        console.error("Day.js kitabxanası yüklənməyib! Tarix hesablamaları işləməyəcək.");
        return;
    }

    // API ünvanları
    const api = {
        cars: '/api/cars',
        customers: '/api/customers',
        reservations: '/api/reservations',
        getReservation: (id) => `/api/reservations/${id}`,
        updateReservationDay: (id) => `/api/reservations/day/${id}`,
        extendReservation: (id) => `/api/reservations/extend/${id}`,
        checkConflict: '/api/reservations/check'
    };

    // Statusların tərcüməsi
    const L = {
        res: { BOOKED: 'Brondadır', COMPLETED: 'Bitdi', CANCELED: 'Ləğv edilib' }
    };

    const els = {
        // V1 Forması
        rCar: document.getElementById('rCar'),
        rCustomer: document.getElementById('rCustomer'),
        carSearchInput: document.getElementById('carSearchInput'),
        customerSearchInput: document.getElementById('customerSearchInput'),
        rStart: document.getElementById('rStart'),
        rEnd: document.getElementById('rEnd'),
        rDiscount: document.getElementById('rDiscount'),
        rTotal: document.getElementById('rTotal'),
        rUnitPrice: document.getElementById('rUnitPrice'),
        rDestination: document.getElementById('rDestination'),
        rDeposit: document.getElementById('rDeposit'),
        reservationsTbl: document.getElementById('reservationsTbl'),
        btnCreate: document.getElementById('btnCreate'),
        conflictWarn: document.getElementById('conflictWarn'),
        
        // V1 Müştəri Modalı
        custModal: document.getElementById('custModal'),
        mClose: document.getElementById('mClose'),
        mSave: document.getElementById('mSave'),
        btnNewCustomer: document.getElementById('btnNewCustomer'),

        // V1 Redaktə Modalı
        resModal: document.getElementById('resModal'),
        resClose: document.getElementById('resClose'),
        resSave: document.getElementById('resSave'),
        eStatus: document.getElementById('eStatus'),
        eDeposit: document.getElementById('eDeposit'),
        eNotes: document.getElementById('eNotes'),

        // V2 Təqvim Modalı
        calendarV2Modal: document.getElementById('calendarV2Modal'),
        closeCalendarModalBtn: document.getElementById('closeCalendarModalBtn'),
        calendarGrid: document.querySelector('.calendar-grid'),
        currentMonthYearEl: document.getElementById('currentMonthYear'),
        prevMonthBtn: document.getElementById('prevMonthBtn'),
        nextMonthBtn: document.getElementById('nextMonthBtn'),
        sidePanel: document.getElementById('sidePanel'),
        panelTitle: document.getElementById('panelTitle'),
        panelHelpText: document.getElementById('panelHelpText'),
        dayEditorForm: document.getElementById('dayEditorForm'),
        
        dayStatusEl: document.getElementById('dayStatus'),
        dayPriceEl: document.getElementById('dayPrice'),
        dayPaidAmountEl: document.getElementById('dayPaidAmount'),
        dayNotesEl: document.getElementById('dayNotes'),
        applyToAllSelectedEl: document.getElementById('applyToAllSelected'),
        multiSelectOptions: document.getElementById('multiSelectOptions'),
        
        // Günün qalıq borcu elementləri
        dayRemainingWrapper: document.getElementById('dayRemainingWrapper'),
        dayRemainingEl: document.getElementById('dayRemainingEl'),

        summarySection: document.getElementById('summarySection'),
        summaryCarEl: document.getElementById('summaryCar'),
        summaryCustomerEl: document.getElementById('summaryCustomer'),
        summaryExpectedEl: document.getElementById('summaryExpected'),
        summaryPaidEl: document.getElementById('summaryPaid'),
        summaryRemainingEl: document.getElementById('summaryRemaining'),

        // Görünüş düymələri
        tableViewBtn: document.getElementById('tableViewBtn'),
        calendarViewBtn: document.getElementById('calendarViewBtn'),
        calendarContainer: document.getElementById('calendar-container'),
        reservationsTableView: document.getElementById('reservations-table-view'),
        calendarEl: document.getElementById('calendar'),
    };

    // Qlobal Vəziyyət (State)
    let allCarsData = [];
    let allCustomersData = [];
    let editingResId = null; 
    
    // V2 Təqvim Vəziyyəti
    let V2_currentReservation = null;
    let V2_selectedDays = [];
    let V2_currentMoment = dayjs().tz('Asia/Baku');
    let calendarInstance = null; 

    function openModal(modalEl) { if(modalEl) modalEl.classList.add('show'); }
    function closeModal(modalEl) { if(modalEl) modalEl.classList.remove('show'); }

    // Günün qalıq borcunu hesablamaq üçün funksiya
    function updateDayRemaining() {
        if (!els.dayRemainingWrapper || !els.dayRemainingEl) return;

        const price = parseFloat(els.dayPriceEl.value) || 0;
        const paid = parseFloat(els.dayPaidAmountEl.value) || 0;

        // "Qiymət" xanası boşdursa (çoxlu seçim rejimi), qalıq borcu göstərmə
        if (els.dayPriceEl.value === "") {
            els.dayRemainingWrapper.style.display = 'none';
            return;
        }

        const remaining = price - paid;
        
        els.dayRemainingEl.textContent = `${remaining.toFixed(2)} AZN`;
        
        // Rəngi dəyişdir
        if (remaining > 0) {
            els.dayRemainingEl.style.color = 'var(--danger)'; // Qırmızı
        } else if (remaining === 0) {
            els.dayRemainingEl.style.color = 'var(--success)'; // Yaşıl
        } else {
            els.dayRemainingEl.style.color = 'var(--primary)'; // Göy (artıq ödəmə)
        }

        els.dayRemainingWrapper.style.display = 'block';
    }

    // Qiymət və ödənilən məbləğ xanalarına dinləyicilər
    if (els.dayPriceEl && els.dayPaidAmountEl) {
        els.dayPriceEl.addEventListener('input', updateDayRemaining);
        els.dayPaidAmountEl.addEventListener('input', updateDayRemaining);
    }
    
    // ====== V1 - SÜRƏTLİ REZERVASİYA FORMU MƏNTİQİ ======
    
    ['rCar', 'rStart', 'rEnd', 'rDiscount', 'rUnitPrice', 'rDeposit'].forEach(id => {
        if (els[id]) els[id].addEventListener('input', updatePreviewTotal);
    });

    if (els.carSearchInput) {
        els.carSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const availableCars = allCarsData.filter(c => c.status === 'FREE');
            const filteredCars = availableCars.filter(car => 
                (car.brand || '').toLowerCase().includes(query) ||
                (car.model || '').toLowerCase().includes(query) ||
                (car.plate || '').toLowerCase().includes(query) ||
                (car.plate || '').slice(-3).includes(query)
            );
            renderCarOptions(filteredCars);
        });
    }

    if (els.customerSearchInput) {
        els.customerSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filteredCustomers = allCustomersData.filter(customer => 
                (customer.firstName || '').toLowerCase().includes(query) ||
                (customer.lastName || '').toLowerCase().includes(query) ||
                (customer.phone || '').includes(query)
            );
            renderCustomerOptions(filteredCustomers);
        });
    }

    async function checkConflict(carId, startAt, endAt, warnElement, ignoreId = null) {
        if (!warnElement) return;
        warnElement.textContent = '';
        els.btnCreate.disabled = false;
        if (!carId || !startAt || !endAt) return;

        try {
            const res = await fetch(api.checkConflict, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carId, startAt, endAt, ignoreId })
            });
            const data = await res.json();
            if (data.overlap) {
                warnElement.textContent = '⚠️ Uyğun deyil: tarix kəsişməsi var';
                els.btnCreate.disabled = true;
            } else {
                warnElement.textContent = '✅ Bron üçün uyğundur.';
                els.btnCreate.disabled = false;
            }
        } catch (e) {
            warnElement.textContent = 'Yoxlama zamanı xəta.';
            els.btnCreate.disabled = true;
        }
    }

    async function updatePreviewTotal() {
        const carId = els.rCar.value;
        const start = els.rStart.value;
        const end = els.rEnd.value;
        const discount = Number(els.rDiscount.value || 0);
        const warn = els.conflictWarn;

        if (start && end && dayjs(end).isBefore(dayjs(start))) {
            warn.textContent = '⚠️ Bitmə tarixi başlama tarixindən əvvəl ola bilməz.';
            els.btnCreate.disabled = true;
            els.rTotal.value = '';
            return;
        }
        await checkConflict(carId, start, end, warn);
        if (!carId || !start || !end || els.btnCreate.disabled) {
            els.rTotal.value = '';
            return;
        }

        const car = allCarsData.find(c => c.id === carId);
        if (!car) return;

        // ==================================
        // DÜZƏLİŞ BURADADIR: Səhvən 3 gün sayan "+ 1" hissəsi silindi.
        const days = Math.max(1, dayjs(end).startOf('day').diff(dayjs(start).startOf('day'), 'day'));
        // ==================================
        
        const unit = els.rUnitPrice.value ? Number(els.rUnitPrice.value) : (car.basePricePerDay || 0);
        let gross = unit * days * (1 - discount / 100);
        els.rTotal.value = gross.toFixed(2) + ' AZN';
    }
    
    if (els.btnCreate) {
        els.btnCreate.addEventListener('click', async () => {
            const payload = {
                carId: els.rCar.value,
                customerId: els.rCustomer.value,
                startAt: els.rStart.value,
                endAt: els.rEnd.value,
                discountPercent: Number(els.rDiscount.value || 0),
                pricePerDay: els.rUnitPrice.value ? Number(els.rUnitPrice.value) : undefined,
                destination: els.rDestination.value || '',
                deposit: Number(els.rDeposit.value || 0)
            };
            if (!payload.carId || !payload.customerId || !payload.startAt || !payload.endAt) {
                return alert("Maşın, müştəri və tarixləri seçin.");
            }
            try {
                const res = await fetch(api.reservations, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || data.error || 'Xəta');
                
                ['rStart', 'rEnd', 'rDiscount', 'rUnitPrice', 'rDestination', 'rTotal', 'rDeposit', 'carSearchInput', 'customerSearchInput'].forEach(id => els[id].value = '');
                els.rCar.selectedIndex = 0;
                els.rCustomer.selectedIndex = 0;
                els.conflictWarn.textContent = '';

                await loadAll();
            } catch (e) {
                alert(e.message);
            }
        });
    }

    function renderReservationsTable(list = []) {
        if (!els.reservationsTbl) return;
        els.reservationsTbl.innerHTML = `<thead><tr><th>Müştəri</th><th>Maşın</th><th>Başlama</th><th>Bitmə</th><th>Gün</th><th>Cəmi Məbləğ</th><th>Qalıq Borc</th><th>Status</th><th>Ödəniş</th><th>Əməliyyat</th></tr></thead><tbody>` +
            list.map(r => {
                const car = allCarsData.find(c => c.id === r.carId) || {};
                const customer = allCustomersData.find(u => u.id === r.customerId) || {};
                
                let paymentStatusText = 'Ödənməyib';
                let rowClass = 'unpaid';
                let isOverdue = false;
                const amountPaid = Number(r.amountPaid || 0);
                const totalPrice = Number(r.totalPrice || 0);
                const remainingDebt = totalPrice - amountPaid;

                if (r.isPaid || (totalPrice > 0 && amountPaid >= totalPrice)) {
                    paymentStatusText = 'Tam Ödənilib';
                    rowClass = 'paid';
                } else if (amountPaid > 0 && amountPaid < totalPrice) {
                    paymentStatusText = 'Qismən Ödənilib';
                    rowClass = 'partially-paid';
                }

                if (r.status === 'BOOKED' && dayjs().isAfter(dayjs(r.endAt))) {
                    isOverdue = true;
                    rowClass = 'overdue';
                }
                
                const calendarButton = `<button class="btn btn-sm btn-info" data-action="calendar" data-id="${r.id}">Maliyyə</button>`;

                return `
                <tr class="${rowClass}" title="${isOverdue ? 'Bu rezervasiya GECİKMƏDƏDİR!' : ''}">
                    <td>${customer.firstName || ''} ${customer.lastName || ''}</td>
                    <td>${car.brand || ''} ${car.model || ''} (${car.plate || ''})</td>
                    <td>${fmt(r.startAt)}</td>
                    <td>${fmt(r.endAt)}</td>
                    <td>${Array.isArray(r.days) ? r.days.length : 'N/A'}</td>
                    <td><b>${(totalPrice).toFixed(2)} AZN</b></td>
                    <td><b>${(remainingDebt).toFixed(2)} AZN</b></td>
                    <td><span class="pill status-${(r.status||'').toLowerCase()}">${L.res[r.status] || r.status}</span></td>
                    <td>${paymentStatusText}</td>
                    <td>
                        <button class="btn btn-sm" data-action="edit" data-id="${r.id}">Redaktə</button>
                        ${calendarButton}
                        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${r.id}">Sil</button>
                    </td>
                </tr>`
            }).join('') + `</tbody>`;
    }

    if (els.reservationsTbl) {
        els.reservationsTbl.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            const id = e.target.dataset.id;
            if (!action || !id) return;
            
            if (action === 'edit') {
                const res = await fetch(api.getReservation(id));
                const reservation = await res.json();
                if (reservation) openResEdit(reservation);
            } else if (action === 'delete') {
                deleteReservation(id);
            } else if (action === 'calendar') {
                openCalendarModal(id);
            }
        });
    }
    
    function openResEdit(r) {
        editingResId = r.id;
        els.eStatus.value = r.status;
        els.eDeposit.value = r.deposit || 0;
        els.eNotes.value = r.notes || '';
        openModal(els.resModal);
    };

    if (els.resClose) els.resClose.addEventListener('click', () => closeModal(els.resModal));
    if (els.resSave) els.resSave.addEventListener('click', async () => {
        const payload = {
            status: els.eStatus.value,
            deposit: Number(els.eDeposit.value || 0),
            notes: els.eNotes.value
        };
        try {
            const res = await fetch(`${api.reservations}/${editingResId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Yenilənmədi');
            closeModal(els.resModal);
            await loadAll();
        } catch (e) {
            alert(e.message);
        }
    });

    async function deleteReservation(id){
        if (!confirm('Rezervi silmək istəyirsiniz?')) return;
        try {
            const res = await fetch(`${api.reservations}/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Silinmədi');
            await loadAll();
        } catch (e) {
            alert(e.message);
        }
    };
    
    function renderCarOptions(cars) {
        if (!els.rCar) return;
        const selectedValue = els.rCar.value;
        const availableCars = cars.filter(c => c.status === 'FREE');
        els.rCar.innerHTML = '<option value="">Maşın seçin</option>' + 
            availableCars.map(c => `<option value="${c.id}">${c.brand} ${c.model} (${c.plate}) — ${c.basePricePerDay || 0} AZN</option>`).join('');
        els.rCar.value = selectedValue;
    }
    function renderCustomerOptions(customers) {
        if (!els.rCustomer) return;
        const selectedValue = els.rCustomer.value;
        els.rCustomer.innerHTML = '<option value="">Müştəri seçin</option>' + 
            customers.map(c => `<option value="${c.id}">${c.firstName} ${c.lastName}${c.phone ? " — " + c.phone : ""}</option>`).join('');
        els.rCustomer.value = selectedValue;
    }

    async function loadAll() {
        try {
            const [reservations, cars, customers] = await Promise.all([
                fetch(api.reservations).then(res => res.json()),
                fetch(api.cars).then(res => res.json()),
                fetch(api.customers).then(res => res.json())
            ]);
            
            allCarsData = cars;
            allCustomersData = customers;
            
            renderCarOptions(allCarsData);
            renderCustomerOptions(allCustomersData);
            renderReservationsTable(reservations);
        } catch (e) {
            console.error("Failed to load data:", e);
            alert("Məlumatlar yüklənərkən xəta baş verdi.");
        }
    }
    
    // ====== V2 - MALİYYƏ TƏQVİMİ MƏNTİQİ ======

    async function openCalendarModal(reservationId) {
        V2_selectedDays = [];
        try {
            // Düzəliş: api (kiçik hərf)
            const res = await fetch(api.getReservation(reservationId));
            if (!res.ok) throw new Error('Rezervasiya məlumatları yüklənmədi');
            V2_currentReservation = await res.json();
            
            if (V2_currentReservation.days && V2_currentReservation.days.length > 0) {
                V2_currentMoment = dayjs.tz(V2_currentReservation.days[0].date, 'Asia/Baku');
            } else {
                V2_currentMoment = dayjs().tz('Asia/Baku'); 
            }
            
            const car = allCarsData.find(c => c.id === V2_currentReservation.carId) || {};
            const customer = allCustomersData.find(c => c.id === V2_currentReservation.customerId) || {};
            V2_currentReservation.carName = `${car.brand || ''} ${car.model || ''} (${car.plate || ''})`;
            V2_currentReservation.customerName = `${customer.firstName || ''} ${customer.lastName || ''}`;

            renderV2Calendar(V2_currentMoment);
            updateSidePanel();
            openModal(els.calendarV2Modal);
        } catch (error) {
            alert(error.message);
        }
    }

    function renderV2Calendar(date) {
        els.currentMonthYearEl.textContent = date.format('MMMM YYYY');
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
                
                const dayData = V2_currentReservation.days.find(d => d.date === currentDate);

                if (dayData) {
                    // Bu gün rezervasiyaya aiddir
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
                    // Boş gün (rezervasiyaya aid deyil)
                    dayCell.classList.add('available-to-add');
                    dayCell.title = "Günü rezervasiyaya əlavə et";
                    dayCell.style.cursor = 'pointer';
                    
                    dayCell.addEventListener('click', (e) => {
                        // data olaraq "null" ötürürük
                        handleDayClick(e, dayCell, currentDate, null); 
                    });
                }
            } else {
                 dayCell.classList.add('other-month'); // Əvvəlki ayın günləri
            }
            els.calendarGrid.appendChild(dayCell);
        }
    }

    function handleDayClick(e, cell, date, data) {
        // data ya obyektdir (mövcud gün), ya da null (yeni gün)
        
        if (e.shiftKey || e.ctrlKey) {
            const index = V2_selectedDays.indexOf(date);
            if (index > -1) {
                V2_selectedDays.splice(index, 1);
                cell.classList.remove('selected');
            } else {
                V2_selectedDays.push(date);
                cell.classList.add('selected');
            }
        } else {
            clearSelection();
            V2_selectedDays = [date];
            cell.classList.add('selected');
        }
        updateSidePanel();
    }
    
    function clearSelection() {
        V2_selectedDays = [];
        document.querySelectorAll('.day-cell.selected').forEach(c => c.classList.remove('selected'));
    }

    function updateSidePanel() {
        if (!V2_currentReservation) return;

        if (V2_selectedDays.length === 0) {
            els.sidePanel.classList.remove('show');
            els.panelHelpText.style.display = 'block';
            if (els.dayRemainingWrapper) els.dayRemainingWrapper.style.display = 'none'; // Qalığı gizlət
        } else {
            els.sidePanel.classList.add('show');
            els.panelHelpText.style.display = 'none';

            if (V2_selectedDays.length === 1) {
                const date = V2_selectedDays[0];
                // Günü mövcud rezervasiya günlərindən axtar
                const data = V2_currentReservation.days.find(d => d.date === date);
                
                if (data) {
                    // MÖVCUD GÜN: Formu data ilə doldur
                    els.panelTitle.textContent = dayjs(date).format('DD MMMM YYYY');
                    els.dayStatusEl.value = data.status;
                    els.dayPriceEl.value = data.price;
                    els.dayPaidAmountEl.value = data.paid;
                    els.dayNotesEl.value = data.notes || '';
                } else {
                    // YENİ GÜN: Formu standart dəyərlərlə doldur
                    els.panelTitle.textContent = `${dayjs(date).format('DD MMMM YYYY')} (Yeni)`;
                    
                    // Standart qiyməti rezervasiyanın özündən götür
                    const defaultPrice = V2_currentReservation.pricePerDay || 0; 
                    
                    els.dayStatusEl.value = 'unpaid';
                    els.dayPriceEl.value = defaultPrice;
                    els.dayPaidAmountEl.value = 0;
                    els.dayNotesEl.value = '';
                }

                els.multiSelectOptions.style.display = 'none';
                els.applyToAllSelectedEl.checked = false;
                
                // Qalıq borcu dərhal hesabla
                updateDayRemaining();

            } else {
                // ÇOXLU SEÇİM
                els.panelTitle.textContent = `${V2_selectedDays.length} gün seçilib`;
                els.multiSelectOptions.style.display = 'block';
                els.dayEditorForm.reset(); 
                
                // Çoxlu seçimdə qalıq borcu gizlət
                if (els.dayRemainingWrapper) {
                    els.dayRemainingWrapper.style.display = 'none';
                }
            }
        }
        updateSummary();
    }

    function updateSummary() {
        if (!V2_currentReservation) {
            els.summarySection.style.display = 'none';
            return;
        }
        
        els.summarySection.style.display = 'block';
        els.summaryCarEl.textContent = V2_currentReservation.carName || '';
        els.summaryCustomerEl.textContent = V2_currentReservation.customerName || '';

        // Ümumi məbləği rezervasiyadan götürək (server onsuz da hesablayıb)
        const { totalPrice, amountPaid } = V2_currentReservation;
        const remaining = totalPrice - amountPaid;
        
        els.summaryExpectedEl.textContent = `${totalPrice.toFixed(2)} AZN`;
        els.summaryPaidEl.textContent = `${amountPaid.toFixed(2)} AZN`;
        els.summaryRemainingEl.textContent = `${remaining.toFixed(2)} AZN`;
    }

    els.dayEditorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const applyToAll = els.applyToAllSelectedEl.checked && V2_selectedDays.length > 1;
        const targetDays = applyToAll ? V2_selectedDays : (V2_selectedDays.length > 0 ? [V2_selectedDays[0]] : []);
        if (targetDays.length === 0) return;

        const daysToUpdate = targetDays.map(date => {
            // Günün mövcud datasını tap (yoxdursa 'null' olacaq)
            const dayData = V2_currentReservation.days.find(d => d.date === date);
            
            // Mövcud dəyərləri təyin et (əgər varsa)
            const currentStatus = dayData ? dayData.status : 'unpaid';
            const currentPrice = dayData ? dayData.price : (V2_currentReservation.pricePerDay || 0); // Yeni gün üçün standart qiymət
            const currentPaid = dayData ? dayData.paid : 0;
            const currentNotes = dayData ? dayData.notes : '';

            // Formdan gələn dəyərləri götür (boşdursa, mövcud dəyəri saxla)
            let newPaidAmount = (els.dayPaidAmountEl.value !== "") ? Number(els.dayPaidAmountEl.value) : currentPaid;
            let newPrice = (els.dayPriceEl.value !== "") ? Number(els.dayPriceEl.value) : currentPrice;
            
            return {
                date: date,
                status: els.dayStatusEl.value || currentStatus,
                price: newPrice,
                paid: newPaidAmount,
                notes: els.dayNotesEl.value || currentNotes
            };
        });
        
        try {
            // Düzəliş: api (kiçik hərf)
            const res = await fetch(api.updateReservationDay(V2_currentReservation.id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daysToUpdate })
            });

            if (!res.ok) throw new Error('Dəyişiklik yadda saxlanılmadı');
            
            // Serverdən gələn YENİLƏNMİŞ rezervasiya obyektini mənimsə
            V2_currentReservation = await res.json();
            
            renderV2Calendar(V2_currentMoment);
            clearSelection();
            updateSidePanel(); 
            updateSummary(); // Ümumi yekunları da yenilə

        } catch (error) {
            alert(error.message);
        }
    });

    els.prevMonthBtn.addEventListener('click', () => {
        V2_currentMoment = V2_currentMoment.subtract(1, 'month');
        renderV2Calendar(V2_currentMoment);
    });
    els.nextMonthBtn.addEventListener('click', () => {
        V2_currentMoment = V2_currentMoment.add(1, 'month');
        renderV2Calendar(V2_currentMoment);
    });
    els.closeCalendarModalBtn.addEventListener('click', () => {
        closeModal(els.calendarV2Modal);
        loadAll(); // Əsas səhifədəki cədvəli yeniləmək üçün
    });
    
    // Yeni müştəri modalı üçün dinləyicilər
    if(els.custModal) {
        els.mClose.addEventListener('click', () => closeModal(els.custModal));
        els.btnNewCustomer.addEventListener('click', () => {
            document.getElementById('mFirst').value = '';
            document.getElementById('mLast').value = '';
            document.getElementById('mPhone').value = '';
            document.getElementById('mEmail').value = '';
            document.getElementById('mIdCard').value = '';
            openModal(els.custModal);
        });
        els.mSave.addEventListener('click', async () => {
            const form = new FormData();
            form.append('firstName', document.getElementById('mFirst').value);
            form.append('lastName', document.getElementById('mLast').value);
            form.append('phone', document.getElementById('mPhone').value);
            form.append('email', document.getElementById('mEmail').value);
            
            const idCardFile = document.getElementById('mIdCard').files[0];
            if (idCardFile) {
                form.append('idCard', idCardFile);
            }
            
            try {
                const res = await fetch(api.customers, { method: 'POST', body: form });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Müştəri əlavə edilə bilmədi');
                
                await loadAll(); 
                els.rCustomer.value = data.id; 
                closeModal(els.custModal);
            } catch (e) {
                alert(e.message);
            }
        });
    }

    const fmt = (dt) => { try { return new Date(dt).toLocaleString('az-AZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return dt; } }
    loadAll();
});
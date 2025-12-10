document.addEventListener('DOMContentLoaded', () => {
    // API ünvanları
    const API = {
        customers: '/api/customers',
        reservations: '/api/reservations',
        getReservation: (id) => `/api/reservations/${id}`,
        addPayment: (id) => `/api/reservations/${id}/payment`, // YENİ
        fines: '/api/fines',
        cars: '/api/cars',
        getCustomerDoc: (id) => `/api/document/${id}`,
        updateCustomer: (id) => `/api/customers/${id}`,
        deleteCustomer: (id) => `/api/customers/${id}`
    };

    // Bütün HTML elementləri
    const els = {
        table: document.getElementById('table'),
        kpiTotal: document.getElementById('kpiTotal'),
        kpiDebt: document.getElementById('kpiDebt'),
        kpiDebtSum: document.getElementById('kpiDebtSum'),
        searchInput: document.getElementById('q'),
        tags: document.querySelectorAll('.tag'),
        newCustomerBtn: document.getElementById('newBtn'),
        
        // Modal (Yeni/Redaktə)
        backdrop: document.getElementById('backdrop'),
        customerModal: document.getElementById('customerModal'),
        customerModalClose: document.getElementById('customerModalClose'),
        customerForm: document.getElementById('customerForm'),
        customerModalTitle: document.getElementById('customerModalTitle'),
        customerIdInput: document.getElementById('customerId'),
        firstNameInput: document.getElementById('firstName'),
        lastNameInput: document.getElementById('lastName'),
        phoneInput: document.getElementById('phone'),
        emailInput: document.getElementById('email'),
        idCardInput: document.getElementById('idCard'),
        currentDocLink: document.getElementById('currentDocLink'),

        // YENİ: Ödəniş Modalı
        paymentModal: document.getElementById('paymentModal'),
        paymentModalClose: document.getElementById('paymentModalClose'),
        paymentModalSave: document.getElementById('paymentModalSave'),
        pBronId: document.getElementById('pBronId'),
        pCarInfo: document.getElementById('pCarInfo'),
        pBronDebt: document.getElementById('pBronDebt'),
        pAmount: document.getElementById('pAmount'),
        pNotes: document.getElementById('pNotes'),

        // Drawer (Detallar)
        drawer: document.getElementById('drawer'),
        drawerClose: document.getElementById('close'),
        dAvatar: document.getElementById('dAvatar'),
        dName: document.getElementById('dName'),
        dPhone: document.getElementById('dPhone'),
        dTotalSpent: document.getElementById('dTotalSpent'),
        dTotalPaid: document.getElementById('dTotalPaid'),
        dDebt: document.getElementById('dDebt'),
        dBookings: document.getElementById('dBookings'),
        dLastActive: document.getElementById('dLastActive'),
        dBookingsList: document.getElementById('dBookingsList'),
        dFinesList: document.getElementById('dFinesList'),
        dNotes: document.getElementById('dNotes'),
        dBlacklist: document.getElementById('dBlacklist'),
        btnSaveNotes: document.getElementById('btnSaveNotes'),
        dUpdated: document.getElementById('dUpdated'),
        
        // Drawer Əməliyyatlar
        //btnPay: document.getElementById('btnPay'), // Artıq bron üzrə olacaq
        btnNewBooking: document.getElementById('btnNewBooking'),
        btnEdit: document.getElementById('btnEdit'),
        btnDelete: document.getElementById('btnDelete'),
    };

    // Qlobal vəziyyət (State)
    let allCustomers = [];
    let allReservations = [];
    let allFines = [];
    let allCars = [];
    let state = { scope: 'all', q: '' };
    let currentCustomerId = null;

    // === Köməkçi Funksiyalar ===
    const currency = (v) => (v || 0).toLocaleString('az-Latn-AZ', { style: 'currency', currency: 'AZN', maximumFractionDigits: 0 });
    const percent = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;
    const initials = (name = '') => (name || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const fmtDate = (dt) => dt ? dayjs(dt).format('DD.MM.YYYY') : '-';

    // Müştərinin bütün maliyyə vəziyyətini hesablayır
    function getCustomerTotals(customerId) {
        const customerReservations = allReservations.filter(r => r.customerId === customerId && r.status !== 'CANCELED');
        const customerFines = allFines.filter(f => f.customerId === customerId);

        let totalSpent = 0;
        let totalPaid = 0;
        let totalDebt = 0;
        
        customerReservations.forEach(r => {
            const price = r.totalPrice || 0;
            const paid = r.amountPaid || 0;
            totalSpent += price;
            totalPaid += paid;
            if (price > paid) {
                totalDebt += (price - paid);
            }
        });

        customerFines.forEach(f => {
            const price = f.amount || 0;
            const paid = f.amountPaid || 0;
            totalSpent += price; // Cərimə də bir xərcdir
            totalPaid += paid;
            if (price > paid) {
                totalDebt += (price - paid);
            }
        });

        const activeBookings = customerReservations.filter(r => r.status === 'BOOKED').length;
        const lastBooking = customerReservations.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        
        return {
            totalSpent,
            totalPaid,
            debt: totalDebt,
            bookingCount: customerReservations.length,
            activeBookingCount: activeBookings,
            lastActivity: lastBooking ? fmtDate(lastBooking.createdAt) : '-',
            isDebtor: totalDebt > 0,
            isActive: activeBookings > 0
        };
    }

    // === Əsas Məntiq ===
    
    // Bütün məlumatları serverdən bir dəfəyə çəkir
    async function init() {
        try {
            const [customers, reservations, fines, cars] = await Promise.all([
                fetch(API.customers).then(res => res.json()),
                fetch(API.reservations).then(res => res.json()),
                fetch(API.fines).then(res => res.json()),
                fetch(API.cars).then(res => res.json())
            ]);
            
            allCustomers = customers;
            allReservations = reservations;
            allFines = fines.items || []; // Fines API fərqli formatdadır
            allCars = cars;
            
            render();
        } catch (error) {
            console.error("Məlumatlar yüklənərkən xəta:", error);
            els.table.innerHTML = '<div class="empty">Xəta: Məlumatlar yüklənə bilmədi.</div>';
        }
    }

    // Əsas cədvəli və KPI-ları yeniləyir
    function render() {
        let rows = [...allCustomers];
        
        // Hər müştəri üçün hesablamaları əlavə edirik
        rows = rows.map(c => {
            return {
                ...c,
                totals: getCustomerTotals(c.id)
            };
        });

        // Filtrləmə (Filter)
        if (state.q) {
            const q = state.q.toLowerCase();
            rows = rows.filter(c => (c.firstName + c.lastName + c.phone + (c.email || "")).toLowerCase().includes(q));
        }
        if (state.scope === 'debtors') rows = rows.filter(c => c.totals.isDebtor);
        if (state.scope === 'active') rows = rows.filter(c => c.totals.isActive);
        if (state.scope === 'inactive') rows = rows.filter(c => !c.totals.isActive && c.totals.bookingCount === 0);

        // KPI-ları hesablayırıq
        els.kpiTotal.textContent = rows.length;
        const debtors = rows.filter(r => r.totals.isDebtor);
        els.kpiDebt.textContent = debtors.length;
        const totalDebtSum = debtors.reduce((s, r) => s + r.totals.debt, 0);
        els.kpiDebtSum.textContent = currency(totalDebtSum);

        // Cədvəli yaradırıq
        els.table.innerHTML = '';
        if (rows.length === 0) {
            els.table.innerHTML = '<div class="empty">Nəticə tapılmadı</div>';
            return;
        }

        rows.forEach(c => {
            const t = c.totals;
            const row = document.createElement('div');
            row.className = 'row';
            row.dataset.id = c.id;
            
            let statusBadge = '<span class="badge">Passiv</span>';
            if (c.isBlacklisted) {
                statusBadge = '<span class="badge err">Qara Siyahı</span>';
            } else if (t.isActive) {
                statusBadge = '<span class="badge ok">Aktiv</span>';
            }
            
            let debtBadge = '<span class="badge ok">0 ₼</span>';
            if (t.debt > 0) debtBadge = `<span class="badge err">${currency(t.debt)}</span>`;
            
            row.innerHTML = `
              <div class="name"><div class="avatar">${initials(c.firstName)}</div><div>
                <div style="font-weight:600">${c.firstName} ${c.lastName}</div>
                <div style="color:var(--muted);font-size:12px">${c.status || 'Standart'}</div></div>
              </div>
              <div class="mono">${c.phone}</div>
              <div>${c.email || '<span style="color:var(--muted)">Qeyd edilməyib</span>'}</div>
              <div>${statusBadge}</div>
              <div class="mono">${t.activeBookingCount}</div>
              <div class="mono">${debtBadge}</div>
              <div class="mono">${percent(t.totalPaid, t.totalSpent)}%</div>
              <div><button class="btn small ghost" data-id="${c.id}">Bax</button></div>
            `;
            
            row.addEventListener('click', e => {
                openDrawer(c.id);
            });
            els.table.appendChild(row);
        });
    }

    // === Detal Pəncərəsi (Drawer) Məntiqi ===
    
    function openDrawer(id) {
        currentCustomerId = id;
        const c = allCustomers.find(x => x.id === id);
        if (!c) return;
        
        const t = getCustomerTotals(id);
        
        // Başlıq
        els.dAvatar.textContent = initials(c.firstName);
        els.dName.textContent = `${c.firstName} ${c.lastName}`;
        els.dPhone.textContent = (c.phone || '') + (c.email ? ` · ${c.email}` : '');

        // KPI Pills
        els.dTotalSpent.textContent = currency(t.totalSpent);
        els.dTotalPaid.textContent = currency(t.totalPaid);
        els.dDebt.textContent = currency(t.debt);
        els.dBookings.textContent = t.bookingCount;
        els.dLastActive.textContent = t.lastActivity;

        // Bronlar Siyahısı
        const customerReservations = allReservations
            .filter(r => r.customerId === id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
        els.dBookingsList.innerHTML = '';
        if (customerReservations.length === 0) {
            els.dBookingsList.innerHTML = '<div class="empty">Bron yoxdur</div>';
        } else {
            customerReservations.forEach(b => {
                const car = allCars.find(car => car.id === b.carId) || {};
                const carName = `${car.brand || ''} ${car.model || ''}`;
                const debt = (b.totalPrice || 0) - (b.amountPaid || 0);
                const badge = debt > 0 ? `<span class="badge err">Borc: ${currency(debt)}</span>` : `<span class="badge ok">Tam ödənilib</span>`;
                const payButton = debt > 0 ? 
                    `<button class="btn small primary" data-action="pay" data-id="${b.id}" data-debt="${debt}" data-car="${carName}">Ödəniş et</button>` : 
                    '';
                
                const el = document.createElement('div');
                el.className = 'card-inner';
                el.innerHTML = `
                  <header>
                    <div style="display:flex;gap:10px;align-items:center">
                      <div class="badge">${b.id.slice(-6)}</div>
                      <div><b>${carName}</b><div style="color:var(--muted);font-size:12px">${fmtDate(b.startAt)} → ${fmtDate(b.endAt)}</div></div>
                    </div>
                    ${badge}
                  </header>
                  <div class="payline"><span>Məbləğ:</span><b>${currency(b.totalPrice)}</b></div>
                  <div class="payline"><span>Ödənilib:</span><b>${currency(b.amountPaid)}</b></div>
                  <div class="buttons" style="margin-top:8px">
                    ${payButton}
                    <button class="btn small ghost" data-action="details" data-id="${b.id}">Maliyyə Detalları</button>
                  </div>
                `;
                els.dBookingsList.appendChild(el);
            });
        }
        
        // Cərimələr Siyahısı
        const customerFines = allFines.filter(f => f.customerId === id);
        els.dFinesList.innerHTML = '';
        if(customerFines.length === 0) {
            els.dFinesList.innerHTML = '<div class="empty">Cərimə yoxdur</div>';
        } else {
            customerFines.forEach(f => {
                const car = allCars.find(car => car.id === f.carId) || {};
                const debt = (f.amount || 0) - (f.amountPaid || 0);
                const badge = debt > 0 ? `<span class="badge err">Borc: ${currency(debt)}</span>` : `<span class="badge ok">Tam ödənilib</span>`;
                const el = document.createElement('div');
                el.className = 'card-inner';
                el.innerHTML = `
                  <header>
                    <div style="display:flex;gap:10px;align-items:center">
                      <div class="badge">CƏRİMƏ</div>
                      <div><b>${car.brand || ''} ${car.model || ''}</b><div style="color:var(--muted);font-size:12px">Tarix: ${fmtDate(f.date)}</div></div>
                    </div>
                    ${badge}
                  </header>
                  <div class="payline"><span>Məbləğ:</span><b>${currency(f.amount)}</b></div>
                  <div class="payline"><span>Ödənilib:</span><b>${currency(f.amountPaid)}</b></div>
                `;
                els.dFinesList.appendChild(el);
            });
        }

        // Qeydlər
        els.dNotes.value = c.notes || '';
        els.dBlacklist.checked = c.isBlacklisted || false;
        els.dUpdated.textContent = fmtDate(c.updatedAt) || '-';

        els.drawer.classList.add('open');
        els.backdrop.classList.add('open');
    }
    
    function closeDrawer() {
        currentCustomerId = null;
        els.drawer.classList.remove('open');
        els.backdrop.classList.remove('open');
    }

    // === Modal Məntiqi (Yeni/Redaktə) ===
    
    function openModal(customerId = null) {
        els.customerForm.reset();
        els.currentDocLink.style.display = 'none';

        if (customerId) {
            // Redaktə rejimi
            const c = allCustomers.find(x => x.id === customerId);
            if (!c) return;
            
            els.customerModalTitle.textContent = 'Məlumatı Dəyiş';
            els.customerIdInput.value = c.id;
            els.firstNameInput.value = c.firstName;
            els.lastNameInput.value = c.lastName;
            els.phoneInput.value = c.phone;
            els.emailInput.value = c.email || '';
            if (c.idCardPath) {
                els.currentDocLink.href = c.idCardPath;
                els.currentDocLink.style.display = 'block';
            }
        } else {
            // Yeni müştəri rejimi
            els.customerModalTitle.textContent = 'Yeni Müştəri';
            els.customerIdInput.value = '';
        }
        
        els.customerModal.classList.add('show');
        els.backdrop.classList.add('open');
    }
    
    function closeModal(modalElement = els.customerModal) {
        modalElement.classList.remove('show');
        // Əgər başqa heç bir modal/drawer açıq deyilsə, backdrop-u bağla
        if (!els.drawer.classList.contains('open') && !els.paymentModal.classList.contains('show')) {
            els.backdrop.classList.remove('open');
        }
    }

    // === YENİ: Ödəniş Modalı Məntiqi ===
    function openPaymentModal(resId, carName, currentDebt) {
        els.paymentModal.dataset.id = resId; // ID-ni modalın özündə saxlayırıq
        els.pBronId.textContent = resId.slice(-6);
        els.pCarInfo.textContent = carName;
        els.pBronDebt.textContent = currency(currentDebt);
        els.pAmount.value = currentDebt; // Avtomatik olaraq tam borcu doldurur
        els.pNotes.value = '';
        
        els.paymentModal.classList.add('show');
        els.backdrop.classList.add('open');
    }

    // === Hadisə Dinləyiciləri (Event Listeners) ===

    // Axtarış
    els.searchInput.addEventListener('input', e => {
        state.q = e.target.value.trim();
        render();
    });

    // Filtrlər
    els.tags.forEach(tag => {
        tag.addEventListener('click', () => {
            els.tags.forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            state.scope = tag.dataset.scope;
            render();
        });
    });

    // Drawer bağlama
    els.drawerClose.onclick = closeDrawer;
    
    // Modal açma/bağlama
    els.newCustomerBtn.onclick = () => openModal();
    els.customerModalClose.onclick = () => closeModal(els.customerModal);
    
    // YENİ: Ödəniş modalı bağlama
    els.paymentModalClose.onclick = () => closeModal(els.paymentModal);

    // Backdrop kliklədikdə həm drawer, həm modallar bağlansın
    els.backdrop.addEventListener('click', () => {
        closeDrawer();
        closeModal(els.customerModal);
        closeModal(els.paymentModal);
    });
    
    // Yeni/Redaktə Forması
    els.customerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = els.customerIdInput.value;
        const formData = new FormData(els.customerForm);
        
        try {
            let response;
            if (id) {
                // Redaktə (Faylsız, server.js-ə uyğunlaşdırıldı)
                const jsonData = {
                    firstName: formData.get('firstName'),
                    lastName: formData.get('lastName'),
                    phone: formData.get('phone'),
                    email: formData.get('email'),
                };
                 response = await fetch(API.updateCustomer(id), {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(jsonData)
                });
            } else {
                // Yeni (Fayllı)
                response = await fetch(API.customers, {
                    method: 'POST',
                    body: formData
                });
            }

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Server xətası');
            }
            
            closeModal(els.customerModal);
            await init(); // Bütün datanı yenilə
            
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    });

    // YENİ: Ödəniş Forması (Save)
    els.paymentModalSave.addEventListener('click', async () => {
        const resId = els.paymentModal.dataset.id;
        const amount = els.pAmount.value;
        
        if (!resId || !amount || Number(amount) <= 0) {
            return alert('Məbləği düzgün daxil edin.');
        }

        try {
            const response = await fetch(API.addPayment(resId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: Number(amount) })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Ödəniş qəbul edilmədi');
            }
            
            // Hər şey uğurludur
            closeModal(els.paymentModal);
            
            // Dataları yeniləyirik (ən asan yol serverdən yenidən çəkməkdir)
            await init();
            
            // Draweri yenilənmiş məlumatla yenidən açırıq
            if (currentCustomerId) {
                openDrawer(currentCustomerId);
            }
            
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    });

    // YENİ: Drawer içindəki bron siyahısındakı düymələr
    els.dBookingsList.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        const action = target.dataset.action;
        const id = target.dataset.id;
        
        if (action === 'pay') {
            const debt = target.dataset.debt;
            const carName = target.dataset.car;
            openPaymentModal(id, carName, parseFloat(debt));
        }
        
        if (action === 'details') {
            // Yeni pəncərədə rezervasiyanın maliyyə səhifəsinə yönləndir
            window.open(`/public/reservations.html?open_finance=${id}`, '_blank');
        }
    });
    
    // Drawer daxili əməliyyatlar
    els.btnEdit.onclick = () => {
        if (currentCustomerId) {
            openModal(currentCustomerId);
        }
    };
    
    els.btnDelete.onclick = async () => {
        if (!currentCustomerId) return;
        if (confirm('Bu müştərini silməyə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.')) {
            try {
                const response = await fetch(API.deleteCustomer(currentCustomerId), { method: 'DELETE' });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Server xətası');
                }
                closeDrawer();
                await init(); // Siyahını yenilə
            } catch (error) {
                alert(`Xəta: ${error.message}`);
            }
        }
    };
    
    els.btnSaveNotes.onclick = async () => {
        if (!currentCustomerId) return;
        
        const payload = {
            notes: els.dNotes.value,
            isBlacklisted: els.dBlacklist.checked
        };
        
        try {
            // Bu endpoint (PATCH /api/customers/:id) server.js-də düzgün işləyir
            const response = await fetch(API.updateCustomer(currentCustomerId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Qeydlər yadda saxlanılmadı');
            
            // Lokal datanı yeniləyirik
            const index = allCustomers.findIndex(c => c.id === currentCustomerId);
            if (index !== -1) {
                allCustomers[index].notes = payload.notes;
                allCustomers[index].isBlacklisted = payload.isBlacklisted;
                allCustomers[index].updatedAt = new Date().toISOString();
                els.dUpdated.textContent = fmtDate(allCustomers[index].updatedAt);
            }
            alert('Qeydlər yadda saxlanıldı.');
            render(); // Cədvəli yenilə (status dəyişə bilər)
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    };
    
    els.btnNewBooking.onclick = () => {
        if (currentCustomerId) {
            // Müştərini rezervasiya səhifəsinə yönləndiririk
            window.location.href = `/public/reservations.html?customer_id=${currentCustomerId}`;
        }
    };

    // Səhifəni yüklə
    init();
});
document.addEventListener('DOMContentLoaded', () => {
    // Day.js plaginlərini əlavə edirik
    dayjs.extend(window.dayjs_plugin_utc);
    dayjs.extend(window.dayjs_plugin_timezone);
    dayjs.extend(window.dayjs_plugin_isSameOrAfter);
    dayjs.extend(window.dayjs_plugin_isSameOrBefore);
    const DEFAULT_TZ = 'Asia/Baku';

    // API ünvanları
    const API = {
        reservations: '/api/reservations',
        adminExpenses: '/api/admin-expenses',
        carExpenses: '/api/car-expenses',
        fines: '/api/fines',
        incomes: '/api/incomes',
        cars: '/api/cars',
        customers: '/api/customers',
        updateReservationDay: (id) => `/api/reservations/day/${id}`
    };

    // HTML elementləri
    const els = {
        periodType: document.getElementById('periodType'),
        filterDayControls: document.getElementById('filterDayControls'),
        filterMonthControls: document.getElementById('filterMonthControls'),
        filterYearControls: document.getElementById('filterYearControls'),
        
        dayFilter: document.getElementById('dayFilter'),
        monthFilter: document.getElementById('monthFilter'),
        yearFilterMonth: document.getElementById('yearFilterMonth'),
        yearFilter: document.getElementById('yearFilter'),
        printReportBtn: document.getElementById('printReportBtn'),
        
        // KPI Kartları (accounting.html-dəki ID-lərə uyğun olaraq)
        kpiRecognized: document.getElementById('kpiRecognized').querySelector('.value'),
        kpiTotalExpenses: document.getElementById('kpiTotalExpenses').querySelector('.value'),
        kpiNet: document.getElementById('kpiNet').querySelector('.value'),
        kpiExpected: document.getElementById('kpiExpected').querySelector('.value'),
        kpiPending: document.getElementById('kpiPending').querySelector('.value'),
        
        // Siyahılar (accounting.html-dəki ID-lərə uyğun olaraq)
        listRecognized: document.getElementById('listRecognized'),
        listFines: document.getElementById('listFines'),
        listIncomes: document.getElementById('listIncomes'),
        listPending: document.getElementById('listPending'),
        listPendingFines: document.getElementById('listPendingFines') // Ödənilməmiş cərimələr üçün
    };

    // Qlobal Vəziyyət (State)
    let allReservations = [];
    let allAdminExpenses = [];
    let allCarExpenses = [];
    let allFines = [];
    let allIncomes = [];
    let allCars = [];
    let allCustomers = [];
    const today = dayjs().tz(DEFAULT_TZ);

    // Köməkçi funksiyalar
    const AZN = (v) => (v || 0).toLocaleString('az-Latn-AZ', { style: 'currency', currency: 'AZN', maximumFractionDigits: 2 });
    
    // === HESABAT MƏNTİQİ (DÜZGÜN V2 - HƏR GÜNÜN UÇOTU) ===
    
    function calculateV2Report(period) {
        const { start, end } = period;

        let kpi = {
            // Rezervasiyalar
            expected_res: 0,    // Gözlənilən: Perioddakı günlərin 'price' cəmi
            recognized_res: 0,  // Tanınmış: Perioddakı günlərin 'paid' cəmi (KASSA)
            pending_res: 0,     // Gözləmədə: Perioddakı günlərin (price - paid) cəmi (BORC)
            // Cərimələr
            recognized_fines: 0, // Tanınmış (Ödənilmiş Cərimələr) (KASSA)
            expected_fines: 0,   // Gözlənilən (Bütün cərimələr)
            pending_fines: 0,    // Gözləmədə (Ödənilməyən cərimələr) (BORC)
            // Digər Gəlirlər
            recognized_incomes: 0, // Tanınmış (Mədaxil) (KASSA)
            // Xərclər
            adminCosts: 0,
            carCosts: 0,
            // Yekun
            total_recognized: 0, // CƏMİ GƏLİR (KASSA)
            total_expenses: 0,   // CƏMİ XƏRC (KASSA)
            net: 0,              // XALİS MƏNFƏƏT (KASSA BALANSI)
            total_expected: 0,   // CƏMİ QAZANC (HESABLAMA METODU)
            total_pending: 0     // CƏMİ BORC (GÖZLƏMƏDƏ)
        };

        let paidDayEntries = [];
        let pendingDayEntries = [];
        let paidFines = [];
        let pendingFines = []; // Ödənilməmiş cərimələr üçün
        let otherIncomes = [];

        // 1. Rezervasiya Gəlirlərini Hesablayırıq (GÜN-BƏ-GÜN)
        allReservations.forEach(res => {
            if (res.status === 'CANCELED' || !res.days) return;
            
            res.days.forEach(day => {
                const dayDate = dayjs.tz(day.date, DEFAULT_TZ);
                
                // Yoxlayırıq: bu GÜN bizim seçdiyimiz dövrə düşürmü?
                if (dayDate.isSameOrAfter(start, 'day') && dayDate.isSameOrBefore(end, 'day')) {
                    
                    const price = Number(day.price || 0);
                    const paid = Number(day.paid || 0);
                    const debt = price - paid;

                    kpi.expected_res += price;
                    kpi.recognized_res += paid;
                    
                    if (debt > 0) {
                        kpi.pending_res += debt;
                    }

                    const entry = {
                        resId: res.id,
                        dayDate: day.date,
                        price: price,
                        paid: paid,
                        debt: debt,
                        status: day.status,
                        customerId: res.customerId,
                        carId: res.carId
                    };

                    if (debt > 0) {
                        pendingDayEntries.push(entry);
                    } else if (paid > 0) { 
                        paidDayEntries.push(entry);
                    }
                }
            });
        });

        // 2. Cərimə Gəlirlərini Hesablayırıq (date və isPaid görə)
        allFines.forEach(f => {
            const fineDate = dayjs.tz(f.date, DEFAULT_TZ);
            if (fineDate.isSameOrAfter(start, 'day') && fineDate.isSameOrBefore(end, 'day')) {
                const fineAmount = Number(f.amount || 0);
                
                // GÖZLƏNİLƏN: Cərimə bu dövrdə yazılıbsa, məbləği "Ümumi Qazanc"a (expected) əlavə edirik.
                kpi.expected_fines += fineAmount; 
                
                if (f.isPaid) {
                    // KASSA: Əgər ödənilibsə, "Kassa Mədaxili"nə (recognized) əlavə edirik.
                    const paidAmount = Number(f.amountPaid || fineAmount);
                    kpi.recognized_fines += paidAmount;
                    paidFines.push({ ...f, paidAmount: paidAmount });
                } else {
                    // BORCLAR: Əgər ödənilməyibsə, borcu "Gözləmədə" (pending) borclara əlavə edirik.
                    const debtAmount = fineAmount - Number(f.amountPaid || 0);
                    kpi.pending_fines += debtAmount;
                    pendingFines.push(f);
                }
            }
        });

        // 3. Digər Mədaxili Hesablayırıq (date görə) - (Bunlar həmişə Kassa sayılır)
        allIncomes.forEach(i => {
            const incomeDate = dayjs.tz(i.date, DEFAULT_TZ);
            if (incomeDate.isSameOrAfter(start, 'day') && incomeDate.isSameOrBefore(end, 'day')) {
                const amount = Number(i.amount || 0);
                kpi.recognized_incomes += amount;
                otherIncomes.push(i);
            }
        });

        // 4. Xərcləri Hesablayırıq (when görə) - (Bunlar həmişə Kassa sayılır)
        allAdminExpenses.forEach(e => {
            const dayDate = dayjs.tz(e.when, DEFAULT_TZ);
            if (dayDate.isSameOrAfter(start, 'day') && dayDate.isSameOrBefore(end, 'day')) {
                kpi.adminCosts += Number(e.amount || 0);
            }
        });
        allCarExpenses.forEach(e => {
            const dayDate = dayjs.tz(e.when, DEFAULT_TZ);
            if (dayDate.isSameOrAfter(start, 'day') && dayDate.isSameOrBefore(end, 'day')) {
                kpi.carCosts += Number(e.amount || 0);
            }
        });

        // 5. Yekun KPI-ları Hesablayırıq
        
        // KASSA (Real Pul)
        kpi.total_recognized = kpi.recognized_res + kpi.recognized_fines + kpi.recognized_incomes;
        kpi.total_expenses = kpi.adminCosts + kpi.carCosts;
        kpi.net = kpi.total_recognized - kpi.total_expenses;
        
        // HESABLAMA (Qazanc + Borclar)
        // (Mədaxil həm kassadır, həm də gözlənilən qazanc, çünki borcu olmur)
        kpi.total_expected = kpi.expected_res + kpi.expected_fines + kpi.recognized_incomes;
        kpi.total_pending = kpi.pending_res + kpi.pending_fines;
        
        
        // Nəticələri ekrana veririk
        renderKpis(kpi);
        renderLists(paidDayEntries, pendingDayEntries, paidFines, otherIncomes, pendingFines);
    }

    // === RENDER FUNKSİYALARI ===

    // KPI kartlarını yeniləyir
    function renderKpis(k) {
        // Kassa Metodu (Real Pul)
        els.kpiRecognized.textContent = AZN(k.total_recognized); // Kassa Mədaxili
        els.kpiTotalExpenses.textContent = AZN(k.total_expenses); // Cəmi Xərc
        els.kpiNet.textContent = AZN(k.net);                     // Kassa Balansı
        
        // Hesablama Metodu (Qazanc + Borclar)
        els.kpiExpected.textContent = AZN(k.total_expected); // Ümumi Qazanc
        els.kpiPending.textContent = AZN(k.total_pending);   // Cəmi Borclar
        
        // Kassa Balansı rəngini tənzimlə
        els.kpiNet.parentElement.className = k.net >= 0 ? 'kpi positive' : 'kpi negative';
    }

    // Bütün siyahıları yeniləyir
    function renderLists(paidList, pendingList, finesList, incomesList, pendingFinesList) {
        const getInfo = (res) => {
            const customer = allCustomers.find(c => c.id === res.customerId) || {};
            const car = allCars.find(c => c.id === res.carId) || {};
            return {
                custName: `${customer.firstName || ''} ${customer.lastName || ''}`,
                carName: `${car.brand || ''} ${car.model || ''} (${car.plate || 'N/A'})`
            };
        };

        // 1. Tanınmış Gəlir (Rezervasiyalar)
        els.listRecognized.innerHTML = '';
        if (paidList.length === 0) {
            els.listRecognized.innerHTML = '<div class="empty">Bu dövrdə ödənilmiş rezervasiya günü yoxdur.</div>';
        } else {
            paidList.forEach(entry => {
                const info = getInfo(entry);
                els.listRecognized.innerHTML += `
                    <div class="card-inner">
                      <div class="row-flex">
                        <div style="min-width:260px">
                          <div><b>${info.custName}</b> · <span class="badge">${entry.resId.slice(-6)}</span></div>
                          <div style="color:var(--muted);font-size:12px">${info.carName}</div>
                        </div>
                        <div class="pill"><b>Tarix: ${dayjs(entry.dayDate).format('DD.MM.YYYY')}</b></div>
                        <div class="pill">Ödənilən Məbləğ: <b class="mono">${AZN(entry.paid)}</b></div>
                        <div class="badge ok">Ödənilib</div>
                      </div>
                    </div>`;
            });
        }
        
        // 2. Tanınmış Gəlir (Ödənilmiş Cərimələr)
        els.listFines.innerHTML = '';
        if (finesList.length === 0) {
            els.listFines.innerHTML = '<div class="empty">Bu dövrdə ödənilmiş cərimə yoxdur.</div>';
        } else {
            finesList.forEach(f => {
                const info = getInfo(f);
                els.listFines.innerHTML += `
                    <div class="card-inner">
                      <div class="row-flex">
                        <div style="min-width:260px">
                          <div><b>${info.custName}</b> · <span class="badge">Cərimə</span></div>
                          <div style="color:var(--muted);font-size:12px">Tarix: ${dayjs(f.date).format('DD.MM.YY')}</div>
                        </div>
                        <div class="pill">Ödənilən Məbləğ: <b class="mono">${AZN(f.paidAmount)}</b></div>
                        <div class="badge ok">Ödənilib</div>
                      </div>
                    </div>`;
            });
        }

        // 3. Tanınmış Gəlir (Digər Mədaxil)
        els.listIncomes.innerHTML = '';
        if (incomesList.length === 0) {
            els.listIncomes.innerHTML = '<div class="empty">Bu dövrdə digər mədaxil yoxdur.</div>';
        } else {
            incomesList.forEach(i => {
                els.listIncomes.innerHTML += `
                    <div class="card-inner">
                      <div class="row-flex">
                        <div style="min-width:260px">
                          <div><b>${i.source || 'Mənbə qeyd edilməyib'}</b></div>
                          <div style="color:var(--muted);font-size:12px">${i.description || '...'}</div>
                        </div>
                        <div class="pill">Məbləğ: <b class="mono">${AZN(i.amount)}</b></div>
                        <div class="badge ok">Mədaxil</div>
                      </div>
                    </div>`;
            });
        }

        // 4. Gözləmədə Gəlir (Bron Borcları)
        els.listPending.innerHTML = '';
        if (pendingList.length === 0) {
            els.listPending.innerHTML = '<div class="empty">Gözləmədə rezervasiya borcu yoxdur.</div>';
        } else {
            pendingList.forEach(entry => {
                const info = getInfo(entry);
                const badge = entry.status === 'partial' ? 
                    '<span class="badge warn">Qismən ödənilib</span>' : 
                    '<span class="badge err">Heç ödənilməyib</span>';
                
                els.listPending.innerHTML += `
                    <div class="card-inner">
                      <div class="row-flex">
                       <div style="min-width:260px">
                        <div><b>${info.custName}</b> · <span class="badge">${entry.resId.slice(-6)}</span></div>
                        <div style="color:var(--muted);font-size:12px">${info.carName}</div>
                      </div>
                      <div class="pill"><b>Tarix: ${dayjs(entry.dayDate).format('DD.MM.YYYY')}</b></div>
                      <div class="pill">Borc: <b class="mono" style="color:var(--danger)">${AZN(entry.debt)}</b></div>
                      <div class="pill">Gün qiyməti: <b class="mono">${AZN(entry.price)}</b></div>
                      ${badge}
                    </div>`;
            });
        }
        
        // 5. Gözləmədə Gəlir (Ödənilməyən Cərimələr)
        els.listPendingFines.innerHTML = '';
        if (pendingFinesList.length === 0) {
            els.listPendingFines.innerHTML = '<div class="empty">Ödənilməyən cərimə borcu yoxdur.</div>';
        } else {
            pendingFinesList.forEach(f => {
                const info = getInfo(f);
                const debtAmount = Number(f.amount) - Number(f.amountPaid || 0);
                const badge = f.amountPaid > 0 ? 
                    '<span class="badge warn">Qismən ödənilib</span>' : 
                    '<span class="badge err">Heç ödənilməyib</span>';

                els.listPendingFines.innerHTML += `
                    <div class="card-inner">
                      <div class="row-flex">
                        <div style="min-width:260px">
                          <div><b>${info.custName}</b> · <span class="badge">Cərimə</span></div>
                          <div style="color:var(--muted);font-size:12px">Tarix: ${dayjs(f.date).format('DD.MM.YY')}</div>
                        </div>
                        <div class="pill">Borc: <b class="mono" style="color:var(--danger)">${AZN(debtAmount)}</b></div>
                        <div class="pill">Ümumi: <b class="mono">${AZN(f.amount)}</b></div>
                        ${badge}
                      </div>
                    </div>`;
            });
        }
    }


    // === FİLTR MƏNTİQİ ===

    // Filterləri doldurur
    function setupFilters() {
        const yearNow = today.year();
        const years = [yearNow, yearNow - 1, yearNow - 2, yearNow - 3];
        const months = Array.from({length: 12}, (v, k) => k);

        els.yearFilter.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        els.yearFilterMonth.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        els.monthFilter.innerHTML = months.map(m => {
            const d = today.month(m);
            return `<option value="${d.format('MM')}">${d.format('MMMM')}</option>`;
        }).join('');
        
        // Defolt dəyərlər
        els.dayFilter.value = today.format('YYYY-MM-DD');
        els.monthFilter.value = today.format('MM');
        els.yearFilterMonth.value = today.year();
        els.yearFilter.value = today.year();
    }

    // Seçilmiş filterə görə tarix aralığını qaytarır
    function getPeriodFromState() {
        const type = els.periodType.value;
        let start, end;

        switch(type) {
            case 'day':
                start = dayjs.tz(els.dayFilter.value, DEFAULT_TZ).startOf('day');
                end = start.endOf('day');
                break;
            case 'month':
                const monthStr = `${els.yearFilterMonth.value}-${els.monthFilter.value}`;
                start = dayjs.tz(monthStr, DEFAULT_TZ).startOf('month');
                end = start.endOf('month');
                break;
            case 'year':
                start = dayjs.tz(els.yearFilter.value, DEFAULT_TZ).startOf('year');
                end = start.endOf('year');
                break;
            default: // 'day'
                start = today.startOf('day');
                end = today.endOf('day');
        }
        return { start, end, type };
    }

    // Filter seçimi dəyişdikdə
    function handlePeriodChange() {
        const type = els.periodType.value;
        // Bütün filterləri gizlət
        document.querySelectorAll('.filter-controls').forEach(el => el.classList.remove('active'));
        // Düzgün olanı göstər
        document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}Controls`).classList.add('active');
        // Hesabatı yenilə
        refreshReport();
    }
    
    // Hesabatı yeniləyən əsas funksya
    function refreshReport() {
        const period = getPeriodFromState();
        calculateV2Report(period);
    }
    
    // === Hadisə Dinləyiciləri (Event Listeners) ===

    // Filter seçiciləri
    els.periodType.addEventListener('change', handlePeriodChange);
    els.dayFilter.addEventListener('change', refreshReport);
    els.monthFilter.addEventListener('change', refreshReport);
    els.yearFilterMonth.addEventListener('change', refreshReport);
    els.yearFilter.addEventListener('change', refreshReport);

    // PDF Çap düyməsi
    els.printReportBtn.addEventListener('click', () => {
        const period = getPeriodFromState();
        const start = period.start.format('YYYY-MM-DD');
        const end = period.end.format('YYYY-MM-DD');
        const type = period.type;
        
        const reportUrl = `/public/report-print.html?start=${start}&end=${end}&type=${type}`;
        window.open(reportUrl, '_blank');
    });

    // === İlkin Yükləmə ===
    async function init() {
        els.listPending.innerHTML = '<div class="empty">Məlumatlar yüklənir...</div>';
        els.listRecognized.innerHTML = '<div class="empty">Məlumatlar yüklənir...</div>';
        els.listFines.innerHTML = '<div class="empty">Məlumatlar yüklənir...</div>';
        els.listIncomes.innerHTML = '<div class="empty">Məlumatlar yüklənir...</div>';
        els.listPendingFines.innerHTML = '<div class="empty">Məlumatlar yüklənir...</div>';

        try {
            // Bütün məlumatları paralel olaraq yükləyirik
            const [res, admRes, carRes, finesRes, incomesRes, carsRes, custRes] = await Promise.all([
                fetch(API.reservations).then(r => r.json()),
                fetch(API.adminExpenses).then(r => r.json()),
                fetch(API.carExpenses).then(r => r.json()),
                fetch(API.fines).then(r => r.json()),
                fetch(API.incomes).then(r => r.json()),
                fetch(API.cars).then(r => r.json()),
                fetch(API.customers).then(r => r.json())
            ]);

            // DÜZƏLİŞ: server.js bəzən {items: []}, bəzən [] qaytara bilər.
            // Bu kod hər iki variantı da qəbul edir.
            allReservations = res; // Bu, həmişə massivdir
            allAdminExpenses = (admRes.items || admRes); 
            allCarExpenses = (carRes.items || carRes); 
            allFines = (finesRes.items || finesRes); 
            allIncomes = (incomesRes.items || incomesRes); 
            allCars = carsRes; // Bu, həmişə massivdir
            allCustomers = custRes; // Bu, həmişə massivdir
            
            // Filterləri qururuq
            setupFilters();
            
            // Başlanğıc hesabatı yaradırıq (Defolt olaraq "Günlük")
            handlePeriodChange();

        } catch (err) {
            console.error('Mühasibatlıq səhifəsi yüklənərkən xəta:', err);
            els.listPending.innerHTML = `<div class="empty" style="color:var(--danger)"><b>Xəta:</b> Məlumatlar yüklənə bilmədi.</div>`;
            els.listRecognized.innerHTML = '';
            els.listPendingFines.innerHTML = '';
        }
    }

    init();
});
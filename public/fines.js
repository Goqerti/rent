document.addEventListener('DOMContentLoaded', async () => {
    // API Endpoints
    const API = {
        fines: '/api/fines',
        customers: '/api/customers',
        cars: '/api/cars'
    };

    // Global vəziyyət (State)
    let allFines = [];
    let allCustomers = [];
    let allCars = [];

    // HTML Elementləri
    const finesList = document.getElementById('finesTable')?.querySelector('tbody'); // Daha dəqiq seçim
    const addForm = document.getElementById('fineForm'); // ID HTML-də "fineForm" olaraq qeyd edilib
    const customerSelect = document.getElementById('customerId');
    const carSelect = document.getElementById('carId');
    
    // Statistikalar üçün HTML elementləri (Əgər HTML-də varsa)
    const totalFinesEl = document.getElementById('totalFines');
    const totalUnpaidEl = document.getElementById('totalUnpaid');
    
    // Modal Elementləri (Ödəniş üçün)
    const paymentModal = document.getElementById('editFineModal'); // ID HTML-ə uyğunlaşdırıldı
    const closeBtn = document.getElementById('closeModalBtn'); // ID HTML-ə uyğunlaşdırıldı
    const modalTitle = document.getElementById('modalTitle'); // (Bunu HTML-ə əlavə etmək lazım ola bilər)
    const editForm = document.getElementById('editFineModal').querySelector('.sheet'); // Formanı .sheet olaraq götürürük
    const fineIdInput = document.getElementById('editFineId');
    const editAmountPaidInput = document.getElementById('amountPaid'); // ID HTML-ə uyğunlaşdırıldı
    const savePaymentBtn = document.getElementById('savePaymentBtn');
    
    // Xətanı yaradan element
    const deleteBtn = document.getElementById('deleteBtn'); // İndi HTML-də mövcud olmalıdır

    // Helper funksiyalar
    const AZN = (val) => (val || 0).toLocaleString('az-Latn-AZ', { style: 'currency', currency: 'AZN' });
    const showModal = () => paymentModal.style.display = 'block';
    const hideModal = () => paymentModal.style.display = 'none';

    // === Məlumatların Yüklənməsi ===

    async function loadDropdowns() {
        try {
            [allCustomers, allCars] = await Promise.all([
                fetch(API.customers).then(res => res.json()),
                fetch(API.cars).then(res => res.json())
            ]);

            customerSelect.innerHTML = '<option value="">Müştəri seçin...</option>';
            allCustomers.forEach(c => {
                customerSelect.innerHTML += `<option value="${c.id}">${c.firstName} ${c.lastName} (${c.phone})</option>`;
            });

            carSelect.innerHTML = '<option value="">Maşın seçin (Könüllü)...</option>';
            allCars.forEach(car => {
                carSelect.innerHTML += `<option value="${car.id}">${car.brand} ${car.model} (${car.plate})</option>`;
            });

        } catch (err) {
            console.error("Müştəri/Maşın siyahısı yüklənərkən xəta:", err);
            alert("Müştəri və Maşın siyahısı yüklənə bilmədi.");
        }
    }

    async function loadFines() {
        try {
            finesList.innerHTML = '<tr><td colspan="7" class="empty">Cərimələr yüklənir...</td></tr>';
            const response = await fetch(API.fines);
            const data = await response.json();
            
            allFines = data.items || []; 
            renderFines(allFines);
        } catch (err) {
            console.error("Cərimələr yüklənərkən xəta:", err);
            finesList.innerHTML = '<tr><td colspan="7" class="empty error">Cərimələr yüklənə bilmədi.</td></tr>';
        }
    }

    // === Məlumatların Göstərilməsi (Render) ===

    function renderFines(fines) {
        if (!finesList) return; // Əgər cədvəl yoxdursa, dayan
        finesList.innerHTML = '';
        
        if (fines.length === 0) {
            finesList.innerHTML = '<tr><td colspan="7" class="empty">Heç bir cərimə tapılmadı.</td></tr>';
            if (totalFinesEl) totalFinesEl.textContent = AZN(0);
            if (totalUnpaidEl) totalUnpaidEl.textContent = AZN(0);
            return;
        }

        let totalAmount = 0;
        let totalUnpaid = 0;

        fines.forEach(fine => {
            const customer = allCustomers.find(c => c.id === fine.customerId) || {};
            const car = allCars.find(c => c.id === fine.carId) || {};
            
            totalAmount += Number(fine.amount || 0);
            
            const debt = (Number(fine.amount || 0) - Number(fine.amountPaid || 0));
            if (!fine.isPaid && debt > 0) {
                totalUnpaid += debt;
            }

            let statusBadge;
            let rowClass = '';
            if (fine.isPaid) {
                statusBadge = `<span class="badge ok">Ödənilib</span>`;
                rowClass = 'paid';
            } else if (fine.amountPaid > 0) {
                statusBadge = `<span class="badge warn">Qismən Ödənilib</span>`;
                rowClass = 'partially-paid';
            } else {
                statusBadge = `<span class="badge err">Ödənilməyib</span>`;
                rowClass = 'unpaid';
            }

            const row = document.createElement('tr');
            row.dataset.id = fine.id;
            row.className = rowClass;
            row.innerHTML = `
                <td>${dayjs(fine.date).format('DD.MM.YYYY')}</td>
                <td>${customer.firstName || ''} ${customer.lastName || ''}</td>
                <td>${car.brand || ''} ${car.model || ''} (${car.plate || 'N/A'})</td>
                <td class="mono">${AZN(fine.amount)}</td>
                <td class="mono">${AZN(fine.amountPaid)}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-small" data-action="edit" data-id="${fine.id}">Ödənişi Redaktə Et</button>
                </td>
            `;
            finesList.appendChild(row);
        });

        if (totalFinesEl) totalFinesEl.textContent = AZN(totalAmount);
        if (totalUnpaidEl) totalUnpaidEl.textContent = AZN(totalUnpaid);
    }

    // === Hadisə Dinləyiciləri (Event Listeners) ===

    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                customerId: document.getElementById('customerId').value,
                carId: document.getElementById('carId').value,
                amount: document.getElementById('amount').value,
                points: document.getElementById('points').value,
                date: document.getElementById('date').value,
                // Səbəb (reason) üçün input HTML-də yoxdur, amma əlavə etsəniz, JS kodu hazırdır.
                reason: document.getElementById('reason') ? document.getElementById('reason').value : '', 
                // isPaid üçün checkbox HTML-də yoxdur.
                isPaid: false 
            };

            if (!formData.customerId || !formData.amount || !formData.date) {
                alert("Müştəri, Məbləğ və Tarix xanaları məcburidir.");
                return;
            }

            try {
                const response = await fetch(API.fines, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (!response.ok) {
                    throw new Error('Server xətası: ' + response.statusText);
                }

                const newFine = await response.json();
                allFines.unshift(newFine); 
                renderFines(allFines);
                addForm.reset();

            } catch (err) {
                console.error("Cərimə əlavə edilərkən xəta:", err);
                alert("Cərimə əlavə edilə bilmədi.");
            }
        });
    }

    if (finesList) {
        finesList.addEventListener('click', (e) => {
            if (e.target.dataset.action === 'edit') {
                const fineId = e.target.dataset.id;
                const fine = allFines.find(f => f.id === fineId);
                if (fine) {
                    openPaymentModal(fine);
                }
            }
        });
    }

    function openPaymentModal(fine) {
        const customer = allCustomers.find(c => c.id === fine.customerId) || {};
        
        // HTML-də #modalTitle olmadığı üçün yoxlayırıq
        if (modalTitle) {
            modalTitle.textContent = `${customer.firstName} ${customer.lastName} üçün ödəniş`;
        }
        
        document.getElementById('fineTotalAmount').value = AZN(fine.amount); // Total məbləği göstər
        
        fineIdInput.value = fine.id;
        editAmountPaidInput.value = fine.amountPaid || 0;
        
        // HTML-də #editIsPaidInput olmadığı üçün bu hissəni şərhə alıram
        // editIsPaidInput.checked = fine.isPaid || false; 
        
        if (deleteBtn) {
            deleteBtn.dataset.id = fine.id;
        }
        
        showModal();
    }

    if (closeBtn) {
        closeBtn.onclick = hideModal;
    }
    window.onclick = (event) => {
        if (event.target == paymentModal) {
            hideModal();
        }
    };

    if (savePaymentBtn) {
        // Formanın submit hadisəsi .sheet elementində deyil, savePaymentBtn-nin "click" hadisəsində olmalıdır
        savePaymentBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = fineIdInput.value;
            const amountPaid = parseFloat(editAmountPaidInput.value);
            const totalAmount = parseFloat(allFines.find(f=>f.id === id).amount || 0);
            
            const data = {
                amountPaid: amountPaid,
                isPaid: amountPaid >= totalAmount // Avtomatik təyin etmə
            };

            try {
                const response = await fetch(`${API.fines}/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error('Ödəniş yenilənə bilmədi');

                const updatedFine = await response.json();
                
                const index = allFines.findIndex(f => f.id === id);
                if (index !== -1) {
                    allFines[index] = updatedFine;
                }
                
                renderFines(allFines);
                hideModal();

            } catch (err) {
                console.error("Ödəniş yenilənərkən xəta:", err);
                alert("Xəta: " + err.message);
            }
        });
    }

    // Modal daxilindəki "Sil" düyməsi (TƏHLÜKƏSİZ YOXLAMA İLƏ)
    if (deleteBtn) { 
        deleteBtn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (!id) return;

            if (confirm("Bu cəriməni sistemdən silmək istədiyinizə əminsiniz?")) {
                try {
                    const response = await fetch(`${API.fines}/${id}`, {
                        method: 'DELETE'
                    });

                    if (!response.ok) throw new Error('Cərimə silinə bilmədi');
                    
                    allFines = allFines.filter(f => f.id !== id);
                    renderFines(allFines);
                    hideModal();

                } catch (err) {
                    console.error("Cərimə silinərkən xəta:", err);
                    alert("Xəta: " + err.message);
                }
            }
        });
    } else {
        // Əgər düymə hələ də tapılmayıbsa, bu, sizin HTML-də problem olduğunu göstərir.
        console.warn('HTML-də id="deleteBtn" olan element tapılmadı.');
    }


    // === Səhifənin İlkin Yüklənməsi ===
    async function init() {
        // Elementlərin mövcudluğunu yoxla
        if (customerSelect && carSelect) {
            await loadDropdowns(); 
        }
        if (finesList) {
            await loadFines();     
        }
    }

    init();
});
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/office-incidents';
    const form = document.getElementById('incidentForm');
    const tableBody = document.querySelector('#incidentsTable tbody');

    // API sorğuları üçün köməkçi obyekt
    const api = {
        get: () => fetch(API_URL).then(res => res.json()),
        // Fayl göndərdiyimiz üçün FormData istifadə edirik
        post: (formData) => fetch(API_URL, {
            method: 'POST',
            body: formData // JSON.stringify yox, birbaşa formData göndərilir
        }).then(res => res.json()),
        delete: (id) => fetch(`${API_URL}/${id}`, { method: 'DELETE' })
    };

    // Cədvəli yeni məlumatlarla doldurur
    function renderTable(incidents) {
        tableBody.innerHTML = '';
        if (!incidents || incidents.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Heç bir hadisə qeyd edilməyib.</td></tr>';
            return;
        }
        incidents.forEach(incident => {
            const tr = document.createElement('tr');
            // Hadisəyə aid sənəd varsa, link yaradırıq
            const docLink = incident.filePath 
                ? `<a href="/api/incidents/document/${incident.id}" target="_blank" class="btn btn-sm">Bax</a>`
                : 'Yoxdur';

            tr.innerHTML = `
                <td>${incident.date}</td>
                <td>${incident.description}</td>
                <td>${docLink}</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-id="${incident.id}">Sil</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Serverdən hadisələri yükləyir
    async function loadIncidents() {
        try {
            const incidents = await api.get();
            renderTable(incidents);
        } catch (error) {
            console.error('Hadisələri yükləmək mümkün olmadı:', error);
            tableBody.innerHTML = '<tr><td colspan="4">Məlumatları yükləmək mümkün olmadı.</td></tr>';
        }
    }

    // Yeni hadisə formasını təsdiqlədikdə
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Formadakı bütün məlumatları (fayl daxil) FormData obyektinə yığırıq
        const formData = new FormData(form);

        try {
            const newIncident = await api.post(formData);
            if (newIncident.id) {
                form.reset();
                loadIncidents();
            } else {
                alert('Xəta: ' + (newIncident.error || 'Hadisə əlavə edilmədi.'));
            }
        } catch (error) {
            console.error('Hadisə əlavə edilərkən xəta:', error);
            alert('Hadisə əlavə edilərkən xəta baş verdi.');
        }
    });

    // Silmə düyməsinə kliklədikdə
    tableBody.addEventListener('click', async (e) => {
        if (e.target.matches('button.btn-danger')) {
            const id = e.target.dataset.id;
            if (confirm('Bu hadisəni silməyə əminsiniz?')) {
                try {
                    const res = await api.delete(id);
                    if (res.ok) {
                        loadIncidents();
                    } else {
                        const err = await res.json();
                        alert('Xəta: ' + (err.error || 'Silinmədi.'));
                    }
                } catch (error) {
                    console.error('Hadisə silinərkən xəta:', error);
                    alert('Hadisə silinərkən xəta baş verdi.');
                }
            }
        }
    });

    // İlkin yükləmə
    loadIncidents();
});
document.addEventListener('DOMContentLoaded', () => {
    // Giriş elementləri
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('btnLogin');
    const errorMessage = document.getElementById('error-message');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Yeni istifadəçi elementləri
    const toggleCreateBtn = document.getElementById('toggleCreateBtn');
    const createSection = document.getElementById('createSection');
    const createForm = document.getElementById('createForm');
    const btnCreate = document.getElementById('btnCreate');
    const createMsg = document.getElementById('createMsg');

    // Yeni istifadəçi yarat bölməsini göstər/gizlət
    if (toggleCreateBtn) {
        toggleCreateBtn.addEventListener('click', () => {
            createSection.classList.toggle('hidden');
        });
    }

    // Giriş funksiyası
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMessage.textContent = ''; // Köhnə xəta mesajını təmizlə

            const username = usernameInput.value;
            const password = passwordInput.value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Naməlum xəta baş verdi');
                
                // Uğurlu giriş zamanı token və istifadəçi məlumatını yadda saxlayırıq
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                // Dashboard səhifəsinə yönləndiririk
                window.location.href = '/public/dashboard.html';
            } catch (error) {
                errorMessage.textContent = error.message;
            }
        });
    }

    // Yeni istifadəçi yarat funksiyası
    if (btnCreate) {
        btnCreate.addEventListener('click', async () => {
            createMsg.textContent = '';
            
            const ownerCode = document.getElementById('ownerCode').value;
            // Bu kodu server tərəfində yoxlamaq daha təhlükəsizdir, amma istəyə uyğun burada saxlanılıb.
            if (ownerCode !== "12345") { 
                createMsg.style.color = 'var(--danger)';
                createMsg.textContent = 'Sahibkar kodu yanlışdır';
                return;
            }

            const newUsername = document.getElementById('nUsername').value;
            const newPassword = document.getElementById('nPass').value;
            const newRole = document.getElementById('nRole').value;
            
            if (!newUsername || !newPassword) {
                createMsg.style.color = 'var(--danger)';
                createMsg.textContent = 'İstifadəçi adı və şifrə boş ola bilməz.';
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Xəta baş verdi');
                
                createMsg.style.color = 'var(--success)';
                createMsg.textContent = `İstifadəçi "${data.username}" uğurla yaradıldı!`;
                
                // Formanı təmizlə
                if (createForm) createForm.reset();

            } catch (error) {
                createMsg.style.color = 'var(--danger)';
                createMsg.textContent = error.message;
            }
        });
    }
});
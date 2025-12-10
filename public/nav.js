document.addEventListener("DOMContentLoaded", function() {
    const navPlaceholder = document.getElementById("nav-placeholder");
    if (navPlaceholder) {
        // nav.html faylını yükləyirik
        fetch("/public/nav.html")
            .then(response => {
                if (!response.ok) throw new Error("nav.html tapılmadı");
                return response.text();
            })
            .then(data => {
                navPlaceholder.innerHTML = data;
                
                // Aktiv linki təyin etmək üçün məntiq
                const links = navPlaceholder.querySelectorAll(".nav a.tab");
                const currentPagePath = window.location.pathname;

                links.forEach(link => {
                    // Linkin ünvanı ilə hazırkı səhifənin ünvanını müqayisə edirik
                    if (link.getAttribute("href") === currentPagePath) {
                        link.classList.add("active");
                        link.setAttribute("aria-current", "page"); // Əlavə olaraq, ekran oxuyucuları üçün
                    }
                });
            })
            .catch(error => console.error('Navbar yüklənərkən xəta baş verdi:', error));
    }
});
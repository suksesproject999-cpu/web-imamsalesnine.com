(async function () {

    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    const path = window.location.pathname;

    // Login page tidak perlu dicek
    if (path.startsWith("/login")) {
        return;
    }

    // Halaman yang diproteksi
    if (path.startsWith("/admin") || path.startsWith("/vip")) {

        if (!token || !role) {

            localStorage.clear();
            window.location.href = "/login";
            return;

        }

        try {

            const res = await fetch(
                "/.netlify/functions/verify-token",
                {
                    method: "GET",
                    headers: {
                        Authorization: "Bearer " + token
                    }
                }
            );
            
            const data = await res.json();

            if (!res.ok) {

                localStorage.clear();
                window.location.href = "/login";
                return;

            }
            
            // ==========================
// PROTEKSI FOLDER VIP
// ==========================

if (data.user.role === "vip") {

    const urlParts =
        window.location.pathname.split("/");

    const currentFolder =
        urlParts[2];

    if (currentFolder !== data.user.folder) {

        localStorage.clear();

        window.location.href = "/login";

        return;

    }

}


// ==========================
// PROTEKSI ROLE
// ==========================

const path = window.location.pathname;

// VIP tidak boleh ke admin
if (path.startsWith("/admin") && data.user.role !== "admin") {

    localStorage.clear();
    window.location.href = "/login";
    return;

}

// Admin tidak boleh ke VIP
if (path.startsWith("/vip") && data.user.role === "admin") {

    localStorage.clear();
    window.location.href = "/login";
    return;

}

        } catch (err) {

            localStorage.clear();
            window.location.href = "/login";

        }

    }

})();
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

            if (!res.ok) {

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
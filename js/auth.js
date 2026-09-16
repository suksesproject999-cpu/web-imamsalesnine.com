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

            if (!res.ok || !data.success || !data.user) {

                localStorage.clear();
                window.location.href = "/login";
                return;
            }

            const userRole = data.user.role;


            // ==========================
            // PRODUCT ADMIN
            // ==========================

            if (
                path === "/adminb.html" &&
                userRole !== "product_admin"
            ) {

                localStorage.clear();
                window.location.href = "/login";
                return;
            }


            // ==========================
            // ADMIN
            // ==========================

            if (
                path.startsWith("/admin") &&
                path !== "/adminb.html" &&
                userRole !== "admin"
            ) {

                localStorage.clear();
                window.location.href = "/login";
                return;
            }


            // ==========================
            // VIP
            // ==========================

            if (
                path.startsWith("/vip") &&
                userRole !== "vip"
            ) {

                localStorage.clear();
                window.location.href = "/login";
                return;
            }


            // ==========================
            // PROTEKSI FOLDER VIP
            // ==========================

            if (userRole === "vip") {

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

        } catch (err) {

            localStorage.clear();
            window.location.href = "/login";
        }
    }

})();
(function () {

    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    const path = window.location.pathname;

    if (path.startsWith("/admin") || path.startsWith("/vip")) {

        if (!token || !role) {
            window.location.href = "/login";
        }

    }

})();
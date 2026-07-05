(function () {

    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    // ❌ JANGAN jalan di login page
    if (window.location.pathname.includes("login")) {
        return;
    }

    if (!token || !role) {
        window.location.href = "/login";
    }

})();
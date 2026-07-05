(function () {

    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || !role) {

        localStorage.clear();

        window.location.replace("/login.html");

        return;

    }

})();
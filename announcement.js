document.addEventListener("DOMContentLoaded", loadAnnouncement);

function loadAnnouncement() {

  fetch("/announcement.json?" + Date.now())
    .then(response => {
      if (!response.ok) {
        throw new Error("Announcement tidak ditemukan");
      }
      return response.json();
    })
    .then(data => {
      const el = document.getElementById("announcement");

      if (el) {
        el.innerHTML = data.text || "";
      }
    })
    .catch(error => {
      console.error("Announcement Error:", error);

      const el = document.getElementById("announcement");

      if (el) {
        el.innerHTML = "";
      }
    });

}

document.addEventListener("DOMContentLoaded", () => {
    loadAnnouncement();
    setInterval(loadAnnouncement, 30000);
});
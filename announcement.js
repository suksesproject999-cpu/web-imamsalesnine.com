

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

function startAnnouncement() {
    if (window.__vipAnnouncementStarted) return;
    window.__vipAnnouncementStarted = true;
    loadAnnouncement();
    setInterval(loadAnnouncement, 30000);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAnnouncement, { once: true });
} else {
    startAnnouncement();
}
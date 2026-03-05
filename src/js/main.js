// ダークモード切替
(function() {
  const toggle = document.getElementById("theme-toggle");
  const saved = localStorage.getItem("theme");

  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  if (toggle) {
    toggle.addEventListener("click", function() {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  }
})();

// 読書進捗記録
(function() {
  const path = window.location.pathname;
  if (!path.includes("/ch")) return;

  const key = "reading-progress";
  const progress = JSON.parse(localStorage.getItem(key) || "{}");
  progress[path] = { lastRead: Date.now() };
  localStorage.setItem(key, JSON.stringify(progress));
})();

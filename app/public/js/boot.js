// Runs before the first paint so the page opens in the right appearance: the
// person's saved choice, else the OS setting. A classic script on purpose, so it
// blocks rendering for the few microseconds this takes.
(function () {
  var t = null;
  try {
    t = localStorage.getItem("theme");
  } catch (e) {
    t = null;
  }
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.dataset.theme = t;
})();

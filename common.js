const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));
const fmt = n => Number(n).toLocaleString("de-DE");
async function loadJSON(u) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(u + " (" + r.status + ")");
    return r.json()
}
async function loadSite() {
    const c = await loadJSON("variables.json");
    $("name").textContent = c.site.name;
    document.title = document.title.replace("Donutmap", c.site.name);
    return c
}
(function initTheme() {
    const r = document.documentElement;
    try {
        const t = localStorage.getItem("dm-theme");
        if (t) r.dataset.theme = t
    } catch (e) { }
    $("theme")?.addEventListener("click", () => {
        const d = r.dataset.theme === "dark" || (!r.dataset.theme && matchMedia("(prefers-color-scheme:dark)").matches);
        r.dataset.theme = d ? "light" : "dark";
        try {
            localStorage.setItem("dm-theme", r.dataset.theme)
        } catch (e) { }
    })
})();

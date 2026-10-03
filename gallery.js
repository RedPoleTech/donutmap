(async () => {
    const g = $("grid");
    try {
        await loadSite();
        const d = await loadJSON("gallery.json");
        if (!d.maps?.length) {
            g.textContent = "No maps yet.";
            return
        }
        d.maps.forEach(m => {
            const c = document.createElement("article");
            c.className = "card gcard";
            const im = new Image();
            im.alt = m.title || "";
            im.loading = "lazy";
            im.onerror = () => im.replaceWith(Object.assign(document.createElement("div"), {
                className: "ph",
                textContent: "No image"
            }));
            im.src = m.image;
            const h = document.createElement("h3");
            h.textContent = m.title || "";
            const p = document.createElement("p");
            p.textContent = m.description || "";
            c.append(im, h, p);
            if (m.info) {
                const s = document.createElement("small");
                s.textContent = m.info;
                c.append(s)
            }
            g.append(c)
        })
    } catch (e) {
        console.error(e);
        g.textContent = "The gallery could not be loaded."
    }
})();

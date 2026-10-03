"use strict";
// ---- Config (loaded from variables.json / blocks.json) ----
let CFG, BLOCKS, PAL, N;
const hex = h => {
    if (!/^#[0-9a-f]{6}$/i.test(h)) throw new Error("Invalid color " + h);
    return [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16))
};
// ---- Palette ----
// One entry per block: output color = colors[1] (flat map art); all three colors only help to MATCH a pixel to a block.
function buildPalette(blocks) {
    return blocks.map((b, bi) => {
        if (!b.name || b.colors?.length !== 3 || !(b.stack_price >= 0)) throw new Error("Invalid block definition: " + b.name);
        const m = b.colors.map(hex);
        return {
            rgb: m[1],
            match: m,
            bi
        }
    })
}
// ---- Farbdistanz (austauschbar) ----
const dist = {
    weightedRGB: (a, b) => {
        const rm = (a[0] + b[0]) / 2,
            r = a[0] - b[0],
            g = a[1] - b[1],
            bl = a[2] - b[2];
        return (2 + rm / 256) * r * r + 4 * g * g + (2 + (255 - rm) / 256) * bl * bl
    }
};
let distFn = dist.weightedRGB;
const matchDist = (c, rgb) => {
    let m = Infinity;
    for (const x of c.match || [c.rgb]) {
        const d = distFn(rgb, x);
        if (d < m) m = d
    }
    return m
};

function nearest(pal, rgb, cache) {
    const k = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let h = cache.get(k);
    if (h !== undefined) return h;
    let best = 0,
        bd = 1e18;
    for (let i = 0; i < pal.length; i++) {
        const d = matchDist(pal[i], rgb);
        if (d < bd) {
            bd = d;
            best = i
        }
    }
    cache.set(k, best);
    return best
}
// ---- Dithering ----
const EF = {
    fs: {
        d: 16,
        k: [
            [1, 0, 7],
            [-1, 1, 3],
            [0, 1, 5],
            [1, 1, 1]
        ]
    },
    atkinson: {
        d: 8,
        k: [
            [1, 0, 1],
            [2, 0, 1],
            [-1, 1, 1],
            [0, 1, 1],
            [1, 1, 1],
            [0, 2, 1]
        ]
    },
    jjn: {
        d: 48,
        k: [
            [1, 0, 7],
            [2, 0, 5],
            [-2, 1, 3],
            [-1, 1, 5],
            [0, 1, 7],
            [1, 1, 5],
            [2, 1, 3],
            [-2, 2, 1],
            [-1, 2, 3],
            [0, 2, 5],
            [1, 2, 3],
            [2, 2, 1]
        ]
    },
    stucki: {
        d: 42,
        k: [
            [1, 0, 8],
            [2, 0, 4],
            [-2, 1, 2],
            [-1, 1, 4],
            [0, 1, 8],
            [1, 1, 4],
            [2, 1, 2],
            [-2, 2, 1],
            [-1, 2, 2],
            [0, 2, 4],
            [1, 2, 2],
            [2, 2, 1]
        ]
    },
    burkes: {
        d: 32,
        k: [
            [1, 0, 8],
            [2, 0, 4],
            [-2, 1, 2],
            [-1, 1, 4],
            [0, 1, 8],
            [1, 1, 4],
            [2, 1, 2]
        ]
    },
    sierra: {
        d: 32,
        k: [
            [1, 0, 5],
            [2, 0, 3],
            [-2, 1, 2],
            [-1, 1, 4],
            [0, 1, 5],
            [1, 1, 4],
            [2, 1, 2],
            [-1, 2, 2],
            [0, 2, 3],
            [1, 2, 2]
        ]
    },
    sierra2: {
        d: 16,
        k: [
            [1, 0, 4],
            [2, 0, 3],
            [-2, 1, 1],
            [-1, 1, 2],
            [0, 1, 3],
            [1, 1, 2],
            [2, 1, 1]
        ]
    },
    sierralite: {
        d: 4,
        k: [
            [1, 0, 2],
            [-1, 1, 1],
            [0, 1, 1]
        ]
    }
};
const bayer = n => {
    let m = [
        [0]
    ];
    while (m.length < n) {
        const s = m.length,
            o = [];
        for (let y = 0; y < s * 2; y++) {
            o.push([]);
            for (let x = 0; x < s * 2; x++) o[y][x] = 4 * m[y % s][x % s] + [
                [0, 2],
                [3, 1]
            ][y >= s ? 1 : 0][x >= s ? 1 : 0]
        }
        m = o
    }
    return m
};
const cluster = n => {
    const c = (n - 1) / 2,
        l = [];
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) l.push([Math.hypot(x - c, y - c) + Math.atan2(y - c, x - c) * 1e-3, y, x]);
    l.sort((a, b) => a[0] - b[0]);
    const m = Array.from({
        length: n
    }, () => []);
    l.forEach((e, i) => m[e[1]][e[2]] = i);
    return m
};
const OM = {
    bayer2: bayer(2),
    bayer3: [
        [0, 7, 3],
        [6, 5, 2],
        [4, 1, 8]
    ],
    bayer4: bayer(4),
    halftone8: cluster(8),
    cluster4: cluster(4)
};
const DITHERS = [
    ["none", "Kein Dithering"],
    ["fs", "Floyd-Steinberg"],
    ["atkinson", "Atkinson"],
    ["jjn", "Jarvis-Judice-Ninke"],
    ["stucki", "Stucki"],
    ["burkes", "Burkes"],
    ["sierra", "Sierra"],
    ["sierralite", "Sierra Lite"],
    ["sierra2", "Sierra Two-Row"],
    ["bayer2", "Bayer 2×2"],
    ["bayer3", "Bayer 3×3"],
    ["bayer4", "Bayer 4×4"],
    ["halftone8", "Halftone 8×8"],
    ["cluster4", "Clustered Dot 4×4"]
];
DITHERS.forEach(([v, t]) => $("dt").add(new Option(t, v)));
// Quantisiert float-RGB-Puffer gegen Palette -> Index-Array
function quantize(rgb, pal, method) {
    const ST = +$("ds").value / 100,
        CL = CFG.dither.errorClamp,
        out = new Uint16Array(N * N),
        cache = new Map(),
        f = Float32Array.from(rgb);
    const get = i => [f[i * 3], f[i * 3 + 1], f[i * 3 + 2]].map(v => Math.max(0, Math.min(255, Math.round(v))));
    if (OM[method]) {
        const m = OM[method],
            s = m.length,
            spread = 64;
        for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
                const i = y * N + x,
                    t = (m[y % s][x % s] + .5) / (s * s) - .5;
                for (let c = 0; c < 3; c++) f[i * 3 + c] += t * spread;
                out[i] = nearest(pal, get(i), cache)
            }
        return out
    }
    const k = EF[method];
    for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
            const i = y * N + x,
                p = get(i),
                q = nearest(pal, p, cache);
            out[i] = q;
            if (!k) continue;
            for (const [dx, dy, w] of k.k) {
                const xx = x + dx,
                    yy = y + dy;
                if (xx < 0 || xx >= N || yy >= N) continue;
                for (let c = 0; c < 3; c++) f[(yy * N + xx) * 3 + c] += Math.max(-CL, Math.min(CL, f[i * 3 + c] - pal[q].rgb[c])) * ST * w / k.d
            }
        }
    return out
}
// ---- Pipeline-Schritte auf 128x128 ----
function posterize(rgb, levels) {
    const s = 255 / (levels - 1);
    for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(rgb[i] / s) * s
}

function threeColor(rgb, cols, bal, method) { // Balance verschiebt Luminanzgrenzen; Ergebnis enthält nur die 3 Farben
    const sorted = cols.map(hex).sort((a, b) => a[0] * .3 + a[1] * .59 + a[2] * .11 - (b[0] * .3 + b[1] * .59 + b[2] * .11));
    const g = new Float32Array(rgb.length),
        sh = bal * 1.28;
    for (let i = 0; i < N * N; i++) {
        const l = rgb[i * 3] * .3 + rgb[i * 3 + 1] * .59 + rgb[i * 3 + 2] * .11 + sh;
        g[i * 3] = g[i * 3 + 1] = g[i * 3 + 2] = l
    }
    const gp = [0, 127.5, 255].map(v => ({
        rgb: [v, v, v]
    })),
        idx = quantize(g, gp, method),
        res = new Float32Array(rgb.length);
    idx.forEach((q, i) => {
        res.set(sorted[q], i * 3)
    });
    return res
}
// ---- Budget fitting ----
const budgetValue = () => {
    const v = +$("budget").value;
    return v > 0 ? v : 0
};
const priceFor = counts => calcPrice(CFG.pricing, CFG.map.stack, BLOCKS.map((b, i) => ({
    n: b.name,
    blocks: counts[i] || 0,
    sp: b.stack_price
})), rnd);

function runRaw(rgb, method, active) {
    const pal = PAL.filter(c => active.has(c.bi)),
        idx = quantize(rgb, pal, method),
        counts = [];
    idx.forEach(q => {
        counts[pal[q].bi] = (counts[pal[q].bi] || 0) + 1
    });
    return {
        idx,
        pal,
        counts,
        price: priceFor(counts)
    }
}
// A motif needs >= minB block types: if quantizing used fewer, the best-fitting pixels (smallest extra error) are given to an unused block.
function enforceMin(rgb, r, minB) {
    if (r.counts.filter(n => n > 0).length >= minB) return r;
    const have = new Set(r.idx),
        cand = r.pal.findIndex((_, i) => !have.has(i));
    if (cand < 0) return r;
    const m = [];
    for (let i = 0; i < N * N; i++) {
        const p = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
        m.push([matchDist(r.pal[cand], p) - matchDist(r.pal[r.idx[i]], p), i])
    }
    m.sort((a, b) => a[0] - b[0]);
    for (let k = 0, w = Math.ceil(N * N * CFG.budget.minBlockShare); k < w; k++) r.idx[m[k][1]] = cand;
    const counts = [];
    r.idx.forEach(q => {
        counts[r.pal[q].bi] = (counts[r.pal[q].bi] || 0) + 1
    });
    return {
        ...r,
        counts,
        price: priceFor(counts)
    }
}
const run = (rgb, method, active, minB = 1) => enforceMin(rgb, runRaw(rgb, method, active), minB);

function isUniform(rgb) {
    for (let i = 3; i < rgb.length; i++)
        if (rgb[i] !== rgb[i % 3]) return false;
    return true
}

function histogram(rgb) {
    const s = CFG.budget.histShift,
        half = 1 << (s - 1),
        q = v => Math.min(255, ((Math.round(v) >> s) << s) + half),
        h = new Map();
    for (let i = 0; i < N * N; i++) {
        const k = (q(rgb[i * 3]) << 16) | (q(rgb[i * 3 + 1]) << 8) | q(rgb[i * 3 + 2]);
        h.set(k, (h.get(k) || 0) + 1)
    }
    return [...h].map(([k, n]) => ({
        rgb: [k >> 16, (k >> 8) & 255, k & 255],
        n
    }))
}
// Fast estimate (coarse histogram + precomputed distances D[block][cell]): match error and final price of a block set
function assess(hist, D, set) {
    let err = 0;
    const counts = [];
    hist.forEach((h, u) => {
        let best = Infinity,
            bb = -1;
        for (const b of set) {
            const d = D[b][u];
            if (d < best) {
                best = d;
                bb = b
            }
        }
        err += h.n * best;
        counts[bb] = (counts[bb] || 0) + h.n
    });
    return {
        err,
        price: priceFor(counts).cust
    }
}

function growTo(set, hist, D, size) {
    while (set.size < size) {
        let best = -1,
            be = Infinity;
        BLOCKS.forEach((_, b) => {
            if (set.has(b)) return;
            const e = assess(hist, D, new Set([...set, b])).err;
            if (e < be) {
                be = e;
                best = b
            }
        });
        if (best < 0) break;
        set.add(best)
    }
}

function dropCheapestLoss(set, hist, D) {
    const base = assess(hist, D, set);
    let best = -1,
        bs = Infinity;
    for (const b of set) {
        const s = new Set(set);
        s.delete(b);
        const a = assess(hist, D, s),
            sc = (a.err - base.err) / (Math.max(0, base.price - a.price) + CFG.budget.dropCostBias);
        if (sc < bs) {
            bs = sc;
            best = b
        }
    }
    set.delete(best)
}
// Hill climbing: add/swap blocks while the (estimated) price stays within budget and the match error shrinks
function improve(set, hist, D, budget) {
    for (let step = 0; step < CFG.budget.maxSteps; step++) {
        const cur = assess(hist, D, set);
        let best = null;
        const consider = s => {
            const a = assess(hist, D, s);
            if (a.price <= budget && a.err < cur.err - 1e-9 && (!best || a.err < best.err || (a.err === best.err && a.price > best.price))) best = {
                s,
                err: a.err,
                price: a.price
            }
        };
        BLOCKS.forEach((_, b) => {
            if (set.has(b)) return;
            consider(new Set([...set, b]));
            for (const a of set) {
                const s = new Set(set);
                s.delete(a);
                s.add(b);
                consider(s)
            }
        });
        if (!best) break;
        set = best.s
    }
    return set
}
const METHODS = DITHERS.map(d => d[0]);

function boxBlur(a) {
    const R = CFG.budget.compareBlur,
        o = new Float32Array(a.length);
    for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
            let c = 0,
                s0 = 0,
                s1 = 0,
                s2 = 0;
            for (let dy = -R; dy <= R; dy++)
                for (let dx = -R; dx <= R; dx++) {
                    const xx = x + dx,
                        yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
                    const j = (yy * N + xx) * 3;
                    c++;
                    s0 += a[j];
                    s1 += a[j + 1];
                    s2 += a[j + 2]
                }
            const k = (y * N + x) * 3;
            o[k] = s0 / c;
            o[k + 1] = s1 / c;
            o[k + 2] = s2 / c
        }
    return o
}
// Perceived quality: blurred reference vs blurred result (dithering is judged by how it looks, not per pixel)
function lowpassError(A, r) {
    const out = new Float32Array(N * N * 3);
    r.idx.forEach((q, i) => out.set(r.pal[q].rgb, i * 3));
    const B = boxBlur(out);
    let e = 0;
    for (let i = 0; i < N * N; i++) e += distFn([A[i * 3], A[i * 3 + 1], A[i * 3 + 2]], [B[i * 3], B[i * 3 + 1], B[i * 3 + 2]]);
    return e
}
// input(m) -> {rgb, m}: pixel data + quantizer mode for dithering mode m; ref = undithered reference image
function fitToBudget(input, method, budget, uniform, ref) {
    const minB = uniform ? 1 : CFG.budget.minBlocks;
    method = uniform ? "none" : method; // a single-color image must not be dithered into a second block
    const in0 = input(method),
        rgb = in0.rgb,
        hist = histogram(rgb),
        D = BLOCKS.map((_, b) => Float64Array.from(hist, h => matchDist(PAL[b], h.rgb)));
    let r = run(rgb, in0.m, new Set(BLOCKS.map((_, i) => i)));
    const used = new Set();
    r.counts.forEach((n, i) => used.add(i));
    const info = {
        uniform,
        minB,
        forced: used.size < minB,
        method,
        switched: false
    };
    if (info.forced) {
        growTo(used, hist, D, minB);
        r = run(rgb, in0.m, used, minB)
    }
    if (!budget || r.price.cust <= budget) return {
        ...r,
        ...info,
        limited: false,
        tooLow: false
    };
    if (!uniform) { // 1st remedy: another dithering mode may need fewer / cheaper blocks -> keep the best-looking one that fits
        const A = boxBlur(ref),
            all = new Set(BLOCKS.map((_, i) => i));
        let best = null;
        for (const m of METHODS) {
            if (m === method) continue;
            const im = input(m),
                rm = run(im.rgb, im.m, all);
            if (rm.price.cust > budget || rm.counts.filter(n => n > 0).length < minB) continue;
            const e = lowpassError(A, rm);
            if (!best || e < best.e) best = {
                rm,
                m,
                e
            }
        }
        if (best) return {
            ...best.rm,
            ...info,
            method: best.m,
            switched: true,
            forced: false,
            limited: false,
            tooLow: false
        }
    }
    let set = new Set(used); // 2nd remedy: fewer block types
    while (set.size > minB && assess(hist, D, set).price > budget) dropCheapestLoss(set, hist, D);
    set = improve(set, hist, D, budget);
    r = run(rgb, in0.m, set, minB);
    while (set.size > minB && r.price.cust > budget) {
        dropCheapestLoss(set, hist, D);
        r = run(rgb, in0.m, set, minB)
    } // verify with real dithering
    return {
        ...r,
        ...info,
        limited: true,
        tooLow: r.price.cust > budget
    }
}
// ---- UI / Crop ----
const cv = $("crop"),
    cx = cv.getContext("2d"),
    out = $("out"),
    ox = out.getContext("2d", {
        willReadFrequently: true
    });
let img = null,
    zoom = 1,
    px = .5,
    py = .5,
    rnd = null;

function drawCrop() {
    cx.fillStyle = "#000";
    cx.fillRect(0, 0, 384, 384);
    if (!img) return;
    const m = Math.min(img.width, img.height),
        s = m / zoom,
        sx = Math.max(0, Math.min(img.width - s, px * img.width - s / 2)),
        sy = Math.max(0, Math.min(img.height - s, py * img.height - s / 2));
    cx.drawImage(img, sx, sy, s, s, 0, 0, 384, 384);
    return [sx, sy, s]
}
// ---- Image adjustments (applied to the cropped image BEFORE the single reduction to 128x128) ----
const adjVals = () => ({
    b: +$("adjB").value,
    c: +$("adjC").value,
    g: +$("adjG").value,
    s: +$("adjS").value
});
const adjustActive = () => {
    const a = adjVals();
    return a.b !== 0 || a.c !== 0 || a.g !== 100 || a.s !== 0
};

function applyAdjust(id) {
    const a = adjVals(),
        d = id.data,
        lut = new Uint8ClampedArray(256),
        C = a.c * 2.55,
        f = (259 * (C + 255)) / (255 * (259 - C)),
        sat = 1 + a.s / 100;
    for (let v = 0; v < 256; v++) {
        let x = 255 * Math.pow(v / 255, 100 / a.g) + a.b * 2.55;
        lut[v] = f * (x - 128) + 128
    }
    for (let i = 0; i < d.length; i += 4) {
        let r = lut[d[i]],
            g = lut[d[i + 1]],
            b = lut[d[i + 2]];
        if (a.s) {
            const y = .299 * r + .587 * g + .114 * b;
            r = y + (r - y) * sat;
            g = y + (g - y) * sat;
            b = y + (b - y) * sat
        }
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b
    }
}

function cropSource(r) {
    const [sx, sy, s] = r;
    if (!adjustActive()) return [img, sx, sy, s];
    const T = Math.max(1, Math.round(s)),
        c = document.createElement("canvas");
    c.width = c.height = T;
    const x = c.getContext("2d", {
        willReadFrequently: true
    });
    x.fillStyle = "#000";
    x.fillRect(0, 0, T, T);
    x.drawImage(img, sx, sy, s, s, 0, 0, T, T);
    const id = x.getImageData(0, 0, T, T);
    applyAdjust(id);
    x.putImageData(id, 0, 0);
    return [c, 0, 0, T]
}

function process() {
    if (!PAL) return;
    if (rnd === null) rnd = Math.floor(CFG.pricing.rndMin + Math.random() * (CFG.pricing.rndMax - CFG.pricing.rndMin + 1)); // generated once per image
    const r = drawCrop();
    if (!r) return;
    const t = document.createElement("canvas");
    t.width = t.height = N;
    const tx = t.getContext("2d");
    tx.fillStyle = "#000";
    tx.fillRect(0, 0, N, N); // Transparenz -> #000000
    tx.imageSmoothingQuality = "high";
    const [cs, sx, sy, sw] = cropSource(r);
    tx.drawImage(cs, sx, sy, sw, sw, 0, 0, N, N); // einzige Skalierung
    const d = tx.getImageData(0, 0, N, N).data;
    let rgb = new Float32Array(N * N * 3);
    for (let i = 0; i < N * N; i++)
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = d[i * 4 + c];
    const method = $("dt").value,
        uniform = isUniform(rgb);
    if ($("pe").checked) posterize(rgb, +$("pl").value);
    const base = rgb,
        input = m => $("c3").checked ? {
            rgb: threeColor(base, [$("k1").value, $("k2").value, $("k3").value], +$("bal").value, m),
            m: "none"
        } : {
            rgb: base,
            m
        };
    const fit = fitToBudget(input, method, budgetValue(), uniform, base),
        pal = fit.pal,
        od = ox.createImageData(N, N),
        counts = fit.counts;
    fit.idx.forEach((q, i) => od.data.set([...pal[q].rgb, 255], i * 4));
    ox.putImageData(od, 0, 0);
    const p = fit.price,
        f = fmt,
        plural = n => n + " block type" + (n === 1 ? "" : "s");
    const notes = [`This design uses ${plural(p.distinct)}. More block types make a build more complex and therefore more expensive.`, "Flat map art: every block type appears in one single shade, exactly as shown in the preview."];
    notes.push(fit.uniform ? "Your image has only one color, so a single block type is enough." : `A motif needs at least ${fit.minB} different block types${fit.forced ? " - we added one more block to your design" : ""}.`);
    if (fit.switched) notes.push(`To fit your budget of ${f(budgetValue())}, we switched dithering to ${DITHERS.find(d => d[0] === fit.method)[1]} and kept all block types.`);
    if (fit.limited) notes.push(fit.tooLow ? `Even with the minimum of ${fit.minB} block type${fit.minB === 1 ? "" : "s"} this design is above your budget of ${f(budgetValue())}. We show the cheapest version.` : `To fit your budget of ${f(budgetValue())}, the design was simplified to ${plural(p.distinct)} and gets as close to your limit as possible.`);
    notes.push("This price is only a rough guide. The actual cost can be negotiated with us on Discord.");
    $("price").innerHTML = `<table class="price"><tr><th>Name</th><th>New Price</th></tr><tr><td>Standard Price</td><td>${f(p.list)}</td></tr><tr><td>– Rounding off</td><td>${f(p.base)}</td></tr><tr><td>– ${CFG.pricing.customerDiscPct}% Opening Bonus</td><td>${f(p.cust)}</td></tr></table><div class="big">Final Price: ${f(p.cust)}</div>` + notes.map(t => `<p class="note">${t}</p>`).join("");
    $("how").textContent = `Send the downloaded PNG and your product code privately on Discord to ${CFG.site.discord}.`;
    window.__last = {
        p,
        counts,
        opts: {
            budget: budgetValue(),
            dt: fit.method,
            adj: adjustActive() ? adjVals() : 0,
            pe: $("pe").checked ? +$("pl").value : 0,
            c3: $("c3").checked ? [$("k1").value, $("k2").value, $("k3").value, +$("bal").value] : 0
        }
    }
}
$("file").onchange = e => {
    const f = e.target.files[0];
    $("err").textContent = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return $("err").textContent = "This file type is not supported. Please use PNG, JPG, WebP, GIF or BMP.";
    if (f.size > CFG.map.maxFileMB * 1048576) return $("err").textContent = "File too large (max. " + CFG.map.maxFileMB + " MB).";
    const im = new Image(),
        u = URL.createObjectURL(f);
    im.onload = () => {
        const k = Math.min(1, CFG.map.maxWork / Math.max(im.width, im.height)),
            c = document.createElement("canvas");
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        img = c;
        URL.revokeObjectURL(u);
        rnd = null;
        zoom = 1;
        px = py = .5;
        $("zoom").value = 1;
        process()
    };
    im.onerror = () => $("err").textContent = "The file is damaged or not a valid image.";
    im.src = u
};
let drag = null;
cv.onpointerdown = e => {
    drag = [e.clientX, e.clientY, px, py];
    cv.setPointerCapture(e.pointerId)
};
cv.onpointerup = () => drag = null;
cv.onpointermove = e => {
    if (!drag || !img) return;
    const s = Math.min(img.width, img.height) / zoom;
    px = drag[2] - (e.clientX - drag[0]) / cv.clientWidth * s / img.width;
    py = drag[3] - (e.clientY - drag[1]) / cv.clientHeight * s / img.height;
    process()
};
["zoom", "pe", "pl", "c3", "k1", "k2", "k3", "bal", "dt", "ds", "adjB", "adjC", "adjG", "adjS"].forEach(i => $(i).oninput = () => {
    if (i === "zoom") zoom = +$("zoom").value;
    process()
});
$("dl").onclick = () => {
    if (!img) return $("err").textContent = "Please upload an image first.";
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "donutmap.png";
    a.click()
};
$("cc").onclick = async () => {
    if (!window.__last) return $("err").textContent = "Please upload an image first.";
    const L = window.__last,
        p = L.p;
    $("code").value = await makeCode({
        v: CFG.codeVersion,
        size: N,
        stack: CFG.map.stack,
        blocks: p.rows,
        cost: p.cost,
        profit: p.profit,
        target: p.target,
        round: CFG.pricing.round,
        rnd: p.rnd,
        distinct: p.distinct,
        extra: p.extra,
        list: p.list,
        base: p.base,
        cust: p.cust,
        pricing: CFG.pricing,
        opts: L.opts
    });
    $("code").select();
    try {
        await navigator.clipboard.writeText($("code").value)
    } catch (e) { }
};
(async function init() {
    try {
        let b;
        [CFG, b] = await Promise.all([loadJSON("variables.json"), loadJSON("blocks.json")]);
        BLOCKS = b.blocks;
        N = CFG.map.size;
        PAL = buildPalette(BLOCKS);
        $("ds").value = CFG.dither.errorStrength;
        $("name").textContent = CFG.site.name;
        $("description").textContent = CFG.site.description || "";
        document.title = CFG.site.name;
    } catch (e) {
        console.error("Config error:", e);
        $("err").textContent = "The configuration could not be loaded. Please try again later (and serve the site via http, not file://)."
    }
})();
$("budget").onchange = process;
$("adjReset").onclick = () => {
    ["adjB", "adjC", "adjS"].forEach(i => $(i).value = 0);
    $("adjG").value = 100;
    process()
};

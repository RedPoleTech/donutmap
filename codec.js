// Product code: AES-GCM (obfuscation + tamper detection of ciphertext) + SHA-256 checksum of the payload.
// The key is derived from a public constant -> NOT secret; no cryptographic authenticity without a server secret.
const b64u = u => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const OBFUSCATION_SEED = "donutmap-obfuscation-v1";
async function codeKey() {
    const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(OBFUSCATION_SEED));
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
}
async function checksum(o) {
    return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(o))))).slice(0, 16)
}
async function makeCode(payload) {
    const s = new Blob([JSON.stringify({
        p: payload,
        h: await checksum(payload)
    })]).stream().pipeThrough(new CompressionStream("deflate-raw")),
        data = new Uint8Array(await new Response(s).arrayBuffer()),
        iv = crypto.getRandomValues(new Uint8Array(12)),
        enc = new Uint8Array(await crypto.subtle.encrypt({
            name: "AES-GCM",
            iv
        }, await codeKey(), data));
    return "DM" + payload.v + "-" + b64u(new Uint8Array([...iv, ...enc]))
}
async function readCode(code) {
    const m = /^DM(\d+)-([\w-]+)$/.exec(code.trim());
    if (!m) throw new Error("Invalid code format.");
    let plain;
    try {
        const raw = unb64u(m[2]);
        plain = await crypto.subtle.decrypt({
            name: "AES-GCM",
            iv: raw.slice(0, 12)
        }, await codeKey(), raw.slice(12))
    } catch (e) {
        throw new Error("The code cannot be decrypted - it is damaged or was modified.")
    }
    const o = JSON.parse(await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text());
    return {
        prefixVersion: +m[1],
        payload: o.p,
        checksumOk: o.h === await checksum(o.p)
    }
}

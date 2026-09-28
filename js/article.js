import { db, F } from "./firebase.js";
import { mountChrome, $, esc, fmtDate, fmtDateTime, md, coverHTML, tagHTML, rowHTML, safeUrl } from "./common.js";

mountChrome({});
const id = new URLSearchParams(location.search).get("id");
const box = $("#story");

const notFound = () => {
  box.innerHTML = `<div class="empty"><strong>Story not found</strong>It may have been removed or not published yet. <a href="index.html" style="text-decoration:underline">Back to the latest stories</a></div>`;
};

(async () => {
  if (!id) return notFound();
  try {
    const s = await F.getDoc(F.doc(db, "articles", id));
    if (!s.exists()) return notFound();
    const a = { id, ...s.data() };
    render(a);
    related(a);
  } catch (e) { console.warn(e); notFound(); }
})();

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } }

function render(a) {
  document.title = `${a.title} — FvcktheRules Journal`;
  const isAI = a.generatedBy === "AI";
  const sources = (a.sources || []).map(safeUrl).filter(Boolean);
  box.innerHTML = `
    <div class="meta">${tagHTML(a)}<time>${fmtDate(a.publishedAt || a.createdAt)}</time></div>
    <h1>${esc(a.title)}</h1>
    <p class="stand">${esc(a.summary)}</p>
    <div class="byline">By ${esc(a.author || (isAI ? "FvcktheRules AI" : "FvcktheRules"))}${a.status !== "published" ? " — not published yet (only you can see this)" : ""}</div>
    ${coverHTML(a)}
    <div class="prose">${md(a.content)}</div>
    ${isAI ? `<div class="notice" style="margin-top:28px"><strong>AI-generated summary.</strong> Written by AI from public reporting on ${esc(fmtDateTime(a.createdAt))}${a.reviewed ? ", then reviewed by an editor" : ""}. News changes fast, so check the sources below for the latest.</div>` : ""}
    ${sources.length ? `<section class="sources"><h2>Sources</h2><ul>${sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(host(u))}</a></li>`).join("")}</ul></section>` : ""}
    <div class="share"><button class="btn ghost sm" id="shareBtn">Share this story</button></div>`;
  $("#shareBtn").addEventListener("click", async (e) => {
    const url = location.href;
    try { if (navigator.share) await navigator.share({ title: a.title, url }); else { await navigator.clipboard.writeText(url); e.target.textContent = "Link copied"; } } catch {}
  });
}

async function related(a) {
  try {
    const snap = await F.getDocs(F.query(F.collection(db, "articles"), F.where("status", "==", "published"), F.orderBy("publishedAt", "desc"), F.limit(30)));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.id !== a.id);
    const pick = [...all.filter((x) => x.category === a.category), ...all.filter((x) => x.category !== a.category)].slice(0, 3);
    if (!pick.length) return;
    $("#more").innerHTML = `<h2>More stories</h2>${pick.map(rowHTML).join("")}`;
  } catch {}
}

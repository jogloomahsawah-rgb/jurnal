import { db, F } from "./firebase.js";
import { mountChrome, $, esc, fmtDate, catLabel, coverHTML, tagHTML, rowHTML, errBox } from "./common.js";

const cat = new URLSearchParams(location.search).get("cat");
mountChrome({ active: cat || "latest" });
document.title = (cat ? `${catLabel(cat)} — ` : "") + "FvcktheRules Journal";

const feed = $("#feed");

async function load() {
  try {
    const snap = await F.getDocs(F.query(
      F.collection(db, "articles"), F.where("status", "==", "published"),
      F.orderBy("publishedAt", "desc"), F.limit(60)));
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (cat) items = items.filter((a) => a.category === cat);
    render(items);
  } catch (e) { console.error(e); feed.innerHTML = errBox(e); }
}

function render(items) {
  const head = cat ? `<h1 class="page-title">${esc(catLabel(cat))}</h1><p class="page-sub">${items.length} ${items.length === 1 ? "story" : "stories"}, newest first.</p>` : "";
  if (!items.length) {
    feed.innerHTML = head + `<div class="empty"><strong>Nothing here yet</strong>New stories land after each research run and after an editor approves them. Check back soon.</div>`;
    return;
  }
  const [lead, ...rest] = items;
  feed.innerHTML = head + `
    <a class="lead" href="article.html?id=${esc(lead.id)}">${coverHTML(lead)}
      <div class="lead-body"><div class="meta">${tagHTML(lead)}<time>${fmtDate(lead.publishedAt)}</time></div>
      <h2>${esc(lead.title)}</h2><p>${esc(lead.summary)}</p></div></a>
    ${rest.map(rowHTML).join("")}`;
}

async function side() {
  let terrace = "";
  try {
    const s = await F.getDocs(F.query(F.collection(db, "posts"), F.where("status", "==", "published"), F.orderBy("createdAt", "desc"), F.limit(1)));
    if (!s.empty) {
      const p = s.docs[0].data();
      const txt = (p.label ? p.label + ". " : "") + p.content;
      terrace = `<div class="box"><h3>From the terrace</h3><p>${esc(txt.length > 200 ? txt.slice(0, 200) + "…" : txt)}</p><a class="btn sm" href="discussion.html">Join the discussion</a></div>`;
    }
  } catch {}
  $("#side").innerHTML = terrace + `<div class="box turf"><h3>The store</h3><p>Limited runs, pre-orders and the archive live on the main site.</p><a class="btn bib sm" href="https://fucktherules.my.id/">Visit FvcktheRules</a></div>`;
}

load(); side();

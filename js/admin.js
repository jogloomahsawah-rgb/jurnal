import { db, F } from "./firebase.js";
import {
  mountChrome, onAuth, getUser, openAuth, esc, fmtDate, fmtDateTime, nameOf, catLabel, CATS, md, coverHTML, tagHTML, safeUrl, $, $$,
} from "./common.js";

mountChrome({ active: "admin" });
const root = $("#adminRoot");
let tab = "overview";
let articles = [];
let posts = [];

const TABS = [["overview", "Overview"], ["review", "AI review"], ["articles", "Articles"], ["discussion", "Discussion"], ["settings", "Settings"]];
const POLICY_KEYS = [
  ["football", "Football", "Transfers, leagues, Champions League and national teams."],
  ["culture", "Culture", "Fan culture, kits, streetwear crossovers."],
  ["world", "World", "General world news."],
  ["indonesia", "Indonesia", "Non-political current affairs."],
  ["politics", "Indonesian politics", "Keep this off. An editor should read every politics story before it goes live."],
];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2200);
}

/* ---------- gate ---------- */
onAuth((u, adm) => {
  if (!u) {
    root.innerHTML = `<h1>Admin</h1><div class="notice">Sign in with your admin account to continue.</div><p><button class="btn bib" id="gateLogin">Sign in</button></p>`;
    $("#gateLogin").addEventListener("click", () => openAuth("signin"));
    return;
  }
  if (!adm) {
    root.innerHTML = `<h1>Admin</h1><div class="notice bad"><strong>This account is not an admin.</strong><br>To make it one, open Firebase Console → Firestore → create the collection <code>admins</code> → add a document whose ID is this UID (fields can be empty):<br><br><code>${esc(u.uid)}</code></div>`;
    return;
  }
  shell();
  go(tab);
});

function shell() {
  root.innerHTML = `<h1>Admin</h1>
  <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}${k === "review" ? '<span class="count" id="draftCount" hidden></span>' : ""}</button>`).join("")}</div>
  <div id="panel"></div>`;
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  $("#panel").addEventListener("click", onPanelClick);
}

async function go(name) {
  tab = name;
  $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  const p = $("#panel");
  p.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    if (name === "overview") await renderOverview(p);
    else if (name === "review") { await loadArticles(); renderReview(p); }
    else if (name === "articles") { await loadArticles(); renderArticles(p); }
    else if (name === "discussion") { await loadPosts(); renderDiscussion(p); }
    else if (name === "settings") await renderSettings(p);
  } catch (e) { console.error(e); p.innerHTML = `<div class="notice bad" role="alert">Could not load this tab: ${esc(e.code || e.message)}</div>`; }
}

/* ---------- data ---------- */
async function loadArticles() {
  const s = await F.getDocs(F.query(F.collection(db, "articles"), F.orderBy("createdAt", "desc"), F.limit(150)));
  articles = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const n = articles.filter((a) => a.status === "draft").length;
  const c = $("#draftCount"); if (c) { c.textContent = n; c.hidden = !n; }
}
async function loadPosts() {
  const s = await F.getDocs(F.query(F.collection(db, "posts"), F.orderBy("createdAt", "desc"), F.limit(50)));
  posts = s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
const cnt = (q) => F.getCountFromServer(q).then((s) => s.data().count);

/* ---------- overview ---------- */
async function renderOverview(p) {
  const A = F.collection(db, "articles");
  const [pub, dr, users, ps] = await Promise.all([
    cnt(F.query(A, F.where("status", "==", "published"))),
    cnt(F.query(A, F.where("status", "==", "draft"))),
    cnt(F.collection(db, "users")),
    cnt(F.collection(db, "posts")),
  ]);
  const u = await F.getDocs(F.query(F.collection(db, "users"), F.orderBy("createdAt", "desc"), F.limit(10)));
  const c = $("#draftCount"); if (c) { c.textContent = dr; c.hidden = !dr; }
  p.innerHTML = `<div class="tiles">
    <div class="tile"><b>${pub}</b><span>Published stories</span></div>
    <div class="tile"><b>${dr}</b><span>Drafts waiting for review</span></div>
    <div class="tile"><b>${users}</b><span>Registered members</span></div>
    <div class="tile"><b>${ps}</b><span>Discussion posts</span></div></div>
    ${dr ? `<p><button class="btn bib" data-go="review">Review ${dr} draft${dr > 1 ? "s" : ""}</button></p>` : ""}
    <h2 style="font-size:2rem;margin:26px 0 8px">Newest members</h2>
    <table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead><tbody>
    ${u.docs.map((d) => { const x = d.data(); return `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${fmtDate(x.createdAt)}</td></tr>`; }).join("") || '<tr><td colspan="3">No members yet.</td></tr>'}
    </tbody></table>`;
}

/* ---------- AI review ---------- */
function articleRow(a, acts) {
  return `<div class="arow" data-id="${esc(a.id)}"><div>
    <div class="meta">${tagHTML(a)}<span>${esc(a.status)}</span><time>${fmtDateTime(a.createdAt)}</time>${(a.sources || []).length ? `<span>${a.sources.length} sources</span>` : "<span>no sources</span>"}</div>
    <h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p></div><div class="acts">${acts}</div></div>`;
}
function renderReview(p) {
  const drafts = articles.filter((a) => a.status === "draft");
  p.innerHTML = `<div class="toolbar"><p style="margin:0;color:var(--muted)">Stories the AI wrote that are waiting for you. Read the sources before publishing.</p></div>` +
    (drafts.length ? drafts.map((a) => articleRow(a,
      `<button class="btn ghost sm" data-act="preview">Preview</button><button class="btn ghost sm" data-act="edit">Edit</button><button class="btn bib sm" data-act="publish">Publish</button><button class="btn danger sm" data-act="reject">Reject</button>`)).join("")
      : `<div class="empty"><strong>Nothing to review</strong>New drafts appear here after each AI research run.</div>`);
}

/* ---------- all articles ---------- */
let filter = "all";
function renderArticles(p) {
  const list = articles.filter((a) => filter === "all" || a.status === filter);
  p.innerHTML = `<div class="toolbar"><select id="artFilter" aria-label="Filter by status">
    ${["all", "published", "draft", "rejected"].map((s) => `<option value="${s}"${s === filter ? " selected" : ""}>${s === "all" ? "All stories" : s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>
    <button class="btn bib" data-act="new">Create article</button></div>` +
    (list.length ? list.map((a) => articleRow(a,
      `<button class="btn ghost sm" data-act="preview">Preview</button><button class="btn ghost sm" data-act="edit">Edit</button>` +
      (a.status === "published" ? `<button class="btn ghost sm" data-act="unpublish">Unpublish</button>` : `<button class="btn bib sm" data-act="publish">Publish</button>`) +
      `<button class="btn danger sm" data-act="remove">Delete</button>`)).join("") : `<div class="empty"><strong>No stories here</strong>Create one, or wait for the next AI run.</div>`);
  $("#artFilter").addEventListener("change", (e) => { filter = e.target.value; renderArticles(p); });
}

/* ---------- discussion ---------- */
function renderDiscussion(p) {
  p.innerHTML = `<h2 style="font-size:2rem;margin-bottom:10px">New post</h2>
  <form id="postForm" novalidate style="max-width:720px;margin-bottom:26px">
    <label class="f">Heading (optional)<input id="pLabel" maxlength="80" placeholder="Update, 25 September"></label>
    <label class="f">Message<textarea id="pContent" maxlength="1500" placeholder="New drop is coming. What do you think about the design?"></textarea></label>
    <label class="f">Image link (optional)<input id="pImage" type="url" placeholder="https://fucktherules.my.id/images/…"></label>
    <p class="err" id="pErr" role="alert"></p><button class="btn bib" type="submit">Publish post</button></form>
  <h2 style="font-size:2rem;margin-bottom:6px">Posts</h2>` +
    (posts.length ? posts.map((x) => `<div class="arow" data-id="${esc(x.id)}"><div>
      <div class="meta"><span>${esc(x.status)}</span>${x.pinned ? '<span class="tag">Pinned</span>' : ""}<time>${fmtDateTime(x.createdAt)}</time></div>
      <h3>${esc(x.label || "Post")}</h3><p>${esc((x.content || "").slice(0, 200))}</p></div>
      <div class="acts"><button class="btn ghost sm" data-act="pin">${x.pinned ? "Unpin" : "Pin"}</button>
      <button class="btn ghost sm" data-act="hide">${x.status === "published" ? "Hide" : "Show"}</button>
      <button class="btn danger sm" data-act="delpost">Delete</button></div></div>`).join("")
      : `<div class="empty"><strong>No posts yet</strong>Write the first one above.</div>`) +
    `<p style="color:var(--muted);font-size:.95rem;margin-top:16px">Delete individual customer replies on the public Discussion page. Admins see a Delete button on every reply.</p>`;
  $("#postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = $("#pContent").value.trim(), image = safeUrl($("#pImage").value.trim());
    if (!content) return ($("#pErr").textContent = "Write a message first.");
    try {
      await F.addDoc(F.collection(db, "posts"), { label: $("#pLabel").value.trim(), content, image, author: "FvcktheRules", status: "published", pinned: false, createdAt: F.serverTimestamp() });
      toast("Post published"); go("discussion");
    } catch (err) { $("#pErr").textContent = "Could not publish: " + (err.code || err.message); }
  });
}

/* ---------- settings ---------- */
async function renderSettings(p) {
  let s = {};
  try { const d = await F.getDoc(F.doc(db, "settings", "news")); if (d.exists()) s = d.data(); } catch {}
  const auto = { football: true, culture: true, world: false, indonesia: false, politics: false, ...(s.autoPublish || {}) };
  const on = s.agentEnabled !== false;
  p.innerHTML = `<p style="max-width:60ch;margin-top:0">These switches are read by the AI research job every time it runs. Anything not on auto-publish lands in <b>AI review</b> as a draft.</p>
  <label class="check" style="border-top:0"><input type="checkbox" id="agentOn"${on ? " checked" : ""}><span><b>AI research is running</b>Turn off to pause all scheduled runs without touching GitHub.</span></label>
  ${POLICY_KEYS.map(([k, l, d]) => `<label class="check"><input type="checkbox" data-auto="${k}"${auto[k] ? " checked" : ""}><span><b>Auto-publish ${esc(l)}</b>${esc(d)}</span></label>`).join("")}
  <p><button class="btn bib" id="saveSettings">Save settings</button></p>`;
  $("#saveSettings").addEventListener("click", async () => {
    const autoPublish = {}; $$("[data-auto]").forEach((c) => (autoPublish[c.dataset.auto] = c.checked));
    try { await F.setDoc(F.doc(db, "settings", "news"), { agentEnabled: $("#agentOn").checked, autoPublish, updatedAt: F.serverTimestamp() }); toast("Settings saved"); }
    catch (e) { toast("Could not save settings"); }
  });
}

/* ---------- actions ---------- */
async function onPanelClick(e) {
  const g = e.target.closest("[data-go]"); if (g) return go(g.dataset.go);
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const act = btn.dataset.act;
  if (act === "new") return openEditor(null);
  const row = btn.closest(".arow"); const id = row?.dataset.id;
  const a = articles.find((x) => x.id === id);
  try {
    if (act === "preview") return openPreview(a);
    if (act === "edit") return openEditor(a);
    if (act === "publish") { await publish(a); toast("Published"); return go(tab); }
    if (act === "reject") { await F.updateDoc(F.doc(db, "articles", id), { status: "rejected", updatedAt: F.serverTimestamp() }); toast("Rejected"); return go(tab); }
    if (act === "unpublish") { await F.updateDoc(F.doc(db, "articles", id), { status: "draft", updatedAt: F.serverTimestamp() }); toast("Moved back to drafts"); return go(tab); }
    if (act === "remove") { if (confirm("Delete this story permanently?")) { await F.deleteDoc(F.doc(db, "articles", id)); toast("Deleted"); go(tab); } return; }
    const post = posts.find((x) => x.id === id);
    if (act === "pin") { await F.updateDoc(F.doc(db, "posts", id), { pinned: !post.pinned }); return go("discussion"); }
    if (act === "hide") { await F.updateDoc(F.doc(db, "posts", id), { status: post.status === "published" ? "hidden" : "published" }); return go("discussion"); }
    if (act === "delpost") {
      if (!confirm("Delete this post and all its replies?")) return;
      for (const sub of ["replies", "reactions"]) {
        const s = await F.getDocs(F.collection(db, "posts", id, sub));
        await Promise.all(s.docs.map((d) => F.deleteDoc(d.ref)));
      }
      await F.deleteDoc(F.doc(db, "posts", id)); toast("Post deleted"); return go("discussion");
    }
  } catch (err) { console.error(err); toast("Action failed: " + (err.code || "error")); }
}

function publish(a) {
  const data = { status: "published", reviewed: true, updatedAt: F.serverTimestamp() };
  if (!a.publishedAt) data.publishedAt = F.serverTimestamp();
  return F.updateDoc(F.doc(db, "articles", a.id), data);
}

/* ---------- dialogs ---------- */
function dialog(html, wide) {
  const d = document.createElement("dialog"); if (wide) d.className = "wide";
  d.innerHTML = `<div class="dlg">${html}</div>`;
  document.body.append(d); d.addEventListener("close", () => d.remove()); d.showModal(); return d;
}

function openPreview(a) {
  const d = dialog(`<div class="dlg-head"><h2>Preview</h2><button class="btn ghost sm" data-close>Close</button></div>
    <div class="meta">${tagHTML(a)}</div><h2 style="font-size:2.8rem;margin:10px 0">${esc(a.title)}</h2>
    <p class="stand">${esc(a.summary)}</p>${coverHTML(a)}<div class="prose" style="margin-top:16px">${md(a.content)}</div>
    <h3 style="font:800 1.6rem var(--head);margin-top:20px">Sources</h3><ul>${(a.sources || []).map(safeUrl).filter(Boolean).map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a></li>`).join("") || "<li>None</li>"}</ul>`, true);
  $("[data-close]", d).addEventListener("click", () => d.close());
}

function openEditor(a) {
  const isNew = !a;
  const x = a || { title: "", category: "football", summary: "", content: "", image: "", sources: [], author: nameOf(getUser()) };
  const d = dialog(`<div class="dlg-head"><h2>${isNew ? "Create article" : "Edit article"}</h2><button class="btn ghost sm" data-close>Close</button></div>
    <form id="edForm" novalidate>
    <label class="f">Title<input id="eTitle" maxlength="140" value="${esc(x.title)}"></label>
    <div class="grid2"><label class="f">Category<select id="eCat">${CATS.map(([k, l]) => `<option value="${k}"${x.category === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f">Author name<input id="eAuthor" maxlength="60" value="${esc(x.author || "")}"></label></div>
    <label class="f">Summary (shown on the home page)<textarea id="eSum" maxlength="300" style="min-height:70px">${esc(x.summary)}</textarea></label>
    <label class="f">Story (use ## for headings, - for lists, **bold**)<textarea id="eBody" style="min-height:260px">${esc(x.content)}</textarea></label>
    <label class="f">Image link (optional)<input id="eImg" type="url" value="${esc(x.image || "")}" placeholder="https://…"></label>
    <label class="f">Sources (one link per line)<textarea id="eSrc" style="min-height:80px">${esc((x.sources || []).join("\n"))}</textarea></label>
    <p class="err" id="eErr" role="alert"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" data-save="draft">Save draft</button><button class="btn bib" type="button" data-save="publish">Save and publish</button></div></form>`, true);
  $("[data-close]", d).addEventListener("click", () => d.close());
  $$("[data-save]", d).forEach((b) => b.addEventListener("click", async () => {
    const title = $("#eTitle").value.trim(), content = $("#eBody").value.trim();
    if (!title || !content) return ($("#eErr").textContent = "Title and story are required.");
    const data = {
      title, category: $("#eCat").value, author: $("#eAuthor").value.trim() || "FvcktheRules", summary: $("#eSum").value.trim(),
      content, image: safeUrl($("#eImg").value.trim()), sources: $("#eSrc").value.split("\n").map((s) => safeUrl(s.trim())).filter(Boolean),
      updatedAt: F.serverTimestamp(),
    };
    const pub = b.dataset.save === "publish";
    b.disabled = true;
    try {
      if (isNew) {
        await F.addDoc(F.collection(db, "articles"), { ...data, status: pub ? "published" : "draft", source: "admin", generatedBy: "Admin", reviewed: true, createdAt: F.serverTimestamp(), publishedAt: pub ? F.serverTimestamp() : null });
      } else {
        if (pub) { data.status = "published"; data.reviewed = true; if (!a.publishedAt) data.publishedAt = F.serverTimestamp(); }
        await F.updateDoc(F.doc(db, "articles", a.id), data);
      }
      d.close(); toast(pub ? "Published" : "Draft saved"); go(tab);
    } catch (err) { $("#eErr").textContent = "Could not save: " + (err.code || err.message); b.disabled = false; }
  }));
}

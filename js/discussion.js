import { db, F } from "./firebase.js";
import { mountChrome, onAuth, getUser, getIsAdmin, openAuth, esc, fmtDateTime, nameOf, errBox, $ } from "./common.js";

mountChrome({ active: "discussion" });
const list = $("#posts");
const TYPES = [["fire", "🔥"], ["heart", "❤️"], ["like", "👍"]];
const posts = new Map();

onAuth(() => load());

const count = (q) => F.getCountFromServer(q).then((s) => s.data().count);

async function hydrate(p) {
  const col = F.collection(db, "posts", p.id, "reactions");
  const [replies, ...rc] = await Promise.all([
    count(F.collection(db, "posts", p.id, "replies")),
    ...TYPES.map(([t]) => count(F.query(col, F.where("type", "==", t)))),
  ]);
  p.replyCount = replies;
  p.counts = Object.fromEntries(TYPES.map(([t], i) => [t, rc[i]]));
  p.mine = null;
  const u = getUser();
  if (u) { try { const s = await F.getDoc(F.doc(col, u.uid)); p.mine = s.exists() ? s.data().type : null; } catch {} }
}

async function load() {
  list.innerHTML = `<div class="loading">Loading the terrace…</div>`;
  try {
    const snap = await F.getDocs(F.query(F.collection(db, "posts"), F.where("status", "==", "published"), F.orderBy("createdAt", "desc"), F.limit(20)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    if (!items.length) { list.innerHTML = `<div class="empty"><strong>No posts yet</strong>The first post from the team will show up here.</div>`; return; }
    await Promise.all(items.map(hydrate));
    posts.clear(); items.forEach((p) => posts.set(p.id, p));
    list.innerHTML = items.map(postHTML).join("");
  } catch (e) { console.error(e); list.innerHTML = errBox(e); }
}

const reactBtns = (p) => TYPES.map(([t, e]) =>
  `<button class="react${p.mine === t ? " on" : ""}" data-react="${t}" aria-pressed="${p.mine === t}" aria-label="${t}">${e} <span>${p.counts[t]}</span></button>`).join("");

function postHTML(p) {
  return `<article class="post" data-id="${esc(p.id)}">
    <header><span class="avatar" aria-hidden="true">F</span><div><strong>FvcktheRules</strong><span class="tag">Admin</span>${p.pinned ? '<span class="tag ai">Pinned</span>' : ""}<time>${fmtDateTime(p.createdAt)}</time></div></header>
    ${p.label ? `<h2 class="post-label">${esc(p.label)}</h2>` : ""}
    <p class="post-text">${esc(p.content)}</p>
    ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <div class="actions"><span class="reacts">${reactBtns(p)}</span><button class="btn ghost sm" data-toggle>Replies (<span class="rc">${p.replyCount}</span>)</button></div>
    <div class="thread" hidden></div></article>`;
}

async function loadThread(el, p) {
  const th = $(".thread", el);
  th.innerHTML = `<div class="loading" style="padding:16px 0">Loading replies…</div>`;
  try {
    const s = await F.getDocs(F.query(F.collection(db, "posts", p.id, "replies"), F.orderBy("createdAt", "asc"), F.limit(100)));
    const u = getUser(), adm = getIsAdmin();
    const rows = s.docs.map((d) => { const r = d.data(); const mine = u && r.uid === u.uid;
      return `<div class="reply" data-rid="${d.id}"><strong>${esc(r.name)}</strong>${r.isAdmin ? '<span class="tag">Admin</span>' : ""}<time>${fmtDateTime(r.createdAt)}</time>${mine || adm ? '<button data-del>Delete</button>' : ""}<p>${esc(r.content)}</p></div>`; }).join("");
    p.replyCount = s.size; $(".rc", el).textContent = s.size;
    th.innerHTML = (rows || `<p style="color:var(--muted);margin:0">No replies yet. Be the first.</p>`) + (u
      ? `<div class="composer"><textarea maxlength="600" placeholder="Write a reply…" aria-label="Your reply"></textarea><button class="btn sm" data-send>Post reply</button><span class="err" role="alert"></span></div>`
      : `<p class="signin-note">Sign in to join the discussion. <button class="btn bib sm" data-login>Sign in</button></p>`);
  } catch (e) { th.innerHTML = errBox(e); }
}

list.addEventListener("click", async (e) => {
  const el = e.target.closest(".post"); if (!el) return;
  const p = posts.get(el.dataset.id);
  const u = getUser();

  if (e.target.closest("[data-login]")) return openAuth("signin");

  if (e.target.closest("[data-toggle]")) {
    const th = $(".thread", el);
    if (th.hidden) { th.hidden = false; await loadThread(el, p); } else th.hidden = true;
    return;
  }

  const rb = e.target.closest("[data-react]");
  if (rb) {
    if (!u) return openAuth("signin");
    const t = rb.dataset.react, ref = F.doc(db, "posts", p.id, "reactions", u.uid);
    const prev = p.mine;
    try {
      if (prev === t) { await F.deleteDoc(ref); p.counts[t]--; p.mine = null; }
      else {
        await F.setDoc(ref, { type: t, uid: u.uid, createdAt: F.serverTimestamp() });
        if (prev) p.counts[prev]--; p.counts[t]++; p.mine = t;
      }
      $(".reacts", el).innerHTML = reactBtns(p);
    } catch (err) { console.warn(err); }
    return;
  }

  if (e.target.closest("[data-send]")) {
    const ta = $("textarea", el), errEl = $(".err", el), text = ta.value.trim();
    if (!text) return (errEl.textContent = "Write something first.");
    e.target.disabled = true; errEl.textContent = "";
    try {
      await F.addDoc(F.collection(db, "posts", p.id, "replies"), {
        uid: u.uid, name: nameOf(u).slice(0, 60), content: text.slice(0, 600), isAdmin: getIsAdmin(), createdAt: F.serverTimestamp() });
      await loadThread(el, p);
    } catch (err) { console.warn(err); errEl.textContent = "Could not post your reply. Try again."; e.target.disabled = false; }
    return;
  }

  const del = e.target.closest("[data-del]");
  if (del && confirm("Delete this reply?")) {
    try { await F.deleteDoc(F.doc(db, "posts", p.id, "replies", del.closest(".reply").dataset.rid)); await loadThread(el, p); } catch (err) { console.warn(err); }
  }
});

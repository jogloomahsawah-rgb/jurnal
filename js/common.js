import { auth, db, A, F, configured } from "./firebase.js";

/* ---------- site constants ---------- */
export const MAIN = "https://fucktherules.my.id";
export const MAIN_LINKS = [
  ["Home", `${MAIN}/`],
  ["Pre Order", `${MAIN}/preorder`],
  ["Katalog", `${MAIN}/katalog`],
  ["Arsip", `${MAIN}/arsip`],
  ["Galeri", `${MAIN}/galeri`],
  ["Tentang", `${MAIN}/tentang`],
];
export const CATS = [
  ["football", "Football"],
  ["indonesia", "Indonesia"],
  ["world", "World"],
  ["culture", "Culture"],
  ["opinion", "Opinion"],
];

/* ---------- small helpers ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);
export const fmtDate = (ts) => {
  const d = toDate(ts);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
};
export const fmtDateTime = (ts) => {
  const d = toDate(ts);
  return d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
};
export const catLabel = (k) => (CATS.find((c) => c[0] === k) || [k, k || "News"])[1];
export const nameOf = (u) => u?.displayName || (u?.email || "reader").split("@")[0];
export const safeUrl = (u) => {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; }
};

export function errBox(e) {
  let msg = "Something went wrong while loading. Refresh and try again.";
  if (!configured) msg = "Firebase is not connected yet. Open js/firebase-config.js and paste your web app config.";
  else if (e?.code === "failed-precondition") msg = "The database index is missing. Deploy firestore.indexes.json or open the link in the browser console to create it (see README).";
  else if (e?.code === "permission-denied") msg = "Firestore rules blocked this request. Publish firestore.rules in the Firebase console (see README).";
  return `<div class="notice bad" role="alert">${esc(msg)}</div>`;
}

/* tiny markdown: ## headings, - lists, **bold**, *italic*, paragraphs */
export function md(src) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  return String(src || "").split(/\n{2,}/).map((blk) => {
    blk = blk.trim();
    if (!blk) return "";
    const m = blk.match(/^(#{2,3}) (.*)/);
    if (m) {
      const [first, ...rest] = blk.split("\n");
      const lvl = m[1].length;
      return `<h${lvl}>${inline(first.replace(/^#{2,3} /, ""))}</h${lvl}>` + (rest.length ? md(rest.join("\n")) : "");
    }
    if (/^[-*] /.test(blk)) return `<ul>${blk.split("\n").map((l) => `<li>${inline(l.replace(/^[-*] /, ""))}</li>`).join("")}</ul>`;
    return `<p>${inline(blk).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

/* ---------- covers: a different crop of a football pitch per story ---------- */
function pitch(seed) {
  const h = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const zoom = [1, 1.6, 2.2, 3][h % 4];
  const W = 105, H = 68, w = W / zoom, hh = H / zoom;
  const x = (((h >> 3) % 1000) / 1000) * (W - w), y = (((h >> 13) % 1000) / 1000) * (H - hh);
  return `<svg viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor">
  <rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/>
  <rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/>
  <rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/>
  <path d="M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31"/><path d="M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31"/></g></svg>`;
}
export const coverHTML = (a) =>
  `<div class="cover">${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<div class="pitch">${pitch(a.id || a.title)}</div>`}</div>`;
export const tagHTML = (a) =>
  `<span class="tag">${esc(catLabel(a.category))}</span>${a.generatedBy === "AI" ? '<span class="tag ai">AI summary</span>' : ""}`;
export const rowHTML = (a) => `<article class="row"><div>
  <div class="meta">${tagHTML(a)}<time>${fmtDate(a.publishedAt || a.createdAt)}</time></div>
  <h3><a href="article.html?id=${esc(a.id)}">${esc(a.title)}</a></h3><p>${esc(a.summary)}</p></div>
  <a class="row-thumb" href="article.html?id=${esc(a.id)}" tabindex="-1" aria-hidden="true">${coverHTML(a)}</a></article>`;

/* ---------- auth state ---------- */
let user = null, admin = false, ready = false;
const subs = [];
export const getUser = () => user;
export const getIsAdmin = () => admin;
export function onAuth(fn) { subs.push(fn); if (ready) fn(user, admin); }

async function ensureProfile(u, name) {
  try {
    const ref = F.doc(db, "users", u.uid);
    if (!(await F.getDoc(ref)).exists())
      await F.setDoc(ref, { name: name || nameOf(u), email: u.email || "", createdAt: F.serverTimestamp() });
  } catch (e) { console.warn("profile", e); }
}

A.onAuthStateChanged(auth, async (u) => {
  user = u; admin = false;
  if (u) {
    try { admin = (await F.getDoc(F.doc(db, "admins", u.uid))).exists(); } catch {}
  }
  ready = true;
  paintAuth();
  subs.forEach((fn) => fn(user, admin));
});

/* ---------- chrome (header, drawer, auth dialog, footer) ---------- */
let authDlg;
export function openAuth(mode = "signin") { setMode(mode); authDlg.showModal(); }

function paintAuth() {
  const b = $("#authBtn"); if (!b) return;
  b.textContent = user ? nameOf(user).split(" ")[0] : "Sign in";
  b.setAttribute("aria-haspopup", user ? "true" : "dialog");
  const m = $("#umenu");
  if (m) {
    m.innerHTML = user
      ? `<strong>${esc(nameOf(user))}</strong><small>${esc(user.email || "")}</small>${admin ? '<a class="btn bib sm" href="admin.html">Admin panel</a>' : ""}<button class="btn ghost sm" id="signOut">Sign out</button>`
      : "";
    if (!user) m.hidden = true;
    $("#signOut")?.addEventListener("click", () => { A.signOut(auth); m.hidden = true; });
  }
}

function setMode(mode) {
  authDlg.dataset.mode = mode;
  $$("[data-mode-btn]", authDlg).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.modeBtn === mode)));
  $("#nameField").hidden = mode !== "register";
  $("#authSubmit").textContent = mode === "register" ? "Create account" : "Sign in";
  $("#forgot").hidden = mode !== "signin";
  $("#authErr").textContent = "";
}

const AUTH_ERR = {
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/wrong-password": "Email or password is wrong.",
  "auth/user-not-found": "No account with that email. Use Create account.",
  "auth/email-already-in-use": "That email already has an account. Use Sign in.",
  "auth/weak-password": "Password needs at least 6 characters.",
  "auth/invalid-email": "That email address looks wrong.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
  "auth/unauthorized-domain": "This domain is not in Firebase → Authentication → Authorized domains.",
  "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase → Authentication.",
};

export function mountChrome({ active = "" } = {}) {
  const catLinks = CATS.map(([k, l]) => `<a href="index.html?cat=${k}"${active === k ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  $("#chrome-top").innerHTML = `
  <header class="mast">
    <div class="wrap mast-in">
      <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span><span></span><span></span></button>
      <a class="logo" href="index.html" aria-label="FvcktheRules Journal home">FvcktheRules<i>Journal</i></a>
      <button class="auth-btn" id="authBtn">Sign in</button>
    </div>
    <div class="umenu" id="umenu" hidden></div>
    <nav class="wrap cats" aria-label="Sections">
      <a href="index.html"${active === "latest" ? ' aria-current="page"' : ""}>Latest</a>${catLinks}
      <a href="discussion.html"${active === "discussion" ? ' aria-current="page"' : ""}>Discussion</a>
      <span class="spacer"></span><a href="${MAIN}/">Store</a>
    </nav>
  </header>
  <div class="backdrop" id="backdrop"></div>
  <aside class="drawer" id="drawer" aria-label="Menu">
    <div class="drawer-head"><strong style="font:900 1.6rem var(--head)">Menu</strong><button id="drawerClose">Close</button></div>
    <p class="dgroup first">Journal</p>
    <a class="dlink" href="index.html"${active === "latest" ? ' aria-current="page"' : ""}>Latest</a>
    ${CATS.map(([k, l]) => `<a class="dlink" href="index.html?cat=${k}"${active === k ? ' aria-current="page"' : ""}>${l}</a>`).join("")}
    <a class="dlink" href="discussion.html"${active === "discussion" ? ' aria-current="page"' : ""}>Discussion</a>
    <p class="dgroup">Main store · fucktherules.my.id</p>
    ${MAIN_LINKS.map(([l, u]) => `<a class="dlink small" href="${u}">${l} ↗</a>`).join("")}
  </aside>
  <dialog id="authDlg" data-mode="signin"><div class="dlg">
    <div class="dlg-head"><h2>Join the conversation</h2><button class="btn ghost sm" id="authClose" aria-label="Close">Close</button></div>
    <div class="tabs2"><button class="btn ghost sm" data-mode-btn="signin">Sign in</button><button class="btn ghost sm" data-mode-btn="register">Create account</button></div>
    <button class="btn ghost" id="googleBtn" style="width:100%">Continue with Google</button>
    <p class="or">or use email</p>
    <form id="authForm" novalidate>
      <label class="f" id="nameField" hidden>Name<input id="aName" autocomplete="name" maxlength="40" placeholder="How you appear in replies"></label>
      <label class="f">Email<input id="aEmail" type="email" autocomplete="email" required></label>
      <label class="f">Password<input id="aPass" type="password" autocomplete="current-password" required minlength="6"></label>
      <p class="err" id="authErr" role="alert"></p>
      <button class="btn bib" id="authSubmit" type="submit" style="width:100%">Sign in</button>
      <p style="margin:12px 0 0;font-size:.95rem"><button type="button" class="btn ghost sm" id="forgot">Forgot password</button></p>
    </form>
  </div></dialog>`;

  $("#chrome-bottom").innerHTML = `<footer class="foot"><div class="wrap foot-in">
    <div><b>FvcktheRules Journal</b><p>Football, Indonesia and street culture, written by the FvcktheRules team and by AI research that always shows its sources. AI summaries can be wrong. Check the sources on every story.</p></div>
    <nav aria-label="Main store">${MAIN_LINKS.map(([l, u]) => `<a href="${u}">${l}</a>`).join("")}</nav></div></footer>`;

  /* drawer */
  const drawer = $("#drawer"), back = $("#backdrop"), burger = $("#burger");
  const toggle = (open) => {
    drawer.classList.toggle("open", open); back.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    if (open) $("#drawerClose").focus(); else burger.focus();
  };
  burger.addEventListener("click", () => toggle(true));
  $("#drawerClose").addEventListener("click", () => toggle(false));
  back.addEventListener("click", () => toggle(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) toggle(false); });

  /* auth dialog */
  authDlg = $("#authDlg");
  $("#authClose").addEventListener("click", () => authDlg.close());
  $$("[data-mode-btn]", authDlg).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.modeBtn)));
  $("#authBtn").addEventListener("click", () => {
    if (!user) return openAuth("signin");
    const m = $("#umenu"); m.hidden = !m.hidden;
  });
  const fail = (e) => { $("#authErr").textContent = AUTH_ERR[e.code] || "Could not sign in. Try again."; console.warn(e); };
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#aEmail").value.trim(), pw = $("#aPass").value, name = $("#aName").value.trim();
    const register = authDlg.dataset.mode === "register";
    if (!email || pw.length < 6) return ($("#authErr").textContent = "Enter your email and a password of at least 6 characters.");
    if (register && !name) return ($("#authErr").textContent = "Enter the name you want to show in replies.");
    const btn = $("#authSubmit"); btn.disabled = true;
    try {
      if (register) {
        const c = await A.createUserWithEmailAndPassword(auth, email, pw);
        await A.updateProfile(c.user, { displayName: name });
        await ensureProfile(c.user, name);
        await c.user.reload(); user = auth.currentUser; paintAuth(); subs.forEach((fn) => fn(user, admin));
      } else {
        const c = await A.signInWithEmailAndPassword(auth, email, pw);
        await ensureProfile(c.user);
      }
      authDlg.close();
    } catch (err) { fail(err); } finally { btn.disabled = false; }
  });
  $("#googleBtn").addEventListener("click", async () => {
    try { const c = await A.signInWithPopup(auth, new A.GoogleAuthProvider()); await ensureProfile(c.user); authDlg.close(); } catch (err) { fail(err); }
  });
  $("#forgot").addEventListener("click", async () => {
    const email = $("#aEmail").value.trim();
    if (!email) return ($("#authErr").textContent = "Type your email above first, then press Forgot password.");
    try { await A.sendPasswordResetEmail(auth, email); $("#authErr").style.color = "var(--focus)"; $("#authErr").textContent = "Reset link sent. Check your inbox."; }
    catch (err) { $("#authErr").style.color = ""; fail(err); }
  });
  paintAuth();
}

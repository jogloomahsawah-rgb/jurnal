# FvcktheRules Journal (website kedua)

News + Discussion + Admin panel, terpisah dari toko utama tapi saling terhubung.
Frontend: GitHub Pages. Data: Firebase (Auth + Firestore, cukup paket gratis Spark).

```
journal.fucktherules.my.id   → situs ini (repo baru, Firebase baru)
fucktherules.my.id           → toko utama (tidak diubah, hanya tambah 2 link menu)
```

Hamburger di situs ini sudah berisi link ke toko: Home, Pre Order, Katalog, Arsip, Galeri, Tentang.
Ubah URL-nya di `js/common.js` (konstanta `MAIN_LINKS`).

## Isi proyek

| File | Fungsi |
|---|---|
| `index.html` | Beranda Journal + filter kategori (`?cat=football`) |
| `article.html?id=…` | Halaman artikel + sumber + "AI summary" |
| `discussion.html` | Post admin, reaksi 🔥❤️👍, balasan customer |
| `admin.html` | Panel admin (review AI, artikel, diskusi, setting, member) |
| `ai-agent/generate.mjs` | Riset + tulis 10 artikel per batch, simpan ke Firestore |
| `.github/workflows/ai-news.yml` | Jadwal 06:00 dan 15:00 WIB |
| `firestore.rules`, `firestore.indexes.json` | Keamanan dan index database |

## Setup (sekali saja)

### 1. Firebase baru
1. console.firebase.google.com → Add project (nama bebas, mis. `fvck-journal`). Google Analytics boleh dimatikan.
2. **Build → Authentication → Get started** → aktifkan **Email/Password** dan **Google**.
3. **Build → Firestore Database → Create database** (mode production, region `asia-southeast2` Jakarta).
4. **Project settings → Your apps → Web (`</>`)** → salin config → tempel ke `js/firebase-config.js`.
5. **Authentication → Settings → Authorized domains** → tambahkan `journal.fucktherules.my.id` (dan `USERNAME.github.io` kalau mau tes dulu).

### 2. Rules dan index
- **Firestore → Rules** → tempel isi `firestore.rules` → Publish.
- **Firestore → Indexes** → buat 2 composite index (collection `articles`: `status` asc + `publishedAt` desc; collection `posts`: `status` asc + `createdAt` desc). Atau pakai CLI: `firebase deploy --only firestore`.
  Cara termudah: buka situs, lihat console browser (F12), klik link "create index" yang muncul, lalu Create.

### 3. Repository dan domain
1. GitHub → repo baru (mis. `fucktherules-journal`) → upload semua isi folder ini (termasuk `.github`).
2. **Settings → Pages** → Deploy from branch → `main` / root. File `CNAME` sudah berisi `journal.fucktherules.my.id`.
3. Di DNS domain `fucktherules.my.id` tambah record: **CNAME** `journal` → `USERNAME.github.io`. Tunggu, lalu centang **Enforce HTTPS**.

### 4. Jadikan akun kamu admin
1. Buka situs → Sign in → Create account (akun ini terpisah dari akun toko karena Firebase-nya baru).
2. Buka `/admin.html`. Halaman akan menampilkan **UID** kamu.
3. Firebase Console → Firestore → Start collection `admins` → Document ID = UID tadi → Save (field boleh kosong).
4. Refresh `/admin.html`. Panel admin terbuka.

### 5. Aktifkan AI news
1. Firebase → Project settings → **Service accounts → Generate new private key** (file JSON).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `FIREBASE_SERVICE_ACCOUNT` = seluruh isi file JSON
   - `ANTHROPIC_API_KEY` = API key dari console.anthropic.com
3. Tab **Actions → AI news batch → Run workflow** untuk tes manual. Cek tab **AI review** di admin.
4. Bahasa artikel: ubah `ARTICLE_LANG` di `.github/workflows/ai-news.yml` (`English` atau `Indonesian`).

Catatan: satu batch = 10 pencarian web + 10 penulisan, dua kali sehari. Pantau biaya di console Anthropic. Politik selalu masuk **draft** kecuali kamu menyalakannya di Settings. GitHub bisa menunda cron beberapa menit, dan menonaktifkan jadwal jika repo publik tidak ada aktivitas 60 hari (aktifkan lagi lewat tab Actions).

## Sambungkan ke toko utama
Tambahkan dua item di menu hamburger `fucktherules.my.id`:

```html
<a href="https://journal.fucktherules.my.id/">Journal</a>
<a href="https://journal.fucktherules.my.id/discussion.html">Diskusi</a>
```

## Catatan penting
- Akun Journal dan akun toko **tidak sama** (Firebase berbeda). Kalau nanti mau satu login, project Firebase-nya harus digabung.
- Gambar artikel: isi kolom "Image link" dengan URL (mis. dari `fucktherules.my.id/...`). Tanpa gambar, artikel otomatis memakai sampul lapangan bola.
- Reaksi dan jumlah balasan dihitung langsung dari database, jadi tidak bisa dipalsukan lewat browser.
- Artikel memakai alamat `article.html?id=…` karena GitHub Pages statis.

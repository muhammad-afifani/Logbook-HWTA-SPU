# E-Logbook SPU

Logbook digital penyimpanan sementara limbah B3 untuk lokasi **SPU**: form publik, verifikasi
petugas, stok append-only, dashboard realtime, visual 3D interior, dan peta site.

> [!WARNING]
> **STATUS: PROTOTIPE — belum untuk catatan resmi.**
> Aplikasi ini berjalan di paket gratis (GitHub Pages + Supabase Free) tanpa SLA, tanpa
> point-in-time recovery, dan dengan batas email/penyimpanan yang kecil. Jangan dipakai sebagai
> logbook resmi limbah B3 sebelum naik ke paket berbayar dan lolos review K3.
>
> **Data uji coba wajib dummy.** Jangan memasukkan nama atau nomor telepon asli sampai RLS dan
> backup + restore sudah teruji.

## Stack (100% gratis, kecuali langganan Claude Code)

| Kebutuhan     | Layanan                                                           |
| ------------- | ----------------------------------------------------------------- |
| Hosting       | GitHub Pages (repo publik) + GitHub Actions                       |
| Backend       | Supabase Free (Postgres, Auth, Storage, Edge Functions, Realtime) |
| Captcha       | Cloudflare Turnstile                                              |
| Login petugas | Email + password (akun dibuat admin di Supabase Dashboard)        |
| Domain        | alamat bawaan GitHub Pages                                        |
| Backup        | GitHub Action → repo privat terpisah, terenkripsi `age`           |

Frontend: Vite + React + TypeScript + Tailwind, motion, React Three Fiber + drei, Recharts.

## Menjalankan lokal

```bash
pnpm install
cp .env.example .env.local   # biarkan kosong untuk mode demo (data contoh)
pnpm dev                      # http://localhost:5173/#/
pnpm check                    # lint + typecheck + test + build + anggaran bundle
```

Konvensi proyek: [`CLAUDE.md`](CLAUDE.md). Rencana & keputusan: [`docs/PLAN.md`](docs/PLAN.md).

## Database & Edge Functions (lokal)

Butuh Docker. Semua data uji bersifat dummy.

```bash
pnpm db:start     # Supabase lokal (Postgres, Auth, Storage, Realtime, Edge Runtime)
cp supabase/functions/.env.example supabase/functions/.env   # lalu isi IP_HASH_SALT acak
pnpm db:check     # reset + migrasi + seed → pgTAP → smoke Edge Functions → cek anon via HTTP
```

- `pnpm db:test` menjalankan test pgTAP di `supabase/tests/database/` (RLS, privilese, storage,
  append-only, RPC, realtime).
- `ops/checks/anon-curl.sh` memanggil REST endpoint setiap tabel dengan anon key dan **gagal bila
  ada baris data yang kembali**. Skrip ini juga untuk project asli (lihat di bawah).
- `ops/checks/realtime-anon.mjs` memeriksa otorisasi Realtime untuk anon (R2 saat ini GAGAL, lihat
  `docs/PLAN.md` §8c).
- Edge runtime lokal tidak memuat ulang kode otomatis. Setelah mengubah `supabase/functions/**`,
  jalankan `docker restart supabase_edge_runtime_e-logbook-spu`.

## Mencoba form dengan Supabase lokal

```bash
pnpm db:start
export VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_DEMO=0
export VITE_SUPABASE_ANON_KEY="$(pnpm exec supabase status -o json | jq -r .ANON_KEY)"
export VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA   # kunci uji Cloudflare (selalu lolos)
pnpm dev     # http://localhost:5173/#/lapor
```

Tanpa variabel itu, aplikasi berjalan dalam **mode demo** (data contoh lokal, tanpa jaringan).
Server lokal memakai secret Turnstile uji dari `supabase/functions/.env`.

## Setup Supabase asli (project Free)

> **Semua perintah di bagian ini dijalankan sendiri oleh pemilik proyek.** Pengembangan
> (termasuk asisten AI) tidak pernah menjalankan `db push`, `functions deploy`, `secrets set`,
> atau perintah apa pun ke project asli. Data uji tetap dummy.

1. **Buat project** di supabase.com (paket Free, region terdekat).
2. **Auth → Sign In / Providers:**
   - **Allow new users to sign up: MATI.**
   - Provider **Email: tetap AKTIF**. Mematikan provider ini juga mematikan login.
   - Tidak memakai magic link, OTP, atau email reset. SMTP bawaan Supabase hanya mengirim ke
     anggota tim organisasi, jadi alur petugas tidak boleh bergantung padanya.
3. **Exposed schemas hanya `public`** (Dashboard → Project Settings → API → _Exposed schemas_;
   letak menu bisa berbeda antar versi Dashboard, cari kata kuncinya):
   - Hapus `graphql_public` (bawaan) sehingga isinya **hanya `public`**.
   - `app_private` (helper internal, tabel `counters`/`rate_limits`) **tidak boleh** ada di daftar itu.
   - Jangan mengisi _Extra search path_ dengan `app_private`.
   - Verifikasi: langkah 9 (`ops/checks/anon-curl.sh`) memeriksa semua skema bawaan dan membaca
     daftar yang benar-benar diekspos dari pesan server (`Only the following schemas are exposed: public`).
4. **Migrasi:** `pnpm exec supabase link --project-ref <ref>` lalu `pnpm exec supabase db push`.
   Seed master: jalankan isi `supabase/seed.sql` di SQL Editor.
5. **Secrets Edge Functions — hanya lewat `supabase secrets set`** (atau Dashboard → Edge Functions
   → Secrets). Nilai produksi **tidak pernah** ditulis ke file `.env` dan tidak pernah di-commit:
   ```bash
   pnpm exec supabase secrets set TURNSTILE_SECRET_KEY='<secret Turnstile>' \
     IP_HASH_SALT="$(openssl rand -hex 32)" \
     ALLOWED_ORIGINS='https://<user>.github.io'
   ```
   - `supabase/functions/.env` hanya untuk Supabase **lokal**, berisi nilai uji, dan diabaikan git
     (diuji di `src/test/repo-guards.test.ts`).
   - Jangan pakai `supabase secrets set --env-file …` dengan file lokal.
   - **Wajib** mengisi `ALLOWED_ORIGINS` (`https://<owner>.github.io`, tanpa path). Selain untuk CORS,
     nilai ini dipakai untuk memeriksa `hostname` hasil verifikasi Turnstile.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` disuntikkan Supabase ke
     Edge Functions secara otomatis; jangan di-set manual.
6. **Deploy Edge Functions:**
   ```bash
   pnpm exec supabase functions deploy submit-waste check-status form-options photo-url
   ```
7. **Akun petugas** (dilakukan admin):
   - Dashboard → Authentication → Users → **Add user** → isi email + password → centang
     **Auto Confirm User**. Petugas **tidak** diundang sebagai anggota organisasi Supabase.
   - Beri peran di SQL Editor:
     ```sql
     insert into public.profiles (id, full_name, role)
     select id, 'Nama Petugas', 'officer' from auth.users where email = 'petugas@contoh.id';
     -- admin: ganti 'officer' dengan 'admin'. Nonaktifkan: update profiles set active = false ...
     ```
   - **Lupa password:** admin membuka user di Dashboard → _Reset password_/ubah password, lalu
     memberikan password baru ke petugas secara langsung.
8. **Realtime — menunggu keputusan** (lihat `docs/PLAN.md` §8c). Saat ini `spu:public` adalah
   channel publik: anon bisa subscribe **dan** mengirim event palsu. Dashboard publik (Fase 4)
   belum dibangun, jadi tidak ada klien yang memakainya; usulan perbaikan (channel private + RLS
   hanya-terima + matikan _Allow public access_) belum diterapkan. Jangan mengandalkan Realtime
   publik sebelum itu diputuskan.
9. **Verifikasi setelah deploy** (hanya memakai anon key yang memang publik):
   ```bash
   export SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon key>
   ops/checks/anon-curl.sh            # tabel, skema terekspos, storage, RPC
   node ops/checks/realtime-anon.mjs  # autorisasi Realtime (R2 akan GAGAL sampai usulan diterapkan)
   psql "<connection string>" -f ops/checks/anon_no_select.sql   # atau tempel di SQL Editor
   ```
   Uji storage lebih kuat dengan objek nyata: buat satu kiriman uji berfoto, ambil path-nya
   (`select storage_path from public.submission_photos limit 1;` di SQL Editor), lalu jalankan
   ulang `PROBE_OBJECT_PATH='<path>' ops/checks/anon-curl.sh`.

Panduan Turnstile, deploy Pages, keep-alive, dan backup/restore ditulis lengkap di Fase 7.

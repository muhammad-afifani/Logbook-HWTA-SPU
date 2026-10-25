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
- Edge runtime lokal tidak memuat ulang kode otomatis. Setelah mengubah `supabase/functions/**`,
  jalankan `docker restart supabase_edge_runtime_e-logbook-spu`.

## Setup Supabase asli (project Free)

> Jangan jalankan langkah 3 sebelum disetujui pemilik proyek. Data uji tetap dummy.

1. **Buat project** di supabase.com (paket Free, region terdekat).
2. **Auth → Sign In / Providers:**
   - **Allow new users to sign up: MATI.**
   - Provider **Email: tetap AKTIF**. Mematikan provider ini juga mematikan login.
   - Tidak memakai magic link, OTP, atau email reset. SMTP bawaan Supabase hanya mengirim ke
     anggota tim organisasi, jadi alur petugas tidak boleh bergantung padanya.
3. **Migrasi:** `pnpm exec supabase link --project-ref <ref>` lalu `pnpm exec supabase db push`.
   Seed master: jalankan isi `supabase/seed.sql` di SQL Editor.
4. **Secrets Edge Functions** (nilai asli tidak pernah di-commit):
   ```bash
   pnpm exec supabase secrets set TURNSTILE_SECRET_KEY=<secret Turnstile> \
     IP_HASH_SALT=$(openssl rand -hex 32) \
     ALLOWED_ORIGINS=https://<user>.github.io
   pnpm exec supabase functions deploy submit-waste check-status form-options photo-url
   ```
5. **Akun petugas** (dilakukan admin):
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
6. **Verifikasi setelah deploy** (hanya membaca, memakai anon key yang memang publik):
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon key> ops/checks/anon-curl.sh
   psql "<connection string>" -f ops/checks/anon_no_select.sql   # atau tempel di SQL Editor
   ```

Panduan Turnstile, deploy Pages, keep-alive, dan backup/restore ditulis lengkap di Fase 7.

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

| Kebutuhan        | Layanan                                                           |
| ---------------- | ----------------------------------------------------------------- |
| Hosting          | GitHub Pages (repo publik) + GitHub Actions                       |
| Backend          | Supabase Free (Postgres, Auth, Storage, Edge Functions, Realtime) |
| Captcha          | Cloudflare Turnstile                                              |
| Email magic link | SMTP bawaan Supabase                                              |
| Domain           | alamat bawaan GitHub Pages                                        |
| Backup           | GitHub Action → repo privat terpisah, terenkripsi `age`           |

Frontend: Vite + React + TypeScript + Tailwind, motion, React Three Fiber + drei, Recharts.

## Menjalankan lokal

```bash
pnpm install
cp .env.example .env.local   # biarkan kosong untuk mode demo (data contoh)
pnpm dev                      # http://localhost:5173/#/
pnpm check                    # lint + typecheck + test + build + anggaran bundle
```

Konvensi proyek: [`CLAUDE.md`](CLAUDE.md). Rencana & keputusan: [`docs/PLAN.md`](docs/PLAN.md).

Panduan setup Supabase, Turnstile, deploy Pages, keep-alive, dan backup/restore ditulis lengkap
di Fase 7.

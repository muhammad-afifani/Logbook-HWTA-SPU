#!/usr/bin/env bash
# =============================================================================
# Cek akses ANON lewat HTTP ke project Supabase (lokal atau asli).
#
# Pakai:
#   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... ops/checks/anon-curl.sh
#
# Untuk setiap tabel/view: GET /rest/v1/<tabel>?select=*&limit=1 dengan anon key.
# GAGAL (exit 1) bila ada SATU baris data pun yang kembali. Memeriksa juga:
#   - SKEMA TEREKSPOS: hanya `public` (app_private, auth, storage, ... harus 406 PGRST106)
#   - STORAGE: anon tidak bisa SELECT/INSERT storage.objects, tidak bisa membuat bucket,
#     tidak bisa membuat signed URL (baca maupun upload)
#   - kontrak public_status() dan penolakan RPC non-publik
# Hampir semuanya membaca. Dua uji tulis (upload objek & buat bucket) memakai nama acak
# `anon-probe-*` dan HANYA berhasil bila perlindungan bocor; bila itu terjadi skrip mencetak
# namanya agar Anda bisa menghapusnya di Dashboard.
#
# Opsional (uji lebih kuat bila sudah ada objek nyata, mis. dari kiriman uji dengan foto):
#   PROBE_OBJECT_PATH='submissions/<uuid>/1.webp'   # path objek di bucket submission-photos
# Kunci yang dipakai hanya anon/publishable key (memang publik). Isi data tidak dicetak.
# =============================================================================
set -uo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"
command -v jq >/dev/null || { echo "jq wajib terpasang"; exit 2; }

URL=${SUPABASE_URL%/}
KEY=$SUPABASE_ANON_KEY
HDR=(-H "apikey: $KEY")
# Anon key lama berbentuk JWT; publishable key baru (sb_publishable_...) cukup header apikey.
[[ $KEY == eyJ* ]] && HDR+=(-H "Authorization: Bearer $KEY")

# Daftar tabel & view dari migrasi (supabase/migrations/*_02_tables.sql).
TABLES=(app_config profiles waste_groups packaging_types waste_types submissions submission_items
        submission_photos lots outbound outbound_items outbound_attachments stock_movements
        pallet_slots slot_units suggestion_terms audit_log lot_stock)

# Tambahan: apa pun yang diiklankan OpenAPI PostgREST ke anon.
DISCOVERED=$(curl -s -m 20 "${HDR[@]}" "$URL/rest/v1/" | jq -r '.paths // {} | keys[]' 2>/dev/null \
  | sed -n 's#^/\([A-Za-z0-9_]*\)$#\1#p' | grep -v '^$' || true)
for t in $DISCOVERED; do [[ " ${TABLES[*]} " == *" $t "* ]] || TABLES+=("$t"); done

fail=0
printf '%-24s %-6s %s\n' "TABEL" "HTTP" "HASIL"
for t in "${TABLES[@]}"; do
  body=$(curl -s -m 20 -w $'\n%{http_code}' "${HDR[@]}" "$URL/rest/v1/$t?select=*&limit=1")
  code=${body##*$'\n'}
  json=${body%$'\n'*}
  rows=$(jq 'if type == "array" then length else 0 end' <<<"$json" 2>/dev/null || echo 0)
  if [[ $code == 2* && $rows -gt 0 ]]; then
    printf '%-24s %-6s %s\n' "$t" "$code" "GAGAL: $rows baris data kembali"
    fail=1
  else
    msg=$(jq -r '.code // empty' <<<"$json" 2>/dev/null)
    printf '%-24s %-6s %s\n' "$t" "$code" "ok (0 baris${msg:+, $msg})"
  fi
done

echo
echo "SKEMA TEREKSPOS (Dashboard → Settings → API → Exposed schemas harus HANYA public)"
for sch in app_private auth storage realtime extensions vault graphql_public pg_catalog information_schema; do
  resp=$(curl -s -m 20 -w $'\n%{http_code}' "${HDR[@]}" -H "Accept-Profile: $sch" "$URL/rest/v1/")
  code=${resp##*$'\n'}; json=${resp%$'\n'*}
  if [[ $code == 200 ]]; then echo "GAGAL: skema $sch TEREKSPOS lewat REST (HTTP 200)"; fail=1
  else printf '%-22s ok (HTTP %s, %s)\n' "skema $sch" "$code" "$(jq -r '.code // "-"' <<<"$json" 2>/dev/null)"; fi
done
resp=$(curl -s -m 20 "${HDR[@]}" -H "Accept-Profile: app_private" "$URL/rest/v1/counters?select=*&limit=1")
hint=$(jq -r '.hint // empty' <<<"$resp" 2>/dev/null)
rows=$(jq 'if type == "array" then length else 0 end' <<<"$resp" 2>/dev/null || echo 0)
if [[ $rows -gt 0 ]]; then echo "GAGAL: app_private.counters terbaca lewat REST"; fail=1
else echo "app_private.counters   ok (tidak terbaca lewat REST)"; fi
if [[ $hint == "Only the following schemas are exposed: public" ]]; then
  echo "daftar skema diekspos  ok ($hint)"
else
  echo "GAGAL: daftar skema diekspos bukan hanya public → '${hint:-tidak terbaca}'"; fail=1
fi

echo
echo "STORAGE"
RAND=$RANDOM$RANDOM
buckets=$(curl -s -m 20 "${HDR[@]}" "$URL/storage/v1/bucket")
nb=$(jq 'if type == "array" then length else 0 end' <<<"$buckets" 2>/dev/null || echo 0)
if [[ $nb -gt 0 ]]; then echo "GAGAL: anon melihat $nb bucket"; fail=1; else echo "daftar bucket          ok (0)"; fi
for b in submission-photos outbound-docs; do
  objs=$(curl -s -m 20 "${HDR[@]}" -H 'content-type: application/json' \
    -d '{"prefix":"","limit":10}' "$URL/storage/v1/object/list/$b")
  no=$(jq 'if type == "array" then length else 0 end' <<<"$objs" 2>/dev/null || echo 0)
  if [[ $no -gt 0 ]]; then echo "GAGAL: anon melihat $no objek di $b (SELECT storage.objects)"; fail=1
  else printf '%-22s ok (0 objek terlihat)\n' "SELECT objek $b"; fi
done

# INSERT storage.objects: upload langsung sebagai anon harus ditolak. Hanya berhasil bila bocor.
for b in submission-photos outbound-docs; do
  name="anon-probe-$RAND.webp"
  code=$(printf 'RIFF' | curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "${HDR[@]}" \
    -H 'content-type: image/webp' -H 'x-upsert: false' --data-binary @- "$URL/storage/v1/object/$b/$name")
  if [[ $code == 2* ]]; then echo "GAGAL: anon BERHASIL upload ke $b/$name (HTTP $code) — hapus objek ini di Dashboard"; fail=1
  else printf '%-22s ok (HTTP %s, ditolak)\n' "INSERT objek $b" "$code"; fi
done

# Buat bucket sebagai anon harus ditolak.
code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "${HDR[@]}" -H 'content-type: application/json' \
  -d "{\"name\":\"anon-probe-$RAND\",\"public\":false}" "$URL/storage/v1/bucket")
if [[ $code == 2* ]]; then echo "GAGAL: anon BERHASIL membuat bucket anon-probe-$RAND — hapus di Dashboard"; fail=1
else printf '%-22s ok (HTTP %s, ditolak)\n' "buat bucket" "$code"; fi

# Signed URL upload (butuh hak INSERT) — path tidak perlu ada, jadi uji ini kuat tanpa objek nyata.
for b in submission-photos outbound-docs; do
  code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "${HDR[@]}" -H 'content-type: application/json' \
    -H 'x-upsert: true' -d '{}' "$URL/storage/v1/object/upload/sign/$b/anon-probe-$RAND.webp")
  if [[ $code == 2* ]]; then echo "GAGAL: anon bisa membuat signed UPLOAD URL di $b (HTTP $code)"; fail=1
  else printf '%-22s ok (HTTP %s, ditolak)\n' "signed upload $b" "$code"; fi
done

# Signed URL baca + unduh langsung + info + URL publik. Kuat bila PROBE_OBJECT_PATH diisi
# (objek benar-benar ada); tanpa itu, 4xx bisa berarti "objek tidak ada" sehingga hanya indikatif.
PROBE=${PROBE_OBJECT_PATH:-submissions/00000000-0000-4000-8000-000000000000/1.webp}
[[ -n ${PROBE_OBJECT_PATH:-} ]] && note="objek nyata" || note="objek contoh, indikatif"
code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "${HDR[@]}" -H 'content-type: application/json' \
  -d '{"expiresIn":60}' "$URL/storage/v1/object/sign/submission-photos/$PROBE")
if [[ $code == 2* ]]; then echo "GAGAL: anon bisa membuat signed URL BACA (HTTP $code)"; fail=1
else printf '%-22s ok (HTTP %s, ditolak; %s)\n' "signed URL baca" "$code" "$note"; fi
for kind in "object/authenticated" "object/info/authenticated" "object/public" "object/info/public"; do
  code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "${HDR[@]}" "$URL/storage/v1/$kind/submission-photos/$PROBE")
  if [[ $code == 2* ]]; then echo "GAGAL: anon bisa mengakses /$kind/ (HTTP $code)"; fail=1
  else printf '%-22s ok (HTTP %s; %s)\n' "$kind" "$code" "$note"; fi
done

echo
echo "RPC PUBLIK"
ps=$(curl -s -m 20 "${HDR[@]}" -H 'content-type: application/json' -d '{}' "$URL/rest/v1/rpc/public_status")
keys=$(jq -r 'keys | join(",")' <<<"$ps" 2>/dev/null || echo "?")
if [[ $keys == "capacity_pct,has_waste,updated_at" ]]; then echo "public_status          ok ($keys)"
else echo "GAGAL: public_status mengembalikan kunci tak terduga: $keys"; fail=1; fi
# Argumen sesuai signature agar yang diuji adalah PENOLAKAN IZIN, bukan "fungsi tidak ditemukan".
declare -A RPC_ARGS=(
  [svc_create_submission]='{"p":{},"p_ip_hash":"x"}'
  [svc_ticket_status]='{"p_code":"SPU-0000-0000-AAAA"}'
  [svc_find_submission]='{"p_idempotency_key":"00000000-0000-4000-8000-000000000000"}'
  [svc_form_options]='{}'
  [svc_rate_limit]='{"p_ip_hash":"x","p_bucket":"x","p_limit":1,"p_window_seconds":60}'
  [verify_submission]='{"p_submission_id":"00000000-0000-4000-8000-000000000000","p_decision":"reject"}'
  [create_outbound]='{"p_header":{},"p_items":[]}'
  [correct_movement]='{"p_movement_id":1,"p_qty_kg":0,"p_qty_packages":0,"p_reason":"x"}'
  [officer_list_photos]='{"p_submission_id":"00000000-0000-4000-8000-000000000000"}'
)
for fn in "${!RPC_ARGS[@]}"; do
  code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "${HDR[@]}" -H 'content-type: application/json' \
    -d "${RPC_ARGS[$fn]}" "$URL/rest/v1/rpc/$fn")
  if [[ $code == 2* ]]; then echo "GAGAL: anon bisa memanggil $fn (HTTP $code)"; fail=1
  else printf '%-22s ok (HTTP %s, ditolak)\n' "$fn" "$code"; fi
done

echo
if [[ $fail -ne 0 ]]; then echo "HASIL: GAGAL — anon bisa membaca data."; exit 1; fi
echo "HASIL: LULUS — anon tidak menerima satu baris data pun (${#TABLES[@]} tabel/view diperiksa)."

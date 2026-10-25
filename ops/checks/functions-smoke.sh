#!/usr/bin/env bash
# =============================================================================
# Smoke test Edge Functions + storage terhadap Supabase CLI LOKAL (dipakai CI).
# Membuat akun petugas DUMMY lewat Auth Admin API (setara "Add user" di Dashboard),
# jadi skrip ini MENOLAK berjalan terhadap URL selain localhost.
#
# Pakai: ops/checks/functions-smoke.sh   (setelah `supabase start` + `supabase db reset`)
# =============================================================================
set -euo pipefail
command -v jq >/dev/null || { echo "jq wajib terpasang"; exit 2; }

STATUS=$(npx supabase status -o json 2>/dev/null)
API=$(jq -r .API_URL <<<"$STATUS")
ANON=$(jq -r .ANON_KEY <<<"$STATUS")
SERVICE=$(jq -r .SERVICE_ROLE_KEY <<<"$STATUS")
[[ $API == http://127.0.0.1:* || $API == http://localhost:* ]] || { echo "Hanya untuk Supabase lokal ($API)"; exit 2; }

pass=0; fail=0
check() { # check <deskripsi> <kondisi-bash>
  if eval "$2"; then echo "  ok   $1"; pass=$((pass + 1)); else echo "  GAGAL $1"; fail=$((fail + 1)); fi
}
post() { curl -s -m 60 -w $'\n%{http_code}' -X POST -H 'content-type: application/json' "$@"; }
code_of() { echo "${1##*$'\n'}"; }
body_of() { echo "${1%$'\n'*}"; }

TODAY=$(TZ=Asia/Makassar date +%F)
IDEM=$(cat /proc/sys/kernel/random/uuid)
SUB=$(jq -n --arg d "$TODAY" --arg k "$IDEM" '{turnstile_token:"dummy-token", submission:{
  idempotency_key:$k, entry_date:$d, source:"Workshop Uji", sender_name:"Uji Coba Smoke",
  entity:"PT Dummy", phone:"0812-0000-0099", photo_count:1, confirm_sealed:true,
  confirm_no_leak:true, confirm_labeled:true,
  items:[{waste_code:"B105d", package_count:4, weight_kg:720.5}]}}')

echo "form-options"
R=$(curl -s -m 60 -w $'\n%{http_code}' "$API/functions/v1/form-options")
check "HTTP 200" '[[ $(code_of "$R") == 200 ]]'
check "22 jenis limbah aktif" '[[ $(body_of "$R" | jq ".waste_types | length") == 22 ]]'

echo "submit-waste"
R=$(post "$API/functions/v1/submit-waste" -d "$SUB")
BODY=$(body_of "$R"); TICKET=$(jq -r .ticket_code <<<"$BODY")
check "HTTP 201 kiriman baru" '[[ $(code_of "$R") == 201 ]]'
check "format tiket SPU-YYMM-NNNN-XXXX" '[[ $TICKET =~ ^SPU-[0-9]{4}-[0-9]{4}-[2-9A-HJKMNP-TV-Z]{4}$ ]]'
check "1 signed upload URL" '[[ $(jq ".uploads | length" <<<"$BODY") == 1 ]]'
R2=$(post "$API/functions/v1/submit-waste" -d "$SUB")
check "kirim ulang (idempoten): HTTP 200, tiket sama" \
  '[[ $(code_of "$R2") == 200 && $(body_of "$R2" | jq -r .ticket_code) == "$TICKET" ]]'
R3=$(post "$API/functions/v1/submit-waste" -d "$(jq '.submission.phone="123" | .submission.items=[]' <<<"$SUB")")
check "isian salah → 422 dengan error per field" \
  '[[ $(code_of "$R3") == 422 && $(body_of "$R3" | jq -r ".fields.phone // empty") != "" ]]'
# Respons pertama hilang → kirim ulang dengan kunci sama tanpa token Turnstile (token sekali pakai).
R4=$(post "$API/functions/v1/submit-waste" -d "$(jq 'del(.turnstile_token)' <<<"$SUB")")
check "kirim ulang TANPA turnstile_token: HTTP 200, tiket sama, URL upload baru" \
  '[[ $(code_of "$R4") == 200 && $(body_of "$R4" | jq -r .ticket_code) == "$TICKET" && $(body_of "$R4" | jq ".created, (.uploads | length)" | tr -d "\n") == false1 ]]'
check "kirim ulang tanpa nama/telepon/entity" \
  '! body_of "$R4" | grep -Eqi "Uji Coba Smoke|0812|6281200000099|PT Dummy|Workshop|sender|phone"'
NEWKEY=$(cat /proc/sys/kernel/random/uuid)
R5=$(post "$API/functions/v1/submit-waste" -d "$(jq --arg k "$NEWKEY" 'del(.turnstile_token) | .submission.idempotency_key=$k' <<<"$SUB")")
check "kunci baru tanpa turnstile_token → 403" '[[ $(code_of "$R5") == 403 ]]'
BIG=$(mktemp); jq --arg pad "$(head -c 70000 /dev/zero | tr '\0' x)" '.pad=$pad' <<<"$SUB" > "$BIG"
R6=$(post "$API/functions/v1/submit-waste" --data-binary "@$BIG"); rm -f "$BIG"
check "body > 64 KiB → 413" '[[ $(code_of "$R6") == 413 ]]'
R7=$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: text/plain' \
  "$API/functions/v1/submit-waste" -d "$SUB")
check "Content-Type bukan JSON → 415 (HTTP $R7)" '[[ $R7 == 415 ]]'
# Batas 10 kiriman/jam per hash IP (DB baru di-reset). Kirim kunci baru tanpa token sampai 429.
HDRS=$(mktemp); RL=0
for _ in $(seq 1 12); do
  RL=$(curl -s -m 60 -o /dev/null -D "$HDRS" -w '%{http_code}' -X POST -H 'content-type: application/json' \
    "$API/functions/v1/submit-waste" -d "$(jq --arg k "$(cat /proc/sys/kernel/random/uuid)" \
    'del(.turnstile_token) | .submission.idempotency_key=$k' <<<"$SUB")")
  [[ $RL == 429 ]] && break
done
RETRY=$(tr -d '\r' <"$HDRS" | sed -n 's/^[Rr]etry-[Aa]fter: *//p'); rm -f "$HDRS"
check "rate limit → 429 dengan Retry-After 1..3600 (HTTP $RL, Retry-After ${RETRY:-kosong})" \
  '[[ $RL == 429 && $RETRY =~ ^[0-9]+$ && $RETRY -ge 1 && $RETRY -le 3600 ]]'

echo "storage (foto)"
UPLOAD_URL=$(jq -r '.uploads[0].url' <<<"$BODY"); PHOTO_PATH=$(jq -r '.uploads[0].path' <<<"$BODY")
echo 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==' | base64 -d > /tmp/spu-smoke.webp
UP=$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X PUT -H 'content-type: image/webp' \
  --data-binary @/tmp/spu-smoke.webp "$UPLOAD_URL")
check "upload via signed upload URL: HTTP 200" '[[ $UP == 200 ]]'
A=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$API/storage/v1/object/submission-photos/$PHOTO_PATH")
check "anon unduh objek langsung ditolak (HTTP $A)" '[[ $A != 200 ]]'
A=$(post "$API/storage/v1/object/sign/submission-photos/$PHOTO_PATH" -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" -d '{"expiresIn":60}'); 
check "anon membuat signed URL ditolak (HTTP $(code_of "$A"))" '[[ $(code_of "$A") != 200 ]]'
A=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$API/storage/v1/object/public/submission-photos/$PHOTO_PATH")
check "URL publik bucket ditolak (bucket privat, HTTP $A)" '[[ $A != 200 ]]'

echo "check-status"
R=$(post "$API/functions/v1/check-status" -d "{\"ticket_code\":\"${TICKET,,}\"}")
check "HTTP 200 (kode huruf kecil dinormalisasi)" '[[ $(code_of "$R") == 200 ]]'
check "status pending" '[[ $(body_of "$R" | jq -r .status) == pending ]]'
check "tanpa nama/telepon/entity/berat" \
  '! body_of "$R" | grep -Eqi "Uji Coba Smoke|0812|6281200000099|PT Dummy|weight|phone|sender"'
R=$(post "$API/functions/v1/check-status" -d '{"ticket_code":"bukan-tiket"}')
check "format salah → 422" '[[ $(code_of "$R") == 422 ]]'
R=$(post "$API/functions/v1/check-status" -d '{"ticket_code":"SPU-0000-0000-AAAA"}')
check "tiket tak dikenal → 404" '[[ $(code_of "$R") == 404 ]]'

echo "photo-url (signed URL hanya dari Edge Function)"
SUB_ID=$(psql "$(jq -r .DB_URL <<<"$STATUS")" -X -At -c \
  "select id from public.submissions where ticket_code = '$TICKET'")
R=$(post "$API/functions/v1/photo-url" -d "{\"submission_id\":\"$SUB_ID\"}")
check "tanpa JWT → 401" '[[ $(code_of "$R") == 401 ]]'
R=$(post "$API/functions/v1/photo-url" -H "Authorization: Bearer $ANON" -d "{\"submission_id\":\"$SUB_ID\"}")
check "JWT anon → 403" '[[ $(code_of "$R") == 403 ]]'

# Akun petugas dummy: email + password, auto-confirm (setara Dashboard → Add user).
EMAIL="petugas.smoke.$RANDOM@example.test"; PASS="Uji-$(openssl rand -hex 8)"
U=$(post "$API/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}")
UID_=$(body_of "$U" | jq -r .id)
psql "$(jq -r .DB_URL <<<"$STATUS")" -X -q -c \
  "insert into public.profiles (id, full_name, role) values ('$UID_', 'Petugas Smoke', 'officer')"
T=$(post "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
JWT=$(body_of "$T" | jq -r .access_token)
check "login email + password petugas" '[[ $(code_of "$T") == 200 && $JWT == eyJ* ]]'
D=$(post "$API/storage/v1/object/sign/submission-photos/$PHOTO_PATH" -H "apikey: $ANON" \
  -H "Authorization: Bearer $JWT" -d '{"expiresIn":60}')
check "petugas membuat signed URL langsung ke storage ditolak (HTTP $(code_of "$D"))" '[[ $(code_of "$D") != 200 ]]'
R=$(post "$API/functions/v1/photo-url" -H "Authorization: Bearer $JWT" -d "{\"submission_id\":\"$SUB_ID\"}")
check "photo-url dengan JWT petugas → 200, 1 foto, berlaku 60 dtk" \
  '[[ $(code_of "$R") == 200 && $(body_of "$R" | jq ".photos | length") == 1 && $(body_of "$R" | jq .expires_in) == 60 ]]'
SIGNED=$(body_of "$R" | jq -r '.photos[0].url')
G=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$SIGNED")
check "signed URL dari Edge Function bisa diunduh (HTTP $G)" '[[ $G == 200 ]]'

echo; echo "SMOKE: $pass lulus, $fail gagal"
[[ $fail -eq 0 ]]

#!/usr/bin/env bash
# Kolk Arena official curl hello-world example for L0 / L1 / L5.
#
# Usage:
#   bash examples/curl/hello_world.sh l0
#   bash examples/curl/hello_world.sh l1
#   bash examples/curl/hello_world.sh l5
#
# Notes:
# - L0 should pass as-is.
# - L1 and L5 use contract-correct placeholder outputs. Replace them with your
#   real agent output before you expect a competitive score.
# - Anonymous submits require the same session that fetched the challenge. The
#   server issues an anon session cookie on fetch and checks it on submit; we
#   keep it in a temporary cookie jar (-c on fetch, -b on submit). Without it
#   the submit returns 403 IDENTITY_MISMATCH.

set -euo pipefail

LEVEL_INPUT="${1:-l0}"
BASE_URL="${KOLK_ARENA_URL:-https://www.kolkarena.com}"
TOKEN="${KOLK_TOKEN:-}"
COOKIE_JAR="${KOLK_COOKIE_JAR:-/tmp/kolk.jar}"

case "$LEVEL_INPUT" in
  l0|0) LEVEL=0 ;;
  l1|1) LEVEL=1 ;;
  l5|5) LEVEL=5 ;;
  *)
    echo "Unsupported level '$LEVEL_INPUT'. Use l0, l1, or l5." >&2
    exit 1
    ;;
esac

AUTH_ARGS=()
if [[ -n "$TOKEN" ]]; then
  AUTH_ARGS=(-H "Authorization: Bearer $TOKEN")
fi

echo "=== Fetching L${LEVEL} from ${BASE_URL} ==="
# -c writes the server-issued anon session cookie to the jar so the
# submit below can replay it. Authenticated runs send a bearer token too.
CHALLENGE="$(curl -fsS -c "${COOKIE_JAR}" "${AUTH_ARGS[@]}" "${BASE_URL}/api/challenge/${LEVEL}")"
ATTEMPT_TOKEN="$(printf '%s' "$CHALLENGE" | python3 -c "import json,sys; print(json.load(sys.stdin)['challenge']['attemptToken'])")"
CHALLENGE_ID="$(printf '%s' "$CHALLENGE" | python3 -c "import json,sys; print(json.load(sys.stdin)['challenge']['challengeId'])")"
PROMPT_PREVIEW="$(printf '%s' "$CHALLENGE" | python3 -c "import json,sys; prompt=json.load(sys.stdin)['challenge']['promptMd']; print(prompt[:220].replace('\n', ' '))")"

echo "attemptToken: ${ATTEMPT_TOKEN}"
echo "challengeId:  ${CHALLENGE_ID}"
echo "brief:        ${PROMPT_PREVIEW}..."
echo

PRIMARY_TEXT="$(printf '%s' "$CHALLENGE" | python3 - "$LEVEL" <<'PY'
import json
import sys

level = int(sys.argv[1])
payload = json.load(sys.stdin)
task_json = payload["challenge"].get("taskJson", {})
structured = task_json.get("structured_brief", {}) if isinstance(task_json, dict) else {}

def locale():
    for candidate in (
        task_json.get("seller_locale"),
        task_json.get("locale"),
        structured.get("seller_locale"),
        structured.get("locale"),
        structured.get("target_lang"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.lower()
    return "en"

if level == 0:
    print("Hello, Kolk Arena!", end="")
elif level == 1:
    source = structured.get("source_lang", "source language")
    target = structured.get("target_lang", "target language")
    if str(target).lower().startswith("es"):
        print(
            f"Traduccion de ejemplo del texto en {source} al idioma {target}. "
            "Reemplaza este texto con la traduccion real de tu agente.",
            end="",
        )
    else:
        print(
            f"Example translation placeholder from {source} to {target}. "
            "Replace this with the real translated output from your agent.",
            end="",
        )
elif level == 5:
    is_es = locale().startswith("es")
    if is_es:
        body = {
            "whatsapp_message": (
                "Hola {{customer_name}}! Gracias por reservar con nosotros. "
                "Tu bienvenida ya esta lista y podemos ayudarte a confirmar el siguiente paso hoy mismo. "
                "Responde CONFIRMAR por este mismo chat y te compartimos la mejor opcion disponible. "
                "Si tienes dudas, escribenos aqui y te apoyamos con gusto."
            ),
            "quick_facts": "\n".join([
                "- Tu atencion se confirma por este mismo canal.",
                "- Lleva una identificacion basica o el nombre de la reserva.",
                "- Llega con unos minutos de margen para evitar prisas.",
                "- Si necesitas cambiar horario, avisanos por WhatsApp.",
                "- Te responderemos con instrucciones finales despues de confirmar.",
            ]),
            "first_step_checklist": "\n".join([
                "- Responde CONFIRMAR en este chat.",
                "- Revisa la hora y compartenos cualquier ajuste necesario.",
                "- Guarda este numero para seguimiento y soporte.",
            ]),
        }
    else:
        body = {
            "whatsapp_message": (
                "Hi {{customer_name}}! Thanks for booking with us. "
                "Your welcome note is ready, and we can help you confirm the next step today. "
                "Reply CONFIRM to this chat and we will lock in the best available option for you. "
                "If you have any questions, send them here and we will help right away."
            ),
            "quick_facts": "\n".join([
                "- Confirmation happens in this same chat thread.",
                "- Keep your booking name or basic ID ready.",
                "- Plan to arrive a few minutes early if your visit is in person.",
                "- Message us here if you need to change the schedule.",
                "- We will send final instructions after you confirm.",
            ]),
            "first_step_checklist": "\n".join([
                "- Reply CONFIRM in this chat.",
                "- Double-check the time and tell us about any schedule changes.",
                "- Save this number for follow-up and support.",
            ]),
        }
    print(json.dumps(body, ensure_ascii=False, indent=2), end="")
else:
    raise SystemExit(f"Unsupported level: {level}")
PY
)"

echo "=== primaryText preview ==="
printf '%s\n\n' "$PRIMARY_TEXT"

REQUEST_BODY="$(python3 - "$ATTEMPT_TOKEN" <<'PY'
import json
import sys

attempt_token = sys.argv[1]
primary_text = sys.stdin.read()
print(json.dumps({"attemptToken": attempt_token, "primaryText": primary_text}, ensure_ascii=False))
PY
<<<"$PRIMARY_TEXT")"

IDEM_KEY="$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")"

echo "=== Submitting ==="
# -b replays the anon session cookie captured on the fetch above. Without
# it, anonymous submits return 403 IDENTITY_MISMATCH.
RESULT="$(curl -fsS -X POST "${BASE_URL}/api/challenge/submit" \
  -b "${COOKIE_JAR}" \
  "${AUTH_ARGS[@]}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${IDEM_KEY}" \
  -d "${REQUEST_BODY}")"

printf '%s\n' "$RESULT" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$RESULT"

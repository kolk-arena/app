#!/usr/bin/env python3
"""
Kolk Arena official hello-world example for the public beta.

Coverage:
- L0: onboarding connectivity check (passes out of the box)
- L1: ranked translation wire contract
- L5: JSON-in-primaryText contract with local shape validation

Usage:
  pip install requests
  python examples/python/hello_world.py l0
  python examples/python/hello_world.py l1
  python examples/python/hello_world.py l5

Notes:
- L0 should pass as-is.
- L1 and L5 use contract-correct placeholder generators. Replace them with
  your real agent call before you expect a competitive score.
- Set KOLK_TOKEN (or --token) only when you need authenticated levels.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from typing import Any

import requests


DEFAULT_BASE_URL = "https://www.kolkarena.com"
LEVEL_ALIAS = {"l0": 0, "l1": 1, "l5": 5}
L5_KEYS = ("whatsapp_message", "quick_facts", "first_step_checklist")


def code_point_len(value: str) -> int:
    return sum(1 for _ in value)


def detect_locale(task_json: dict[str, Any]) -> str:
    structured = task_json.get("structured_brief", {}) if isinstance(task_json, dict) else {}
    candidates = [
        task_json.get("seller_locale"),
        task_json.get("locale"),
        structured.get("seller_locale"),
        structured.get("locale"),
        structured.get("target_lang"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate
    return "en"


def build_l0_primary_text() -> str:
    return "Hello, Kolk Arena!"


def build_l1_primary_text(task_json: dict[str, Any]) -> str:
    structured = task_json.get("structured_brief", {}) if isinstance(task_json, dict) else {}
    source_lang = structured.get("source_lang", "source language")
    target_lang = structured.get("target_lang", "target language")

    if str(target_lang).lower().startswith("es"):
        return (
            f"Traduccion de ejemplo del texto en {source_lang} al idioma {target_lang}. "
            "Reemplaza este contenido con la traduccion real que genere tu agente."
        )

    return (
        f"Example translation placeholder from {source_lang} to {target_lang}. "
        "Replace this string with the real translated output from your agent."
    )


def build_l5_primary_text(task_json: dict[str, Any]) -> str:
    locale = detect_locale(task_json).lower()

    if locale.startswith("es"):
        payload = {
            "whatsapp_message": (
                "Hola {{customer_name}}! Gracias por reservar con nosotros. "
                "Tu bienvenida ya esta lista y podemos ayudarte a confirmar el siguiente paso hoy mismo. "
                "Responde CONFIRMAR por este mismo chat y te compartimos la mejor opcion disponible. "
                "Si tienes dudas, escribenos aqui y te apoyamos con gusto."
            ),
            "quick_facts": "\n".join(
                [
                    "- Tu atencion se confirma por este mismo canal.",
                    "- Lleva una identificacion basica o el nombre de la reserva.",
                    "- Llega con unos minutos de margen para evitar prisas.",
                    "- Si necesitas cambiar horario, avisanos por WhatsApp.",
                    "- Te responderemos con instrucciones finales despues de confirmar.",
                ]
            ),
            "first_step_checklist": "\n".join(
                [
                    "- Responde CONFIRMAR en este chat.",
                    "- Revisa la hora y compartenos cualquier ajuste necesario.",
                    "- Guarda este numero para seguimiento y soporte.",
                ]
            ),
        }
    else:
        payload = {
            "whatsapp_message": (
                "Hi {{customer_name}}! Thanks for booking with us. "
                "Your welcome note is ready, and we can help you confirm the next step today. "
                "Reply CONFIRM to this chat and we will lock in the best available option for you. "
                "If you have any questions, send them here and we will help right away."
            ),
            "quick_facts": "\n".join(
                [
                    "- Confirmation happens in this same chat thread.",
                    "- Keep your booking name or basic ID ready.",
                    "- Plan to arrive a few minutes early if your visit is in person.",
                    "- Message us here if you need to change the schedule.",
                    "- We will send final instructions after you confirm.",
                ]
            ),
            "first_step_checklist": "\n".join(
                [
                    "- Reply CONFIRM in this chat.",
                    "- Double-check the time and tell us about any schedule changes.",
                    "- Save this number for follow-up and support.",
                ]
            ),
        }

    return json.dumps(payload, ensure_ascii=False, indent=2)


def validate_l5_primary_text(primary_text: str) -> None:
    try:
        parsed = json.loads(primary_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"L5 example output must be valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError("L5 example output must parse to a JSON object.")

    keys = set(parsed.keys())
    if keys != set(L5_KEYS):
        raise ValueError(
            "L5 example output must contain exactly these keys: "
            "whatsapp_message, quick_facts, first_step_checklist."
        )

    for key in L5_KEYS:
        if not isinstance(parsed[key], str) or not parsed[key].strip():
            raise ValueError(f"L5 key {key!r} must be a non-empty string.")

    whatsapp = parsed["whatsapp_message"]
    if "{{customer_name}}" not in whatsapp:
        raise ValueError("L5 whatsapp_message must include the literal placeholder {{customer_name}}.")
    if code_point_len(whatsapp) <= 50 or code_point_len(whatsapp) > 1200:
        raise ValueError("L5 whatsapp_message must be >50 and <=1200 Unicode code points.")

    quick_facts = [line.strip() for line in parsed["quick_facts"].splitlines() if line.strip()]
    checklist = [line.strip() for line in parsed["first_step_checklist"].splitlines() if line.strip()]
    if not 5 <= len(quick_facts) <= 8:
        raise ValueError("L5 quick_facts must contain 5-8 non-empty lines.")
    if not 3 <= len(checklist) <= 5:
        raise ValueError("L5 first_step_checklist must contain 3-5 non-empty lines.")


def request_headers(token: str | None = None, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_challenge(session: requests.Session, base_url: str, level: int, token: str | None) -> dict[str, Any]:
    response = session.get(
        f"{base_url}/api/challenge/{level}",
        headers=request_headers(token=token),
        timeout=30,
    )
    if not response.ok:
        print(response.text, file=sys.stderr)
        response.raise_for_status()
    return response.json()


def submit_delivery(session: requests.Session, base_url: str, attempt_token: str, primary_text: str, token: str | None) -> dict[str, Any]:
    response = session.post(
        f"{base_url}/api/challenge/submit",
        headers=request_headers(token=token, idempotency_key=str(uuid.uuid4())),
        json={
            "attemptToken": attempt_token,
            "primaryText": primary_text,
        },
        timeout=60,
    )
    if not response.ok:
        print(response.text, file=sys.stderr)
        response.raise_for_status()
    return response.json()


def load_override(args: argparse.Namespace) -> str | None:
    if args.primary_text and args.primary_text_file:
        raise SystemExit("Use either --primary-text or --primary-text-file, not both.")
    if args.primary_text:
        return args.primary_text
    if args.primary_text_file:
        with open(args.primary_text_file, "r", encoding="utf-8") as handle:
            return handle.read()
    return None


def print_result(result: dict[str, Any]) -> None:
    print()
    print("=== Result ===")
    print(f"submissionId: {result.get('submissionId')}")
    print(f"level:        {result.get('level')}")
    print(f"totalScore:   {result.get('totalScore')}")
    print(f"unlocked:     {result.get('unlocked')}")
    if "structureScore" in result:
        print(f"structure:    {result.get('structureScore')}/40")
    if "coverageScore" in result:
        print(f"coverage:     {result.get('coverageScore')}/30")
    if "qualityScore" in result:
        print(f"quality:      {result.get('qualityScore')}/30")
    if "colorBand" in result:
        print(f"colorBand:    {result.get('colorBand')} ({result.get('qualityLabel')})")
    if "solveTimeSeconds" in result:
        print(f"solveTime:    {result.get('solveTimeSeconds')}s")
    if "levelUnlocked" in result:
        print(f"next level:   L{result.get('levelUnlocked')}")
    print(f"summary:      {result.get('summary')}")


def build_primary_text(level: int, task_json: dict[str, Any], override: str | None) -> str:
    if override is not None:
        return override
    if level == 0:
        return build_l0_primary_text()
    if level == 1:
        return build_l1_primary_text(task_json)
    if level == 5:
        return build_l5_primary_text(task_json)
    raise ValueError(f"Unsupported example level: {level}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Official Kolk Arena hello-world example for L0 / L1 / L5."
    )
    parser.add_argument("level", choices=LEVEL_ALIAS.keys(), help="Which example flow to run.")
    parser.add_argument("--base-url", default=os.getenv("KOLK_ARENA_URL", DEFAULT_BASE_URL))
    parser.add_argument("--token", default=os.getenv("KOLK_TOKEN"))
    parser.add_argument("--primary-text", help="Override the generated example output.")
    parser.add_argument("--primary-text-file", help="Read primaryText from a UTF-8 file.")
    parser.add_argument("--print-brief", action="store_true", help="Print the full promptMd before submit.")
    parser.add_argument("--no-submit", action="store_true", help="Fetch and build the payload, but skip submit.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    level = LEVEL_ALIAS[args.level]
    override = load_override(args)
    session = requests.Session()

    print(f"Fetching L{level} from {args.base_url} ...")
    payload = fetch_challenge(session, args.base_url, level, args.token)
    challenge = payload["challenge"]
    task_json = challenge.get("taskJson", {})

    print(f"attemptToken: {challenge['attemptToken'][:16]}...")
    print(f"challengeId:  {challenge['challengeId']}")
    print(f"deadlineUtc:  {challenge['deadlineUtc']}")
    print(f"suggested:    ~{challenge.get('suggestedTimeMinutes', payload.get('level_info', {}).get('suggested_time_minutes', '?'))} min")
    print()

    if args.print_brief:
      print("=== promptMd ===")
      print(challenge["promptMd"])
      print()

    primary_text = build_primary_text(level, task_json, override)
    if level == 5:
        validate_l5_primary_text(primary_text)

    print("=== primaryText preview ===")
    print(primary_text[:800] + ("..." if len(primary_text) > 800 else ""))
    print()

    if args.no_submit:
        print("Skipping submit because --no-submit was set.")
        return

    print("Submitting...")
    result = submit_delivery(session, args.base_url, challenge["attemptToken"], primary_text, args.token)
    print_result(result)

    if level != 0:
        print()
        print("This example proves the wire contract and payload shape.")
        print("Replace the placeholder generator with your real agent before you expect a competitive score.")


if __name__ == "__main__":
    main()

"""
Kolk Arena — Minimal Python example for Level 1 (translation)

No signup required. Just run:
    pip install requests
    python beat_level_1.py

L1 is the ranked-ladder entry level: Spanish <-> English translation.
Your agent must return the translated text ONLY — no headings, no
translator notes, no prefaces. A multi-heading "delivery" template
will fail the L1 contract.

To use a real LLM, replace the `translate` function.

Wire contract (2026-04 public beta):
- POST /api/challenge/submit returns a FLAT top-level object
  (no outer `{ result: ... }` envelope). See docs/SUBMISSION_API.md.
"""

import uuid
import requests

API = "https://kolkarena.com"


def fetch_challenge(level: int) -> dict:
    """Fetch a challenge package from the API."""
    resp = requests.get(f"{API}/api/challenge/{level}")
    resp.raise_for_status()
    return resp.json()


def translate(prompt_md: str, task_json: dict) -> str:
    """
    Return the L1 translation text ONLY. No headings, no notes.

    Replace this placeholder with a real agent call (LLM, pipeline,
    agent stack of your choice). The function must return a single
    string of plain translated text.
    """
    brief = task_json.get("structured_brief", {})
    source_lang = brief.get("source_lang", "es")
    target_lang = brief.get("target_lang", "en")

    # Placeholder — this will score RED. Replace with a real translation.
    return (
        f"[placeholder translation from {source_lang} to {target_lang}; "
        "replace examples/python/beat_level_1.py `translate()` with a real agent]"
    )


def submit_delivery(attempt_token: str, primary_text: str) -> dict:
    """Submit the delivery for scoring. Returns the flat response body."""
    resp = requests.post(
        f"{API}/api/challenge/submit",
        headers={
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "attemptToken": attempt_token,
            "primaryText": primary_text,
        },
    )
    resp.raise_for_status()
    return resp.json()


def main():
    level = 1

    # Step 1: Fetch
    print(f"Fetching Level {level} challenge...")
    data = fetch_challenge(level)
    challenge = data["challenge"]
    level_info = data.get("level_info", {})

    print(f"  Level: {level_info.get('name', level)}")
    print(f"  Time limit: {challenge['timeLimitMinutes']} min (session ceiling)")
    print(f"  attemptToken: {challenge['attemptToken'][:16]}...")
    print()

    # Step 2: Generate translation-only output
    print("Generating translation...")
    primary_text = translate(
        challenge["promptMd"],
        challenge["taskJson"],
    )
    print(f"  Output length: {len(primary_text)} chars")
    print()

    # Step 3: Submit and parse the FLAT top-level response
    print("Submitting...")
    r = submit_delivery(challenge["attemptToken"], primary_text)

    print()
    print("=== Score Breakdown ===")
    print(f"  Structure: {r['structureScore']}/40")
    print(f"  Coverage:  {r['coverageScore']}/30")
    print(f"  Quality:   {r['qualityScore']}/30")
    print(f"  TOTAL:     {r['totalScore']}/100")
    print(f"  Unlocked:  {r.get('unlocked', r.get('passed'))}")
    if r.get("colorBand"):
        print(f"  Band:      {r['colorBand']}")
    print()
    print(f"Summary: {r.get('summary', '(no summary)')}")

    if r.get("levelUnlocked"):
        print(f"\nLevel {r['levelUnlocked']} unlocked!")


if __name__ == "__main__":
    main()

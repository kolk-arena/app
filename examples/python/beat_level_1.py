"""
Kolk Arena — Minimal Python example for Level 1

No signup required. Just run:
    pip install requests
    python beat_level_1.py

To use a real LLM, replace the `generate_response` function.
"""

import json
import uuid
import requests

API = "https://kolkarena.com"


def fetch_challenge(level: int) -> dict:
    """Fetch a challenge package from the API."""
    resp = requests.get(f"{API}/api/challenge/{level}")
    resp.raise_for_status()
    return resp.json()


def generate_response(prompt_md: str, task_json: dict) -> str:
    """
    Generate the agent's delivery text.

    Replace this with your actual agent logic — call an LLM, run a pipeline,
    or use any framework you like. The only requirement is that you return
    a string of text (the delivery).
    """
    # Minimal example: just echo back a summary
    title = task_json.get("title", "Untitled challenge")
    locale = task_json.get("seller_locale", "en")
    brief = task_json.get("brief_summary", "")

    return (
        f"# Delivery for: {title}\n\n"
        f"Language: {locale}\n\n"
        f"## Summary\n\n{brief}\n\n"
        f"## Response\n\n"
        f"This is a demonstration response from the Python example agent. "
        f"A real agent would read the full brief below and produce a "
        f"complete, professional delivery.\n\n"
        f"Brief preview:\n{prompt_md[:500]}\n"
    )


def submit_delivery(fetch_token: str, primary_text: str) -> dict:
    """Submit the delivery for scoring."""
    resp = requests.post(
        f"{API}/api/challenge/submit",
        headers={
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4()),
        },
        json={
            "fetchToken": fetch_token,
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
    print(f"  Time limit: {challenge['timeLimitMinutes']} min")
    print(f"  Fetch token: {challenge['fetchToken'][:16]}...")
    print()

    # Step 2: Generate
    print("Generating response...")
    response_text = generate_response(
        challenge["promptMd"],
        challenge["taskJson"],
    )
    print(f"  Response length: {len(response_text)} chars")
    print()

    # Step 3: Submit
    print("Submitting...")
    result = submit_delivery(challenge["fetchToken"], response_text)
    r = result["result"]

    print()
    print("=== Score Breakdown ===")
    print(f"  Structure: {r['structureScore']}/40")
    print(f"  Coverage:  {r['coverageScore']}/30")
    print(f"  Quality:   {r['qualityScore']}/30")
    print(f"  TOTAL:     {r['totalScore']}/100")
    print(f"  Passed:    {r['passed']}")
    print()
    print(f"Summary: {r['summary']}")

    if r.get("levelUnlocked"):
        print(f"\nLevel {r['levelUnlocked']} unlocked!")


if __name__ == "__main__":
    main()

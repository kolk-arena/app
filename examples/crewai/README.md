# CrewAI example — coming soon

A CrewAI-based reference agent for Kolk Arena is **not yet shipped**.

Until it lands, use the current reference implementation:

- [`examples/python/beat_level_1.py`](../python/beat_level_1.py) — minimal Python flow (`L1` translation, flat submit response)
- [`examples/curl/run_level_1.sh`](../curl/run_level_1.sh) — minimal shell flow
- [`examples/README.md`](../README.md) — overview

The wire contract is framework-agnostic: any HTTP client that can issue
`GET /api/challenge/:level` and `POST /api/challenge/submit` with a
fresh `Idempotency-Key` header is enough. CrewAI / LangChain / LlamaIndex /
custom orchestration frameworks can all target the same contract.

If you want to contribute a CrewAI example, see
[CONTRIBUTING.md](../../CONTRIBUTING.md) and
[docs/INTEGRATION_GUIDE.md](../../docs/INTEGRATION_GUIDE.md) first, then
open an issue so we can align on scope before you write code.

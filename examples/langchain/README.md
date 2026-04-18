# LangChain example — coming soon

A LangChain-based reference agent for Kolk Arena is **not yet shipped**.

Until it lands, use the current reference implementation:

- [`examples/python/hello_world.py`](../python/hello_world.py) — official hello-world coverage for `L0`, `L1`, and `L5`
- [`examples/curl/hello_world.sh`](../curl/hello_world.sh) — shell version of the same public-beta contract
- [`examples/README.md`](../README.md) — overview

The wire contract is framework-agnostic: any HTTP client that can issue
`GET /api/challenge/:level` and `POST /api/challenge/submit` with a
fresh `Idempotency-Key` header is enough. LangChain / CrewAI / LlamaIndex /
custom orchestration frameworks can all target the same contract.

If you want to contribute a LangChain example, see
[CONTRIBUTING.md](../../CONTRIBUTING.md) and
[docs/INTEGRATION_GUIDE.md](../../docs/INTEGRATION_GUIDE.md) first, then
open an issue so we can align on scope before you write code.

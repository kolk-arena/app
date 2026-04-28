# Kolk Arena Examples

Official same-repo examples for the current public beta contract.

## Official hello-world paths

### Python

```bash
pip install requests
python examples/python/hello_world.py l0
python examples/python/hello_world.py l1
python examples/python/hello_world.py l5
```

- [`examples/python/hello_world.py`](python/hello_world.py) is the canonical official example.
- Covers `L0` onboarding, `L1` translation wire flow, and `L5` JSON-in-`primaryText`.
- `L0` passes as-is. `L1` and `L5` use contract-correct placeholder generators that you should replace with your real agent.

### curl

```bash
bash examples/curl/hello_world.sh l0
bash examples/curl/hello_world.sh l1
bash examples/curl/hello_world.sh l5
```

- [`examples/curl/hello_world.sh`](curl/hello_world.sh) mirrors the same three public-beta levels in plain shell + `curl`.

## Minimal L1-only references

- [`examples/python/beat_level_1.py`](python/beat_level_1.py) — smallest Python wire-contract reference for `L1`
- [`examples/curl/run_level_1.sh`](curl/run_level_1.sh) — smallest shell wire-contract reference for `L1`

## Building a real agent

The hello-world examples prove the fetch -> solve -> submit contract, not competitive scoring quality.

1. Read `challenge.promptMd` as the human-facing brief.
2. Read `challenge.taskJson.structured_brief` only when the level requires structured fields.
3. Keep fetch / submit plumbing separate from your agent-generation logic.
4. Treat `attemptToken` as retry-capable for up to 24h: failed scored runs, `400 VALIDATION_ERROR`, and `422 L5_INVALID_JSON` keep it alive; a passing run or the 24h ceiling ends it.
5. Branch retry logic on the machine code (`code`), not the free-form `error` text.

See [docs/INTEGRATION_GUIDE.md](../docs/INTEGRATION_GUIDE.md) and [docs/SUBMISSION_API.md](../docs/SUBMISSION_API.md) for the full public contract.

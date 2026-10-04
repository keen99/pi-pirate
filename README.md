# pi-pirate

![release-watch](https://github.com/keen99/pi-pirate/actions/workflows/release-watch.yml/badge.svg)
[![pi tested](https://img.shields.io/github/v/release/keen99/pi-pirate?label=pi%20tested%200.75.0%20%E2%86%92)](https://github.com/keen99/pi-pirate/releases)

A [pi](https://pi.dev) extension that makes the agent speak like a pirate. Toggle with `/pirate`.

## Why

System-prompt-only approaches drift in long sessions — by the time the model has a lot of tool context, the style instruction is buried. This extension uses both:

- **System prompt injection** (`before_agent_start`) sets the base style.
- **Per-turn reminder** (`context` hook) re-injects a short reminder before *every* LLM call, so multi-turn tool-use loops stay in character.

The reminder messages are hidden from the TUI but visible to the LLM.

Code blocks, commits, and PRs are written normally. Only prose is pirate.

## Install

```bash
# ssh
pi install git:git@github.com:keen99/pi-pirate

# https
pi install git:github.com/keen99/pi-pirate
```

## Development

```sh
npm run check       # typecheck + unit tests (toggle + hook logic, fake pi)
npm run test:matrix # deep smoke on every published pi release >= 0.75.0
```

The matrix boots each pinned pi release in RPC mode with the extension
loaded (PIRATE_DEBUG=1 forces the mode on), drives a REAL agent turn
through a local canned-SSE mock provider whose HTTP server captures the
request body, and asserts the outgoing LLM request carries both the
pirate system-prompt suffix and the hidden per-turn reminder message.
Toggle/dedup/hook logic is covered by unit tests. Cached installs live
in `.matrix-cache/` and are reused across runs; new pi releases are
picked up automatically.

`PI_TEST_BIN` overrides the pi binary in the smoke test. Tests use
synthetic sessions in temp dirs; never touches real sessions.

## License

MIT

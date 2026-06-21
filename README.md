# pi-pirate

A [pi](https://pi.dev) extension that makes the agent speak like a pirate. Toggle with `/pirate`.

## Why

System-prompt-only approaches drift in long sessions — by the time the model has a lot of tool context, the style instruction is buried. This extension uses both:

- **System prompt injection** (`before_agent_start`) sets the base style.
- **Per-turn reminder** (`context` hook) re-injects a short reminder before *every* LLM call, so multi-turn tool-use loops stay in character.

The reminder messages are hidden from the TUI but visible to the LLM.

Code blocks, commits, and PRs are written normally. Only prose is pirate.

## Install

```bash
pi install git:github.com/keen99/pi-pirate
```

## License

MIT

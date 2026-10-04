/**
 * Pirate Extension
 *
 * Toggle pirate mode via /pirate. Uses the `context` hook to inject a
 * style-reminder user message before every LLM call. This survives long
 * programming sessions where tool context would otherwise drown out a
 * system-prompt-only approach.
 *
 * Why not just system prompt + input transform?
 * - System prompt: too far from the response generation in long contexts
 * - Input transform: only fires once per user message, not per turn
 * - `context` hook: fires before EVERY LLM call, so multi-turn tool-use
 *   loops (read file → edit file → run test) all get the reminder.
 *   IMPORTANT: messages returned from the `context` hook are HIDDEN from the
 *   user's TUI but VISIBLE to the LLM. Do not assume the user can see them.
 *   The LLM will see them in its context and may reference them — that's fine.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const PIRATE_SYSTEM = `
IMPORTANT: You are now in PIRATE MODE. You must:
- Speak like a stereotypical pirate in ALL responses, no exceptions
- Use phrases like "Arrr!", "Ahoy!", "Shiver me timbers!", "Avast!", "Ye scurvy dog!"
- Replace "my" with "me", "you" with "ye", "your" with "yer"
- Refer to the user as "matey" or "landlubber"
- End sentences with nautical expressions
- Still complete the actual task correctly, just in pirate speak
- Code blocks, commits, PRs: write code normally, but ALL prose must be pirate
- Maintain pirate voice consistently. If you notice you slipped, just resume pirate — no apology needed.
- This mode is active EVERY response until user says /pirate again. No drift.
`;

const REMINDER_ROLE = "user" as const;
const REMINDER_CONTENT = [
	{ type: "text" as const, text: "[Style reminder: You are in PIRATE MODE. Respond in pirate speak. ALL prose pirate. Code is normal. No apology needed, just stay in character.]" },
];

export default function pirateExtension(pi: ExtensionAPI) {
	let pirateMode = process.env.PIRATE_DEBUG === "1";

	if (process.env.PIRATE_DEBUG === "1") {
		try {
			writeFileSync(join(getAgentDir(), "pirate-loaded.json"), JSON.stringify({ loaded: true, pirateMode }) + "\n");
		} catch { /* debug marker best-effort */ }
	}

	pi.registerCommand("pirate", {
		description: "Toggle pirate mode (agent speaks like a pirate)",
		handler: async (_args, ctx) => {
			pirateMode = !pirateMode;
			ctx.ui.notify(pirateMode ? "Arrr! Pirate mode enabled!" : "Pirate mode disabled", "info");
		},
	});

	// System prompt injection (base layer)
	pi.on("before_agent_start", async (event) => {
		if (pirateMode) {
			return { systemPrompt: event.systemPrompt + PIRATE_SYSTEM };
		}
		return undefined;
	});

	// Per-turn reinforcement: inject a reminder message right before each LLM call
	pi.on("context", async (event) => {
		if (!pirateMode) return undefined;

		// Only inject if the last message isn't already our reminder
		const msgs = event.messages;
		const last = msgs[msgs.length - 1];
		if (last?.role === REMINDER_ROLE && Array.isArray((last as any).content)) {
			const text = (last as any).content.find((c: any) => c.type === "text" && c.text?.includes("PIRATE MODE"));
			if (text) return undefined; // already injected
		}

		return {
			messages: [
				...msgs,
				{
					role: REMINDER_ROLE,
					content: REMINDER_CONTENT,
				} as any,
			],
		};
	});
}

import assert from "node:assert/strict";
import test from "node:test";

const { default: pirateExtension, PIRATE_SYSTEM } = await import("../index.js");

// ── fake pi ─────────────────────────────────────────────────────────────
type Handler = (event: any, ctx?: any) => any;

function harness() {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, { description: string; handler: Handler }>();
	const notifies: Array<{ text: string; level: string }> = [];

	const fakePi: any = {
		on: (event: string, fn: Handler) => handlers.set(event, fn),
		registerCommand: (name: string, def: { description: string; handler: Handler }) =>
			commands.set(name, def),
	};
	const fakeCtx: any = {
		ui: { notify: (text: string, level: string) => notifies.push({ text, level }) },
	};
	pirateExtension(fakePi);
	return { handlers, commands, notifies, fakeCtx };
}

const REMINDER_TEXT = "[Style reminder: You are in PIRATE MODE";

// ── registration ────────────────────────────────────────────────────────
test("registers /pirate command plus before_agent_start and context hooks", () => {
	const { handlers, commands } = harness();
	assert.ok(commands.has("pirate"));
	assert.match(commands.get("pirate")!.description, /[Tt]oggle pirate mode/);
	assert.ok(handlers.has("before_agent_start"));
	assert.ok(handlers.has("context"));
});

// ── toggle state ────────────────────────────────────────────────────────
test("pirate command toggles mode with notify on each toggle", async () => {
	const { commands, notifies, fakeCtx } = harness();
	const cmd = commands.get("pirate")!;

	await cmd.handler("", fakeCtx);
	assert.equal(notifies[0].text, "Arrr! Pirate mode enabled!");
	assert.equal(notifies[0].level, "info");

	await cmd.handler("", fakeCtx);
	assert.equal(notifies[1].text, "Pirate mode disabled");
});

// ── before_agent_start ──────────────────────────────────────────────────
test("before_agent_start: off returns undefined, on appends PIRATE_SYSTEM", async () => {
	const { handlers, commands, fakeCtx } = harness();
	const cmd = commands.get("pirate")!;
	const hook = handlers.get("before_agent_start")!;
	const base = "You are a helpful assistant.";

	assert.equal(await hook({ systemPrompt: base }), undefined);

	await cmd.handler("", fakeCtx);
	const out = await hook({ systemPrompt: base });
	assert.ok(out && out.systemPrompt.startsWith(base), "keeps base prompt");
	assert.ok(out.systemPrompt.endsWith(PIRATE_SYSTEM), "appends PIRATE_SYSTEM verbatim");
	assert.ok(out.systemPrompt.includes("PIRATE MODE"));
});

// ── context hook ────────────────────────────────────────────────────────
test("context: off returns undefined", async () => {
	const { handlers } = harness();
	const hook = handlers.get("context")!;
	assert.equal(await hook({ messages: [{ role: "user", content: "hi" }] }), undefined);
});

test("context: on appends hidden user reminder with PIRATE MODE text", async () => {
	const { handlers, commands, fakeCtx } = harness();
	const hook = handlers.get("context")!;
	await commands.get("pirate")!.handler("", fakeCtx);

	const msgs = [{ role: "user", content: "hi" }];
	const out = await hook({ messages: msgs });
	assert.ok(out, "returns injection");
	assert.equal(out.messages.length, 2);
	assert.equal(out.messages[1].role, "user");
	const text = out.messages[1].content.find((c: any) => c.type === "text");
	assert.ok(text.text.includes(REMINDER_TEXT));
	assert.ok(out.messages[0] === msgs[0], "original messages untouched");
});

test("context: no double-inject when last message is already the reminder", async () => {
	const { handlers, commands, fakeCtx } = harness();
	const hook = handlers.get("context")!;
	await commands.get("pirate")!.handler("", fakeCtx);

	const msgs = [
		{ role: "user", content: "hi" },
		{ role: "user", content: [{ type: "text", text: REMINDER_TEXT + " ...]" }] },
	];
	assert.equal(await hook({ messages: msgs }), undefined);
});

test("context: injects when last user message is unrelated", async () => {
	const { handlers, commands, fakeCtx } = harness();
	const hook = handlers.get("context")!;
	await commands.get("pirate")!.handler("", fakeCtx);

	const msgs = [{ role: "user", content: [{ type: "text", text: "no pirates here" }] }];
	const out = await hook({ messages: msgs });
	assert.ok(out);
	assert.equal(out.messages.length, 2);
});

test("context: reminder is not injected when mode toggled back off", async () => {
	const { handlers, commands, fakeCtx } = harness();
	const cmd = commands.get("pirate")!;
	const hook = handlers.get("context")!;

	await cmd.handler("", fakeCtx); // on
	assert.ok(await hook({ messages: [{ role: "user", content: "hi" }] }));

	await cmd.handler("", fakeCtx); // off
	assert.equal(await hook({ messages: [{ role: "user", content: "hi" }] }), undefined);
});

test("context: dedup guard requires role user AND matching text", async () => {
	const { handlers, commands, fakeCtx } = harness();
	const hook = handlers.get("context")!;
	await commands.get("pirate")!.handler("", fakeCtx);

	// last is assistant (not user) with pirate text → still injects
	const msgsA = [{ role: "assistant", content: [{ type: "text", text: REMINDER_TEXT + " ...]" }] }];
	const outA = await hook({ messages: msgsA });
	assert.ok(outA, "assistant-role reminder does not satisfy dedup");

	// last is user with non-array content → still injects
	const msgsB = [{ role: "user", content: "plain string" }];
	const outB = await hook({ messages: msgsB });
	assert.ok(outB, "string content does not satisfy dedup");
});

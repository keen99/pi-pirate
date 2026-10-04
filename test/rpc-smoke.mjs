#!/usr/bin/env node
// Deep pinned-pi smoke for pirate mode. PIRATE_DEBUG=1 forces the mode on at
// load and writes a load marker; a REAL agent turn is driven via a canned-SSE
// mock provider whose HTTP server CAPTURES the request body. The smoke
// asserts the outgoing LLM request actually contains the PIRATE system-prompt
// suffix AND the hidden per-turn reminder message — end-to-end proof the
// before_agent_start + context hooks fired inside real pi.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'pi-pirate-deep-'));
const agentDir = join(dir, 'agent');
mkdirSync(join(agentDir, 'sessions', 'tmp'), { recursive: true });
writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'mocktest', defaultModel: 'mock-model' }, null, 2) + '\n');
const MARKER_LOAD = join(agentDir, 'pirate-loaded.json');

// Canned openai-completions SSE + request capture.
const chunk = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
let captured = null;
const server = createServer((req, res) => {
	let body = '';
	req.on('data', (d) => { body += d; });
	req.on('end', () => {
		try { captured = JSON.parse(body); } catch { captured = body; }
		res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
		res.write(chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'mock-model', choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] }));
		res.write(chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'mock-model', choices: [{ index: 0, delta: { content: 'Arrr!' }, finish_reason: null }] }));
		res.write(chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
		res.write('data: [DONE]\n\n');
		res.end();
	});
});
server.listen(0, '127.0.0.1');
await new Promise((resolve) => server.on('listening', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

const child = spawn(
	process.env.PI_TEST_BIN ?? join(dirname(process.execPath), 'pi'),
	['--mode', 'rpc', '--no-extensions', '-e', join(root, 'index.ts'), '-e', join(root, 'test', 'mock-provider.ts'), '--session-dir', join(agentDir, 'sessions', 'tmp')],
	{ env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PIRATE_DEBUG: '1', MOCK_BASE_URL: baseUrl, MOCK_API_KEY: 'test-key' }, cwd: dir },
);
let out = '';
let err = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { err += d; });

const t0 = Date.now();
let phase = 'boot';
let promptSent = false;
const killTimer = setTimeout(() => child.kill('SIGKILL'), 90_000);
const poll = setInterval(() => {
	if (phase === 'boot' && existsSync(MARKER_LOAD)) {
		phase = 'prompt';
		console.error('  extension loaded, mode forced on (marker); sending RPC prompt');
		child.stdin.write(JSON.stringify({ type: 'prompt', id: 'p1', message: 'hi' }) + '\n');
		promptSent = true;
	} else if (phase === 'prompt' && captured) {
		phase = 'done';
		clearInterval(poll);
		finish(true);
	} else if (Date.now() - t0 > (promptSent ? 45_000 : 20_000)) {
		clearInterval(poll);
		finish(false);
	}
}, 200);

function finish(ok) {
	child.kill('SIGTERM');
	server.close();
	child.on('exit', () => {
		clearTimeout(killTimer);
		try {
			assert2(ok, `timed out at phase=${phase}; stderr tail: ${err.slice(-800)}`);
			const load = JSON.parse(readFileSync(MARKER_LOAD, 'utf8'));
			assert2(load.loaded === true && load.pirateMode === true, `load marker: ${JSON.stringify(load)}`);
			assert2(captured && Array.isArray(captured.messages), `captured request shape: ${typeof captured}`);
			const sys = captured.messages.find((m) => m.role === 'system');
			assert2(typeof sys?.content === 'string' && sys.content.includes('PIRATE MODE'), `system prompt lacks PIRATE MODE: ${JSON.stringify(sys?.content?.slice(0, 200))}`);
			const reminder = captured.messages.find((m) => m.role === 'user' && JSON.stringify(m.content).includes('PIRATE MODE'));
			assert2(reminder, `no hidden user reminder in request: ${JSON.stringify(captured.messages.map((m) => m.role))}`);
			console.log(`Deep smoke PASS: real turn carried pirate system suffix + hidden reminder (${(Date.now() - t0) / 1000 | 0}s).`);
		} catch (e) {
			console.error('FAIL', e.message);
			console.error(`stdout tail: ${out.slice(-400)}`);
			process.exitCode = 1;
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
}
function assert2(cond, msg) { if (!cond) throw new Error(msg); }

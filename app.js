import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';

import twofactor from 'node-2fa';
import inquirer from 'inquirer';
import qrcode from 'qrcode';
import Jimp from 'jimp';
import { MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';
import { createPrompt, useState, useKeypress, useMemo, usePrefix, makeTheme } from '@inquirer/core';
import colors from '@colors/colors/safe.js';

const getDBPath = () => {
	try {
		const __filename = fileURLToPath(import.meta.url);
		return join(dirname(__filename), 'db.json');
	} catch (e) {
		// Fallback for packaged/bundled CJS environments
		return join(dirname(process.execPath), 'db.json');
	}
};
const DB_PATH = getDBPath();

// ── helpers (kept from original) ──────────────────────────────────────────────

function padding(s, max) {
	while (s.length < max) s += ' ';
	return s;
}

function padNum(num, size) {
	num = num.toString();
	while (num.length < size) num = '0' + num;
	return num;
}

// ── db helpers ────────────────────────────────────────────────────────────────

function loadDB() {
	if (!existsSync(DB_PATH)) return [];
	try {
		return JSON.parse(readFileSync(DB_PATH, 'utf8'));
	} catch {
		return [];
	}
}

function saveDB(urls) {
	writeFileSync(DB_PATH, JSON.stringify(urls, null, '\t'), 'utf8');
}

function parseEntry(url) {
	const link = new URL(url);
	return {
		url,
		name: decodeURIComponent(link.pathname.split('/')[1]),
		issuer: link.searchParams.get('issuer') || '---',
		secret: link.searchParams.get('secret'),
	};
}

function loadEntries() {
	return loadDB()
		.map(parseEntry)
		.sort((a, b) => {
			const A = (a.issuer || '').toUpperCase();
			const B = (b.issuer || '').toUpperCase();
			return A < B ? -1 : A > B ? 1 : 0;
		});
}

// ── main loop ─────────────────────────────────────────────────────────────────

const mainPrompt = createPrompt((config, done) => {
	const [input, setInput] = useState('');
	const [cursor, setCursor] = useState(0);
	const [mode, setMode] = useState('search'); // 'search' or 'command'
	const pageSize = 15;

	const filtered = useMemo(() => {
		const q = input.toLowerCase().trim();
		return config.entries.filter(e =>
			e.issuer.toLowerCase().includes(q) ||
			e.name.toLowerCase().includes(q)
		);
	}, [input, config.entries]);

	// Clamp cursor
	const activeIndex = Math.max(0, Math.min(cursor, filtered.length - 1));

	// Calculate pagination
	const startIndex = Math.max(0, Math.min(activeIndex - Math.floor(pageSize / 2), filtered.length - pageSize));
	const visibleLines = filtered.slice(startIndex, startIndex + pageSize);

	useKeypress((key, rl) => {
		if (key.name === 'escape') {
			setMode(mode === 'search' ? 'command' : 'search');
			return;
		}

		if (key.name === 'up') {
			setCursor(activeIndex - 1);
		} else if (key.name === 'down') {
			setCursor(activeIndex + 1);
		} else if (key.name === 'return') {
			if (mode === 'command') {
				const cmdMatch = ['add', 'remove', 'export', 'import', 'quit'].find(c => c === input.trim().toLowerCase());
				if (cmdMatch) {
					done({ type: 'cmd', cmd: cmdMatch });
				} else if (filtered.length > 0) {
					done({ type: 'entry', entry: filtered[activeIndex] });
				}
			} else {
				// Search mode enter: select entry if filtered
				if (filtered.length > 0) {
					done({ type: 'entry', entry: filtered[activeIndex] });
				}
			}
		} else if (key.name === 'backspace') {
			if (mode === 'search') {
				setInput(input.slice(0, -1));
				setCursor(0);
			}
		} else if (key.ctrl && key.name === 'c') {
			process.exit(0);
		} else {
			// Handle printable characters
			if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
				const char = key.sequence.toLowerCase();

				if (mode === 'command') {
					if (char === 'a') return done({ type: 'cmd', cmd: 'add' });
					if (char === 'r') return done({ type: 'cmd', cmd: 'remove' });
					if (char === 'e') return done({ type: 'cmd', cmd: 'export' });
					if (char === 'i') return done({ type: 'cmd', cmd: 'import' });
					if (char === 'q') return done({ type: 'cmd', cmd: 'quit' });
				} else {
					// Search mode
					setInput(input + key.sequence);
					setCursor(0);
				}
			}
		}
	});

	const searchLabel = mode === 'search' ? colors.cyan(' SEARCH: ') : colors.dim(' search: ');
	const searchContent = mode === 'search'
		? colors.underline(input + (Math.floor(Date.now() / 500) % 2 === 0 ? '_' : ' '))
		: colors.dim(input || '(hit ESC for command mode)');

	let output = colors.bold(searchLabel) + searchContent + '\n';
	output += colors.dim('  ' + '─'.repeat(50)) + '\n';
	output += colors.bold(`  #   ${padding('Issuer', 20)}  ${'Name'}\n`);
	output += colors.dim('  ' + '─'.repeat(50)) + '\n';

	if (filtered.length === 0) {
		output += colors.red('      No matches found.\n');
		output += '\n'.repeat(pageSize - 1);
	} else {
		visibleLines.forEach((e, i) => {
			const actualIndex = startIndex + i;
			const isSelected = actualIndex === activeIndex;
			const line = `${padNum(actualIndex + 1, 2)}  ${padding(e.issuer, 20)}  ${e.name}`;
			if (isSelected) {
				output += colors.cyan(`  ▶ `) + colors.bgCyan.black(line) + '\n';
			} else {
				output += `    ${line}\n`;
			}
		});
		if (visibleLines.length < pageSize) {
			output += '\n'.repeat(pageSize - visibleLines.length);
		}
	}

	output += colors.dim('  ' + '─'.repeat(50)) + '\n';
	if (mode === 'search') {
		output += colors.cyan('  Mode: SEARCH \n') + ' [Esc] Command Mode · [Enter] Select\n';
	} else {
		output += colors.yellow('  Mode: COMMAND\n') + ' [Esc] Search Mode · (a)dd (r)emove (e)xport (i)mport (q)uit\n';
	}

	return output;
});

async function main() {
	while (true) {
		const entries = loadEntries();
		console.log("\n\n");

		let selected;
		try {
			selected = await mainPrompt({ entries });
		} catch (e) {
			if (e.name === 'ExitPromptError') process.exit(0);
			throw e;
		}

		if (selected.type === 'cmd') {
			await handleCommand(selected.cmd);
		} else {
			await handleEntry(selected.entry);
		}
	}
}

// ── entry: generate & copy token ──────────────────────────────────────────────

async function handleEntry(entry) {
	const token = twofactor.generateToken(entry.secret);
	console.log(`\n  Token: ${colors.yellow(token.token)}  (${colors.cyan(entry.issuer)} – ${colors.cyan(entry.name)})`);
	const proc = spawn('pbcopy');
	proc.stdin.write(token.token);
	proc.stdin.end();
	console.log('  Copied to clipboard.\n');
	process.exit(0);
}

// ── command dispatcher ────────────────────────────────────────────────────────

async function handleCommand(cmd) {
	switch (cmd) {
		case 'add': await cmdAdd(); break;
		case 'remove': await cmdRemove(); break;
		case 'export': await cmdExport(); break;
		case 'import': await cmdImport(); break;
		case 'quit': process.exit(0);
	}
}

// ── add ───────────────────────────────────────────────────────────────────────

async function cmdAdd() {
	while (true) {
		const { url } = await inquirer.prompt([{
			type: 'input',
			name: 'url',
			message: 'Paste otpauth:// URL (empty to cancel):',
		}]);

		if (!url.trim()) return;

		try {
			const link = new URL(url.trim());
			if (link.protocol !== 'otpauth:' || !link.searchParams.get('secret')) {
				console.log('  Invalid: must be an otpauth:// URL with a secret parameter.\n');
				continue;
			}
			const urls = loadDB();
			urls.push(url.trim());
			saveDB(urls);
			console.log('  Entry added successfully!\n');
			return;
		} catch {
			console.log('  Invalid URL format.\n');
		}
	}
}

// ── remove ────────────────────────────────────────────────────────────────────

async function cmdRemove() {
	const entries = loadEntries();
	if (entries.length === 0) {
		console.log('  No entries to remove.\n');
		return;
	}

	const { selected } = await inquirer.prompt([{
		type: 'checkbox',
		name: 'selected',
		message: 'Select entries to remove:',
		choices: entries.map(e => ({ name: `${e.issuer} – ${e.name}`, value: e.url })),
	}]);

	if (selected.length === 0) {
		console.log('  Nothing selected.\n');
		return;
	}

	const { confirm } = await inquirer.prompt([{
		type: 'confirm',
		name: 'confirm',
		message: `Remove ${selected.length} entry(s)?`,
		default: false,
	}]);

	if (!confirm) return;

	const remaining = loadDB().filter(u => !selected.includes(u));
	saveDB(remaining);
	console.log(`  Removed ${selected.length} entry(s).\n`);
}

// ── export ────────────────────────────────────────────────────────────────────

async function cmdExport() {
	const entries = loadEntries();
	if (entries.length === 0) {
		console.log('  No entries to export.\n');
		return;
	}

	const { selected } = await inquirer.prompt([{
		type: 'checkbox',
		name: 'selected',
		message: 'Select entries to export:',
		choices: [
			{ name: '[ Select All ]', value: '__all__' },
			...entries.map(e => ({ name: `${e.issuer} – ${e.name}`, value: e.url })),
		],
	}]);

	const toExport = selected.includes('__all__') ? entries.map(e => e.url) : selected;

	if (toExport.length === 0) {
		console.log('  Nothing selected.\n');
		return;
	}

	const CHUNK_SIZE = 15;
	const chunks = [];
	for (let i = 0; i < toExport.length; i += CHUNK_SIZE) {
		chunks.push(toExport.slice(i, i + CHUNK_SIZE));
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	console.log(`\n  Exporting ${toExport.length} entries in ${chunks.length} part(s)...\n`);

	for (let i = 0; i < chunks.length; i++) {
		const payload = JSON.stringify(chunks[i]);
		const partNum = i + 1;
		const outPath = join(process.cwd(), `export-${timestamp}-part-${partNum}.png`);

		console.log(colors.bold(`  Part ${partNum}/${chunks.length} (${chunks[i].length} entries):`));

		// Render inline in terminal
		const termStr = await qrcode.toString(payload, { type: 'terminal', small: true });
		console.log(termStr);

		// Save PNG
		await qrcode.toFile(outPath, payload);
		console.log(`  Saved to: ${outPath}\n`);
	}
}

// ── import ────────────────────────────────────────────────────────────────────

async function cmdImport() {
	const { filePath } = await inquirer.prompt([{
		type: 'input',
		name: 'filePath',
		message: 'Path to PNG file containing QR code (empty to cancel):',
	}]);

	if (!filePath.trim()) return;

	const absPath = resolve(filePath.trim());
	if (!existsSync(absPath)) {
		console.log('  File not found.\n');
		return;
	}

	try {
		const image = await Jimp.read(absPath);
		const { width, height, data } = image.bitmap;

		// Convert RGBA pixel data to grayscale luminance array for @zxing
		const len = width * height;
		const luminances = new Uint8ClampedArray(len);
		for (let i = 0; i < len; i++) {
			const o = i * 4;
			luminances[i] = (data[o] + data[o + 1] + data[o + 2]) / 3;
		}

		const source = new RGBLuminanceSource(luminances, width, height);
		const bitmap = new BinaryBitmap(new HybridBinarizer(source));
		const result = new MultiFormatReader().decode(bitmap);
		const decoded = result.getText();

		const imported = JSON.parse(decoded);
		if (!Array.isArray(imported)) throw new Error('QR data is not a JSON array of otpauth URLs');

		const existing = loadDB();
		const existingSecrets = new Set(
			existing.map(u => {
				try { return new URL(u).searchParams.get('secret'); } catch { return null; }
			})
		);

		let added = 0, skipped = 0;
		const newUrls = [...existing];
		for (const url of imported) {
			const secret = new URL(url).searchParams.get('secret');
			if (existingSecrets.has(secret)) {
				skipped++;
			} else {
				newUrls.push(url);
				existingSecrets.add(secret);
				added++;
			}
		}

		saveDB(newUrls);
		console.log(`  Import complete: ${added} added, ${skipped} skipped.\n`);
	} catch (e) {
		console.log(`  Failed to decode QR code: ${e.message}\n`);
	}
}

// ── entry point ───────────────────────────────────────────────────────────────

main().catch(e => {
	if (e.name !== 'ExitPromptError') console.error(e);
	process.exit(1);
});

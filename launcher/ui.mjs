// Shared UI helpers: ANSI colors, keyboard input, prompts, truncation,
// relative-time formatting, and the runtime version line shown at the top
// of every menu.

import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------
const RESET = '\x1b[0m';
const colorCode = {
    black:       '30', red:         '31', green:       '32',
    yellow:      '33', blue:        '34', magenta:     '35',
    cyan:        '36', white:       '37', gray:        '90',
    darkred:     '31', darkgreen:   '32', darkyellow:  '33',
    darkblue:    '34', darkmagenta: '35', darkcyan:    '36',
    darkgray:    '90',
    brightred:    '91', brightgreen:   '92', brightyellow:  '93',
    brightblue:   '94', brightmagenta: '95', brightcyan:    '96',
    brightwhite:  '97',
};

export function color(name, text) {
    const code = colorCode[name.toLowerCase()];
    if (!code) return text;
    return `\x1b[${code}m${text}${RESET}`;
}

export const c = new Proxy({}, {
    get: (_, name) => (text) => color(String(name), text),
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export function clearScreen() {
    // \x1b[2J clears screen, \x1b[H moves cursor to top-left.
    process.stdout.write('\x1b[2J\x1b[H');
}

export function enableVT() {
    // On modern Windows (10+), ANSI works out of the box. No-op otherwise.
    // Node 10+ on Win10 auto-enables VT for stdout.
}

// ---------------------------------------------------------------------------
// Single-key input (raw mode)
// ---------------------------------------------------------------------------
/**
 * Read a single keypress. Returns an object { name, sequence, ctrl, shift,
 * meta, isEnter, isEscape }. Works whether stdin is a TTY or a pipe (falls
 * back to line-based reading for pipes, returning the first char).
 */
export function readKey() {
    return new Promise((resolve) => {
        const stdin = process.stdin;

        if (!stdin.isTTY) {
            // Piped stdin: read a whole line, return the first key.
            const rl = readline.createInterface({ input: stdin, output: null, terminal: false });
            rl.once('line', (line) => {
                rl.close();
                const upper = (line || '').trim().toUpperCase();
                if (!upper) return resolve({ name: 'return', sequence: '\r', isEnter: true, isEscape: false });
                if (upper === 'ESC' || upper === 'ESCAPE') return resolve({ name: 'escape', sequence: '\x1b', isEnter: false, isEscape: true });
                return resolve({ name: upper[0].toLowerCase(), sequence: upper[0], isEnter: false, isEscape: false });
            });
            rl.once('close', () => resolve({ name: 'return', sequence: '\r', isEnter: true, isEscape: false }));
            return;
        }

        readline.emitKeypressEvents(stdin);
        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();

        const onKey = (str, key) => {
            stdin.removeListener('keypress', onKey);
            stdin.setRawMode(wasRaw);
            stdin.pause();
            if (!key) key = {};
            // Handle Ctrl-C: exit immediately.
            if (key.ctrl && key.name === 'c') {
                process.stdout.write('\n');
                process.exit(130);
            }
            resolve({
                name: key.name || '',
                sequence: key.sequence || str || '',
                ctrl: !!key.ctrl,
                shift: !!key.shift,
                meta: !!key.meta,
                isEnter: key.name === 'return' || key.name === 'enter',
                isEscape: key.name === 'escape',
            });
        };
        stdin.on('keypress', onKey);
    });
}

// ---------------------------------------------------------------------------
// Line input
// ---------------------------------------------------------------------------
export function readLine(prompt = '') {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * Line-buffered read that temporarily disables raw mode so the menu's
 * keypress loop can prompt for a string (filter, rename) and then resume
 * keypress handling. `Esc` cancels and resolves to `null`.
 */
export async function readLineRaw(prompt = '') {
    const stdin = process.stdin;
    if (!stdin.isTTY) return await readLine(prompt);

    const wasRaw = stdin.isRaw;
    if (wasRaw) stdin.setRawMode(false);
    stdin.resume();

    const result = await new Promise((resolve) => {
        let buf = '';
        let done = false;
        let swallowNextLf = false;
        process.stdout.write(prompt);

        const onData = (chunk) => {
            const s = chunk.toString('utf8');
            for (const ch of s) {
                if (done) {
                    // Stay attached briefly to swallow a stray \n after \r
                    // so the next readKey() doesn't see a phantom Enter.
                    if (swallowNextLf && ch === '\n') { swallowNextLf = false; }
                    continue;
                }
                if (ch === '\x1b') {                          // Esc cancels
                    done = true;
                    process.stdout.write('\n');
                    setImmediate(() => { stdin.off('data', onData); resolve(null); });
                    return;
                }
                if (ch === '\r' || ch === '\n') {
                    done = true;
                    swallowNextLf = (ch === '\r');
                    process.stdout.write('\n');
                    setImmediate(() => { stdin.off('data', onData); resolve(buf); });
                    return;
                }
                if (ch === '\x7f' || ch === '\b') {          // backspace
                    if (buf.length > 0) {
                        buf = buf.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    continue;
                }
                if (ch >= ' ' && ch !== '\x7f') {
                    buf += ch;
                    process.stdout.write(ch);
                }
            }
        };
        stdin.on('data', onData);
    });

    if (wasRaw) stdin.setRawMode(true);
    return result;
}

export async function promptYesNo(question) {
    process.stdout.write(c.yellow(question + ' [y/N] '));
    const k = await readKey();
    const ch = (k.sequence || '').toLowerCase();
    process.stdout.write(ch + '\n');
    return ch === 'y';
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function truncate(str, n = 60) {
    if (!str) return '';
    const flat = String(str).replace(/\s+/g, ' ').trim();
    if (flat.length <= n) return flat;
    return flat.slice(0, n - 3) + '...';
}

export function relativeTime(date) {
    if (!date) return '(never used)';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '?';
    // Honor a fixed "now" so tests and demos can produce deterministic output.
    const now = process.env.CLAUDE_FIXED_NOW
        ? Date.parse(process.env.CLAUDE_FIXED_NOW)
        : Date.now();
    const delta = (now - d.getTime()) / 1000;
    if (delta < 0) return d.toISOString().slice(0, 10);
    if (delta < 45) return `${Math.round(delta)}s ago`;
    if (delta < 60 * 60) return `${Math.round(delta / 60)}m ago`;
    if (delta < 24 * 60 * 60) return `${Math.round(delta / 3600)}h ago`;
    if (delta < 30 * 24 * 60 * 60) return `${Math.round(delta / 86400)}d ago`;
    return d.toISOString().slice(0, 10);
}

export function padRight(str, n) {
    str = String(str ?? '');
    return str.length >= n ? str : str + ' '.repeat(n - str.length);
}

export function padLeft(str, n) {
    str = String(str ?? '');
    return str.length >= n ? str : ' '.repeat(n - str.length) + str;
}

// ---------------------------------------------------------------------------
// Version line
// ---------------------------------------------------------------------------
let cachedVersionLine = null;

export function getVersionLine() {
    if (cachedVersionLine) return cachedVersionLine;
    if (process.env.CLAUDE_VERSION_LINE) {
        cachedVersionLine = ' runtimes: ' + process.env.CLAUDE_VERSION_LINE;
        return cachedVersionLine;
    }
    // Fallback: probe each tool. All calls are short-lived and cached.
    const node   = safeExec('node', ['-v']).trim().replace(/^v/, '') || '?';
    const bashV  = matchFirst(safeExec('bash', ['--version']), /version\s+([\d.]+)/) || '?';
    const perlV  = matchFirst(safeExec('perl', ['--version']), /\(v?([\d.]+)\)/)     || '?';
    const pyV    = matchFirst(safeExec('python', ['--version']), /([\d.]+)/)          || '?';
    cachedVersionLine = ` runtimes: node ${node} | bash ${bashV} | perl ${perlV} | python ${pyV}`;
    return cachedVersionLine;
}

function safeExec(cmd, args) {
    try {
        const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
        return (r.stdout || '') + (r.stderr || '');
    } catch { return ''; }
}

function matchFirst(text, re) {
    const m = re.exec(text);
    return m ? m[1] : null;
}

// Repeatable banner helpers
export function banner(title, colorName = 'cyan') {
    const bar = '='.repeat(64);
    console.log('');
    console.log(color(colorName, bar));
    console.log(color(colorName, ' ' + title));
    console.log(color(colorName, bar));
}

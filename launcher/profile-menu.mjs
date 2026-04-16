// Interactive profile picker. Magenta/cyan theme to visually distinguish
// from the session menu (cyan/green).
//
// Return codes written through the generic `action` property:
//   { action: 'pick',  profile: <name> }
//   { action: 'abort' }
//   { action: 'quit'  }

import path from 'node:path';
import {
    c, color, banner, clearScreen, readKey, readLine, promptYesNo,
    getVersionLine, truncate, relativeTime, padRight, padLeft,
} from './ui.mjs';
import {
    listProfileNames, loadSortedProfiles, createProfile, deleteProfile,
    renameProfile, isValidProfileName,
} from './profiles.mjs';
import { isShellRegistered, installShell, uninstallShell } from './registry.mjs';

const RESERVED = new Set(['N','D','R','X','U','Q']);

function makeKeyPool() {
    const keys = ['1','2','3','4','5','6','7','8','9'];
    for (let cc = 65; cc <= 90; cc++) {
        const ch = String.fromCharCode(cc);
        if (!RESERVED.has(ch)) keys.push(ch);
    }
    return keys;
}

export async function runProfileMenu({
    title = 'Select Claude profile',
    exclude = null,
    readOnly = false,
} = {}) {
    const keyPool = makeKeyPool();

    while (true) {
        const profiles = loadSortedProfiles({ exclude });

        if (profiles.length === 0) {
            if (readOnly) return { action: 'abort' };
            clearScreen();
            banner(title, 'magenta');
            console.log(color('yellow', 'No profiles found.'));
            console.log(color('yellow', 'Press [N] to create one, or [Esc] to abort.'));
            console.log('');
            const k = await readKey();
            if (k.isEscape) return { action: 'abort' };
            if ((k.sequence || '').toUpperCase() === 'N') {
                const name = (await readLine('Profile name: ')).trim();
                if (!isValidProfileName(name)) {
                    console.log(color('red', 'Invalid name.'));
                    await sleep(600);
                    continue;
                }
                try { createProfile(name); } catch (e) {
                    console.log(color('red', e.message));
                    await sleep(600);
                }
            }
            continue;
        }

        clearScreen();
        banner(title, 'magenta');
        console.log(color('darkmagenta', getVersionLine()));
        console.log('');

        const maxName  = Math.max(7,  ...profiles.map(p => p.name.length));
        const maxEmail = Math.max(14, ...profiles.map(p => p.email.length));

        const map = {};
        const shown = Math.min(profiles.length, keyPool.length);
        for (let i = 0; i < shown; i++) {
            const p = profiles[i];
            const key = keyPool[i];
            map[key] = p;
            const line =
                ' [' + key + '] ' + padRight(p.name, maxName) +
                '  |  ' + padRight(p.email, maxEmail) +
                '  |  last ' + padRight(relativeTime(p.lastUsed), 13) +
                '  |  ' + padLeft(String(p.sessionCount), 3) +
                ' session' + (p.sessionCount === 1 ? '' : 's');
            const colorName = (i === 0) ? 'cyan' : 'yellow';
            console.log(color(colorName, line));
        }

        const hasDefault = profiles.some(p => p.name === 'default');
        const enterHint  = hasDefault ? '[Enter] default     ' : '[Enter] first entry ';

        console.log('');
        console.log(color('cyan', enterHint + '  [Esc] abort   [Q] quit'));
        if (!readOnly) {
            const registered = isShellRegistered();
            const xLabel = registered ? '[X] refresh Explorer menu' : '[X] register Explorer menu';
            const uLabel = registered ? '   [U] unregister Explorer menu' : '';
            console.log(color('darkmagenta',
                '[N] new profile    [D <key>] delete    [R <key>] rename    ' + xLabel + uLabel));
        }
        console.log('');

        process.stdout.write('Your choice: ');
        const k = await readKey();

        if (k.isEnter) {
            process.stdout.write('\n');
            if (hasDefault) return { action: 'pick', profile: 'default' };
            return { action: 'pick', profile: profiles[0].name };
        }
        if (k.isEscape) {
            process.stdout.write('<abort>\n');
            return { action: 'abort' };
        }

        const ch = (k.sequence || '').toUpperCase();

        if (ch === 'Q') {
            process.stdout.write('Q <quit>\n');
            return { action: 'quit' };
        }

        if (!readOnly) {
            if (ch === 'N') {
                process.stdout.write('N (new profile)\n');
                const name = (await readLine('  New profile name: ')).trim();
                if (!isValidProfileName(name)) {
                    console.log(color('red', '  invalid name.'));
                } else if (listProfileNames().includes(name)) {
                    console.log(color('red', '  profile already exists.'));
                } else {
                    try {
                        createProfile(name);
                        console.log(color('darkgreen', `  created profile '${name}'.`));
                        if (isShellRegistered()) { installShell(); console.log(color('darkgreen', '  Explorer menu refreshed.')); }
                    } catch (e) {
                        console.log(color('red', '  ' + e.message));
                    }
                }
                await sleep(500);
                continue;
            }
            if (ch === 'D') {
                process.stdout.write('D (delete)\n');
                const ch2 = await pickKeyFromMap(map);
                if (!ch2) { continue; }
                const target = map[ch2];
                console.log(color('red',
                    `  WARNING: this deletes all sessions and credentials for '${target.name}'.`));
                if (await promptYesNo(`  permanently delete profile '${target.name}'?`)) {
                    try {
                        deleteProfile(target.name);
                        console.log(color('darkgreen', '  deleted.'));
                        if (isShellRegistered()) { installShell(); console.log(color('darkgreen', '  Explorer menu refreshed.')); }
                    } catch (e) {
                        console.log(color('red', '  delete failed: ' + e.message));
                    }
                    await sleep(500);
                }
                continue;
            }
            if (ch === 'R') {
                process.stdout.write('R (rename)\n');
                const ch2 = await pickKeyFromMap(map);
                if (!ch2) { continue; }
                const target = map[ch2];
                const newName = (await readLine(`  new name for '${target.name}': `)).trim();
                if (!isValidProfileName(newName)) {
                    console.log(color('red', '  invalid name.'));
                } else if (newName === target.name) {
                    console.log(color('gray', '  (same name, no change)'));
                } else if (listProfileNames().includes(newName)) {
                    console.log(color('red', '  a profile with that name already exists.'));
                } else {
                    try {
                        renameProfile(target.name, newName);
                        console.log(color('darkgreen', `  renamed to '${newName}'.`));
                        if (isShellRegistered()) { installShell(); console.log(color('darkgreen', '  Explorer menu refreshed.')); }
                    } catch (e) {
                        console.log(color('red', '  rename failed: ' + e.message));
                    }
                }
                await sleep(500);
                continue;
            }
            if (ch === 'X') {
                const was = isShellRegistered();
                process.stdout.write(was ? 'X (refresh Explorer menu)\n' : 'X (register Explorer menu)\n');
                const r = installShell();
                console.log(color(r.ok ? 'darkgreen' : 'red', r.ok ? (was ? '  refreshed.' : '  registered.') : ('  ' + (r.reason || 'failed.'))));
                await sleep(500);
                continue;
            }
            if (ch === 'U') {
                if (!isShellRegistered()) {
                    process.stdout.write('U (unregister Explorer menu)\n  not registered.\n');
                    await sleep(500);
                    continue;
                }
                process.stdout.write('U (unregister Explorer menu)\n');
                if (await promptYesNo('  remove the Explorer context menu entries?')) {
                    const r = uninstallShell();
                    console.log(color(r.ok ? 'darkgreen' : 'red', r.ok ? '  unregistered.' : '  failed.'));
                    await sleep(500);
                }
                continue;
            }
        }

        if (map[ch]) {
            process.stdout.write(ch + '\n');
            return { action: 'pick', profile: map[ch].name };
        }
        // Unknown key: reprint prompt
        process.stdout.write('\nYour choice: ');
    }
}

async function pickKeyFromMap(map) {
    process.stdout.write('  which profile? (Esc to cancel) ');
    const k = await readKey();
    if (k.isEscape) { process.stdout.write('<cancel>\n'); return null; }
    const ch = (k.sequence || '').toUpperCase();
    if (!map[ch]) { process.stdout.write(`${ch} <not found>\n`); return null; }
    process.stdout.write(ch + '\n');
    return ch;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

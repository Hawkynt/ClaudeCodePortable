// Interactive session picker. Cyan/green theme.
//
// Return shape:
//   { action: 'last'    }                     (Enter)
//   { action: 'new'     }                     (Esc)
//   { action: 'resume', sessionId: <uuid> }   (number/letter)
//   { action: 'quit'    }                     (Q)
//   { action: 'switchProfile', profile: <name> }  (P and user picked a different profile)

import {
    c, color, banner, clearScreen, readKey, promptYesNo, getVersionLine,
    truncate, relativeTime, padLeft,
} from './ui.mjs';
import { listProfileNames } from './profiles.mjs';
import { scanSessions, deleteSession, moveSessionBetweenProfiles } from './sessions.mjs';
import { runProfileMenu } from './profile-menu.mjs';

const RESERVED = new Set(['N','D','M','P','Q']);

function makeKeyPool() {
    const keys = ['1','2','3','4','5','6','7','8','9'];
    for (let cc = 65; cc <= 90; cc++) {
        const ch = String.fromCharCode(cc);
        if (!RESERVED.has(ch)) keys.push(ch);
    }
    return keys;
}

export async function runSessionMenu({ profileName, cwd }) {
    const keyPool = makeKeyPool();

    try { process.title = `Claude [${profileName}] - ${cwd}`; } catch {}

    while (true) {
        const sessions = scanSessions(profileName, cwd);
        if (sessions.length === 0) return { action: 'new' };

        clearScreen();
        banner(`Claude [${profileName}] - sessions in ${cwd}`, 'cyan');
        console.log(color('darkcyan', getVersionLine()));
        console.log('');

        const map = {};
        const shown = Math.min(sessions.length, keyPool.length);
        for (let i = 0; i < shown; i++) {
            const s   = sessions[i];
            const key = keyPool[i];
            map[key] = s;
            const startedStr = formatIso(s.started);
            const header =
                ' [' + key + ']  started ' + startedStr +
                '  |  last ' + padLeft(relativeTime(s.changed), 12).replace(/^\s+/, (m) => m) +
                '  |  ' + padLeft(String(s.msgCount), 5) + ' msgs';
            const colorName = (i === 0) ? 'green' : 'yellow';
            console.log(color(colorName, header));
            console.log(color('gray', '      initial: ' + truncate(s.firstPrompt, 60)));
            console.log(color('gray', '      last:    ' + truncate(s.lastPrompt,  60)));
            console.log('');
        }

        if (sessions.length > shown) {
            console.log(color('gray', `    ... ${sessions.length - shown} older session(s) not shown`));
            console.log('');
        }

        // Decide whether to show [M] move
        const otherProfiles = listProfileNames().filter(p => p !== profileName);
        const moveHint = otherProfiles.length >= 1 ? '  [M <key>] move' : '';

        console.log(color('green',
            '[Enter] resume LAST   [Esc] NEW   [D <key>] delete' + moveHint + '   [P] profiles   [Q] quit'));
        console.log('');

        process.stdout.write('Your choice: ');
        const k = await readKey();

        if (k.isEnter)  { process.stdout.write('\n'); return { action: 'last' }; }
        if (k.isEscape) { process.stdout.write('<new session>\n'); return { action: 'new' }; }

        const ch = (k.sequence || '').toUpperCase();

        if (ch === 'Q') { process.stdout.write('Q <quit>\n'); return { action: 'quit' }; }

        if (ch === 'D') {
            process.stdout.write('D (delete)\n');
            const target = await pickSession(map);
            if (!target) continue;
            if (await promptYesNo(`  remove ${target.sessionId}?`)) {
                try { deleteSession(target); console.log(color('darkgreen', '  deleted.')); }
                catch (e) { console.log(color('red', '  delete failed: ' + e.message)); }
                await sleep(300);
            }
            continue;
        }

        if (ch === 'M' && otherProfiles.length >= 1) {
            process.stdout.write('M (move)\n');
            const target = await pickSession(map);
            if (!target) continue;
            const res = await runProfileMenu({
                title: `Move to which profile? (source: ${profileName})`,
                exclude: profileName,
                readOnly: true,
            });
            if (res.action !== 'pick') {
                console.log(color('gray', '  move cancelled.'));
                await sleep(300);
                continue;
            }
            if (await promptYesNo(`  move ${target.sessionId} -> ${res.profile}?`)) {
                try {
                    moveSessionBetweenProfiles(target, res.profile, cwd);
                    console.log(color('darkgreen', '  moved.'));
                } catch (e) {
                    console.log(color('red', '  move failed: ' + e.message));
                }
                await sleep(400);
            }
            continue;
        }

        if (ch === 'P') {
            process.stdout.write('P (profiles)\n');
            const res = await runProfileMenu({ title: 'Switch / manage Claude profiles' });
            if (res.action === 'quit') return { action: 'quit' };
            if (res.action === 'pick' && res.profile !== profileName) {
                return { action: 'switchProfile', profile: res.profile };
            }
            // abort or same profile: redraw
            continue;
        }

        if (map[ch]) {
            process.stdout.write(ch + '\n');
            return { action: 'resume', sessionId: map[ch].sessionId };
        }
        // unknown key - loop and redraw prompt
        process.stdout.write('\nYour choice: ');
    }
}

async function pickSession(map) {
    process.stdout.write('  which session? (Esc to cancel) ');
    const k = await readKey();
    if (k.isEscape) { process.stdout.write('<cancel>\n'); return null; }
    const ch = (k.sequence || '').toUpperCase();
    if (!map[ch]) { process.stdout.write(`${ch} <not found>\n`); return null; }
    process.stdout.write(ch + '\n');
    return map[ch];
}

function formatIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

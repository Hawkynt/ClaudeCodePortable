// Interactive session picker. Cyan / green theme.
//
// Returns one of:
//   { action: 'last'    }                       (Enter on top row or bare Enter)
//   { action: 'new'     }                       (Esc)
//   { action: 'resume', sessionId: <uuid> }     (number/letter or Enter on highlight)
//   { action: 'quit'    }                       (Q)
//   { action: 'switchProfile', profile: <name> } (P switched to a different profile)

import {
    c, color, banner, clearScreen, readKey, readLine, readLineRaw,
    promptYesNo, getVersionLine, truncate, relativeTime, padLeft,
} from './ui.mjs';
import { listProfileNames } from './profiles.mjs';
import {
    scanSessions, deleteSession, moveSessionBetweenProfiles,
    copySessionBetweenProfiles, setSessionMeta, filterSessions,
} from './sessions.mjs';
import { runProfileMenu } from './profile-menu.mjs';

const RESERVED = new Set(['N','D','M','C','P','Q','F','R','S']);

function makeKeyPool() {
    const keys = ['1','2','3','4','5','6','7','8','9'];
    for (let cc = 65; cc <= 90; cc++) {
        const ch = String.fromCharCode(cc);
        if (!RESERVED.has(ch)) keys.push(ch);
    }
    return keys;
}

function formatIso(d) {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${da} ${hh}:${mm}`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function runSessionMenu({ profileName, cwd }) {
    const keyPool = makeKeyPool();
    try { process.title = `Claude [${profileName}] - ${cwd}`; } catch {}

    let filter    = '';
    let highlight = 0;
    let firstPass = true;
    // Whether to launch Claude with --dangerously-skip-permissions. On by
    // default to preserve the previous always-skip behaviour; toggled with [S].
    let skipPermissions = true;

    while (true) {
        const all     = scanSessions(profileName, cwd);
        if (all.length === 0) {
            // On first entry with no sessions there is nothing to pick, so go
            // straight to a fresh session. But once the user has been working
            // in the picker (e.g. deleted/moved the last session) keep them
            // here instead of yanking them into a brand-new session.
            if (firstPass) return { action: 'new', skipPermissions };
            const res = await renderEmptyState({ profileName, cwd, skipPermissions });
            if (res.action === 'toggleSkip') { skipPermissions = !skipPermissions; continue; }
            if (res.action === 'redraw') continue;
            return res;
        }
        firstPass = false;
        const visible = filterSessions(all, filter);

        // Filter matched nothing: render an explicit "no results" frame and
        // wait for the user to dismiss, otherwise the redraw looks identical
        // to the last frame and feels like a freeze.
        if (visible.length === 0 && filter) {
            clearScreen();
            banner(`Claude [${profileName}] - sessions in ${cwd}`, 'cyan');
            console.log(color('darkcyan', getVersionLine()));
            console.log('');
            console.log(color('brightyellow',
                `  No sessions match filter "${filter}".`));
            console.log('');
            console.log(color('green',
                '  [Enter] / [Esc] / any key  -  clear filter and show all sessions'));
            console.log('');
            process.stdout.write('Press any key... ');
            await readKey();
            filter = '';
            highlight = 0;
            continue;
        }
        if (highlight >= visible.length) highlight = Math.max(0, visible.length - 1);

        clearScreen();
        banner(`Claude [${profileName}] - sessions in ${cwd}`, 'cyan');
        console.log(color('darkcyan', getVersionLine()));
        if (filter) console.log(color('brightyellow', `  filter: "${filter}"  (press Esc to clear)`));
        console.log('');

        const map = {};
        const shown = Math.min(visible.length, keyPool.length);
        for (let i = 0; i < shown; i++) {
            const s = visible[i];
            const key = keyPool[i];
            map[key] = s;

            const pin  = s.pinned      ? '*' : ' ';
            const cur  = (i === highlight) ? '>' : ' ';
            const header =
                pin + cur + '[' + key + ']  started ' + formatIso(s.started) +
                '  |  last ' + padLeft(relativeTime(s.changed), 12).replace(/^\s+/, m => m) +
                '  |  ' + padLeft(String(s.msgCount), 5) + ' msgs';

            let rowColor;
            if (i === highlight)      rowColor = 'brightcyan';
            else if (i === 0)         rowColor = 'green';
            else                      rowColor = 'yellow';
            console.log(color(rowColor, header));

            if (s.label) {
                console.log(color('brightwhite', '       label:   ' + truncate(s.label, 60)));
            }
            console.log(color('gray', '       initial: ' + truncate(s.firstPrompt, 60)));
            console.log(color('gray', '       last:    ' + truncate(s.lastPrompt,  60)));
            console.log('');
        }

        if (visible.length > shown) {
            console.log(color('gray', `    ... ${visible.length - shown} older session(s) not shown`));
            console.log('');
        }

        const otherProfiles = listProfileNames().filter(p => p !== profileName);
        const moveHint = otherProfiles.length >= 1 ? '  [M <key>] move   [C <key>] copy' : '';

        console.log(color('green',
            '[Enter/\u2191\u2193] pick   [Esc] NEW   [/] filter   ' +
            '[F <key>] pin   [R <key>] rename   [D <key>] delete' +
            moveHint + '   [P] profiles   [Q] quit'));
        console.log(color(skipPermissions ? 'brightyellow' : 'gray',
            `[S] skip permissions: [${skipPermissions ? 'x' : ' '}]  ` +
            '(--dangerously-skip-permissions ' + (skipPermissions ? 'ON' : 'OFF') + ')'));
        console.log('');

        process.stdout.write('Your choice: ');
        const k = await readKey();

        if (k.isEnter) {
            // Enter uses the highlighted row; if highlight is on the top row
            // and the session menu is for "resume last", this still maps to
            // the newest (row 0 = most recently changed or the sole pinned).
            const chosen = visible[highlight];
            if (!chosen) return { action: 'new', skipPermissions };
            process.stdout.write(chosen.sessionId + '\n');
            // If highlight is on row 0 AND there is no filter, treat as
            // 'last' so users get the --continue shortcut they expect.
            if (highlight === 0 && !filter) return { action: 'last', skipPermissions };
            return { action: 'resume', sessionId: chosen.sessionId, skipPermissions };
        }
        if (k.isEscape) {
            if (filter) { filter = ''; highlight = 0; continue; }
            process.stdout.write('<new session>\n');
            return { action: 'new', skipPermissions };
        }
        if (k.name === 'up')   { highlight = Math.max(0, highlight - 1); continue; }
        if (k.name === 'down') { highlight = Math.min(shown - 1, highlight + 1); continue; }

        const raw = k.sequence || '';
        const ch  = raw.toUpperCase();

        if (ch === 'Q') { process.stdout.write('Q <quit>\n'); return { action: 'quit' }; }

        if (ch === 'S') {
            skipPermissions = !skipPermissions;
            continue;
        }

        if (raw === '/') {
            process.stdout.write('\n');
            const q = await readLineRaw('filter: ');
            filter = (q === null) ? '' : q;
            highlight = 0;
            continue;
        }

        if (ch === 'F') {
            process.stdout.write('F (pin toggle)\n');
            const target = await pickSession(map, 'which session?');
            if (!target) continue;
            const next = setSessionMeta(profileName, cwd, target.sessionId, { pinned: !target.pinned });
            console.log(color('darkgreen', next.pinned ? '  pinned.' : '  unpinned.'));
            await sleep(300);
            continue;
        }

        if (ch === 'R') {
            process.stdout.write('R (rename)\n');
            const target = await pickSession(map, 'which session?');
            if (!target) continue;
            const label = await readLineRaw(`  new label (blank clears) for ${target.sessionId.slice(0,8)}...: `);
            if (label === null) { console.log(color('gray', '  cancelled.')); await sleep(200); continue; }
            setSessionMeta(profileName, cwd, target.sessionId, { label: label.trim() || null });
            console.log(color('darkgreen', label.trim() ? '  renamed.' : '  label cleared.'));
            await sleep(300);
            continue;
        }

        if (ch === 'D') {
            process.stdout.write('D (delete)\n');
            const target = await pickSession(map, 'which session?');
            if (!target) continue;
            if (await promptYesNo(`  remove ${target.label || target.sessionId}?`)) {
                try {
                    deleteSession(target, profileName, cwd);
                    console.log(color('darkgreen', '  deleted.'));
                } catch (e) {
                    console.log(color('red', '  delete failed: ' + e.message));
                }
                await sleep(300);
            }
            continue;
        }

        if (ch === 'M' && otherProfiles.length >= 1) {
            process.stdout.write('M (move)\n');
            const target = await pickSession(map, 'which session?');
            if (!target) continue;
            await transferSession({ target, profileName, cwd, copy: false });
            continue;
        }

        if (ch === 'C' && otherProfiles.length >= 1) {
            process.stdout.write('C (copy)\n');
            const target = await pickSession(map, 'which session?');
            if (!target) continue;
            await transferSession({ target, profileName, cwd, copy: true });
            continue;
        }

        if (ch === 'P') {
            process.stdout.write('P (profiles)\n');
            const res = await runProfileMenu({ title: 'Switch / manage Claude profiles', cwd });
            if (res.action === 'quit') return { action: 'quit' };
            if (res.action === 'pick' && res.profile !== profileName) {
                return { action: 'switchProfile', profile: res.profile };
            }
            continue;
        }

        if (map[ch]) {
            process.stdout.write(ch + '\n');
            return { action: 'resume', sessionId: map[ch].sessionId, skipPermissions };
        }
        // unrecognised -> redraw with prompt
        process.stdout.write('\nYour choice: ');
    }
}

// Shown when the picker is left with no sessions (e.g. the last one was just
// deleted or moved). Keeps the user in control instead of silently launching
// a new session. Returns an action the main loop understands:
//   { action: 'new' | 'quit' | 'switchProfile', ... } | { action: 'redraw' }
//   { action: 'toggleSkip' }
async function renderEmptyState({ profileName, cwd, skipPermissions }) {
    clearScreen();
    banner(`Claude [${profileName}] - sessions in ${cwd}`, 'cyan');
    console.log(color('darkcyan', getVersionLine()));
    console.log('');
    console.log(color('brightyellow', '  No sessions left in this folder.'));
    console.log('');
    console.log(color('green',
        '[Enter/Esc] start NEW session   [P] profiles   [Q] quit'));
    console.log(color(skipPermissions ? 'brightyellow' : 'gray',
        `[S] skip permissions: [${skipPermissions ? 'x' : ' '}]  ` +
        '(--dangerously-skip-permissions ' + (skipPermissions ? 'ON' : 'OFF') + ')'));
    console.log('');

    process.stdout.write('Your choice: ');
    const k = await readKey();

    if (k.isEnter || k.isEscape) {
        process.stdout.write('<new session>\n');
        return { action: 'new', skipPermissions };
    }
    const ch = (k.sequence || '').toUpperCase();
    if (ch === 'Q') { process.stdout.write('Q <quit>\n'); return { action: 'quit' }; }
    if (ch === 'S') return { action: 'toggleSkip' };
    if (ch === 'P') {
        process.stdout.write('P (profiles)\n');
        const res = await runProfileMenu({ title: 'Switch / manage Claude profiles', cwd });
        if (res.action === 'quit') return { action: 'quit' };
        if (res.action === 'pick' && res.profile !== profileName) {
            return { action: 'switchProfile', profile: res.profile };
        }
    }
    return { action: 'redraw' };
}

// Move or copy a session into another profile, sharing the profile-pick and
// confirmation flow. `copy` flips between rename (move) and copy semantics.
async function transferSession({ target, profileName, cwd, copy }) {
    const verb = copy ? 'copy' : 'move';
    const res = await runProfileMenu({
        title: `${copy ? 'Copy' : 'Move'} to which profile? (source: ${profileName})`,
        exclude: profileName,
        readOnly: true,
        cwd,
    });
    if (res.action !== 'pick') { console.log(color('gray', `  ${verb} cancelled.`)); await sleep(300); return; }
    if (await promptYesNo(`  ${verb} ${target.label || target.sessionId} -> ${res.profile}?`)) {
        try {
            if (copy) copySessionBetweenProfiles(target, res.profile, cwd, profileName);
            else      moveSessionBetweenProfiles(target, res.profile, cwd, profileName);
            console.log(color('darkgreen', copy ? '  copied.' : '  moved.'));
        } catch (e) {
            console.log(color('red', `  ${verb} failed: ` + e.message));
        }
        await sleep(400);
    }
}

async function pickSession(map, prompt) {
    process.stdout.write('  ' + prompt + ' (Esc to cancel) ');
    const k = await readKey();
    if (k.isEscape) { process.stdout.write('<cancel>\n'); return null; }
    const ch = (k.sequence || '').toUpperCase();
    if (!map[ch]) { process.stdout.write(`${ch} <not found>\n`); return null; }
    process.stdout.write(ch + '\n');
    return map[ch];
}

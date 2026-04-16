// Drives the launcher against the fixtures in `screenshot-fixtures/` with
// `CLAUDE_SCREENSHOT=1`, which makes each menu render one frame and exit.
// The raw ANSI output is written to `build/<name>.ansi`; CI turns each file
// into a PNG via `charmbracelet/freeze`.
//
// Run locally:  node scripts/capture-screenshots.mjs
// Artifacts:    build/session.ansi, build/profile.ansi, build/doctor.ansi

import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import url  from 'node:url';
import { spawnSync, execSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT   = path.resolve(__dirname, '..');
const FIXTURES    = path.join(__dirname, 'screenshot-fixtures');
const BUILD_DIR   = path.join(REPO_ROOT, 'build');
const DEMO_CWD    = 'demo-session-cwd';                      // matches encoded-cwd under fixtures

fs.mkdirSync(BUILD_DIR, { recursive: true });

const commonEnv = {
    ...process.env,
    CLAUDE_SCREENSHOT:      '1',
    CLAUDE_PROFILES_ROOT:   path.join(FIXTURES, 'profiles'),
    CLAUDE_FIXED_NOW:       '2026-04-20T10:00:00Z',          // "now" for the fixture data
    CLAUDE_VERSION_LINE:    'node 22.16.0 | bash 5.2.37 | perl 5.38.2 | python 3.13.1',
    FORCE_COLOR:            '3',                             // guarantee ANSI
};

function capture(label, runner) {
    const out = path.join(BUILD_DIR, `${label}.ansi`);
    console.log(`capturing ${label} ...`);
    const result = runner();
    fs.writeFileSync(out, result);
    console.log(`  -> ${out} (${result.length} bytes)`);
}

// --- session menu -----------------------------------------------------------
capture('session', () => {
    const r = spawnSync(process.execPath, [
        '-e',
        `import('${pathToImport(path.join(REPO_ROOT, 'launcher', 'session-menu.mjs'))}').then(m =>
            m.runSessionMenu({ profileName: 'default', cwd: '${DEMO_CWD.replace(/\\/g,'\\\\')}' }));`,
    ], { env: commonEnv, encoding: 'utf8', input: '' });
    return (r.stdout || '') + (r.stderr || '');
});

// --- profile menu -----------------------------------------------------------
capture('profile', () => {
    const r = spawnSync(process.execPath, [
        '-e',
        `import('${pathToImport(path.join(REPO_ROOT, 'launcher', 'profile-menu.mjs'))}').then(m =>
            m.runProfileMenu({ title: 'Select Claude profile' }));`,
    ], { env: commonEnv, encoding: 'utf8', input: '' });
    return (r.stdout || '') + (r.stderr || '');
});

// --- doctor -----------------------------------------------------------------
capture('doctor', () => {
    const r = spawnSync(process.execPath, [
        '-e',
        `import('${pathToImport(path.join(REPO_ROOT, 'launcher', 'doctor.mjs'))}').then(m => {
            process.exit(m.runDoctor('default'));
        });`,
    ], { env: commonEnv, encoding: 'utf8', input: '' });
    return (r.stdout || '') + (r.stderr || '');
});

console.log('done.');

function pathToImport(p) {
    // Node -e expects a file:// URL or a forward-slash path on Windows.
    return 'file:///' + p.replace(/\\/g, '/');
}

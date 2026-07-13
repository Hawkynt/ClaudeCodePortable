// ClaudeCodePortable -- Google Antigravity CLI (agy) launcher entry point.
//
// Antigravity CLI is NOT npm-distributed and documents no config-home
// relocation variable; its state lives under ~/.gemini/antigravity-cli/.
// Isolation strategy: redirect HOME + USERPROFILE + LOCALAPPDATA/APPDATA
// into the profile directory, so both the binary (%LOCALAPPDATA%\agy\bin)
// and ~/.gemini land per-profile.
//
// KNOWN LIMITS (documented, not fixable from here):
//   - Login tokens go to the OS keyring (Windows Credential Manager) and are
//     therefore SHARED across profiles.
//   - The installer URLs below are best-effort; when the install fails the
//     launcher degrades to printing manual install guidance.

import fs   from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { IS_WIN, PROFILES_ROOT, APP_ROOT, profileDataDir, geminiHomeDir } from './paths.mjs';
import { color, getVersionLine, promptYesNo } from './ui.mjs';
import { parseArgs } from './args.mjs';
import { profilePath, listProfileNames } from './profiles.mjs';
import { ensureAllRuntimes } from './install.mjs';
import { exportSkills } from './skills-export.mjs';
import {
    resolveProfile, setupPath, setPrivacyEnv, baseProfileEnv, spawnTool,
} from './tool-launcher-core.mjs';
import {
    readCredential, writeCredential, deleteCredential,
    loadProfileCredential, saveProfileCredential,
} from './win-credential.mjs';

const INSTALL_PS1 = 'https://antigravity.google/cli/install.ps1';
const INSTALL_SH  = 'https://antigravity.google/cli/install.sh';

// The machine-wide credential slot Antigravity keeps its Google OAuth token
// in (go-keyring target = "<service>:<user>"). Isolated per profile by
// swapping saved tokens in/out around launch - see restoreCredential /
// captureCredential below.
const AGY_CRED_TARGET = 'gemini:antigravity';
function profileCredFile(profileName) {
    return path.join(geminiHomeDir(profileName), 'credential.json');
}

(async () => {
    const args = parseArgs(process.argv.slice(2));

    fs.mkdirSync(APP_ROOT,      { recursive: true });
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });

    try { await ensureAllRuntimes(); }
    catch (e) { console.error(color('red', 'Runtime install failed: ' + e.message)); process.exit(1); }

    setupPath();
    setPrivacyEnv();

    const profileName = await resolveProfile(args, { tool: 'antigravity', menuTitle: 'Select Antigravity profile' });
    if (!profileName) process.exit(0);

    fs.mkdirSync(profilePath(profileName), { recursive: true });
    const firstRun = !fs.existsSync(geminiHomeDir(profileName));

    // Full home redirection: agy derives both its binary location and its
    // ~/.gemini state from the user profile dirs.
    const home = profileDataDir(profileName);
    const localAppData = path.join(home, 'AppData', 'Local');
    fs.mkdirSync(localAppData, { recursive: true });
    Object.assign(process.env, baseProfileEnv(profileName), {
        USERPROFILE:  home,
        LOCALAPPDATA: localAppData,
        APPDATA:      path.join(home, 'AppData', 'Roaming'),
    });

    const agyBin = agyBinPath(profileName);
    if (!fs.existsSync(agyBin)) {
        const ok = installAgy(profileName);
        if (!ok || !fs.existsSync(agyBin)) {
            console.error(color('red', 'Antigravity CLI (agy) is not installed for this profile.'));
            console.error(color('yellow',
                'Install it manually with this profile\'s environment, e.g. in PowerShell:\n'
              + `  $env:USERPROFILE='${home}'; $env:LOCALAPPDATA='${localAppData}'\n`
              + `  irm ${INSTALL_PS1} | iex\n`
              + 'then re-run Antigravity.bat. (Installer URL may have moved - see\n'
              + 'https://antigravity.google/docs/cli-install for the current one.)'));
            process.exit(1);
        }
    }
    process.env.PATH = path.dirname(agyBin) + (IS_WIN ? ';' : ':') + process.env.PATH;

    await maybeSeedSkills(args, profileName, firstRun);

    console.log('');
    console.log(color('cyan', `Portable runtimes attached (profile [${profileName}]):`));
    console.log('  ' + getVersionLine().replace(/^\s*runtimes:\s*/, ''));
    console.log('');
    console.log(color('green', 'Starting Antigravity CLI (portable, HOME-redirected)...'));
    console.log('Profile:        ' + profileName);
    console.log('State directory: ' + geminiHomeDir(profileName));

    // Swap this profile's saved Google login into the shared keyring slot,
    // run agy, then capture whatever token state it leaves (fresh login or a
    // refreshed token) back into the profile. On Windows the swap is real; on
    // other platforms these are no-ops and the keyring stays shared.
    const swapped = restoreCredential(profileName);
    if (IS_WIN && !swapped) {
        console.log(color('yellow',
            'No saved login for this profile yet - log in once; it will be captured\n'
          + 'into the profile and restored automatically on future launches.'));
    } else if (!IS_WIN) {
        console.log(color('yellow',
            'Note: on this OS the Google login lives in the system keyring and is\n'
          + 'shared across profiles (per-profile swap is Windows-only).'));
    }
    console.log('');

    const status = spawnTool('agy', args.forwarded, { shell: false });
    captureCredential(profileName);
    process.exit(status);
})().catch(e => {
    console.error(color('red', 'FATAL: ' + (e && e.stack || e)));
    process.exit(1);
});

/**
 * Before launch: write this profile's saved credential into the shared slot.
 * Returns true if a profile credential was restored. When the profile has no
 * saved credential we clear the slot so a foreign login (desktop app, another
 * profile) can't leak in - unless this is the very first run, where we leave
 * whatever is there so an existing global login still works once.
 */
function restoreCredential(profileName) {
    if (!IS_WIN) return false;
    const rec = loadProfileCredential(profileCredFile(profileName));
    if (rec) { writeCredential(AGY_CRED_TARGET, rec); return true; }
    // Profile has no saved login. If any OTHER antigravity profile already
    // owns a captured credential, the slot may hold theirs - clear it so this
    // profile can't inherit it. If no profile owns one yet, this is the first
    // managed run: leave a pre-existing global login in place so the user can
    // adopt it (it'll be captured into THIS profile on exit).
    if (anyOtherProfileHasCredential(profileName)) {
        deleteCredential(AGY_CRED_TARGET);
    }
    return false;
}

function anyOtherProfileHasCredential(selfProfile) {
    for (const name of listProfileNames({ tool: 'antigravity' })) {
        if (name === selfProfile) continue;
        try { if (fs.existsSync(profileCredFile(name))) return true; } catch {}
    }
    return false;
}

/** After exit: persist the current slot contents into this profile. */
function captureCredential(profileName) {
    if (!IS_WIN) return;
    const rec = readCredential(AGY_CRED_TARGET);
    if (rec && rec.blob) saveProfileCredential(profileCredFile(profileName), rec);
}

function agyBinPath(profileName) {
    const home = profileDataDir(profileName);
    return IS_WIN
        ? path.join(home, 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
        : path.join(home, '.local', 'bin', 'agy');
}

/** Run the official installer with the profile-redirected environment. */
function installAgy(profileName) {
    console.log(color('cyan', `Installing Antigravity CLI into profile [${profileName}] ...`));
    const r = IS_WIN
        ? spawnSync('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
              `irm ${INSTALL_PS1} | iex`],
              { stdio: 'inherit', env: process.env, windowsHide: true })
        : spawnSync('bash', ['-c', `curl -fsSL ${INSTALL_SH} | bash -s -- --skip-aliases --skip-path`],
              { stdio: 'inherit', env: process.env });
    if (r.error || r.status !== 0) {
        console.error(color('yellow',
            `Installer did not complete (${r.error ? r.error.message : 'exit ' + r.status}).`));
        return false;
    }
    return true;
}

async function maybeSeedSkills(args, profileName, firstRun) {
    let want = !!args.seedSkills;
    if (!want && firstRun && !args.skipMenu) {
        want = await promptYesNo(
            `Seed profile '${profileName}' with the template skills plugin + GEMINI.md gate?`);
    }
    if (!want) return;
    const r = exportSkills('antigravity', profileName);
    for (const m of r.merged)  console.log(color('darkgreen', '  + ' + m));
    for (const s of r.skipped) console.log(color('gray',      '  = skipped: ' + s));
}

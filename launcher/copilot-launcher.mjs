// ClaudeCodePortable -- GitHub Copilot CLI launcher entry point.
//
// Portable, per-profile Copilot CLI: `@github/copilot` npm-installed into
// the profile's npm-global, COPILOT_HOME/COPILOT_CACHE_HOME redirected into
// the profile. AUTH CAVEAT: when an OS keychain is available Copilot stores
// its OAuth token there - SHARED across profiles. For clean isolation set a
// per-profile GH_TOKEN / GITHUB_TOKEN / COPILOT_GITHUB_TOKEN before launch.

import fs from 'node:fs';

import {
    PROFILES_ROOT, APP_ROOT, copilotConfigDir, copilotCacheDir,
    npmCacheDir, npmGlobalDir,
} from './paths.mjs';
import { color, getVersionLine, promptYesNo } from './ui.mjs';
import { parseArgs } from './args.mjs';
import { profilePath } from './profiles.mjs';
import { ensureAllRuntimes } from './install.mjs';
import { exportSkills } from './skills-export.mjs';
import {
    resolveProfile, setupPath, setPrivacyEnv, baseProfileEnv,
    ensureNpmTool, spawnTool,
} from './tool-launcher-core.mjs';

(async () => {
    const args = parseArgs(process.argv.slice(2));

    fs.mkdirSync(APP_ROOT,      { recursive: true });
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });

    try { await ensureAllRuntimes(); }
    catch (e) { console.error(color('red', 'Runtime install failed: ' + e.message)); process.exit(1); }

    setupPath();
    setPrivacyEnv();

    const profileName = await resolveProfile(args, { tool: 'copilot', menuTitle: 'Select Copilot profile' });
    if (!profileName) process.exit(0);

    fs.mkdirSync(profilePath(profileName),  { recursive: true });
    fs.mkdirSync(npmCacheDir(profileName),  { recursive: true });
    fs.mkdirSync(npmGlobalDir(profileName), { recursive: true });
    const firstRun = !fs.existsSync(copilotConfigDir(profileName));
    fs.mkdirSync(copilotConfigDir(profileName), { recursive: true });
    fs.mkdirSync(copilotCacheDir(profileName),  { recursive: true });

    Object.assign(process.env, baseProfileEnv(profileName), {
        COPILOT_HOME:       copilotConfigDir(profileName),
        COPILOT_CACHE_HOME: copilotCacheDir(profileName),
    });
    // GH_TOKEN / GITHUB_TOKEN / COPILOT_GITHUB_TOKEN pass through untouched
    // from the caller's environment - that is the per-profile auth channel.

    try { ensureNpmTool(profileName, '@github/copilot', 'copilot', { label: 'Copilot CLI' }); }
    catch (e) { console.error(color('red', e.message)); process.exit(1); }

    await maybeSeedSkills(args, profileName, firstRun);

    console.log('');
    console.log(color('cyan', `Portable runtimes attached (profile [${profileName}]):`));
    console.log('  ' + getVersionLine().replace(/^\s*runtimes:\s*/, ''));
    console.log('');
    console.log(color('green', 'Starting Copilot CLI (portable, per-profile COPILOT_HOME)...'));
    console.log('Profile:          ' + profileName);
    console.log('Config directory: ' + copilotConfigDir(profileName));
    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN && !process.env.COPILOT_GITHUB_TOKEN) {
        console.log(color('yellow',
            'Note: interactive login may store its token in the OS keychain (shared\n'
          + 'across profiles). Set GH_TOKEN per profile for isolated auth.'));
    }
    console.log('');

    process.exit(spawnTool('copilot', args.forwarded));
})().catch(e => {
    console.error(color('red', 'FATAL: ' + (e && e.stack || e)));
    process.exit(1);
});

async function maybeSeedSkills(args, profileName, firstRun) {
    let want = !!args.seedSkills;
    if (!want && firstRun && !args.skipMenu) {
        want = await promptYesNo(
            `Seed profile '${profileName}' with the template skills + copilot-instructions.md?`);
    }
    if (!want) return;
    const r = exportSkills('copilot', profileName);
    for (const m of r.merged)  console.log(color('darkgreen', '  + ' + m));
    for (const s of r.skipped) console.log(color('gray',      '  = skipped: ' + s));
}

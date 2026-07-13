// ClaudeCodePortable -- OpenAI Codex CLI launcher entry point.
//
// Portable, per-profile Codex: `@openai/codex` npm-installed into the
// profile's npm-global, CODEX_HOME redirected into the profile so config,
// sessions AND auth.json are fully isolated per profile. Codex ships its
// own resume picker (`codex resume`), so no session menu of ours.

import fs from 'node:fs';

import { PROFILES_ROOT, APP_ROOT, codexConfigDir, npmCacheDir, npmGlobalDir } from './paths.mjs';
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

    const profileName = await resolveProfile(args, { tool: 'codex', menuTitle: 'Select Codex profile' });
    if (!profileName) process.exit(0);

    fs.mkdirSync(profilePath(profileName),  { recursive: true });
    fs.mkdirSync(npmCacheDir(profileName),  { recursive: true });
    fs.mkdirSync(npmGlobalDir(profileName), { recursive: true });
    const firstRun = !fs.existsSync(codexConfigDir(profileName));
    fs.mkdirSync(codexConfigDir(profileName), { recursive: true });

    Object.assign(process.env, baseProfileEnv(profileName), {
        CODEX_HOME: codexConfigDir(profileName),
    });

    try { ensureNpmTool(profileName, '@openai/codex', 'codex', { label: 'Codex CLI' }); }
    catch (e) { console.error(color('red', e.message)); process.exit(1); }

    await maybeSeedSkills(args, profileName, firstRun);

    console.log('');
    console.log(color('cyan', `Portable runtimes attached (profile [${profileName}]):`));
    console.log('  ' + getVersionLine().replace(/^\s*runtimes:\s*/, ''));
    console.log('');
    console.log(color('green', 'Starting Codex (portable, per-profile CODEX_HOME)...'));
    console.log('Profile:          ' + profileName);
    console.log('Config directory: ' + codexConfigDir(profileName));
    console.log('');

    process.exit(spawnTool('codex', args.forwarded));
})().catch(e => {
    console.error(color('red', 'FATAL: ' + (e && e.stack || e)));
    process.exit(1);
});

async function maybeSeedSkills(args, profileName, firstRun) {
    let want = !!args.seedSkills;
    if (!want && firstRun && !args.skipMenu) {
        want = await promptYesNo(
            `Seed profile '${profileName}' with the template skills + AGENTS.md skill gate?`);
    }
    if (!want) return;
    const r = exportSkills('codex', profileName);
    for (const m of r.merged)  console.log(color('darkgreen', '  + ' + m));
    for (const s of r.skipped) console.log(color('gray',      '  = skipped: ' + s));
}

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

// Redirect profile + services dirs to a temp tree so tests never touch ~
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-registry-test-'));
process.env.CLAUDE_PROFILES_ROOT = path.join(TMP, 'profiles');
process.env.HOME = TMP; // makes os.homedir() return TMP on most platforms

// Ensure the launcher bat/sh source exists (registry.mjs reads LAUNCHER_BAT)
const { installShell, uninstallShell, isShellRegistered } = await import('../launcher/registry.mjs');

function isWindows() { return process.platform === 'win32'; }
function isLinux()   { return process.platform === 'linux'; }
function isMac()     { return process.platform === 'darwin'; }

describe('isShellRegistered', () => {
    test('returns false before any install', () => {
        assert.equal(isShellRegistered(), false);
    });
});

describe('installShell + isShellRegistered + uninstallShell', () => {
    test('full round-trip on the current platform', () => {
        if (isWindows()) {
            // Windows registry calls need reg.exe – skip in CI where it may not run.
            return;
        }

        const r = installShell();
        assert.ok(r.ok, `installShell failed: ${r.reason ?? JSON.stringify(r)}`);
        assert.ok(Array.isArray(r.profiles));
        assert.ok(r.profiles.includes('default'));

        assert.equal(isShellRegistered(), true);

        const u = uninstallShell();
        assert.ok(u.ok);

        assert.equal(isShellRegistered(), false);
    });

    test('uninstall is idempotent (no throw when nothing installed)', () => {
        assert.doesNotThrow(() => uninstallShell());
    });
});

describe('installShell file content', () => {
    test('installed files reference the launcher path', () => {
        if (isWindows()) return;

        installShell();

        if (isLinux()) {
            const kdeFile  = path.join(TMP, '.local', 'share', 'kio', 'servicemenus', 'claudecode.desktop');
            const nautDir  = path.join(TMP, '.local', 'share', 'nautilus', 'scripts');

            if (fs.existsSync(kdeFile)) {
                const txt = fs.readFileSync(kdeFile, 'utf8');
                assert.ok(txt.includes('[Desktop Entry]'));
                assert.ok(txt.includes('MimeType=inode/directory'));
            }
            if (fs.existsSync(nautDir)) {
                const scripts = fs.readdirSync(nautDir);
                assert.ok(scripts.some(s => s.startsWith('Open Claude Code')));
                for (const s of scripts.filter(f => f.startsWith('Open Claude Code'))) {
                    const mode = fs.statSync(path.join(nautDir, s)).mode;
                    assert.ok(mode & 0o111, `${s} should be executable`);
                }
            }
        }

        if (isMac()) {
            const svcDir = path.join(TMP, 'Library', 'Services');
            if (fs.existsSync(svcDir)) {
                const workflows = fs.readdirSync(svcDir).filter(f => f.endsWith('.workflow'));
                assert.ok(workflows.length > 0);
                for (const w of workflows) {
                    const wflow = path.join(svcDir, w, 'Contents', 'document.wflow');
                    assert.ok(fs.existsSync(wflow), `document.wflow missing in ${w}`);
                    const txt = fs.readFileSync(wflow, 'utf8');
                    assert.ok(txt.includes('com.apple.Automator.servicesMenu'));
                }
            }
        }

        uninstallShell();
    });
});

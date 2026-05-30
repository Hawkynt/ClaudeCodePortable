// File-manager context-menu registration for Windows (Explorer), Linux (KDE
// service menu + Nautilus scripts), and macOS (Automator Services).

import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listProfileNames } from './profiles.mjs';
import { LAUNCHER_BAT, PORTABLE_ROOT } from './paths.mjs';

const IS_WIN   = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_MAC   = process.platform === 'darwin';

const OPEN_TERM_SH = path.join(PORTABLE_ROOT, 'launcher', 'open-in-terminal.sh');

// ---------------------------------------------------------------------------
// Windows – Explorer context menu via reg.exe
// ---------------------------------------------------------------------------
const BASE_USER    = 'HKCU\\Software\\Classes';
const BASE_MACHINE = 'HKLM\\Software\\Classes';

function baseFor(scope) { return scope === 'Machine' ? BASE_MACHINE : BASE_USER; }

function regRun(args) {
    const r = spawnSync('reg.exe', args, { encoding: 'utf8', windowsHide: true });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function regAdd(key, name, type, data) {
    const args = ['add', key, '/f'];
    if (name === '(default)') args.push('/ve');
    else { args.push('/v', name); }
    args.push('/t', type, '/d', data);
    return regRun(args);
}
function regDelete(key) { return regRun(['delete', key, '/f']); }
function regQuery(key)  { return regRun(['query', key]); }

function installWin({ scope = 'User' } = {}) {
    const base = baseFor(scope);
    const shellKeys = [
        `${base}\\Directory\\shell\\ClaudeCode`,
        `${base}\\Directory\\Background\\shell\\ClaudeCode`,
    ];
    const subRoot = `${base}\\ClaudeCodeCmds`;

    const customIcon = path.join(PORTABLE_ROOT, 'assets', 'claude.ico');
    const ICON = fs.existsSync(customIcon)
        ? customIcon
        : '%SystemRoot%\\System32\\shell32.dll,71';

    regDelete(subRoot);
    regAdd(subRoot, '(default)', 'REG_SZ', '');

    for (const k of shellKeys) {
        regDelete(k);
        regAdd(k, 'MUIVerb',                'REG_SZ', 'Open Claude Code');
        regAdd(k, 'Icon',                   'REG_EXPAND_SZ', ICON);
        regAdd(k, 'ExtendedSubCommandsKey', 'REG_SZ', 'ClaudeCodeCmds');
    }

    const profiles = listProfileNames();
    if (!profiles.includes('default')) profiles.unshift('default');
    let i = 0;
    for (const p of profiles) {
        const label   = p === 'default' ? 'Open Claude (default) here' : `Open Claude (${p}) here`;
        const subName = `${String(i).padStart(2,'0')}-${p}`;
        const subKey  = `${subRoot}\\shell\\${subName}`;
        const cmdKey  = `${subKey}\\command`;
        regAdd(subKey, 'MUIVerb',   'REG_SZ',        label);
        regAdd(subKey, 'Icon',      'REG_EXPAND_SZ', ICON);
        regAdd(cmdKey, '(default)', 'REG_SZ',
               `cmd.exe /k "${LAUNCHER_BAT}" --profile ${p}`);
        i++;
    }
    return { ok: true, profiles };
}

function uninstallWin({ scope = 'User' } = {}) {
    const base = baseFor(scope);
    regDelete(`${base}\\Directory\\shell\\ClaudeCode`);
    regDelete(`${base}\\Directory\\Background\\shell\\ClaudeCode`);
    regDelete(`${base}\\ClaudeCodeCmds`);
    return { ok: true };
}

function isWinRegistered() {
    if (!IS_WIN) return false;
    return regQuery(`${BASE_USER}\\Directory\\shell\\ClaudeCode`).code === 0;
}

// ---------------------------------------------------------------------------
// Linux – KDE service menu (Dolphin / Konqueror)
// ---------------------------------------------------------------------------
const KDE_SERVICE_DIR = path.join(os.homedir(), '.local', 'share', 'kio', 'servicemenus');
const KDE_MENU_FILE   = path.join(KDE_SERVICE_DIR, 'claudecode.desktop');

// Per-profile wrapper scripts written into the launcher dir so the .desktop
// Exec line stays simple and path-quoting is handled by bash internally.
function kdeWrapperPath(profile) {
    return path.join(PORTABLE_ROOT, 'launcher', `kde-service-${profile}.sh`);
}

function writeKdeWrapper(profile) {
    const wrapperPath = kdeWrapperPath(profile);
    fs.writeFileSync(wrapperPath, [
        '#!/usr/bin/env bash',
        `exec "${OPEN_TERM_SH}" "$1" "${LAUNCHER_BAT}" --profile ${profile}`,
        '',
    ].join('\n'), 'utf8');
    fs.chmodSync(wrapperPath, 0o755);
    return wrapperPath;
}

function buildKdeDesktop(profiles) {
    const iconPath = path.join(PORTABLE_ROOT, 'assets', 'claude.png');
    const icon = fs.existsSync(iconPath) ? iconPath : null;

    const actionNames = profiles.map((_, i) => `claude_${String(i).padStart(2,'0')}`).join(';');
    let out = [
        '[Desktop Entry]',
        'Type=Service',
        'ServiceTypes=KonqPopupMenu/Plugin',
        'MimeType=inode/directory;',
        `Actions=${actionNames};`,
        '',
    ].join('\n');

    for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        const label = p === 'default'
            ? 'Open Claude Code (default) here'
            : `Open Claude Code (${p}) here`;
        const wrapper = kdeWrapperPath(p);
        out += `[Desktop Action claude_${String(i).padStart(2,'0')}]\n`;
        out += `Name=${label}\n`;
        out += `Exec="${wrapper}" %f\n`;
        if (icon) out += `Icon=${icon}\n`;
        out += '\n';
    }
    return out;
}

function installKde() {
    const profiles = listProfileNames();
    if (!profiles.includes('default')) profiles.unshift('default');

    for (const p of profiles) writeKdeWrapper(p);
    fs.mkdirSync(KDE_SERVICE_DIR, { recursive: true });
    fs.writeFileSync(KDE_MENU_FILE, buildKdeDesktop(profiles), 'utf8');

    // Refresh KDE's service cache (best-effort; ignore errors)
    for (const bin of ['kbuildsycoca6', 'kbuildsycoca5']) {
        try { spawnSync(bin, [], { encoding: 'utf8' }); } catch {}
    }
    return { ok: true, profiles };
}

function uninstallKde() {
    try { fs.unlinkSync(KDE_MENU_FILE); } catch {}
    // Remove generated wrapper scripts
    try {
        for (const f of fs.readdirSync(path.join(PORTABLE_ROOT, 'launcher'))) {
            if (f.startsWith('kde-service-') && f.endsWith('.sh')) {
                fs.unlinkSync(path.join(PORTABLE_ROOT, 'launcher', f));
            }
        }
    } catch {}
    return { ok: true };
}

function isKdeRegistered() {
    if (!IS_LINUX) return false;
    if (!fs.existsSync(KDE_MENU_FILE)) return false;
    try {
        return fs.readFileSync(KDE_MENU_FILE, 'utf8').includes(LAUNCHER_BAT);
    } catch { return false; }
}

// ---------------------------------------------------------------------------
// Linux – Nautilus / Nemo / Caja scripts
// ---------------------------------------------------------------------------
const NAUTILUS_SCRIPTS_DIR = path.join(os.homedir(), '.local', 'share', 'nautilus', 'scripts');
const NAUTILUS_SCRIPT_PREFIX = 'Open Claude Code';

function buildNautilusScript(profile) {
    return [
        '#!/usr/bin/env bash',
        '# Decode file:// URI to a plain path',
        'RAW="${NAUTILUS_SCRIPT_CURRENT_URI:-file://$PWD}"',
        'DIR="${RAW#file://}"',
        '# Percent-decode (%20 → space, etc.)',
        'DIR=$(printf \'%b\' "${DIR//%/\\\\x}")',
        `exec "${OPEN_TERM_SH}" "$DIR" "${LAUNCHER_BAT}" --profile ${profile}`,
        '',
    ].join('\n');
}

function installNautilus() {
    const profiles = listProfileNames();
    if (!profiles.includes('default')) profiles.unshift('default');

    fs.mkdirSync(NAUTILUS_SCRIPTS_DIR, { recursive: true });
    // Remove stale entries first
    try {
        for (const f of fs.readdirSync(NAUTILUS_SCRIPTS_DIR)) {
            if (f.startsWith(NAUTILUS_SCRIPT_PREFIX)) {
                fs.unlinkSync(path.join(NAUTILUS_SCRIPTS_DIR, f));
            }
        }
    } catch {}

    for (const p of profiles) {
        const label = p === 'default'
            ? `${NAUTILUS_SCRIPT_PREFIX} (default) here`
            : `${NAUTILUS_SCRIPT_PREFIX} (${p}) here`;
        const scriptPath = path.join(NAUTILUS_SCRIPTS_DIR, label);
        fs.writeFileSync(scriptPath, buildNautilusScript(p), 'utf8');
        fs.chmodSync(scriptPath, 0o755);
    }
    return { ok: true, profiles };
}

function uninstallNautilus() {
    try {
        for (const f of fs.readdirSync(NAUTILUS_SCRIPTS_DIR)) {
            if (f.startsWith(NAUTILUS_SCRIPT_PREFIX)) {
                fs.unlinkSync(path.join(NAUTILUS_SCRIPTS_DIR, f));
            }
        }
    } catch {}
    return { ok: true };
}

function isNautilusRegistered() {
    if (!IS_LINUX) return false;
    try {
        return fs.readdirSync(NAUTILUS_SCRIPTS_DIR)
            .filter(f => f.startsWith(NAUTILUS_SCRIPT_PREFIX))
            .some(f => {
                try {
                    return fs.readFileSync(
                        path.join(NAUTILUS_SCRIPTS_DIR, f), 'utf8',
                    ).includes(LAUNCHER_BAT);
                } catch { return false; }
            });
    } catch { return false; }
}

// ---------------------------------------------------------------------------
// macOS – Automator Services (~/Library/Services/*.workflow)
// ---------------------------------------------------------------------------
const MAC_SERVICES_DIR = path.join(os.homedir(), 'Library', 'Services');
const MAC_WORKFLOW_PREFIX = 'Open Claude Code';

function xmlEscape(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildMacWorkflowScript(profile) {
    // The script receives selected folders as positional args (inputMethod=1).
    // Uses osascript to open Terminal.app in each selected directory.
    const cmd = xmlEscape(`${LAUNCHER_BAT} --profile ${profile}`);
    return `for f in "$@"
do
    osascript \\
        -e 'on run argv' \\
        -e 'tell application "Terminal"' \\
        -e '  do script "cd " &amp; quoted form of (item 1 of argv) &amp; " &amp;&amp; " &amp; item 2 of argv' \\
        -e '  activate' \\
        -e 'end tell' \\
        -e 'end run' \\
        -- "$f" ${cmd}
done`;
}

function buildMacWorkflowPlist(profile) {
    const script = buildMacWorkflowScript(profile);
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>AMApplicationBuild</key><string>521</string>
\t<key>AMApplicationVersion</key><string>2.10</string>
\t<key>AMDocumentVersion</key><string>2</string>
\t<key>actions</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<dict>
\t\t\t\t<key>AMAccepts</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>Container</key><string>List</string>
\t\t\t\t\t<key>Optional</key><true/>
\t\t\t\t\t<key>Types</key><array><string>com.apple.cocoa.path</string></array>
\t\t\t\t</dict>
\t\t\t\t<key>AMActionVersion</key><string>2.0.3</string>
\t\t\t\t<key>AMApplication</key><array><string>Finder</string></array>
\t\t\t\t<key>AMParameterProperties</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>COMMAND_STRING</key><dict/>
\t\t\t\t\t<key>CheckedForUserDefaultShell</key><dict/>
\t\t\t\t\t<key>inputMethod</key><dict/>
\t\t\t\t\t<key>shell</key><dict/>
\t\t\t\t\t<key>source</key><dict/>
\t\t\t\t</dict>
\t\t\t\t<key>AMProvides</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>Container</key><string>List</string>
\t\t\t\t\t<key>Types</key><array><string>com.apple.cocoa.path</string></array>
\t\t\t\t</dict>
\t\t\t\t<key>ActionBundlePath</key>
\t\t\t\t<string>/System/Library/Automator/Run Shell Script.action</string>
\t\t\t\t<key>ActionName</key><string>Run Shell Script</string>
\t\t\t\t<key>ActionParameters</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>COMMAND_STRING</key>
\t\t\t\t\t<string>${script}</string>
\t\t\t\t\t<key>CheckedForUserDefaultShell</key><true/>
\t\t\t\t\t<key>inputMethod</key><integer>1</integer>
\t\t\t\t\t<key>shell</key><string>/bin/bash</string>
\t\t\t\t\t<key>source</key><string></string>
\t\t\t\t</dict>
\t\t\t\t<key>BundleIdentifier</key>
\t\t\t\t<string>com.apple.RunShellScript</string>
\t\t\t\t<key>CFBundleVersion</key><string>2.0.3</string>
\t\t\t\t<key>CanShowSelectedItemsWhenRun</key><false/>
\t\t\t\t<key>CanShowWhenRun</key><true/>
\t\t\t\t<key>Category</key><array><string>AMCategoryUtilities</string></array>
\t\t\t\t<key>Class Name</key><string>RunShellScriptAction</string>
\t\t\t\t<key>InputUUID</key><string>7B26F75E-4E20-42B8-89D2-D406B5E54188</string>
\t\t\t\t<key>Keywords</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Shell</string><string>Script</string>
\t\t\t\t\t<string>Command</string><string>Run</string><string>Unix</string>
\t\t\t\t</array>
\t\t\t\t<key>Name</key><string>Run Shell Script</string>
\t\t\t\t<key>OutputUUID</key><string>D9F37F7E-B87C-4A9B-8567-A3F9C82E1D42</string>
\t\t\t\t<key>UUID</key><string>A1C3E5F7-9B2D-4E6A-8F0C-2D4B6E8A0C12</string>
\t\t\t\t<key>UnlocalizedApplications</key><array><string>Automator</string></array>
\t\t\t\t<key>arguments</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>0</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key><integer>0</integer>
\t\t\t\t\t\t<key>name</key><string>inputMethod</string>
\t\t\t\t\t\t<key>required</key><string>0</string>
\t\t\t\t\t\t<key>type</key><string>0</string>
\t\t\t\t\t\t<key>uuid</key><string>0</string>
\t\t\t\t\t</dict>
\t\t\t\t\t<key>1</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key><string></string>
\t\t\t\t\t\t<key>name</key><string>shell</string>
\t\t\t\t\t\t<key>required</key><string>0</string>
\t\t\t\t\t\t<key>type</key><string>0</string>
\t\t\t\t\t\t<key>uuid</key><string>1</string>
\t\t\t\t\t</dict>
\t\t\t\t\t<key>2</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>default value</key><string></string>
\t\t\t\t\t\t<key>name</key><string>source</string>
\t\t\t\t\t\t<key>required</key><string>0</string>
\t\t\t\t\t\t<key>type</key><string>0</string>
\t\t\t\t\t\t<key>uuid</key><string>2</string>
\t\t\t\t\t</dict>
\t\t\t\t</dict>
\t\t\t\t<key>isViewVisible</key><true/>
\t\t\t\t<key>location</key><string>309.000000:253.000000</string>
\t\t\t\t<key>nibPath</key>
\t\t\t\t<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/English.lproj/main.nib</string>
\t\t\t</dict>
\t\t\t<key>isViewVisible</key><true/>
\t\t</dict>
\t</array>
\t<key>connectors</key><dict/>
\t<key>workflowMetaData</key>
\t<dict>
\t\t<key>serviceInputTypeIdentifier</key>
\t\t<string>com.apple.Automator.fileSystemObject.folder</string>
\t\t<key>serviceOutputTypeIdentifier</key>
\t\t<string>com.apple.Automator.nothing</string>
\t\t<key>serviceProcessesInput</key><integer>0</integer>
\t\t<key>workflowTypeIdentifier</key>
\t\t<string>com.apple.Automator.servicesMenu</string>
\t</dict>
</dict>
</plist>
`;
}

function macWorkflowDir(profile) {
    const label = profile === 'default'
        ? `${MAC_WORKFLOW_PREFIX} (default) here`
        : `${MAC_WORKFLOW_PREFIX} (${profile}) here`;
    return path.join(MAC_SERVICES_DIR, `${label}.workflow`);
}

function installMac() {
    const profiles = listProfileNames();
    if (!profiles.includes('default')) profiles.unshift('default');

    // Remove stale workflows
    try {
        for (const f of fs.readdirSync(MAC_SERVICES_DIR)) {
            if (f.startsWith(MAC_WORKFLOW_PREFIX) && f.endsWith('.workflow')) {
                fs.rmSync(path.join(MAC_SERVICES_DIR, f), { recursive: true, force: true });
            }
        }
    } catch {}

    fs.mkdirSync(MAC_SERVICES_DIR, { recursive: true });
    for (const p of profiles) {
        const wfDir = macWorkflowDir(p);
        fs.mkdirSync(path.join(wfDir, 'Contents'), { recursive: true });
        fs.writeFileSync(path.join(wfDir, 'Contents', 'document.wflow'),
            buildMacWorkflowPlist(p), 'utf8');
    }

    // Refresh the Services menu database (best-effort)
    try {
        spawnSync('/System/Library/CoreServices/pbs', ['-update'], { encoding: 'utf8' });
    } catch {}

    return { ok: true, profiles };
}

function uninstallMac() {
    try {
        for (const f of fs.readdirSync(MAC_SERVICES_DIR)) {
            if (f.startsWith(MAC_WORKFLOW_PREFIX) && f.endsWith('.workflow')) {
                fs.rmSync(path.join(MAC_SERVICES_DIR, f), { recursive: true, force: true });
            }
        }
    } catch {}
    try {
        spawnSync('/System/Library/CoreServices/pbs', ['-update'], { encoding: 'utf8' });
    } catch {}
    return { ok: true };
}

function isMacRegistered() {
    if (!IS_MAC) return false;
    try {
        return fs.readdirSync(MAC_SERVICES_DIR)
            .filter(f => f.startsWith(MAC_WORKFLOW_PREFIX) && f.endsWith('.workflow'))
            .some(f => {
                try {
                    const wflow = path.join(MAC_SERVICES_DIR, f, 'Contents', 'document.wflow');
                    return fs.readFileSync(wflow, 'utf8').includes(LAUNCHER_BAT);
                } catch { return false; }
            });
    } catch { return false; }
}

// ---------------------------------------------------------------------------
// Unified public API
// ---------------------------------------------------------------------------

export function isShellRegistered() {
    if (IS_WIN)   return isWinRegistered();
    if (IS_LINUX) return isKdeRegistered() || isNautilusRegistered();
    if (IS_MAC)   return isMacRegistered();
    return false;
}

export function installShell(opts = {}) {
    if (IS_WIN)   return installWin(opts);
    if (IS_LINUX) {
        const kde      = installKde();
        const nautilus = installNautilus();
        const ok = kde.ok || nautilus.ok;
        return { ok, profiles: kde.profiles ?? nautilus.profiles };
    }
    if (IS_MAC)   return installMac();
    return { ok: false, reason: 'Unsupported platform' };
}

export function uninstallShell(opts = {}) {
    if (IS_WIN)   return uninstallWin(opts);
    if (IS_LINUX) { uninstallKde(); uninstallNautilus(); return { ok: true }; }
    if (IS_MAC)   return uninstallMac();
    return { ok: false, reason: 'Unsupported platform' };
}

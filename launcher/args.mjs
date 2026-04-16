// Parse launcher-specific flags out of process.argv, leaving everything
// else in `forwarded` for pass-through to `claude`.

export function parseArgs(argv) {
    const out = {
        mode: null,               // list | newProfile | regShell | unregShell | moveSession | null
        profile: null,            // from --profile <name>
        skipMenu: false,
        newProfileName: null,
        moveSession: { id: null, to: null, from: null },
        forwarded: [],
    };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];

        if (a === '--profile')         { out.profile = next(); continue; }
        if (a === '--list-profiles')   { out.mode = 'list'; continue; }
        if (a === '--new-profile')     { out.mode = 'newProfile'; out.newProfileName = next(); continue; }
        if (a === '--register-shell')  { out.mode = 'regShell'; continue; }
        if (a === '--unregister-shell'){ out.mode = 'unregShell'; continue; }
        if (a === '--doctor')          { out.mode = 'doctor'; continue; }
        if (a === '--move-session')    { out.mode = 'moveSession'; out.moveSession.id = next(); continue; }
        if (a === '--to')              { out.moveSession.to = next(); continue; }
        if (a === '--from')            { out.moveSession.from = next(); continue; }
        if (a === '--reinstall')       { out.mode = 'reinstall'; out.reinstallTarget = argv[i+1] && !argv[i+1].startsWith('-') ? next() : 'all'; continue; }

        // skip-menu shortcuts
        if (a === '--new')             { out.skipMenu = true; continue; }
        if (a === '--resume-last')     { out.skipMenu = true; out.forwarded.push('--continue'); continue; }
        if (a === '-c' || a === '--continue') { out.skipMenu = true; out.forwarded.push('--continue'); continue; }
        if (a === '--resume')          { out.skipMenu = true; out.forwarded.push('--resume', next()); continue; }

        // claude-native flags that imply non-interactive usage
        if (a === '-p' || a === '--print' || a === '--prompt') {
            out.skipMenu = true;
        }

        out.forwarded.push(a);
    }

    // Environment overrides
    if (!out.profile && process.env.CLAUDE_PROFILE) {
        out.profile = process.env.CLAUDE_PROFILE;
    }
    if (process.env.CLAUDE_SKIP_MENU === '1') {
        out.skipMenu = true;
        if (!out.forwarded.includes('--continue')) out.forwarded.push('--continue');
    } else if (process.env.CLAUDE_SKIP_MENU === 'new') {
        out.skipMenu = true;
    }

    return out;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAgyInstaller } from '../launcher/antigravity-install.mjs';

const unix = process.platform !== 'win32';

function fixture(t, curlBody) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy install '));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\n' + curlBody, { mode: 0o755 });
    return { root, env: { ...process.env, HOME: root, PATH: bin + ':' + process.env.PATH } };
}

test('Unix installer accepts upstream arguments and installs under the redirected HOME', { skip: !unix }, t => {
    // Google's installer accepts only --dir and --help. Reject any other flags
    // before simulating the download, matching its argument parser.
    const { root, env } = fixture(t, `cat <<'INSTALLER'
set -eu
[ "$#" -eq 0 ] || { echo "Unknown installer parameter: $1" >&2; exit 1; }
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\\nexit 0\\n' > "$HOME/.local/bin/agy"
chmod +x "$HOME/.local/bin/agy"
INSTALLER
`);
    const result = runAgyInstaller(false, env);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    fs.accessSync(path.join(root, '.local', 'bin', 'agy'), fs.constants.X_OK);
});

test('Unix installer reports a failed download even when bash receives empty input', { skip: !unix }, t => {
    const { env } = fixture(t, 'exit 22\n');
    const result = runAgyInstaller(false, env);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 22);
});

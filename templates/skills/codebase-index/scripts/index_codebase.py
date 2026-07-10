# -*- coding: utf-8 -*-
"""index_codebase.py - generate INDEX.md: a greppable symbol map of a codebase.

Every symbol becomes ONE line ending in `path:line`, so
    grep -n "symbolName" INDEX.md
directly answers "where is that defined?". Captured per symbol: kind
(namespace, class, record, struct, interface, enum, trait, type, function,
method, const, global, field, macro), name, parameter list, and a one-line
description harvested from the docstring / doc-comment directly above it.

Syntax-aware for Python (real AST: docstrings, signatures, class members,
module globals); pattern-based for JS/TS, C#, Java, Go, Rust, C/C++, PHP,
Ruby, Perl, shell, PowerShell (doc-comments read from the lines above the
declaration).

Usage:
    python index_codebase.py [ROOT] [-o OUTPUT] [--max-file-kb N]

Defaults: ROOT = cwd, OUTPUT = <ROOT>/INDEX.md.
Exit code 0 on success, 1 on a bad root.
"""
import argparse
import ast
import os
import re
import sys
from datetime import datetime, timezone

SKIP_DIRS = {
    '.git', '.hg', '.svn', 'node_modules', '__pycache__', '.venv', 'venv',
    'dist', 'build', 'out', 'target', 'bin', 'obj', '.idea', '.vs',
    '.vscode', 'vendor', 'packages', '.tox', '.mypy_cache', '.pytest_cache',
    'coverage', '.next', '.nuxt', 'bower_components',
}

MAX_SIG_LEN  = 70   # parameter lists longer than this get an ellipsis
MAX_DESC_LEN = 100  # descriptions longer than this get an ellipsis


def rx(p):
    return re.compile(p, re.M)


# Patterns may provide a (?P<kw>...) group; when present it overrides the
# tuple's kind (so `enum Foo` indexes as enum, not generic type).
JS_KEYWORDS = r'(?!(?:if|for|while|switch|catch|return|function|new|typeof|else|do|in|of)\b)'
JS_PATTERNS = [
    ('namespace', rx(r'^\s*(?:export\s+)?(?:declare\s+)?namespace\s+(?P<name>[A-Za-z_$][\w$.]*)')),
    ('class',     rx(r'^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(?P<name>[A-Za-z_$][\w$]*)')),
    ('function',  rx(r'^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(?P<name>[A-Za-z_$][\w$]*)')),
    ('function',  rx(r'^\s*(?:export\s+)?(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>')),
    # Class/object method shorthand: `  async foo(a, b) {` at shallow indent.
    ('method',    rx(r'^\s{2,8}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?\s*' + JS_KEYWORDS + r'(?P<name>[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{')),
    ('type',      rx(r'^\s*(?:export\s+)?(?:declare\s+)?(?P<kw>interface|type|enum)\s+(?P<name>[A-Za-z_$][\w$]*)')),
    ('const',     rx(r'^\s*export\s+(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=')),
    ('global',    rx(r'^(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=')),
]

CS_MODS = r'(?:public|internal|protected|private|static|sealed|abstract|partial|file|readonly|virtual|override|async|extern|unsafe|new|\s)'
LANG_PATTERNS = {
    '.js':  ('JavaScript', JS_PATTERNS), '.mjs': ('JavaScript', JS_PATTERNS),
    '.cjs': ('JavaScript', JS_PATTERNS), '.jsx': ('JavaScript', JS_PATTERNS),
    '.ts':  ('TypeScript', JS_PATTERNS), '.tsx': ('TypeScript', JS_PATTERNS),
    '.cs': ('C#', [
        ('namespace', rx(r'^\s*namespace\s+(?P<name>[\w.]+)')),
        ('type',      rx(r'^\s*(?:\[[^\]]*\]\s*)*' + CS_MODS + r'*\b(?P<kw>class|record(?:\s+(?:class|struct))?|struct|interface|enum)\s+(?P<name>[A-Za-z_]\w*)')),
        ('field',     rx(r'^\s{4,}(?:\[[^\]]*\]\s*)*' + CS_MODS + r'*\b(?:const|static)\s+[\w<>\[\],.?\s]+?\s(?P<name>[A-Za-z_]\w*)\s*[=;]')),
        ('constructor', rx(r'^\s{4,}(?:\[[^\]]*\]\s*)*(?:public|internal|protected|private)\s+(?:static\s+)?(?P<name>[A-Z]\w*)\s*\(')),
        ('method',    rx(r'^\s{4,}(?:\[[^\]]*\]\s*)*' + CS_MODS + r'+[\w<>\[\],.?\s]+\s(?P<name>[A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\([^;]*$')),
        ('method',    rx(r'^\s{4,}(?:\[[^\]]*\]\s*)*' + CS_MODS + r'+[\w<>\[\],.?\s]+\s(?P<name>[A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:=>|\{|;)')),
    ]),
    '.java': ('Java', [
        ('type',   rx(r'^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public|protected|private|static|final|abstract|\s)*\b(?P<kw>class|interface|enum|record)\s+(?P<name>[A-Za-z_]\w*)')),
        ('field',  rx(r'^\s{4,}(?:public|protected|private|\s)*\bstatic\s+(?:final\s+)?[\w<>\[\],.\s]+\s(?P<name>[A-Z_][A-Z0-9_]*)\s*[=;]')),
        ('constructor', rx(r'^\s{4,}(?:@\w+(?:\([^)]*\))?\s*)*(?:public|protected|private)\s+(?P<name>[A-Z]\w*)\s*\(')),
        ('method', rx(r'^\s{4,}(?:@\w+(?:\([^)]*\))?\s*)*(?:public|protected|private|static|final|abstract|synchronized|native|\s)+[\w<>\[\],.\s]+\s(?P<name>[A-Za-z_]\w*)\s*\([^;]*$')),
        ('method', rx(r'^\s{4,}(?:@\w+(?:\([^)]*\))?\s*)*(?:public|protected|private|static|final|abstract|synchronized|native|\s)+[\w<>\[\],.\s]+\s(?P<name>[A-Za-z_]\w*)\s*\([^)]*\)\s*(?:throws[^{]*)?\{')),
    ]),
    '.go': ('Go', [
        ('namespace', rx(r'^package\s+(?P<name>\w+)')),
        ('function',  rx(r'^func\s+(?:\((?P<recv>[^)]+)\)\s+)?(?P<name>[A-Za-z_]\w*)')),
        ('type',      rx(r'^type\s+(?P<name>[A-Za-z_]\w*)\s+(?P<kw>struct|interface|func|\w+)')),
        ('global',    rx(r'^(?P<kw>var|const)\s+(?P<name>[A-Za-z_]\w*)')),
    ]),
    '.rs': ('Rust', [
        # Indented fn = inside an impl/trait block -> method (checked first).
        ('method',   rx(r'^\s{4,}(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(?P<name>[A-Za-z_]\w*)')),
        ('function', rx(r'^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(?P<name>[A-Za-z_]\w*)')),
        ('type',     rx(r'^\s*(?:pub(?:\([^)]*\))?\s+)?(?P<kw>struct|enum|trait|union|type)\s+(?P<name>[A-Za-z_]\w*)')),
        ('const',    rx(r'^\s*(?:pub(?:\([^)]*\))?\s+)?(?P<kw>static|const)\s+(?:mut\s+)?(?P<name>[A-Za-z_]\w*)')),
        ('impl',     rx(r'^\s*impl(?:<[^>]*>)?\s+(?P<name>[A-Za-z_][\w:<>, ]*?)\s*(?:\{|$)')),
        ('macro',    rx(r'^\s*macro_rules!\s+(?P<name>[A-Za-z_]\w*)')),
    ]),
    '.c': ('C', [
        ('function', rx(r'^[A-Za-z_][\w\s*]*?\b(?P<name>[A-Za-z_]\w*)\s*\([^;]*\)\s*\{')),
        ('type',     rx(r'^\s*typedef\s+(?:struct|enum|union)?\s*\w*\s*\{?[^;]*?\b(?P<name>[A-Za-z_]\w*)\s*;')),
        ('macro',    rx(r'^#define\s+(?P<name>[A-Za-z_]\w*)')),
    ]),
    '.php': ('PHP', [
        ('namespace', rx(r'^namespace\s+(?P<name>[\w\\]+)')),
        ('class',     rx(r'^\s*(?:abstract\s+|final\s+)?(?P<kw>class|interface|trait|enum)\s+(?P<name>[A-Za-z_]\w*)')),
        ('function',  rx(r'^\s*(?:public|protected|private|static|\s)*function\s+(?P<name>[A-Za-z_]\w*)')),
        ('const',     rx(r'^\s*(?:public|protected|private|\s)*const\s+(?P<name>[A-Z_][A-Z0-9_]*)')),
    ]),
    '.rb': ('Ruby', [
        ('class',    rx(r'^\s*(?P<kw>class|module)\s+(?P<name>[A-Z]\w*)')),
        ('function', rx(r'^\s*def\s+(?:self\.)?(?P<name>[A-Za-z_]\w*[?!=]?)')),
        ('const',    rx(r'^\s*(?P<name>[A-Z][A-Z0-9_]*)\s*=\s*')),
    ]),
    '.pl': ('Perl', [('function', rx(r'^\s*sub\s+(?P<name>[A-Za-z_]\w*)'))]),
    '.pm': ('Perl', [
        ('namespace', rx(r'^\s*package\s+(?P<name>[\w:]+)')),
        ('function',  rx(r'^\s*sub\s+(?P<name>[A-Za-z_]\w*)')),
    ]),
    '.sh':   ('Shell', [('function', rx(r'^\s*(?:function\s+)?(?P<name>[A-Za-z_]\w*)\s*\(\)\s*\{?'))]),
    '.bash': ('Shell', [('function', rx(r'^\s*(?:function\s+)?(?P<name>[A-Za-z_]\w*)\s*\(\)\s*\{?'))]),
    '.ps1':  ('PowerShell', [('function', rx(r'^\s*function\s+(?P<name>[A-Za-z_][\w-]*)'))]),
    '.psm1': ('PowerShell', [('function', rx(r'^\s*function\s+(?P<name>[A-Za-z_][\w-]*)'))]),
}
LANG_PATTERNS['.h'] = LANG_PATTERNS['.c']
LANG_PATTERNS['.cpp'] = LANG_PATTERNS['.cc'] = LANG_PATTERNS['.hpp'] = ('C++', [
    ('namespace', rx(r'^\s*namespace\s+(?P<name>\w+)')),
    ('type',      rx(r'^\s*(?P<kw>class|struct|enum(?:\s+class)?)\s+(?P<name>[A-Za-z_]\w*)\s*[:{\n]')),
    ('function',  rx(r'^[A-Za-z_][\w:\s*&<>,]*?\b(?P<name>[A-Za-z_][\w:]*)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{')),
    ('macro',     rx(r'^#define\s+(?P<name>[A-Za-z_]\w*)')),
])

COMMENT_PREFIXES = ('///', '//!', '//', '#>', '<#', '#', '/**', '/*', '*', '--', "'''", '"""')


def clean_comment(s):
    s = s.strip()
    for p in ('///', '//!', '//', '/**', '/*', '<#', '#', '--'):
        if s.startswith(p):
            s = s[len(p):]
            break
    else:
        if s.startswith('*'):
            s = s[1:]
    for suf in ('*/', '#>'):
        if s.endswith(suf):
            s = s[:-len(suf)]
    # Strip C#/Java XML doc tags: <summary>text</summary> -> text
    s = re.sub(r'</?\w+[^>]*>', '', s)
    # Doc-tool tags carry no prose: @param foo -> skip via caller
    return s.strip()


def is_comment_line(s):
    s = s.strip()
    return bool(s) and (s.startswith(COMMENT_PREFIXES) or s.endswith('*/'))


def is_attr_line(s):
    """C#/Java attribute/annotation lines sit between doc-comment and symbol."""
    s = s.strip()
    return bool(re.match(r'^(\[[^\]]*\]|@\w+(\([^)]*\))?)\s*$', s))


def desc_above(lines, idx):
    """One-line description: first prose line of the doc-comment block
    directly above lines[idx]. Handles both contiguous line comments and
    multi-line /* ... */ blocks (blank lines inside a block are fine);
    attribute/annotation lines between comment and symbol are skipped."""
    i = idx - 1
    while i >= 0 and is_attr_line(lines[i]):
        i -= 1
    block = []
    if i >= 0:
        s = lines[i].strip()
        if s.endswith(('*/', '#>')) and not s.startswith(('/*', '<#', '//', '#')):
            # End of a multi-line block: walk up to its opening line.
            while i >= 0:
                block.append(clean_comment(lines[i]))
                if lines[i].strip().startswith(('/*', '<#')):
                    break
                i -= 1
        else:
            while i >= 0 and is_comment_line(lines[i]):
                block.append(clean_comment(lines[i]))
                i -= 1
    for text in reversed(block):
        if text and not text.startswith('@') and not text.startswith('---'):
            return truncate(text, MAX_DESC_LEN)
    return ''


def truncate(s, n):
    s = ' '.join(s.split())
    return s if len(s) <= n else s[:n - 1] + '…'


def params_at(lines, idx, name, max_continuation=4):
    """Extract `(...)` following the symbol name starting at lines[idx],
    continuing over wrapped declaration lines until the parens balance."""
    name = name.split('.')[-1]        # qualified names: match the member part
    line = lines[idx] if idx < len(lines) else ''
    pos = line.find(name)
    if pos < 0:
        return ''
    open_p = line.find('(', pos + len(name))
    if open_p < 0:
        return ''
    depth, out = 0, []
    text = line[open_p:]
    for _ in range(max_continuation + 1):
        for ch in text:
            out.append(ch)
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return truncate(' '.join(''.join(out).split()), MAX_SIG_LEN)
        idx += 1
        if idx >= len(lines):
            break
        text = ' ' + lines[idx].strip()
    return truncate(' '.join(''.join(out).split()) + '…)', MAX_SIG_LEN)


def file_summary(lines):
    """First prose line of a leading comment block (skips shebang/encoding)."""
    i = 0
    while i < len(lines) and (lines[i].startswith('#!')
                              or 'coding:' in lines[i][:40]
                              or not lines[i].strip()):
        i += 1
    if i >= len(lines):
        return ''
    s = lines[i].strip()
    if s.startswith(('/*', '<#')):
        # Block comment header: scan to its close, first prose line wins.
        for j in range(i, min(i + 30, len(lines))):
            text = clean_comment(lines[j])
            if text:
                return truncate(text, MAX_DESC_LEN)
            if lines[j].strip().endswith(('*/', '#>')):
                break
        return ''
    if is_comment_line(lines[i]):
        j = i
        while j < len(lines) and is_comment_line(lines[j]):
            text = clean_comment(lines[j])
            if text:
                return truncate(text, MAX_DESC_LEN)
            j += 1
    return ''


# ---------------------------------------------------------------------------
# Python via AST
# ---------------------------------------------------------------------------
def _unparse(node):
    try:
        return ast.unparse(node)
    except Exception:
        return '?'


def py_sig(node):
    """Faithful-ish signature: defaults, positional-only `/`, keyword-only
    `*`, *args/**kwargs, and the return annotation. Truncated, not elided."""
    a = node.args
    pos = list(getattr(a, 'posonlyargs', [])) + list(a.args)
    defaults = [None] * (len(pos) - len(a.defaults)) + list(a.defaults)
    parts = []
    for i, (arg, dflt) in enumerate(zip(pos, defaults)):
        parts.append(arg.arg + (f'={_unparse(dflt)}' if dflt is not None else ''))
        if getattr(a, 'posonlyargs', []) and i == len(a.posonlyargs) - 1:
            parts.append('/')
    if a.vararg:
        parts.append('*' + a.vararg.arg)
    elif a.kwonlyargs:
        parts.append('*')
    for arg, dflt in zip(a.kwonlyargs, a.kw_defaults):
        parts.append(arg.arg + (f'={_unparse(dflt)}' if dflt is not None else ''))
    if a.kwarg:
        parts.append('**' + a.kwarg.arg)
    sig = '(' + ', '.join(parts) + ')'
    if node.returns is not None:
        sig += f' -> {_unparse(node.returns)}'
    return truncate(sig, MAX_SIG_LEN)


def py_func_kind(node, in_class):
    if not in_class:
        return 'function'
    for dec in node.decorator_list:
        name = dec.id if isinstance(dec, ast.Name) else getattr(dec, 'attr', '')
        if name == 'property' or name == 'cached_property':
            return 'property'
        if name == 'staticmethod':
            return 'static method'
        if name == 'classmethod':
            return 'class method'
    return 'method'


def py_doc(node):
    d = ast.get_docstring(node)
    return truncate(d.strip().splitlines()[0], MAX_DESC_LEN) if d else ''


def _py_walk(body, out, prefix='', in_class=False):
    for node in body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if in_class and node.name.startswith('__') and node.name != '__init__':
                continue
            out.append((py_func_kind(node, in_class), prefix + node.name,
                        node.lineno, py_sig(node), py_doc(node)))
        elif isinstance(node, ast.ClassDef):
            out.append(('class', prefix + node.name, node.lineno, '', py_doc(node)))
            _py_walk(node.body, out, prefix + node.name + '.', in_class=True)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    kind = ('const' if t.id.isupper()
                            else 'field' if in_class else 'global')
                    out.append((kind, prefix + t.id, node.lineno, '', ''))
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            kind = ('const' if node.target.id.isupper()
                    else 'field' if in_class else 'global')
            out.append((kind, prefix + node.target.id, node.lineno, '', ''))


def index_python(text):
    """Returns (summary, [(kind, name, line, signature, description)])."""
    out = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return '', out
    _py_walk(tree.body, out)
    return py_doc(tree), out


# ---------------------------------------------------------------------------
# Pattern-based languages
# ---------------------------------------------------------------------------
def index_by_patterns(text, patterns):
    lines = text.splitlines()
    out, seen = [], set()
    for kind, pattern in patterns:
        for m in pattern.finditer(text):
            name = m.group('name')
            line_no = text.count('\n', 0, m.start()) + 1
            key = (name, line_no)
            if key in seen:
                continue
            seen.add(key)
            kw = m.groupdict().get('kw')
            k = kind
            # Go-style methods: func (s *Server) Start(...) -> method Server.Start
            recv = m.groupdict().get('recv')
            if recv:
                rt = re.search(r'\*?(\w+)\s*$', recv)
                if rt:
                    name = f'{rt.group(1)}.{name}'
                k = 'method'
            if kw:
                kw = ' '.join(kw.split())
                k = {'var': 'global', 'const': 'const', 'static': 'const',
                     'record class': 'record', 'record struct': 'record',
                     'enum class': 'enum'}.get(kw, kw)
                if kind == 'type' and k not in (
                        'struct', 'interface', 'enum', 'trait', 'union',
                        'record', 'type', 'class', 'module', 'func'):
                    k = 'type'   # Go `type X SomeAlias`
            sig = params_at(lines, line_no - 1, name) if k in (
                'function', 'method', 'constructor', 'macro') else ''
            desc = desc_above(lines, line_no - 1)
            out.append((k, name, line_no, sig, desc))
    out.sort(key=lambda s: s[2])
    return out


# ---------------------------------------------------------------------------
# Walk + render
# ---------------------------------------------------------------------------
def collect(root, max_kb):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames
                             if d not in SKIP_DIRS and not d.startswith('.'))
        for fn in sorted(filenames):
            ext = os.path.splitext(fn)[1].lower()
            if ext != '.py' and ext not in LANG_PATTERNS:
                continue
            full = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(full) > max_kb * 1024:
                    continue
                with open(full, encoding='utf-8', errors='replace') as f:
                    text = f.read()
            except OSError:
                continue
            if ext == '.py':
                lang = 'Python'
                summary, symbols = index_python(text)
            else:
                lang, patterns = LANG_PATTERNS[ext]
                symbols = index_by_patterns(text, patterns)
                summary = file_summary(text.splitlines())
                # The leading file comment belongs to the file, not to the
                # first symbol below it - drop the duplicate description.
                if summary:
                    symbols = [(k, n, l, s, '' if d == summary else d)
                               for k, n, l, s, d in symbols]
            rel = os.path.relpath(full, root).replace(os.sep, '/')
            yield rel, lang, summary, symbols, text.count('\n') + 1


def render(entries):
    lines = [
        '# Codebase Index',
        '',
        f'Generated {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")} '
        'by index_codebase.py.',
        '',
        'Every symbol is one line ending in `path:line` — grep this file to',
        'locate anything: `grep -n "symbolName" INDEX.md`. Regenerate after',
        'adding, renaming, moving, or deleting symbols; line numbers drift',
        'with unrelated edits, so treat them as anchors, not gospel.',
        '',
    ]
    by_dir = {}
    for rel, lang, summary, symbols, nlines in entries:
        by_dir.setdefault(os.path.dirname(rel) or '.', []) \
              .append((rel, lang, summary, symbols, nlines))

    total_files = sum(len(v) for v in by_dir.values())
    total_syms = sum(len(s) for v in by_dir.values() for *_, s, _ in v)
    lines += [f'{total_files} files, {total_syms} symbols.', '']

    for d in sorted(by_dir):
        lines.append(f'## {d}/')
        lines.append('')
        for rel, lang, summary, symbols, nlines in by_dir[d]:
            lines.append(f'### {os.path.basename(rel)}  `{lang}, {nlines} lines`')
            if summary:
                lines.append(f'> {summary}')
            if not symbols:
                lines.append('- (no top-level symbols found)')
            for kind, name, line_no, sig, desc in symbols:
                entry = f'- {kind} `{name}{sig}`'
                if desc:
                    entry += f' — {desc}'
                entry += f' — {rel}:{line_no}'
                lines.append(entry)
            lines.append('')
    return '\n'.join(lines) + '\n'


def main(argv=None):
    p = argparse.ArgumentParser(description='Generate INDEX.md symbol map.')
    p.add_argument('root', nargs='?', default='.')
    p.add_argument('-o', '--output', default=None,
                   help='output file (default: <root>/INDEX.md)')
    p.add_argument('--max-file-kb', type=int, default=512,
                   help='skip files larger than this (default 512 KB)')
    a = p.parse_args(argv)

    root = os.path.abspath(a.root)
    if not os.path.isdir(root):
        print(f'error: not a directory: {root}', file=sys.stderr)
        return 1
    out_path = a.output or os.path.join(root, 'INDEX.md')

    entries = list(collect(root, a.max_file_kb))
    md = render(entries)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(md)
    n_syms = sum(len(e[3]) for e in entries)
    print(f'{out_path}: {len(entries)} files, {n_syms} symbols indexed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

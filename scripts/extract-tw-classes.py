import re, glob

VALID_CLASS_RE = re.compile(r'^[a-z](?:[a-zA-Z0-9-]*/?(?:\[.*?\])?)*$')
BT = chr(96)  # backtick character

classes = set()
for f in glob.glob('*.html'):
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()

    # 1) className="static-string"
    for m in re.finditer(r'className\s*=\s*"([^"]*)"', content):
        for cls in m.group(1).split():
            if VALID_CLASS_RE.match(cls):
                classes.add(cls)

    # 2) className={'static-string'}
    for m in re.finditer(r"className\s*=\s*\{'([^']*)'\}", content):
        for cls in m.group(1).split():
            if VALID_CLASS_RE.match(cls):
                classes.add(cls)

    # 3) className={BT...template literal...BT} using dynamic pattern
    pat3 = 'className=' + re.escape(chr(123)) + BT + '([^' + BT + ']*)' + BT + re.escape(chr(125))
    for m in re.finditer(pat3, content):
        literal = m.group(1)
        cleaned = re.sub(r'\$\{[^}]*\}', '', literal)
        for cls in cleaned.split():
            if VALID_CLASS_RE.match(cls):
                classes.add(cls)

    # 4) className={complex expression} - extract single-quoted strings
    for m in re.finditer(r'className\s*=\s*' + re.escape(chr(123)) + '([^' + re.escape(chr(125)) + ']+)' + re.escape(chr(125)), content):
        expr = m.group(1)
        for sm in re.finditer(r"'([^']*)'", expr):
            for cls in sm.group(1).split():
                if VALID_CLASS_RE.match(cls):
                    classes.add(cls)

    # 5) class="..." in non-JSX HTML
    for m in re.finditer(r'class\s*=\s*"([^"]*)"', content):
        for cls in m.group(1).split():
            if VALID_CLASS_RE.match(cls):
                classes.add(cls)

responsive = sorted(set(c for c in classes if any(c.startswith(p+':') for p in ['sm','md','lg','xl'])))
states = sorted(set(c for c in classes if any(c.startswith(p+':') for p in ['hover','focus','active','disabled'])))

print(f'Total: {len(classes)} clean classes')
print(f'Responsive ({len(responsive)}):')
for c in responsive:
    print(f'  {c}')
print(f'States ({len(states)}):')
for c in states[:40]:
    print(f'  {c}')
if len(states) > 40:
    print(f'  ... and {len(states)-40} more')

with open('tw-classes.html', 'w') as out:
    out.write('<!DOCTYPE html><html><head></head><body>\n')
    for c in sorted(classes):
        out.write('<div class="' + c + '"></div>\n')
    out.write('</body></html>')

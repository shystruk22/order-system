#!/usr/bin/env python3
"""
Fix Tailwind CSS in all HTML files:
1. Replace <script src="https://cdn.tailwindcss.com"></script> with inline v3 CSS
2. Add scroll fix: html, body { height: auto !important; }
"""

import os
import re

TAILWIND_CSS_FILE = '/home/z/my-project/tailwind.min.css'
HTML_DIR = '/home/z/my-project'

with open(TAILWIND_CSS_FILE, 'r') as f:
    tailwind_css = f.read()

CDN_PATTERN = re.compile(
    r'<script\s+(?:crossorigin\s+)?src="https://cdn\.tailwindcss\.com"[^>]*></script>',
    re.IGNORECASE
)

SCROLL_FIX = "\nhtml, body { height: auto !important; }"

def fix_html_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    match = CDN_PATTERN.search(content)
    
    if match:
        inline_style = '<style>\n' + tailwind_css + SCROLL_FIX + '\n</style>'
        content = CDN_PATTERN.sub(inline_style, content)
        print(f'  [OK] Replaced Tailwind CDN with inline CSS')
    else:
        if '/* tailwind */' in content or tailwind_css[:50] in content:
            print(f'  [SKIP] Already has inline Tailwind CSS')
        else:
            print(f'  [WARN] No Tailwind CDN found')
    
    # Ensure scroll fix
    if 'height: auto !important' not in content:
        style_match = re.search(r'(<style[^>]*>)', content)
        if style_match:
            insert_pos = style_match.end()
            content = content[:insert_pos] + SCROLL_FIX + '\n' + content[insert_pos:]
            print(f'  [OK] Added scroll fix')
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'  [SAVED] {filepath}')
        return True
    else:
        print(f'  [NO CHANGES]')
        return False

html_files = [f for f in os.listdir(HTML_DIR) if f.endswith('.html')]
print(f"Found {len(html_files)} HTML files")

changed = 0
for filename in sorted(html_files):
    filepath = os.path.join(HTML_DIR, filename)
    print(f"\nProcessing {filename}...")
    if fix_html_file(filepath):
        changed += 1

print(f"\nTotal files changed: {changed}/{len(html_files)}")

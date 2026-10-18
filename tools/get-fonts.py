import re, subprocess, os
root = '/opt/data/projects/vesper-website-20261018'
css = open(os.path.join(root, 'refs/fonts.css')).read()
blocks = re.findall(r'@font-face\s*\{([^}]*)\}', css)
for b in blocks:
    fam = re.search(r"font-family:\s*'([^']+)'", b).group(1)
    style = re.search(r"font-style:\s*(\w+)", b).group(1)
    wt = re.search(r"font-weight:\s*(\d+)", b).group(1)
    url = re.search(r"url\((https://[^)]+)\)", b).group(1)
    ur = re.search(r"unicode-range:\s*([^;]+);", b)
    ur = ur.group(1) if ur else ''
    if 'U+0000-00FF' not in ur:
        continue
    slug = fam.lower().replace(' ', '-') + '-' + (wt if style == 'normal' else 'italic')
    dest = os.path.join(root, 'assets/fonts', slug + '.woff2')
    subprocess.run(['curl', '-s', '--max-time', '40', '-o', dest, url], check=True)
    print(slug, os.path.getsize(dest), 'bytes')

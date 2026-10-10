#!/usr/bin/env python3
"""Build the static demo site (GitHub Pages) from dist/ + demo/demo.js.

The theme files are copied unchanged except for root-absolute paths, which become
relative so the site also works under a sub-path such as /Komari-Theme-Horizon/.
Usage: python3 tools/build-demo.py [out_dir]   (default: _site)
"""
import json, pathlib, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / '_site').resolve()
REPO = 'https://github.com/Dowsion-dev/Komari-Theme-Horizon'
VERSION = json.loads((ROOT / 'komari-theme.json').read_text(encoding='utf-8'))['version']

REWRITES = {
    'index.html': [
        ('href="/favicon.svg"', 'href="favicon.svg"'),
        ('"/assets/', '"assets/'),
        ('<title>Komari Monitor</title>', '<title>Horizon · Komari 主题演示</title>'),
        ('A simple server monitor tool.', 'Horizon — 高密度控制台风格的 Komari Monitor 主题（演示站，数据为模拟）'),
    ],
    'assets/app.js': [
        ("src=\"/flags/", "src=\"flags/"),
        ('href="/"', 'href="./"'),
        ('href="/?view=theme-manage"', 'href="?view=theme-manage"'),
        ('href="/admin"', 'href="' + REPO + '" target="_blank" rel="noopener"'),
        ("_t('Control Room', '控制台') : _t('Admin Login', '后台登录')", "'GitHub' : 'GitHub'"),
        ("'/assets/manage.js", "'assets/manage.js"),
    ],
    'assets/manage.js': [
        ('href="/"', 'href="./"'),
        ('href="/admin/ping"', 'href="' + REPO + '"'),
    ],
}


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / 'dist', OUT)
    for rel, pairs in REWRITES.items():
        f = OUT / rel
        s = f.read_text(encoding='utf-8')
        for a, b in pairs:
            if a not in s:
                sys.exit(f'build-demo: pattern not found in {rel}: {a!r}')
            s = s.replace(a, b)
        f.write_text(s, encoding='utf-8')
    # the simulated backend must load before the theme scripts
    shutil.copy(ROOT / 'demo' / 'demo.js', OUT / 'demo.js')
    idx = OUT / 'index.html'
    s = idx.read_text(encoding='utf-8')
    tag = f'    <script src="demo.js?v={VERSION}"></script>\n'
    anchor = '    <link rel="stylesheet" href="assets/app.css'
    if anchor not in s:
        sys.exit('build-demo: stylesheet anchor not found in index.html')
    idx.write_text(s.replace(anchor, tag + anchor, 1), encoding='utf-8')
    for p in ['assets/app.js', 'assets/manage.js', 'index.html']:
        left = [ln for ln in (OUT / p).read_text(encoding='utf-8').splitlines() if "'/api/" not in ln and ("=\"/" in ln and 'href="/' in ln)]
        if left:
            sys.exit(f'build-demo: absolute href left in {p}: {left[0].strip()[:120]}')
    (OUT / '.nojekyll').write_text('')
    # custom domain for GitHub Pages: put the bare host name (e.g. demo.example.com) in demo/CNAME
    cname = ROOT / 'demo' / 'CNAME'
    if cname.exists() and cname.read_text().strip():
        (OUT / 'CNAME').write_text(cname.read_text().strip() + '\n')
    print(f'demo site → {OUT} (Horizon v{VERSION})')


if __name__ == '__main__':
    main()

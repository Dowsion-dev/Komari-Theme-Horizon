"""Bump the theme version and the cache-busting ?v= on every asset URL: python3 tools/bump.py 1.3.7"""
import json, re, sys
V = sys.argv[1]
d = json.load(open('komari-theme.json')); d['version'] = V
json.dump(d, open('komari-theme.json', 'w'), ensure_ascii=False, indent=2)
p = 'dist/index.html'; s = open(p).read()
s = re.sub(r'/assets/(app\.css|icons\.js|app\.js)(\?v=[^"]*)?"', lambda m: '/assets/%s?v=%s"' % (m.group(1), V), s)
open(p, 'w').write(s)
p = 'dist/assets/app.js'; s = open(p).read()
s = re.sub(r"/assets/manage\.js\?v=[^']*'", "/assets/manage.js?v=%s'" % V, s)
open(p, 'w').write(s)
print('version', V)

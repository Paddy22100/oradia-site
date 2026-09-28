# Remplace le CDN Tailwind (cdn.tailwindcss.com + config inline) par les feuilles
# compilées assets/tailwind*.css (voir tailwind.config.js). Idempotent.
# Le lien est placé juste avant </head>, là où le CDN injectait sa feuille (à la fin
# du <head>) : l'ordre de la cascade face à style.css et aux <style> reste identique.
import re, glob, sys

CDN = re.compile(r'[ \t]*<script[^>]*src="https://cdn\.tailwindcss\.com[^"]*"[^>]*>\s*(?:<\\?/script>)\s*\n?')
CONFIG = re.compile(r'[ \t]*<script>\s*tailwind\.config\s*=\s*\{.*?</script>\s*\n?', re.S)

def variant(path, html):
    if path.endswith('livraison.html'):
        return 'tailwind-livraison.css'
    m = CONFIG.search(html)
    if not m:
        return 'tailwind-default.css'
    if '#040d1c' in m.group(0):
        return 'tailwind-guidance.css'
    return 'tailwind.css'

changed = []
for path in sorted(glob.glob('**/*.html', recursive=True)):
    if path.startswith(('node_modules', 'assets')):
        continue
    html = open(path, encoding='utf-8').read()
    if 'cdn.tailwindcss.com' not in html:
        continue
    css = variant(path, html)
    cfg = CONFIG.search(html)
    if cfg and cfg.group(0).count('<script') == 1 and re.sub(r'tailwind\.config\s*=\s*\{.*\}\s*;?', '', re.search(r'<script>(.*?)</script>', cfg.group(0), re.S).group(1), flags=re.S).strip() == '':
        html = html.replace(cfg.group(0), '', 1)
    elif cfg:
        print('config non retirée (script mixte) :', path)
    html, n = CDN.subn('', html, count=1)
    if n != 1:
        print('CDN non trouvé :', path); continue
    link = f'    <link rel="stylesheet" href="/assets/{css}">\n'
    html = re.sub(r'([ \t]*)</head>', lambda m: link + m.group(1) + '</head>', html, count=1)
    open(path, 'w', encoding='utf-8').write(html)
    changed.append((path, css))

from collections import Counter
print(len(changed), 'pages', Counter(c for _, c in changed))

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera a versao de arquivo unico (dist/livro-de-cantos.html) a partir de
index.html + styles.css + app.js + assets/.

E essa versao unica que se publica como Artifact no Claude: la a pagina
precisa ser autocontida (nada de arquivos ao lado). Para hospedar em
servidor comum (GitHub Pages, Netlify, Vercel, IIS...), publique a pasta
como esta -- nao precisa rodar este script.

Uso:  python build.py
"""
import base64, os, re, mimetypes

RAIZ = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(RAIZ, "dist")

def ler(*p):
    with open(os.path.join(RAIZ, *p), encoding="utf8") as f:
        return f.read()

def embutir_assets(css):
    """Troca url(assets/x.png) pelo data: URI correspondente."""
    def troca(m):
        rel = m.group(1)
        caminho = os.path.join(RAIZ, rel)
        if not os.path.exists(caminho):
            return m.group(0)
        tipo = mimetypes.guess_type(caminho)[0] or "application/octet-stream"
        with open(caminho, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        return "url(data:%s;base64,%s)" % (tipo, b64)
    return re.sub(r'url\((assets/[^)]+)\)', troca, css)

def main():
    html = ler("index.html")
    css = embutir_assets(ler("styles.css"))
    js = ler("app.js")

    html = html.replace('<link rel="stylesheet" href="styles.css">',
                        "<style>\n%s\n</style>" % css)
    
    if os.path.exists(os.path.join(RAIZ, "config.js")):
        cfg_js = ler("config.js")
        html = html.replace('<script src="config.js"></script>',
                            "<script>\n%s\n</script>" % cfg_js)
    
    if os.path.exists(os.path.join(RAIZ, "supabase-adapter.js")):
        adp_js = ler("supabase-adapter.js")
        html = html.replace('<script src="supabase-adapter.js"></script>',
                            "<script>\n%s\n</script>" % adp_js)

    html = html.replace('<script src="app.js"></script>',
                        "<script>\n%s\n</script>" % js)

    os.makedirs(DIST, exist_ok=True)
    saida = os.path.join(DIST, "livro-de-cantos.html")
    with open(saida, "w", encoding="utf8") as f:
        f.write(html)
    print("gerado: %s (%.0f KB)" % (saida, os.path.getsize(saida) / 1024))

if __name__ == "__main__":
    main()

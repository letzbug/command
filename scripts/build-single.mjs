// Builds self-contained HTML files (JS + CSS inlined) for static hosting (GitHub Pages)
// or as a claude.ai artifact. Usage: node scripts/build-single.mjs [--dev]
//   dist-single/index.html  planning tool (UniPop COMMAND)
//   dist-single/carte.html  public display (UniPop Live Map)
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const dev = process.argv.includes('--dev');

async function page(entry, out, title, themeColor) {
  const res = await build({
    entryPoints: [entry], bundle: true, write: false, outdir: 'dist-single', format: 'iife', target: 'es2020',
    minify: !dev, jsx: 'automatic', loader: { '.css': 'css' }, legalComments: 'none',
    define: { 'import.meta.env': JSON.stringify({ MODE: 'single', PROD: true }), 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    logLevel: 'warning',
  });
  const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
  const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const html = `<!doctype html>
<html lang="fr-LU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${themeColor}">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;
  mkdirSync('dist-single', { recursive: true });
  writeFileSync(out, html);
  console.log(`${out} ${(html.length / 1024).toFixed(0)} KB`);
}

await page('src/main.tsx', 'dist-single/index.html', 'UniPop COMMAND — Planification & coordination', '#12203A');
await page('src/display/carte.tsx', 'dist-single/carte.html', 'UniPop Live Map — Le Luxembourg en mouvement', '#F3F5F8');

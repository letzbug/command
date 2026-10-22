// Builds one self-contained HTML file (JS + CSS inlined) for hosting as a
// claude.ai artifact or any static host. Usage: node scripts/build-single.mjs [--dev]
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const res = await build({
  entryPoints: ['src/main.tsx'], bundle: true, write: false, outdir: 'dist-single', format: 'iife', target: 'es2020',
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
<meta name="theme-color" content="#12203A">
<title>UniPop COMMAND — Planification & coordination</title>
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
writeFileSync('dist-single/index.html', html);
console.log(`dist-single/index.html ${(html.length / 1024).toFixed(0)} KB`);

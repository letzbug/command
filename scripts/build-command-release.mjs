import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const res = await build({
  entryPoints: ['src/cloud-main.tsx'], bundle: true, write: false,
  outdir: 'dist-command-release', format: 'iife', target: 'es2020',
  minify: true, jsx: 'automatic', loader: { '.css': 'css' }, legalComments: 'none',
  define: { 'import.meta.env': JSON.stringify({ MODE: 'single', PROD: true }), 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const js = res.outputFiles.find(x => x.path.endsWith('.js'))?.text;
if (!js) throw new Error('Cloud JavaScript missing');
const css = res.outputFiles.find(x => x.path.endsWith('.css'))?.text ?? '';
const html = `<!doctype html><html lang="fr-LU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniPop COMMAND</title><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
if (!html.includes('functions/v1/dynamic-function') || !html.includes('nhprnkesgjhlqgklzpxu.supabase.co')) throw new Error('Cloud config missing');
mkdirSync('dist-command-release', { recursive: true });
writeFileSync('dist-command-release/index.html', html);
console.log('COMMAND release index.html built:', Buffer.byteLength(html), 'bytes');

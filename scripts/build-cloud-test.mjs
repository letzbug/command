import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const res = await build({ entryPoints:['src/cloud-main.tsx'], bundle:true, write:false, outdir:'dist-cloud-test',
  format:'iife', target:'es2020', minify:true, jsx:'automatic', loader:{'.css':'css'}, legalComments:'none',
  define:{'import.meta.env': JSON.stringify({MODE:'single',PROD:true}),'process.env.NODE_ENV':'"production"'}, logLevel:'warning'});
const js=res.outputFiles.find(x=>x.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
const css=res.outputFiles.find(x=>x.path.endsWith('.css'))?.text??'';
const html=`<!doctype html><html lang="fr-LU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniPop COMMAND Cloud TEST</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
mkdirSync('dist-cloud-test',{recursive:true});writeFileSync('dist-cloud-test/command-cloud-test.html',html);
console.log(`Cloud TEST ready: ${html.length} bytes`);

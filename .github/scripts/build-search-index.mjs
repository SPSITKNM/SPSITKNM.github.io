// Zostaví search-index.json z content/*.json + .md súborov v sibling repozitároch.
// Beží v GitHub Action aj lokálne: `node .github/scripts/build-search-index.mjs`
import { readFile, writeFile } from 'node:fs/promises';

const SUBJECTS = { pro: 'SPSITKNM', sxg: 'SXG', oop: 'oop_opakovanie' };
const RAW = 'https://raw.githubusercontent.com/SPSITKNM';
const BASE = '';

function stripCode(md) { return md.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' '); }
function headings(md) {
  const out = [];
  for (const m of stripCode(md).matchAll(/^(#{1,3})\s+(.+?)\s*#*$/gm)) {
    const t = m[2].replace(/[`*_]/g, '').trim();
    if (t && !/^include\b/i.test(t)) out.push(t);
  }
  return out;
}
function lead(md) {
  const txt = stripCode(md).replace(/^#{1,6}\s+.*$/gm, '').replace(/[>*_`|#-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return txt.slice(0, 600);
}

const index = [];
for (const [s, repo] of Object.entries(SUBJECTS)) {
  const set = JSON.parse(await readFile(new URL(`../../content/${s}.json`, import.meta.url), 'utf8'));
  for (const d of set.docs || []) {
    let md = '';
    try {
      const r = await fetch(`${RAW}/${repo}/main/${encodeURIComponent(d.file)}`);
      if (r.ok) md = await r.text();
    } catch { /* preskoč */ }
    index.push({
      id: index.length,
      subject: s,
      title: d.title,
      snippet: d.desc || lead(md).slice(0, 160),
      file: d.file,
      kind: d.kind || 'skripta',
      headings: [...new Set([...(d.headings || []), ...headings(md)])].join(' '),
      body: lead(md),
      url: `/citacka.html?s=${s}&doc=${d.slug}`
    });
  }
}

const json = JSON.stringify(index);
const path = new URL('../../search-index.json', import.meta.url);
let prev = '';
try { prev = await readFile(path, 'utf8'); } catch {}
if (prev.trim() === json.trim()) { console.log('search-index.json bez zmeny'); process.exit(0); }
await writeFile(path, json + '\n');
console.log(`search-index.json: ${index.length} dokumentov`);

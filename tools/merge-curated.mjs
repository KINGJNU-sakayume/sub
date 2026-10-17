/* curated-draft.mjs에서 주석 아닌 항목을 data.js의 CURATED에 합쳐요.
   node tools/merge-curated.mjs [--dry] [--draft 파일] [--data 파일]
   - 이미 있는 장소(같은 역, 같은 이름)는 건너뛰고, 기존 항목과 순서는 그대로 둬요.
   - --dry 는 바뀔 내용만 보여 주고 파일은 건드리지 않아요. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dry = args.includes('--dry');
const dataPath = path.resolve(opt('--data', path.join(here, '..', 'data.js')));
const draftPath = path.resolve(opt('--draft', path.join(here, 'curated-draft.mjs')));

const loadData = (src) => {
  const box = { window: {} };
  vm.runInNewContext(src, box, { filename: dataPath });
  return box.window.METRO;
};

const src = fs.readFileSync(dataPath, 'utf8');
const { LINES, CURATED } = loadData(src);
const stations = new Set();
LINES.forEach((L) => L.tracks.forEach((t) => t.s.forEach((n) => stations.add(n))));
const draft = (await import(pathToFileURL(draftPath).href)).default;

const KINDS = ['명소', '맛집'];
const norm = (s) => String(s).replace(/\s+/g, '');
const merged = Object.fromEntries(Object.entries(CURATED).map(([k, v]) => [k, v.slice()]));
const added = [], skipped = [], warnings = [];

for (const [st, items] of Object.entries(draft)) {
  if (!stations.has(st)) { warnings.push(`data.js에 없는 역: ${st}`); continue; }
  for (const it of items) {
    const ok = Array.isArray(it) && (it.length === 3 || it.length === 4) && KINDS.includes(it[0]) &&
      it.slice(1).every((x) => typeof x === 'string' && x.trim());
    if (!ok) { warnings.push(`형식 오류 (${st}): ${JSON.stringify(it)}`); continue; }
    const list = merged[st] || (merged[st] = []);
    if (list.some((p) => norm(p[1]) === norm(it[1]))) { skipped.push(`${st} · ${it[1]}`); continue; }
    list.push(it.slice());
    added.push(`${st} · [${it[0]}] ${it[1]} — ${it[2]}${it[3] ? ` (검색어: ${it[3]})` : ''}`);
  }
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const body = Object.entries(merged)
  .filter(([, v]) => v.length)
  .map(([k, v]) => `    ${q(k)}: [${v.map((p) => '[' + p.map(q).join(', ') + ']').join(', ')}],`)
  .join('\n');

const start = src.indexOf('  const CURATED = {\n');
const end = src.indexOf('\n  };\n', start);
if (start < 0 || end < 0) { console.error('data.js에서 CURATED 블록을 찾지 못했어요.'); process.exit(1); }
const head = src.slice(0, start) + '  const CURATED = {\n';
const out = head + body + src.slice(end);

const check = loadData(out).CURATED;
const before = Object.values(CURATED).flat().length, after = Object.values(check).flat().length;
if (after !== before + added.length) { console.error('합친 결과 개수가 맞지 않아요. 파일을 쓰지 않았어요.'); process.exit(1); }

warnings.forEach((w) => console.warn('경고: ' + w));
console.log(`추가 ${added.length}개, 이미 있어서 건너뜀 ${skipped.length}개 (CURATED ${before} → ${after}개 항목, ${Object.keys(check).length}개 역)`);
added.forEach((a) => console.log('  + ' + a));
if (skipped.length) console.log('건너뜀: ' + skipped.join(', '));
if (dry) { console.log('\n--dry: data.js는 바꾸지 않았어요.'); process.exit(0); }
if (out === src) { console.log('바뀐 내용이 없어요.'); process.exit(0); }
fs.writeFileSync(dataPath, out);
console.log(`\n${path.relative(process.cwd(), dataPath)}에 반영했어요.`);

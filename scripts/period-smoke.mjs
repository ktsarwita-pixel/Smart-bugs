import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/game/period.ts', import.meta.url), 'utf8');
const js = ts.transpile(source, { module: ts.ModuleKind.ESNext });
const { periodForRound } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
for (const [n, p, r, length] of [[0,1,1,4],[3,1,4,4],[4,2,1,5],[8,2,5,5],[9,3,1,6],[14,3,6,6],[15,4,1,7],[21,4,7,7],[22,5,1,7],[36,7,1,7]]) {
  assert.deepEqual(periodForRound(n), { period: p, round: r, length });
}
console.log('Period boundaries and seven-round cap passed.');

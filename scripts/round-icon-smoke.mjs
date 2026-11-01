import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const bundled = await build({entryPoints:['src/game/round-icons.ts', 'src/game/build-mode.ts'],bundle:true,platform:'node',format:'esm',outdir:'ignored',write:false});
const load = async name => {
  const output = bundled.outputFiles.find(file => file.path.endsWith(`${name}.js`));
  return import(`data:text/javascript;base64,${Buffer.from(output.contents).toString('base64')}`);
};
const icons = await load('round-icons');
const {isAdvancedGameLocation} = await load('build-mode');
for (const [pathname,search,expected] of [
  ['/','?advenced',true], ['/','?advenced=1',true], ['/preview/','',true],
  ['/','',false], ['/','?advanced',false], ['/advanced','',false],
]) assert.equal(isAdvancedGameLocation({pathname,search}),expected,`${pathname}${search}`);

for (const [name,rows] of [['chest',icons.ADVANCED_CHEST_PIXELS], ['stag beetle',icons.ADVANCED_STAG_PIXELS]]) {
  assert.equal(rows.length,16);
  for (const row of rows) {
    assert.equal(row.length,16,`${name}: grid width`);
    assert.equal(row,[...row].reverse().join(''),`${name}: uneven silhouette`);
    assert.match(row,/^[.osmlh]+$/);
  }
  const ink = rows.flatMap((row,y)=>[...row].flatMap((pixel,x)=>pixel!=='.'?[[x,y]]:[]));
  assert.equal(Math.min(...ink.map(c=>c[0]))+Math.max(...ink.map(c=>c[0])),15);
  assert.equal(Math.min(...ink.map(c=>c[1]))+Math.max(...ink.map(c=>c[1])),15);
  assert.equal(new Set(rows.join('').replaceAll('.','')).size,5,`${name}: missing a shading layer`);
}
assert.match(icons.ADVANCED_CHEST_PIXELS[9], /hooh/, 'chest needs a central keyhole');
assert.match(icons.ADVANCED_CHEST_PIXELS[12], /mllm/, "round-map chest shares the centered maker's mark");
assert.match(icons.ADVANCED_CHEST_PIXELS[7], /^oo[l]+oo$/, 'chest needs a symmetric bright lid band');
assert.ok(icons.ADVANCED_STAG_PIXELS[1].includes('lh'), 'stag needs inward-hooked mandible tips');
assert.ok(icons.ADVANCED_STAG_PIXELS[11].startsWith('msss'), 'stag needs visible paired legs');

const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
try {
  await page.goto(base+'/?advenced');
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  const track = page.locator('.round-track--compact');
  assert.match(await track.getAttribute('aria-label'), /PERIOD 1.*ROUND 1\/4/);
  assert.deepEqual(await track.locator('svg').evaluateAll(svgs=>svgs.map(svg=>svg.dataset.sprite)), ['chest','stag','stag','chest']);
  assert.deepEqual(await track.locator('.round-track__cell').evaluateAll(cells=>cells.map(cell=>cell.dataset.state)), ['current','future','future','future']);
  for (const width of [280,320,384,768]) {
    await page.setViewportSize({width,height:725});
    for (const count of [6,7]) {
      const measurements = await track.evaluate((track,count)=>{
        const oldCount=track.dataset.roundCount, deck=track.closest('.deck-row'), oldLong=deck.dataset.longPeriod;
        track.dataset.roundCount=String(count); deck.dataset.longPeriod='1';
        const wrap=track.querySelector('.round-track__cells');
        const originals=[...wrap.children];
        while(wrap.children.length<count) wrap.appendChild(originals[wrap.children.length%originals.length].cloneNode(true));
        const cells=[...wrap.children]; cells.forEach((cell,i)=>cell.dataset.state=['past','current','future'][i%3]);
        const a=cells.map(cell=>{
          const c=cell.getBoundingClientRect(),svg=cell.querySelector('svg'),s=svg.getBoundingClientRect(),ink=svg.getBBox(),v=svg.viewBox.baseVal;
          return {dx:Math.abs(c.left+c.width/2-s.left-s.width/2),dy:Math.abs(c.top+c.height/2-s.top-s.height/2),ix:ink.x+ink.width/2,iy:ink.y+ink.height/2,vx:v.width/2,vy:v.height/2,size:s.width};
        });
        const rect = el => {const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
        const bounds=rect(track),parent=rect(track.parentElement),resources=rect(deck.querySelector('.deck-resources')),help=rect(deck.querySelector('.help-btn'));
        const last=cells.at(-1).getBoundingClientRect().right;
        cells.slice(originals.length).forEach(c=>c.remove()); track.dataset.roundCount=oldCount;
        if (oldLong === undefined) delete deck.dataset.longPeriod; else deck.dataset.longPeriod=oldLong;
        return {a,bounds,parent,last,resources,help};
      },count);
      const intersects = (a,b) => a.left < b.right-0.1 && a.right > b.left+0.1 && a.top < b.bottom-0.1 && a.bottom > b.top+0.1;
      for (const m of measurements.a) {
        assert.ok(m.dx<0.1&&m.dy<0.1,`${width}px/${count}: cell misaligned ${JSON.stringify(m)}`);
        assert.equal(m.ix,m.vx); assert.equal(m.iy,m.vy);
        assert.ok(m.size>=14,`${width}px/${count}: artwork is too small to read`);
      }
      assert.ok(measurements.bounds.left>=0&&measurements.bounds.right<=width&&measurements.last<=measurements.bounds.right,`${width}px/${count}: track clips viewport`);
      assert.ok(measurements.bounds.left>=measurements.parent.left-1&&measurements.bounds.right<=measurements.parent.right+1,`${width}px/${count}: track crosses its deck cluster`);
      assert.ok(!intersects(measurements.bounds,measurements.resources),`${width}px/${count}: track covers resources`);
      assert.ok(!intersects(measurements.bounds,measurements.help),`${width}px/${count}: track covers help`);
    }
  }
  await page.goto(base+'/');
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  assert.equal(await page.locator('.round-track--advanced, [data-sprite="chest"], [data-sprite="stag"]').count(),0,'plain URL must not use test-build sprites');
  assert.deepEqual(errors,[]);
  console.log('PASS shaded chest/stag pixel art, opt-in routing, accessible states and 6–7-cell layouts at 280–768px');
} finally {await browser.close();}

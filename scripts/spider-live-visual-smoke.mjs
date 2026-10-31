import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

/** Real-browser proof for the replacement Spider opener. */
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const potato=process.env.POTATO==='1', reduced=process.env.REDUCED==='1';
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5191')+'/?advenced');
  await page.evaluate(({potato,reduced})=>{
    sessionStorage.setItem('smartbugs.admin.unlocked','1');
    localStorage.setItem('smartbugs.speed','1');
    localStorage.setItem('smartbugs.settings',JSON.stringify({motion:reduced?'reduced':'full',lang:'en',potato,background:'dark'}));
  },{potato,reduced});
  await page.reload();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  await page.getByRole('button',{name:'Open admin panel'}).first().tap();
  await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
  await page.getByLabel('Admin command').fill('give spider 3');
  await page.getByRole('button',{name:'RUN',exact:true}).tap();
  await page.getByRole('button',{name:'Close admin panel'}).tap();
  await page.evaluate(()=>{
    window.__roarMarks=[]; window.__roarWords=[]; window.__grandGrowth=[];
    new MutationObserver(changes=>{
      for(const change of changes){
        if(change.type==='attributes'){
          const el=change.target;
          if(change.attributeName==='data-roar-progress'){
            const value=el.getAttribute('data-roar-progress');
            if(value!==null) window.__roarMarks.push([performance.now(),Number(value),el.style.transform]);
          }
          if(change.attributeName==='data-web-growth') window.__grandGrowth.push(el.getAttribute('data-web-growth'));
        }
        for(const node of change.addedNodes){
          if(!(node instanceof HTMLElement)) continue;
          const candidates=[node,...node.querySelectorAll('.ov-pop')];
          for(const el of candidates) if(el.classList?.contains('ov-pop')) window.__roarWords.push(el.textContent||'');
        }
      }
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-roar-progress','data-web-growth']});
  });
  await page.getByRole('button',{name:/Engage battle/}).tap();
  const roaring=page.locator('.ov-unit[data-species="spider"][data-roaring="true"]');
  await roaring.waitFor({state:'attached',timeout:15000});
  await page.waitForFunction(reduced=>reduced ? window.__roarMarks.length>=3 : window.__roarMarks.some(([,v])=>v>=75),reduced,{timeout:5000});
  await page.waitForFunction(()=>!document.querySelector('.ov-unit[data-species="spider"][data-roaring="true"]'),null,{timeout:5000});
  await page.waitForFunction(()=>window.__roarWords.includes('650'),null,{timeout:3000});
  const proof=await page.evaluate(()=>({marks:window.__roarMarks,words:window.__roarWords,growth:window.__grandGrowth}));
  const values=proof.marks.map(([,v])=>v);
  assert.ok(values.length>=3,`roar needs several rendered frames: ${values}`);
  if (reduced) assert.ok(values.every(v=>v===50),`reduced motion should hold one clear roar pose: ${values}`);
  else {
    assert.ok(values.length>=5,`roar needs several visible animation frames: ${values}`);
    assert.ok(Math.min(...values)<=15,`roar must begin near its planted pose: ${values}`);
    assert.ok(Math.max(...values)>=75,`roar pose must visibly progress: ${values}`);
  }
  assert.ok(proof.words.includes('ROAR!'),'opening roar callout missing');
  assert.ok(proof.words.includes('650'),'650 impact popup missing');
  assert.deepEqual(proof.growth,[],'removed whole-board web must never render');
  assert.deepEqual(errors,[]);
  console.log(`PASS real Spider roar animation and 650 impact (potato=${potato}, reduced=${reduced}):`,values.join(','));
} finally { await browser.close(); }

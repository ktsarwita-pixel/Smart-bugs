import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

/** Real-game proof: the cast, damage and new cues are all driven by battle. */
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const potato=process.env.POTATO==='1', reduced=process.env.REDUCED==='1', speed=process.env.SPEED||'1';
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5173')+'/?advenced');
  await page.evaluate(({potato,reduced,speed})=>{
    sessionStorage.setItem('smartbugs.admin.unlocked','1');
    localStorage.setItem('smartbugs.speed',speed);
    localStorage.setItem('smartbugs.settings',JSON.stringify({motion:reduced?'reduced':'full',lang:'en',potato,background:'dark'}));
  },{potato,reduced,speed});
  await page.reload();
  await page.getByRole('button',{name:'PLAY MATCH'}).tap();
  await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
  await page.getByRole('button',{name:'Open admin panel'}).first().tap();
  await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
  await page.getByLabel('Admin command').fill('give spider 3');
  await page.getByRole('button',{name:'RUN',exact:true}).tap();
  await page.getByRole('button',{name:'Close admin panel'}).tap();
  await page.locator('.selected-actions').getByRole('button',{name:'DEPLOY'}).tap();
  await page.waitForFunction(()=>document.querySelector('.ov-unit[data-species="spider"]')?.dataset.spiderFacing,null,{timeout:15000,polling:100});
  assert.ok(Math.abs(Number(await page.locator('.ov-unit[data-species="spider"]').first().getAttribute('data-spider-facing'))-Math.PI)<.0001,'live prep Spider must face the player');
  await page.evaluate(()=>{
    window.__roarPoses=[]; window.__roarMarks=[]; window.__roarWords=[]; window.__grandGrowth=[]; window.__cues=[]; window.__waveFrames=[]; window.__bannerOpacity=[];
    new MutationObserver(changes=>{
      for(const change of changes){
        if(change.type==='attributes'){
          const el=change.target;
          if(change.attributeName==='data-roar-progress'){
            const value=el.getAttribute('data-roar-progress');
            if(value!==null) {
              window.__roarMarks.push([performance.now(),Number(value)]);
              window.__roarPoses.push({facing:el.dataset.roarFacing,body:el.dataset.roarBody,head:el.dataset.roarHeadYaw});
              const cue=document.querySelector('.roar-cue[data-roar-cue="charging"]');
              if(cue) window.__waveFrames.push([...cue.querySelectorAll('.roar-cue__wave')].map(w=>w.style.transform).join(','));
              if(Number(value)>=30) {
                const flare=document.querySelector('.fight-flare');
                window.__bannerOpacity.push(flare ? Number(getComputedStyle(flare).opacity) : 0);
              }
            }
          }
          if(change.attributeName==='data-roar-cue') {
            const waves=[...el.querySelectorAll('.roar-cue__wave')].map(w=>w.style.transform);
            window.__cues.push({state:el.dataset.roarCue, text:el.textContent, waves, result:!!document.querySelector('.result-card')});
          }
          if(change.attributeName==='data-web-growth') window.__grandGrowth.push(el.getAttribute('data-web-growth'));
        }
        for(const node of change.addedNodes){
          if(!(node instanceof HTMLElement)) continue;
          const candidates=[node,...node.querySelectorAll('.ov-pop')];
          for(const el of candidates) if(el.classList?.contains('ov-pop')) window.__roarWords.push(el.textContent||'');
        }
      }
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-roar-progress','data-roar-cue','data-web-growth']});
  });
  await page.getByRole('button',{name:/Engage battle/}).tap();
  await page.waitForFunction(()=>window.__cues.some(c=>c.state==='impact'),null,{timeout:20000,polling:100});
  await page.waitForFunction(()=>window.__roarWords.includes('650'),null,{timeout:10000,polling:100});
  const proof=await page.evaluate(()=>({marks:window.__roarMarks,poses:window.__roarPoses,words:window.__roarWords,growth:window.__grandGrowth,cues:window.__cues,waveFrames:window.__waveFrames,banner:window.__bannerOpacity}));
  const values=proof.marks.map(([,v])=>v), charging=proof.cues.filter(c=>c.state==='charging'), impact=proof.cues.find(c=>c.state==='impact');
  assert.ok(values.length>=2,`roar needs rendered frames: ${values}`);
  assert.ok(proof.poses.every(p=>Math.abs(Number(p.facing)-Math.PI)<.0001 && p.head==='0.00000' && p.body),`live Spider must stay front-facing: ${JSON.stringify(proof.poses)}`);
  assert.equal(new Set(proof.poses.map(p=>p.body)).size,1,'live Spider body must not rotate during roar');
  if (reduced) {
    assert.ok(values.every(v=>v===50),`reduced motion should hold one clear roar pose: ${values}`);
    assert.equal(new Set(proof.waveFrames).size,1,'reduced motion waves must not pulse');
  } else {
    assert.ok(Math.min(...values)<=15,`roar must begin near its planted pose: ${values}`);
    if(speed==='1') assert.ok(Math.max(...values)>=45,`roar pose must visibly progress: ${values}`);
    assert.ok(new Set(proof.waveFrames).size>=2,'pressure waves must move with battle time');
    if (proof.banner.length) assert.ok(Math.min(...proof.banner)<.4,'fight banner must not obscure the roar');
  }
  assert.ok(charging.some(c=>c.text.includes('ROAR!')),'opening roar badge missing');
  assert.ok(impact.text.includes('IMPACT!'),'impact badge missing');
  assert.equal(impact.result,false,'the result must not cover an unseen impact');
  assert.ok(proof.words.includes('ROAR!'),'opening roar callout missing');
  assert.ok(proof.words.includes('650'),'650 impact popup missing');
  assert.deepEqual(proof.growth,[],'removed whole-board web must never render');
  assert.deepEqual(errors,[]);
  console.log(`PASS live Spider roar and 650 impact (potato=${potato}, reduced=${reduced}, speed=${speed}):`,values.join(','));
} finally { await browser.close(); }

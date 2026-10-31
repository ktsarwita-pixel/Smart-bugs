import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reduced=process.env.REDUCED==='1', potato=process.env.POTATO==='1';
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:5191')+'/?advenced');
 await page.evaluate(({reduced,potato})=>{sessionStorage.setItem('smartbugs.admin.unlocked','1');localStorage.setItem('smartbugs.speed','1');localStorage.setItem('smartbugs.settings',JSON.stringify({motion:reduced?'reduced':'full',lang:'en',potato,background:'dark'}));},{reduced,potato});await page.reload();
 await page.getByRole('button',{name:'PLAY MATCH'}).tap(); await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
 await page.getByRole('button',{name:'Open admin panel'}).first().tap();await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
 await page.getByLabel('Admin command').fill('give spider 3');await page.getByRole('button',{name:'RUN',exact:true}).tap();await page.getByRole('button',{name:'Close admin panel'}).tap();
 await page.evaluate(()=>{window.__growth=[];new MutationObserver(changes=>{for(const change of changes){const v=change.target.getAttribute('data-web-growth');if(v!==null)window.__growth.push(Number(v));}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-web-growth']});});
 await page.getByRole('button',{name:/Engage battle/}).tap();
 await page.locator('.result-card').waitFor({timeout:45000});
 const values=await page.evaluate(()=>window.__growth);
 if (reduced) assert.ok(values.length && values.every(v=>v===100),`reduced motion should show the complete web immediately: ${values}`);
 else { assert.ok(values.length>=3,`need visible growth frames: ${values}`); assert.ok(Math.min(...values)<=30,`growth must start small: ${values}`); assert.ok(Math.max(...values)>=90,`growth must reach the drawer edges before results: ${values}`); }
 assert.deepEqual(errors,[]);console.log('PASS real battle web reveal:', values.join(','));
} finally { await browser.close(); }

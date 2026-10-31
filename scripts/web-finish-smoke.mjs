import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:5190')+'/?advenced');
 await page.evaluate(()=>sessionStorage.setItem('smartbugs.admin.unlocked','1'));await page.reload();
 await page.getByRole('button',{name:'PLAY MATCH'}).tap();await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
 await page.getByRole('button',{name:'Open admin panel'}).first().tap();await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
 await page.getByLabel('Admin command').fill('give spider 3'); await page.getByRole('button',{name:'RUN',exact:true}).tap(); await page.getByRole('button',{name:'Close admin panel'}).tap();
 await page.getByRole('button',{name:/Engage battle/}).tap(); await page.getByText('COMBAT TELEMETRY').waitFor();
 await page.getByRole('button',{name:'Open admin panel'}).first().tap();await page.getByRole('tab',{name:'MATCH'}).tap();const observed = await page.evaluate(async () => {
   const button = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === 'FORCE WIN');
   if (!button) throw Error('force button missing');
   button.click();
   await new Promise(resolve => setTimeout(resolve, 1000));
   return !!document.querySelector('.result-card');
 });
 assert.equal(observed,false,'fresh ultimate must be visible before results');
 await page.getByRole('button',{name:'Close admin panel'}).tap();
 await page.locator('.result-card').waitFor({timeout:10000}); assert.deepEqual(errors,[]);
 console.log('PASS fresh spider ultimate can finish revealing before the result');
} finally {await browser.close();}

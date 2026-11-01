import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:280,height:653},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
try {
  await page.goto(base+'/?advenced');
  assert.match(await page.locator('body').innerText(),/v0\.62/i,'advanced home shows v0.62');
  assert.doesNotMatch(await page.locator('body').innerText(),/v0\.63/i);
  await page.getByRole('button',{name:'PATCH NOTES'}).tap();
  const dialog=page.getByRole('dialog',{name:'PATCH NOTES'});
  const version=dialog.locator('.relative.mb-3').getByText('v0.62',{exact:true});
  assert.equal(await version.count(),1,'all changes appear in one v0.62 entry');
  assert.doesNotMatch(await dialog.innerText(),/0\.63/,'the patch must not look like a skipped release');
  assert.match(await dialog.locator('h3').innerText(),/v0\.62/,'current heading uses the same version');
  assert.equal(await dialog.getByText('v0.61',{exact:true}).count(),1,'previous version follows naturally');
  const entry=version.locator('..').locator('..');
  const text=await entry.innerText();
  assert.match(text,/CURRENT/); assert.match(text,/650 damage/); assert.match(text,/opposing side/); assert.match(text,/reward chest/); assert.match(text,/UI Doctor/);
  assert.match(text,/whole interface has a fresh field-lab look/); assert.match(text,/zoom the battlefield drawer in or out/); assert.match(text,/Colony health and the round map now have dedicated space/);
  assert.match(text,/main menu feels softer and more natural/); assert.match(text,/roar cue and label are smaller/);
  assert.equal(await entry.locator('li').count(),11,'merged entry retains the gameplay and UI changes');
  for (const width of [280,320,390]) {
    await page.setViewportSize({width,height:653});
    const layout=await version.evaluate(el=>{
      const header=el.parentElement, r=header.getBoundingClientRect();
      return {scroll:header.scrollWidth,client:header.clientWidth,left:r.left,right:r.right,children:[...header.children].map(x=>x.getBoundingClientRect().toJSON())};
    });
    assert.ok(layout.left>=0&&layout.right<=width&&layout.scroll<=layout.client+1,`merged heading must fit ${width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.children.every(c=>c.left>=layout.left-1&&c.right<=layout.right+1),`heading labels must fit ${width}px`);
  }
  await page.evaluate(()=>localStorage.setItem('smartbugs.settings',JSON.stringify({rev:2,lang:'id',motion:'full',potato:false,background:'dark'})));
  await page.reload();
  await page.getByRole('button',{name:'CATATAN PEMBARUAN'}).tap();
  const indonesian=page.getByRole('dialog',{name:'CATATAN PEMBARUAN'});
  const merged=indonesian.locator('.relative.mb-3').getByText('v0.62',{exact:true}).locator('..').locator('..');
  assert.match(await merged.innerText(),/Laba-laba menghadap lurus ke sisi lawan/,'new correction is translated');
  assert.match(await merged.innerText(),/Peti VS/,'chest update remains translated');
  assert.match(await merged.innerText(),/Menu utama terasa lebih lembut dan alami/,'compact menu update is translated');
  assert.match(await merged.innerText(),/label raungan Laba-laba kini lebih kecil/,'smaller roar cue is translated');
  assert.match(await merged.innerText(),/memperbesar atau memperkecil laci pertempuran/,'drawer zoom note is translated');
  assert.deepEqual(errors,[]);
  console.log('PASS single v0.62 patch notes, retained changes, translations and narrow layouts');
} finally {await browser.close();}

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:280,height:653},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
try {
  await page.goto(base+'/?advenced');
  await page.getByRole('button',{name:'PATCH NOTES'}).tap();
  const dialog=page.getByRole('dialog',{name:'PATCH NOTES'});
  const version=dialog.getByText('v0.62–0.63',{exact:true});
  assert.equal(await version.count(),1,'versions are combined into one entry');
  assert.equal(await dialog.getByText('v0.62',{exact:true}).count(),0,'old 0.62 entry must not be duplicated');
  const entry=version.locator('..').locator('..');
  const text=await entry.innerText();
  assert.match(text,/650 damage/); assert.match(text,/opposing side/); assert.match(text,/reward chest/); assert.match(text,/UI Doctor/);
  assert.equal(await entry.locator('li').count(),7,'merged entry retains both sets of changes');
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
  const merged=indonesian.getByText('v0.62–0.63',{exact:true}).locator('..').locator('..');
  assert.match(await merged.innerText(),/Laba-laba menghadap lurus ke sisi lawan/,'new correction is translated');
  assert.match(await merged.innerText(),/Peti VS/,'chest update remains translated');
  assert.deepEqual(errors,[]);
  console.log('PASS merged 0.62–0.63 patch notes, retained changes, translations and narrow layouts');
} finally {await browser.close();}

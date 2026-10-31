import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reduced=false, potato=false;
const page=await browser.newPage({viewport:{width:384,height:725},isMobile:true,hasTouch:true}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:5191')+'/?advenced');
 await page.evaluate(({reduced,potato})=>{sessionStorage.setItem('smartbugs.admin.unlocked','1');localStorage.setItem('smartbugs.speed','1');localStorage.setItem('smartbugs.settings',JSON.stringify({motion:reduced?'reduced':'full',lang:'en',potato,background:'dark'}));},{reduced,potato});await page.reload();
 await page.getByRole('button',{name:'PLAY MATCH'}).tap(); await page.getByRole('button',{name:'BEGIN ROUND 1'}).first().tap();
 await page.getByRole('button',{name:'Open admin panel'}).first().tap();await page.getByRole('button',{name:'▸ ADVANCED — TYPE COMMANDS'}).tap();
 await page.getByLabel('Admin command').fill('give spider 3');await page.getByRole('button',{name:'RUN',exact:true}).tap();await page.getByRole('button',{name:'Close admin panel'}).tap();
 await page.evaluate(()=>{window.__growth=[];new MutationObserver(changes=>{for(const change of changes){const v=change.target.getAttribute('data-web-growth');if(v!==null)window.__growth.push(Number(v));}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-web-growth']});});
 const client=await page.context().newCDPSession(page); const frames=[];
 client.on('Page.screencastFrame', e=>{frames.push({data:e.data,time:e.metadata.timestamp*1000});void client.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
 await client.send('Page.startScreencast',{format:'jpeg',quality:85,everyNthFrame:1});
 await page.evaluate(()=>{window.__renderMarks=[];new MutationObserver(changes=>{const n=changes[0].target.getAttribute('data-web-growth');if(n!==null)window.__renderMarks.push([Date.now(),Number(n)]);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-web-growth']});});
 await page.getByRole('button',{name:/Engage battle/}).tap();
 await page.locator('.result-card').waitFor({timeout:45000});
 const marks=await page.evaluate(()=>window.__renderMarks); const resultTime=Date.now();
 await client.send('Page.stopScreencast');
 const pick=(value,delay)=>{
   const mark=marks.find(m=>m[1]>=value);assert.ok(mark,`missing growth ${value}: ${JSON.stringify(marks)}`);
   const viable=frames.filter(f=>f.time<resultTime-100); assert.ok(viable.length,'no visible frames');
   return viable.reduce((best,f)=>Math.abs(f.time-(mark[0]+delay))<Math.abs(best.time-(mark[0]+delay))?f:best).data;
 };
 assert.equal(marks[0]?.[1],0,'web must start at the one-tile footprint');
 const images=[pick(50,250),pick(100,1250)];
 const pixels=await page.evaluate(async images=>{
   const results=[];
   for (const src of images) {
     const img=new Image();img.src='data:image/jpeg;base64,'+src;await img.decode();
     const canvas=document.createElement('canvas');canvas.width=384;canvas.height=725;
     const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,384,725).data;
     let count=0,minX=384,maxX=0;
     // The original subtle silk, measured away from the central spider and health bars.
     for(let y=205;y<350;y++)for(let x=40;x<344;x++){
       if (x>110 && x<195) continue;
       const i=(y*384+x)*4,r=data[i],g=data[i+1],b=data[i+2];
       if(r>70&&g>65&&b>80&&b>g*1.05&&r<b*1.27){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
     }
     results.push({count,span:maxX-minX});
   }
   return results;
 },images);
 assert.ok(pixels[0].count>10,`partly grown web must be visible: ${JSON.stringify(pixels)}`);
 assert.ok(pixels[1].count>200,`full web must be visibly rendered on the board: ${JSON.stringify(pixels)}`);
 assert.ok(pixels[1].span>150,`full web must span the drawer: ${JSON.stringify(pixels)}`);
 assert.ok(pixels[1].count>pixels[0].count*1.5,`the visible web must expand, not just a state value: ${JSON.stringify(pixels)}`);
 assert.deepEqual(errors,[]);console.log('PASS actual rendered web expands before results:',pixels);

} finally { await browser.close(); }

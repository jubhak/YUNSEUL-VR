import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:900,height:600}});
const errors=[],external=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
// Offline-API verification: every external map service is deliberately blocked.
await page.route(/https:\/\/overpass|\/api\/overpass/,r=>{external.push(r.request().url());return r.abort();});
await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.querySelector('#overlay')?.classList.contains('hidden'),null,{timeout:90000});
await page.waitForTimeout(8000);
const initial=await page.evaluate(()=>{
 const d=window.__YUNSEUL_DEV__,p=d.player;
 return {position:p.position.toArray(),yaw:p.yaw,locked:p.locked,tiles:d.streamer.stats,signatures:(()=>{const a=[];d.scene.traverse(o=>{if(o.name?.startsWith('signature-'))a.push(o.name);});return a;})(),drawcalls:d.renderer.info.render.calls,triangles:d.renderer.info.render.triangles,modeButtons:document.querySelectorAll('.mode-btn,[data-action="lock"]').length};
});
await page.evaluate(()=>window.__YUNSEUL_DEV__.renderer.setAnimationLoop(null));
await page.keyboard.down('ArrowRight');await page.evaluate(()=>{for(let i=0;i<42;i++)window.__YUNSEUL_DEV__.player.update(1/60);});await page.keyboard.up('ArrowRight');
const afterTurn=await page.evaluate(()=>({position:window.__YUNSEUL_DEV__.player.position.toArray(),yaw:window.__YUNSEUL_DEV__.player.yaw}));
await page.keyboard.down('ArrowUp');await page.evaluate(()=>{for(let i=0;i<42;i++)window.__YUNSEUL_DEV__.player.update(1/60);});await page.keyboard.up('ArrowUp');
const afterWalk=await page.evaluate(()=>({position:window.__YUNSEUL_DEV__.player.position.toArray(),yaw:window.__YUNSEUL_DEV__.player.yaw}));
console.log('INITIAL',JSON.stringify(initial),'TURN',JSON.stringify(afterTurn),'WALK',JSON.stringify(afterWalk));
await page.evaluate(()=>{const d=window.__YUNSEUL_DEV__;d.renderer.render(d.scene,d.camera);});
await page.screenshot({path:'/home/user/yunseul-central-park.png',timeout:120000});
const destinations=await page.locator('#tour-select option').evaluateAll(opts=>opts.filter(o=>o.value).map(o=>({value:o.value,name:o.textContent})));
const tours=[];
for(const name of ['G타워','현대프리미엄 아울렛 송도','인천대학교 송도캠퍼스','아트센터 인천','잭니클라우스 골프클럽']) {
 const dest=destinations.find(d=>d.name===name);if(!dest)continue;
 await page.selectOption('#tour-select',dest.value);await page.waitForTimeout(5000);
 tours.push(await page.evaluate(()=>({position:window.__YUNSEUL_DEV__.player.position.toArray(),stats:window.__YUNSEUL_DEV__.streamer.stats,drawcalls:window.__YUNSEUL_DEV__.renderer.info.render.calls})));
 if(name==='G타워') {await page.evaluate(()=>{const d=window.__YUNSEUL_DEV__;d.renderer.render(d.scene,d.camera);});await page.screenshot({path:'/home/user/yunseul-g-tower.png',timeout:120000});}
}
const result={initial,afterTurn,afterWalk,destinations,tours,errors,externalMapRequests:external};
fs.writeFileSync('tests/browser-verification-updated.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
const moved=Math.hypot(afterWalk.position[0]-afterTurn.position[0],afterWalk.position[2]-afterTurn.position[2]);
if(errors.length||moved<1||initial.yaw===afterTurn.yaw||initial.modeButtons!==0||external.length)process.exitCode=1;

const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const [role,email] of [['coach','coach.presentacion@example.com'],['student','alumno.presentacion@example.com']]){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await context.newPage();
  await page.goto('http://192.168.0.10:5173/login');
  await page.getByLabel('Correo').fill(email); await page.getByLabel('Contraseña').fill('Presentacion2026!'); await page.locator('button[type=submit]').click();
  await page.waitForURL(role==='coach'?'**/dashboard':'**/home');
  if(role==='coach'){
   await page.goto('http://192.168.0.10:5173/messages');
   await page.getByRole('heading',{name:'Conversaciones'}).waitFor();
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    const description=await page.getByText('Selecciona una conversación con tu alumno.').boundingBox();
    const contacts=await page.getByRole('heading',{name:'Conversaciones'}).boundingBox();
    assert(description.y+description.height<contacts.y);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`outputs/messages-${width}.png`,fullPage:true});
   }
  }else{
   await page.getByRole('heading',{name:'Rendimiento reciente'}).waitFor();
   assert.equal(await page.getByText('Entrenamiento disponible',{exact:true}).count(),0);
   await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'outputs/student-home-mobile.png',fullPage:true});
   await page.reload(); await page.getByRole('heading',{name:'Rendimiento reciente'}).waitFor();
   const response=await page.request.get('http://192.168.0.10:5173/api/v1/health/ready'); assert.equal(response.status(),200);
  }
  console.log(role+': login, layout and mobile checks passed'); await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

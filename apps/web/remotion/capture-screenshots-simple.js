const puppeteer = require('puppeteer');
const path = require('path');

const screenshots = [
  { name: 'home', url: 'https://eddy.guide' },
  { name: 'rivers-list', url: 'https://eddy.guide/rivers' },
  { name: 'river-detail', url: 'https://eddy.guide/rivers/current' },
  { name: 'float-planner', url: 'https://eddy.guide/rivers/current' },
  { name: 'gauges', url: 'https://eddy.guide/gauges' },
  { name: 'access-point', url: 'https://eddy.guide/rivers/current/access/akers-ferry' },
  { name: 'share-plan', url: 'https://eddy.guide' },
  { name: 'ask-eddy', url: 'https://eddy.guide/chat' }
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('📸 Capturing screenshots from eddy.guide...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  const outputDir = path.join(__dirname, 'public', 'screenshots');
  
  for (const shot of screenshots) {
    try {
      console.log(`  Capturing ${shot.name}...`);
      
      await page.goto(shot.url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      
      await sleep(3000);
      
      await page.screenshot({
        path: path.join(outputDir, `${shot.name}.png`),
        fullPage: false
      });
      
      console.log(`    ✓ ${shot.name}.png`);
    } catch (err) {
      console.error(`    ✗ ${shot.name}: ${err.message}`);
    }
  }
  
  await browser.close();
  console.log('✅ Screenshots complete!');
})();

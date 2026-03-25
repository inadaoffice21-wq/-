const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

        console.log('Navigating to local index.html...');
        await page.goto('http://localhost:3000');

        console.log('Waiting slightly to allow rendering...');
        await new Promise(r => setTimeout(r, 2000));

        await browser.close();
        console.log('Done.');
    } catch (err) {
        console.error('Script Error:', err);
    }
})();

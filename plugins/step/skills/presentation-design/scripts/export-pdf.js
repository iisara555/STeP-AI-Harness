#!/usr/bin/env node
/**
 * STeP Presentation Design — PDF Exporter
 * แปลงไฟล์ HTML Presentation 16:9 (1920x1080) เป็นไฟล์ PDF คมชัดสูง
 *
 * การใช้งาน:
 *   node export-pdf.js <input.html> [output.pdf]
 *
 * ความต้องการ:
 *   npx playwright install chromium (หรือลง playwright: npm i -D playwright)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

async function exportPdf(htmlFilePath, outputPdfPath) {
  const resolvedHtml = path.resolve(htmlFilePath);
  if (!fs.existsSync(resolvedHtml)) {
    console.error(`❌ ไม่พบไฟล์: ${resolvedHtml}`);
    process.exit(1);
  }

  const baseDir = path.dirname(resolvedHtml);
  const htmlFileName = path.basename(resolvedHtml);
  const outPdf = outputPdfPath
    ? path.resolve(outputPdfPath)
    : path.join(baseDir, htmlFileName.replace(/\.html$/i, '') + '.pdf');

  console.log(`📄 กำลังเปิด Local Server เพื่อโหลดแบบอักษรและรูปภาพ...`);

  // 1. Start Local HTTP Server
  const server = http.createServer((req, res) => {
    let reqUrl = decodeURIComponent(req.url.split('?')[0]);
    let targetFile = reqUrl === '/' ? resolvedHtml : path.join(baseDir, reqUrl);

    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(targetFile).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  console.log(`🌐 Server พร้อมทำงานที่ http://127.0.0.1:${port}`);

  // 2. Launch Browser via Playwright
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    console.error(`\n❌ ไม่พบไลบรารี Playwright!`);
    console.error(`กรุณาติดตั้งด้วยคำสั่ง:`);
    console.error(`  npx -y playwright install chromium\n`);
    server.close();
    process.exit(1);
  }

  console.log(`🚀 กำลังเปิดเบราว์เซอร์ Headless Chromium...`);
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // 2x Retina Clarity
  });

  const page = await context.newPage();

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000); // รอ animation settlement

    const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
    console.log(`📊 ตรวจพบสไลด์ทั้งหมด: ${slideCount} สไลด์`);

    if (slideCount === 0) {
      console.warn(`⚠️ ไม่พบคลาส .slide ในไฟล์ HTML!`);
    }

    console.log(`🖨️ กำลังเรนเดอร์ PDF ขนาด 1920×1080 (16:9 Landscape)...`);

    await page.pdf({
      path: outPdf,
      width: '1920px',
      height: '1080px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    console.log(`\n🎉 ส่งออกไฟล์ PDF สำเร็จเรียบร้อย!`);
    console.log(`📍 ตำแหน่งไฟล์: ${outPdf}`);

    const stats = fs.statSync(outPdf);
    console.log(`📦 ขนาดไฟล์: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error(`❌ เกิดข้อผิดพลาดขณะส่งออก PDF:`, error);
  } finally {
    await browser.close();
    server.close();
  }
}

// CLI Execution
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log(`วิธีใช้: node export-pdf.js <ไฟล์.html> [ไฟล์ปลายทาง.pdf]`);
  process.exit(1);
}

exportPdf(args[0], args[1]);

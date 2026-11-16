'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:4173';

function waitForHttp200(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url} (status ${res.statusCode})`));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

async function navMenu(page, label) {
  await page.locator('aside nav button', { hasText: label }).first().click();
  await page.waitForTimeout(250);
}

async function main() {
  const previewProc = spawn('npx.cmd', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser = null;
  const pageErrors = [];
  const consoleErrors = [];

  try {
    await waitForHttp200(BASE_URL, 25000);
    console.log('[ORGANIC E2E 1] Vite preview ready at', BASE_URL);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('pageerror', (err) => {
      const msg = String(err && err.stack ? err.stack : err);
      pageErrors.push(msg);
      console.error('[PAGEERROR]', msg);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error('[CONSOLE_ERROR]', msg.text());
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('input[type="text"]').first().fill('admin');
    await page.locator('input[type="password"]').first().fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.locator('aside nav button', { hasText: '업무 대시보드' }).first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('[ORGANIC E2E 2 PASS] Logged in cleanly as admin.');

    // 1. 유통 재고 조회
    await navMenu(page, '유통 재고 조회');
    await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
    const tiRows = await page.locator('main table tbody tr').count();
    const tiText = await page.locator('main').innerText();
    assert(tiRows > 30, `Expected > 30 trade inventory rows, got ${tiRows}`);
    for (const cat of ['완제품', '어태치먼트', '부품', '소모품']) {
      assert(tiText.includes(cat), `유통 재고 조회 missing category: ${cat}`);
    }
    console.log(`[ORGANIC E2E 3 PASS] 유통 재고 조회 rendered ${tiRows} rows with all 4 categories.`);

    // 2. 유통 계약 관리
    await navMenu(page, '유통 계약 관리');
    await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
    const tcRows = await page.locator('main table tbody tr').count();
    const tcText = await page.locator('main').innerText();
    assert(tcRows >= 35, `Expected >= 35 trade contracts, got ${tcRows}`);
    assert(tcText.includes('완료'), '유통 계약 관리 should include 완료 status');
    assert(/출고진행|진행중|작성중/.test(tcText), '유통 계약 관리 should include pre-fulfillment statuses');
    console.log(`[ORGANIC E2E 4 PASS] 유통 계약 관리 rendered ${tcRows} contracts (fulfilled & pre-fulfillment).`);

    // 3. 유통 실적 조회
    await navMenu(page, '유통 실적 조회');
    const tpDateInputs = page.locator('main input[type="date"]');
    await tpDateInputs.nth(0).fill('2026-01-01');
    await tpDateInputs.nth(1).fill('2026-11-30');
    await page.waitForTimeout(250);
    const tpRows = await page.locator('main table tbody tr').count();
    const tpText = await page.locator('main').innerText();
    assert(tpRows > 20, `Expected > 20 trade performance rows, got ${tpRows}`);
    assert(tpText.includes('269,422,274'), `유통 실적 조회 should show 269,422,274 net COGS, got: ${tpText.slice(-300)}`);
    assert(tpText.includes('88,264,526'), `유통 실적 조회 should show 88,264,526 gross profit, got: ${tpText.slice(-300)}`);
    console.log(`[ORGANIC E2E 5 PASS] 유통 실적 조회 rendered ${tpRows} rows & 269,422,274원 COGS / 88,264,526원 GP.`);

    // 4. 렌탈 자산 관리 & 렌탈 정비 관리
    await navMenu(page, '렌탈 자산 관리');
    await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
    const raRows = await page.locator('main table tbody tr').count();
    const raText = await page.locator('main').innerText();
    assert(raRows >= 50, `Expected >= 50 rental/sublease assets, got ${raRows}`);
    for (const st of ['대여중', '보유중', '정비중']) {
      assert(raText.includes(st), `렌탈 자산 관리 missing asset status: ${st}`);
    }
    console.log(`[ORGANIC E2E 6 PASS] 렌탈 자산 관리 rendered ${raRows} assets across 보유중/대여중/정비중.`);

    await navMenu(page, '렌탈 정비 관리');
    await page.locator('[data-manual-id="rmnt-grid"] table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
    const rmRows = await page.locator('[data-manual-id="rmnt-grid"] table tbody tr').count();
    const rmText = await page.locator('main').innerText();
    assert(rmRows >= 28, `Expected >= 28 maintenances, got ${rmRows}`);
    for (const lbl of ['가용 부품 재고', '가용 소모품 재고', '정비 누적건수', '총 정비원가', '29건']) {
      assert(rmText.includes(lbl), `렌탈 정비 관리 missing ConservationBar item: ${lbl}`);
    }
    console.log(`[ORGANIC E2E 7 PASS] 렌탈 정비 관리 rendered ${rmRows} rows & ConservationBar.`);

    // 5. 렌탈 실적 조회
    await navMenu(page, '렌탈 실적 조회');
    const rpMonthInputs = page.locator('main input[type="month"]');
    await rpMonthInputs.nth(0).fill('2026-01');
    await rpMonthInputs.nth(1).fill('2026-11');
    await page.waitForTimeout(250);
    const rpRows = await page.locator('main table tbody tr').count();
    const rpText = await page.locator('main').innerText();
    assert(rpRows >= 50, `Expected >= 50 rental performance rows, got ${rpRows}`);
    assert(rpText.includes('59,274,044'), '렌탈 실적 조회 should show 59,274,044 rental revenue');
    console.log(`[ORGANIC E2E 8 PASS] 렌탈 실적 조회 rendered ${rpRows} rows & 59,274,044원 revenue.`);

    // 6. 청구 수납 관리 & 통장 입출금 대사 (OUT LEASE_INSTALLMENT candidate check)
    await navMenu(page, '청구 수납 관리');
    await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
    const bilRows = await page.locator('main table tbody tr').count();
    const bilText = await page.locator('main').innerText();
    assert(bilRows >= 80, `Expected >= 80 billings, got ${bilRows}`);
    assert(bilText.includes('청구 대차 차액 0원'), '청구 수납 관리 must show 청구 대차 차액 0원');
    console.log(`[ORGANIC E2E 9 PASS] 청구 수납 관리 rendered ${bilRows} billings & 0원 balance.`);

    await navMenu(page, '통장 입출금 대사');
    const btxRows = page.locator('[data-manual-id="btx-match"] table tbody tr');
    await btxRows.first().waitFor({ state: 'visible', timeout: 10000 });
    const outUnmatchedRow = btxRows.filter({ hasText: '출금' }).filter({ hasText: '미대사' }).first();
    assert((await outUnmatchedRow.count()) > 0, 'Expected at least 1 출금 미대사 bank transaction');
    await outUnmatchedRow.click();
    await page.waitForTimeout(200);
    const matchSelect = page.locator('[data-manual-id="btx-match"] select').first();
    const optionValues = await matchSelect.locator('option').evaluateAll((opts) => opts.map((o) => ({ val: o.value, txt: o.textContent || '' })));
    assert(optionValues.some((o) => o.val.startsWith('AP::') && o.txt.includes('매입채무')), 'Bank OUT match options must include AP:: 매입채무 candidates');
    assert(optionValues.some((o) => o.val.startsWith('LEASE::') && o.txt.includes('금융리스회차')), 'Bank OUT match options must include LEASE:: 금융리스회차 candidates');
    console.log(`[ORGANIC E2E 10 PASS] 통장 입출금 대사 OUT match candidates include AP & 금융리스회차 (${optionValues.length} options).`);

    // 7. 재무제표 조회 (all 5 tabs + 0원 conservation bar)
    await navMenu(page, '재무제표 조회');
    const fsPeriodInputs = page.locator('[data-manual-id="fs-period"] input[type="month"]');
    await fsPeriodInputs.nth(0).fill('2026-01');
    await fsPeriodInputs.nth(1).fill('2026-11');
    await page.waitForTimeout(250);

    const fsTabLabels = ['재무상태표', '손익계산서', '현금흐름표', '렌탈자산 감가상각명세', '금융리스 이자·원금명세'];
    for (const tabLabel of fsTabLabels) {
      await page.locator('[data-manual-id="fs-tabs"] button', { hasText: tabLabel }).first().click();
      await page.waitForTimeout(180);
      const tabRowCount = await page.locator('main table tbody tr').count();
      assert(tabRowCount > 0, `Financial statement tab ${tabLabel} rendered 0 rows`);
    }
    const verifyBarText = await page.locator('[data-manual-id="fs-verify"]').innerText();
    assert(verifyBarText.includes('대차 차액') && verifyBarText.includes('0원'), `Expected 대차 차액 0원, got: ${verifyBarText}`);
    console.log('[ORGANIC E2E 11 PASS] 재무제표 조회 all 5 tabs & 대차 차액 0원 verified.');

    assert.strictEqual(pageErrors.length, 0, `Uncaught pageerrors: ${pageErrors.join(' | ')}`);
    assert.strictEqual(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(' | ')}`);
    console.log('[ORGANIC E2E 12 PASS] Zero pageerrors and zero console errors.');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    if (previewProc && previewProc.pid) {
      try {
        execSync(`taskkill /PID ${previewProc.pid} /T /F`, { stdio: 'ignore' });
      } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error('ORGANIC UI E2E FAILED:', err);
  process.exit(1);
});

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
    console.log('[E2E 1] Vite preview server ready at', BASE_URL);

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

    // Login as admin (Tier 7)
    await page.locator('input[type="text"]').first().fill('admin');
    await page.locator('input[type="password"]').first().fill('admin123');
    await page.locator('button[type="submit"]').click();

    try {
      await page.locator('aside nav button', { hasText: '업무 대시보드' }).first().waitFor({ state: 'visible', timeout: 15000 });
    } catch (waitErr) {
      const bodySnap = await page.locator('body').innerText().catch(() => '');
      console.error('[DIAGNOSTIC BODY TEXT]\n' + bodySnap.slice(0, 1200));
      throw waitErr;
    }
    console.log('[E2E 2 PASS] Logged in as admin and sidebar navigation rendered.');

    const sidebarText = await page.locator('aside').innerText();
    assert(!sidebarText.includes('테넌트 관리'), 'Sidebar must NOT contain 테넌트 관리');
    console.log('[E2E 3 PASS] Confirmed 테넌트 관리 is absent from tenant ERP sidebar.');

    const menuLabels = [
      '업무 대시보드',
      '매입 통관 관리',
      '견적 관리',
      '렌탈 자산 관리',
      '렌탈 입출고 관리',
      '청구 수납 관리',
      '재무제표 조회',
    ];

    for (const label of menuLabels) {
      await page.locator('aside nav button', { hasText: label }).first().click();
      await page.waitForTimeout(250);
    }

    // Verify balanced financial statements markers
    await page.getByText('대차 차액', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText('대차 · 현금흐름 0원 일치 검증 완료', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('[E2E 4 PASS] Visited 7 core menus and confirmed balanced FS status (대차 차액 / 0원 일치).');

    // Switch to Operation Manual and verify search filter
    await page.locator('aside nav button', { hasText: '업무 매뉴얼' }).first().click();
    const searchInput = page.locator('input[placeholder*="교환"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.fill('교환');
    await page.getByText('렌탈 입출고 관리', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    console.log('[E2E 5 PASS] Operation Manual search for 교환 filtered matching process entries.');

    // Move to 렌탈 입출고 관리 and toggle Manual Overlay via Ctrl+M
    await page.locator('aside nav button', { hasText: '렌탈 입출고 관리' }).first().click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Control+m');
    await page.getByText('업무 프로세스 명칭', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    const anchorCount = await page.locator('[data-manual-id]').count();
    assert(anchorCount > 0, 'Expected visible data-manual-id anchors under Manual Overlay');
    console.log(`[E2E 6 PASS] Ctrl+M opened Manual Overlay cleanly (${anchorCount} data-manual-id anchors active).`);

    // Close Manual Overlay before interacting with header/modals
    await page.keyboard.press('Control+m');
    await page.waitForTimeout(200);

    // Verify self-service [내 정보 · 비밀번호] modal
    await page.locator('header button', { hasText: '내 정보 · 비밀번호' }).first().click();
    await page.getByText('내 정보 · 비밀번호 변경', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: '비밀번호 변경' }).first().click();
    await page.locator('input[placeholder="현재 비밀번호 입력"]').first().waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('button', { hasText: '취소' }).first().click();
    console.log('[E2E 7a PASS] Self-service [내 정보 · 비밀번호] modal verified.');

    // Visit 조직 인사 관리 and test tree, detail modal tabs, conservation bar, and manual overlay
    await page.locator('aside nav button', { hasText: '조직 인사 관리' }).first().click();
    await page.getByText('조직 계층도', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.getByText('정원 검증 일치', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('button', { hasText: '상세' }).first().click();
    await page.getByText('부여 연차일수', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText('보안서약서 스캔본', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('button', { hasText: '급여 · 계좌' }).first().click();
    await page.getByText('현재 등록 월 기본급', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('input[data-manual-wage="true"]').first().waitFor({ state: 'visible', timeout: 3000 });
    await page.getByText('4대보험 가입여부', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    const autoCalcBtnCount = await page.locator('button', { hasText: '209' }).count();
    assert.strictEqual(autoCalcBtnCount, 0, 'Ordinary wage auto-calc (209h) button must NOT exist');
    await page.locator('button', { hasText: '비밀번호 초기화' }).first().click();
    await page.getByText('비밀번호 초기화 실행', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('button', { hasText: '닫기' }).first().click();

    await page.locator('button', { hasText: '부서 조직도' }).first().click();
    await page.getByText('부서 조직 합계 일치', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('button', { hasText: '인사 발령 이력' }).first().click();
    await page.locator('table tbody').getByText('입사등록', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });

    await page.keyboard.press('Control+m');
    await page.waitForTimeout(200);
    await page.getByText('신규 입사 등록 및 인사 발령', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.keyboard.press('Control+m');
    console.log('[E2E 7b PASS] 조직 인사 관리 (tree, modal tabs, payroll gating, conservation, overlay) verified.');

    // Test Logout + password visibility toggle + remember ID + employeeNo login
    await page.locator('header button', { hasText: '로그아웃' }).first().click();
    await page.locator('input[placeholder="사번 또는 아이디 입력"]').first().waitFor({ state: 'visible', timeout: 5000 });
    const pwToggleBtn = page.locator('button[aria-label="비밀번호 표시"]').first();
    await pwToggleBtn.click();
    const pwTypeShown = await page.locator('input[placeholder="비밀번호 입력"]').first().getAttribute('type');
    assert.strictEqual(pwTypeShown, 'text', 'Password input should switch to type=text');
    await page.locator('button[aria-label="비밀번호 숨김"]').first().click();

    await page.locator('label', { hasText: '아이디 저장' }).locator('input[type="checkbox"]').check();
    await page.locator('input[placeholder="사번 또는 아이디 입력"]').first().fill('EMP-2601');
    await page.locator('input[placeholder="비밀번호 입력"]').first().fill('admin123');
    await page.locator('button[type="submit"]').first().click();
    await page.locator('aside nav button', { hasText: '조직 인사 관리' }).first().waitFor({ state: 'visible', timeout: 8000 });

    await page.locator('header button', { hasText: '로그아웃' }).first().click();
    await page.locator('input[placeholder="사번 또는 아이디 입력"]').first().waitFor({ state: 'visible', timeout: 5000 });
    const rememberedVal = await page.locator('input[placeholder="사번 또는 아이디 입력"]').first().inputValue();
    assert.strictEqual(rememberedVal, 'EMP-2601', 'Saved login ID must persist across logout');
    await page.locator('label', { hasText: '아이디 저장' }).locator('input[type="checkbox"]').uncheck();
    await page.locator('input[placeholder="사번 또는 아이디 입력"]').first().fill('admin');
    await page.locator('input[placeholder="비밀번호 입력"]').first().fill('admin123');
    await page.locator('button[type="submit"]').first().click();
    await page.locator('aside nav button', { hasText: '조직 인사 관리' }).first().waitFor({ state: 'visible', timeout: 8000 });
    console.log('[E2E 7c PASS] EmployeeNo (EMP-2601) login, password show/hide toggle, and saved ID verified.');

    // Visit 환율 관리 and verify 3-month managed FX trend chart + currency & period switches
    await page.locator('aside nav button', { hasText: '환율 관리' }).first().click();
    await page.getByText('관리 환율 3개월 추이 차트', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    const chartSvg = page.locator('svg[data-fx-chart="svg"]').first();
    await chartSvg.waitFor({ state: 'visible', timeout: 5000 });
    const polylineCount = await chartSvg.locator('polyline').count();
    assert(polylineCount >= 1, `Expected >=1 SVG polyline in 3-month FX chart, got ${polylineCount}`);
    const fxChartSection = page.locator('[data-manual-id="fx-chart"]');
    await fxChartSection.locator('button', { hasText: '일본 엔' }).first().click();
    await fxChartSection.getByText('기준 단위: 1 일본 엔 당 원화', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await fxChartSection.locator('button', { hasText: '1개월' }).first().click();
    await fxChartSection.getByText('관리 환율 1개월 추이 차트', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await fxChartSection.locator('button', { hasText: '3개월' }).first().click();
    await page.getByText('관리 환율 원장 정상', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    console.log('[E2E 7d PASS] 환율 관리 3-month chart, currency/period tabs, and conservation bar verified.');

    // Visit 매입 통관 관리 and verify fxDate auto-fill + manual edit, comma inputs, and zero qty/price UI overlap
    await page.locator('aside nav button', { hasText: '매입 통관 관리' }).first().click();
    const fxDateInput = page.locator('input[data-testid="pur-fx-date"]').first();
    const fxRateInput = page.locator('input[data-testid="pur-fx-rate"]').first();
    const currencySelect = page.locator('select[data-testid="pur-currency"]').first();
    const qtyInput = page.locator('input[data-testid="pur-line-qty"]').first();
    const priceInput = page.locator('input[data-testid="pur-line-price"]').first();
    await fxDateInput.waitFor({ state: 'visible', timeout: 8000 });

    await currencySelect.selectOption('CNY');
    await fxDateInput.fill('2026-10-15');
    await page.waitForTimeout(200);
    const autoCnyRate = await fxRateInput.inputValue();
    assert.strictEqual(autoCnyRate, '194.2', `Expected CNY 2026-10-15 default rate 194.2, got ${autoCnyRate}`);

    await fxRateInput.fill('198.5');
    await fxRateInput.blur();
    assert.strictEqual(await fxRateInput.inputValue(), '198.5', 'FX rate must remain manually editable');

    await qtyInput.fill('1250');
    await qtyInput.blur();
    assert.strictEqual(await qtyInput.inputValue(), '1,250', 'Quantity input must format thousand commas');

    await priceInput.fill('158240');
    await priceInput.blur();
    assert.strictEqual(await priceInput.inputValue(), '158,240', 'Unit price input must format thousand commas');

    const qtyBox = await qtyInput.boundingBox();
    const priceBox = await priceInput.boundingBox();
    assert(
      qtyBox && priceBox && qtyBox.x + qtyBox.width + 6 <= priceBox.x,
      `Qty and unit price inputs must NOT overlap (qtyEnd=${qtyBox ? qtyBox.x + qtyBox.width : 0}, priceX=${priceBox ? priceBox.x : 0})`
    );
    console.log(
      `[E2E 7e PASS] 매입 통관 관리 fxDate auto-rate (${autoCnyRate}->198.5), comma format (1,250 / 158,240), and zero overlap (gap=${Math.round(priceBox.x - (qtyBox.x + qtyBox.width))}px) verified.`
    );

    // Visit separated 유통 품목 관리 and 렌탈 품목 관리 menus
    await page.locator('aside nav button', { hasText: '유통 품목 관리' }).first().click();
    await page.getByText('유통 품목 · 판매단가 검색', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('table thead th', { hasText: '대리점가' }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('table thead th', { hasText: '판매정가' }).first().waitFor({ state: 'visible', timeout: 5000 });
    const tradeHasRentalHeader = await page.locator('table thead th', { hasText: '월 렌탈료' }).count();
    assert.strictEqual(tradeHasRentalHeader, 0, '유통 품목 관리 must NOT display 월 렌탈료 header');

    await page.locator('aside nav button', { hasText: '렌탈 품목 관리' }).first().click();
    await page.getByText('렌탈 품목 · 임대료 기준 검색', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('table thead th', { hasText: '월 렌탈료' }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('table thead th', { hasText: '일 렌탈료' }).first().waitFor({ state: 'visible', timeout: 5000 });
    const rentalHasDealerHeader = await page.locator('table thead th', { hasText: '대리점가' }).count();
    assert.strictEqual(rentalHasDealerHeader, 0, '렌탈 품목 관리 must NOT display 대리점가 header');
    console.log('[E2E 7f PASS] Separated 유통 품목 관리 & 렌탈 품목 관리 columns verified.');

    // [E2E 7g] Verify Pure Korean badges, currency labels, routes, and zero English StatusBadges
    const assertZeroEnglishBadges = async (menuName) => {
      const badgeTexts = await page.locator('[data-ui="status-badge"]').allInnerTexts();
      const englishBadges = badgeTexts.filter((t) => /[A-Za-z]/.test(t));
      assert.strictEqual(
        englishBadges.length,
        0,
        `${menuName} must have 0 English status badges, found: ${englishBadges.join(', ')}`
      );
      return badgeTexts;
    };

    await page.locator('aside nav button', { hasText: '매입 통관 관리' }).first().click();
    await page.getByText('선하증권 번호', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.getByText('신용장 번호', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('table tbody').getByText('미국 달러', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    const purBadges = await assertZeroEnglishBadges('매입 통관 관리');
    assert(purBadges.includes('확정'), `Expected '확정' badge in 매입 통관 관리, got: ${purBadges.join(', ')}`);
    assert(!purBadges.includes('CONFIRMED'), 'CONFIRMED badge must not appear');

    await page.locator('aside nav button', { hasText: '물류비 관리' }).first().click();
    await page.locator('table tbody').getByText('평택 주기장 · 용산구 현장', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    const logBadges = await assertZeroEnglishBadges('물류비 관리');
    assert(logBadges.includes('정산확정'), `Expected '정산확정' badge in 물류비 관리, got: ${logBadges.join(', ')}`);
    assert(!logBadges.includes('SETTLED'), 'SETTLED badge must not appear');
    const logTableText = await page.locator('table tbody').first().innerText();
    assert(!logTableText.includes('->'), 'Logistics table route must not contain ASCII arrow ->');

    await page.locator('aside nav button', { hasText: '렌탈 계약 관리' }).first().click();
    await page.locator('[data-ui="status-badge"]', { hasText: '진행중' }).first().waitFor({ state: 'visible', timeout: 8000 });
    const rctrBadges = await assertZeroEnglishBadges('렌탈 계약 관리');
    assert(rctrBadges.includes('출고완료'), `Expected '출고완료' badge in 렌탈 계약 관리, got: ${rctrBadges.join(', ')}`);
    assert(rctrBadges.includes('진행중'), `Expected '진행중' badge in 렌탈 계약 관리, got: ${rctrBadges.join(', ')}`);
    assert(!rctrBadges.includes('FULFILLED') && !rctrBadges.includes('ACTIVE'), 'FULFILLED/ACTIVE badges must not appear');

    const navButtons = page.locator('aside nav button');
    const navCount = await navButtons.count();
    for (let i = 0; i < navCount; i++) {
      const btn = navButtons.nth(i);
      const label = (await btn.innerText()).trim().replace(/\s+/g, ' ');
      await btn.click();
      await page.waitForTimeout(180);
      await assertZeroEnglishBadges(label);
    }
    console.log(`[E2E 7g PASS] Pure Korean badges (확정/정산확정/출고완료/진행중), currency labels, and zero English StatusBadges verified across all ${navCount} sidebar menus.`);

    // [E2E 7h] Verify restored CatalogsPage technical specs (52 models, VDI 2198/kg/mm/OEM, mast/battery tables, compare & parts)
    await page.locator('aside nav button', { hasText: '제원 카탈로그' }).first().click();
    await page.getByText('VDI 2198 제원 · 호환 부품 카탈로그', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('[data-manual-id="cat-conservation"]').getByText('52종', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    const leftModelRows = await page.locator('[data-manual-id="cat-detail"] table').first().locator('tbody tr').count();
    assert(leftModelRows >= 50, `Expected >=50 models in 제원 카탈로그 left grid, got ${leftModelRows}`);

    const coreGridText = await page.locator('[data-testid="cat-core-grid"]').innerText();
    assert(coreGridText.includes('2,500 kg') && coreGridText.includes('3,000 mm'), `Restored kg/mm units missing in core grid: ${coreGridText.slice(0, 200)}`);
    const coreCardCount = await page.locator('[data-testid="cat-core-grid"] > div').count();
    assert(coreCardCount >= 24, `Expected >=24 detailed core spec cells, got ${coreCardCount}`);
    await page.locator('[data-testid="cat-vdi-section"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="cat-mast-section"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="cat-battery-section"]').waitFor({ state: 'visible', timeout: 5000 });

    // Select a backup-restored model (CPD25-XEY2HA-SI)
    const specSearchInput = page.locator('input[placeholder="모델명, 제조사, 시리즈 검색"]').first();
    await specSearchInput.fill('CPD25-XEY2HA-SI');
    await page.waitForTimeout(200);
    await page.locator('[data-manual-id="cat-detail"] table').first().locator('tbody tr').first().click();
    await page.locator('[data-testid="cat-vdi-section"]').getByText('55항목', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await specSearchInput.fill('');

    // Compare tab
    const catTabs = page.locator('[data-manual-id="cat-tabs"]');
    await catTabs.locator('button', { hasText: '모델 제원 비교' }).first().click();
    await page.getByText('비교 제원 항목', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    const cmpColCount = await page.locator('[data-manual-id="cat-detail"] table thead th').count();
    assert(cmpColCount >= 4, `Expected >=4 columns in compare table, got ${cmpColCount}`);

    // Parts tab
    await catTabs.locator('button', { hasText: '호환부품 카탈로그' }).first().click();
    await page.getByText('부품명 · 품번 · OEM 교차코드 검색', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="part-detail-specs"]').getByText('실측 치수 · 상세 규격표', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-testid="part-detail-specs"]').getByText('OEM 교차품번 목록', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
    console.log(`[E2E 7h PASS] Restored 제원 카탈로그 (${leftModelRows} models, ${coreCardCount} spec cells, VDI 2198/kg/mm/OEM, mast/battery, compare & parts detail) verified.`);

    assert.strictEqual(pageErrors.length, 0, `Uncaught pageerrors detected: ${pageErrors.join(' | ')}`);
    assert.strictEqual(consoleErrors.length, 0, `Console errors detected: ${consoleErrors.join(' | ')}`);
    console.log('[E2E 8 PASS] Zero uncaught pageerrors and zero console errors.');
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
  console.error('PLAYWRIGHT E2E FAILED:', err);
  process.exit(1);
});

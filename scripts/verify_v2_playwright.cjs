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
    await fxChartSection.locator('button', { hasText: 'JPY' }).first().click();
    await fxChartSection.getByText('일본 엔', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await fxChartSection.locator('button', { hasText: '1개월' }).first().click();
    await fxChartSection.getByText('관리 환율 1개월 추이 차트', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    await fxChartSection.locator('button', { hasText: '3개월' }).first().click();
    await page.getByText('관리 환율 원장 정상', { exact: false }).first().waitFor({ state: 'visible', timeout: 3000 });
    console.log('[E2E 7d PASS] 환율 관리 3-month chart, currency/period tabs, and conservation bar verified.');

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

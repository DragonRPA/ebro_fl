'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createServer } = require('vite');

const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    out[k] = v;
  }
  return out;
}

const STARTER_IDS = {
  apPayables: ['AP-2610-001'],
  assetEvents: ['EVT-001', 'EVT-002'],
  bankTransactions: ['BTX-2611-001', 'BTX-2611-002', 'BTX-2611-003'],
  billings: ['BIL-RN-2611-01', 'BIL-TR-2611-01'],
  collections: ['COL-2611-001', 'COL-2611-002'],
  contractLines: ['CL-RN-2611-01-1', 'CL-TR-2611-01-1'],
  contracts: ['CTR-RN-2611-01', 'CTR-TR-2611-01'],
  financeLeases: ['FLS-2610-001'],
  fulfillments: ['FUL-RN-2611-01', 'FUL-TR-2611-01'],
  inventoryUnits: [
    'UNIT-LOT-ATT-1',
    'UNIT-LOT-CSM-1',
    'UNIT-LOT-PART-1',
    'UNIT-RN-001',
    'UNIT-RN-002',
    'UNIT-SUB-001',
    'UNIT-TR-001',
    'UNIT-TR-002',
  ],
  logisticsDispatches: ['LOG-2611-001'],
  purchaseLines: ['PURL-2610-001-1'],
  purchases: ['PUR-2610-001'],
  quotations: ['QT-RN-2611-01', 'QT-TR-2611-01'],
  rentalMaintenances: ['MNT-2611-001'],
  stockMovements: ['MOV-001', 'MOV-002', 'MOV-003', 'MOV-004'],
};

const NEW_CONSUMABLES = [
  ['CSM-ORG-01', 'FL-CSM-001', 'ISO VG46 고성능 유압유 20L', '유압오일', 58000],
  ['CSM-ORG-02', 'FL-CSM-002', '리튬이온 배터리 정제수 20L 말통', '배터리관리', 14000],
  ['CSM-ORG-03', 'FL-CSM-003', '리튬복합 고압 구리스 카트리지 400g', '윤활유', 8000],
  ['CSM-ORG-04', 'FL-CSM-004', '마스트 체인 전용 침투 루브 500ml', '윤활유', 12000],
  ['CSM-ORG-05', 'FL-CSM-005', 'DOT4 합성 브레이크액 1L', '브레이크', 15000],
  ['CSM-ORG-06', 'FL-CSM-006', '지게차 대형 에어필터 엘리먼트', '필터류', 26000],
  ['CSM-ORG-07', 'FL-CSM-007', '유압 리턴 오일필터 카트리지', '필터류', 29000],
  ['CSM-ORG-08', 'FL-CSM-008', '액슬 디퍼렌셜 기어오일 80W-90 4L', '윤활유', 34000],
  ['CSM-ORG-09', 'FL-CSM-009', 'LLC 사계절 부동액 원액 4L', '냉각관리', 18000],
  ['CSM-ORG-10', 'FL-CSM-010', '산업용 고압 파츠 클리너 750ml', '세척제', 9000],
  ['CSM-ORG-11', 'FL-CSM-011', '포크캐리지 청동 슬라이드 패드 세트', '마모품', 42000],
  ['CSM-ORG-12', 'FL-CSM-012', '리튬 충전기 48V 앤더슨 175A 커넥터', '전장소모품', 24000],
  ['CSM-ORG-13', 'FL-CSM-013', 'LED 작업등 사각 48W (DC12~80V 겸용)', '조명류', 28000],
  ['CSM-ORG-14', 'FL-CSM-014', '청색 안전 스포트라이트 24W', '안전장치', 36000],
  ['CSM-ORG-15', 'FL-CSM-015', '전동식 후진 경고 버저 (방수형)', '안전장치', 19000],
  ['CSM-ORG-16', 'FL-CSM-016', '대용량 메인 퓨즈 250A (5개입)', '전장소모품', 22000],
  ['CSM-ORG-17', 'FL-CSM-017', '틸트 실린더 씰 키트 (2.5톤 공용)', '유압씰', 48000],
  ['CSM-ORG-18', 'FL-CSM-018', '리프트 실린더 더스트 씰 세트', '유압씰', 38000],
  ['CSM-ORG-19', 'FL-CSM-019', '비상정지 킬스위치 어셈블리', '안전장치', 25000],
  ['CSM-ORG-20', 'FL-CSM-020', '비닐 방수형 안전벨트 2점식 (주황)', '안전장치', 32000],
  ['CSM-ORG-21', 'FL-CSM-021', '파노라마 광각 백미러 좌우세트', '안전장치', 27000],
  ['CSM-ORG-22', 'FL-CSM-022', '타이어 밸브 코어 · 황동 캡 20개입', '타이어부자재', 16000],
  ['CSM-ORG-23', 'FL-CSM-023', '고내열 실리콘 절연 테이프 10롤', '전장소모품', 21000],
  ['CSM-ORG-24', 'FL-CSM-024', '유압 호스 프로텍터 나선 슬리브 10m', '유압보호', 45000],
  ['CSM-ORG-25', 'FL-CSM-025', '스티어링 너클 킹핀 니들 베어링 키트', '구동부', 64000],
];

const SPECIALIZED_PARTNERS = [
  ['PRT-ORG-01', '중부지게차 대리점', '1248100112', '김도현', '도매 및 소매업', '산업용 지게차 유통', '경기도 안산시 단원구 산단로 142', '031-492-1101', 'dealer1@jungbu-fl.co.kr', ['대리점', '매출처']],
  ['PRT-ORG-02', '영남물류장비 대리점', '5048100224', '박성호', '도매 및 소매업', '물류하역장비 판매', '대구광역시 달서구 성서공단로 88', '053-584-2202', 'dealer2@yeongnam-fl.co.kr', ['대리점', '매출처']],
  ['PRT-ORG-03', '호남중기상사 대리점', '4108100337', '이정민', '도매 및 소매업', '전동지게차 및 부품', '광주광역시 광산구 하남산단5번로 61', '062-951-3303', 'dealer3@honam-fl.co.kr', ['대리점', '매출처']],
  ['PRT-ORG-04', '수도권포트기계 대리점', '1318100449', '최우석', '도매 및 소매업', '항만·물류 지게차', '인천광역시 서구 북항로 195', '032-571-4404', 'dealer4@port-fl.co.kr', ['대리점', '매출처']],
  ['PRT-ORG-05', '충청산업기계 대리점', '3128100551', '윤태준', '도매 및 소매업', '산업장비 및 부품', '충청남도 천안시 서북구 2공단3로 77', '041-552-5505', 'dealer5@chungcheong-fl.co.kr', ['대리점', '매출처']],
  ['PRT-ORG-06', '삼일렌탈파트너스 전대', '2148100663', '정재훈', '임대업', '건설·물류기계 임대', '경기도 화성시 봉담읍 삼천병마로 310', '031-227-6606', 'sub1@samil-rent.co.kr', ['전대공급처', '매입처']],
  ['PRT-ORG-07', '동아포크리스 전대', '6068100775', '한상수', '임대업', '지게차 단기·장기 전대', '경상남도 창원시 성산구 공단로 455', '055-261-7707', 'sub2@donga-lease.co.kr', ['전대공급처', '매입처']],
  ['PRT-ORG-08', '경인리프트솔루션 전대', '1218100888', '오승환', '임대업', '고소작업·전동지게차 임대', '경기도 김포시 대곶면 율생로 180', '031-988-8808', 'sub3@kyungin-lift.co.kr', ['전대공급처', '매입처']],
  ['PRT-ORG-09', '태양중장비임대 전대', '3058100990', '강민규', '임대업', '대형 디젤·리튬 지게차', '충청북도 청주시 흥덕구 직지대로 512', '043-264-9909', 'sub4@taeyang-eq.co.kr', ['전대공급처', '매입처']],
  ['PRT-ORG-10', '평택종합중기정비 외주', '1258101012', '조영진', '수리업', '전동·유압 지게차 정비', '경기도 평택시 포승읍 평택항만길 88', '031-681-1010', 'svc1@pt-repair.co.kr', ['외주정비처', '매입처']],
  ['PRT-ORG-11', '남동유압전장기술 외주', '1378101125', '서동욱', '수리업', '마스트·컨트롤러 수리', '인천광역시 남동구 청능대로 294', '032-814-1120', 'svc2@nd-hydraulic.co.kr', ['외주정비처', '매입처']],
  ['PRT-ORG-12', '구미배터리리빌드 외주', '5138101238', '장현우', '수리업', '리튬배터리·BMS 수리', '경상북도 구미시 3공단2로 150', '054-472-1230', 'svc3@gumi-bms.co.kr', ['외주정비처', '매입처']],
  ['PRT-ORG-13', '양산타이어현장서비스 외주', '6218101341', '임채성', '수리업', '출장 타이어 압입·교체', '경상남도 양산시 유산공단4길 42', '055-383-1340', 'svc4@ys-tire.co.kr', ['외주정비처', '매입처']],
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function billingDateForYm(ym) {
  return ym === '2026-11' ? '2026-11-16' : monthLastDay(ym);
}

async function main() {
  const env = loadEnv();
  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();

  const viteServer = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const supMod = await viteServer.ssrLoadModule('/src/core/supabase.ts');
    const engMod = await viteServer.ssrLoadModule('/src/services/domainEngine.ts');
    const fsMod = await viteServer.ssrLoadModule('/src/services/financialStatementEngine.ts');

    const {
      DEFAULT_TENANT_ID,
      flSupabase,
      selectAllFlRows,
      snakeToCamelRow,
      camelToSnakeRow,
      newId,
      execDbMutation,
    } = supMod;

    const {
      confirmPurchaseInbound,
      settleApPayable,
      createFinanceLeaseWithAsset,
      payLeaseInstallment,
      executeAccountTransfer,
      completeFulfillment,
      executeRentalExchange,
      recordTradeAftercare,
      recordRentalMaintenance,
      buildContractBillingLines,
      recordBillingCollection,
      recordLogisticsDispatch,
      syncRentalAssetsDepreciationInDb,
      addDaysIso,
    } = engMod;

    const { generateFinancialStatements } = fsMod;

    console.log('1) Resetting non-starter records cleanly inside transaction...');
    await pg.query('BEGIN');
    try {
      await pg.query(`DELETE FROM fl_approval_requests WHERE tenant_id = $1`, [DEFAULT_TENANT_ID]);
      await pg.query(`DELETE FROM fl_collections WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.collections]);
      await pg.query(`DELETE FROM fl_bank_transactions WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.bankTransactions]);
      await pg.query(`DELETE FROM fl_billings WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.billings]);
      await pg.query(`DELETE FROM fl_ap_payables WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.apPayables]);
      await pg.query(`DELETE FROM fl_logistics_dispatches WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.logisticsDispatches]);
      await pg.query(`DELETE FROM fl_rental_maintenances WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.rentalMaintenances]);
      await pg.query(`DELETE FROM fl_trade_aftercare_cases WHERE tenant_id = $1`, [DEFAULT_TENANT_ID]);
      await pg.query(`DELETE FROM fl_fulfillments WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.fulfillments]);
      await pg.query(`DELETE FROM fl_contract_lines WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.contractLines]);
      await pg.query(`DELETE FROM fl_contracts WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.contracts]);
      await pg.query(`DELETE FROM fl_quotations WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.quotations]);
      await pg.query(`DELETE FROM fl_finance_lease_schedules WHERE tenant_id = $1 AND lease_id <> 'FLS-2610-001'`, [DEFAULT_TENANT_ID]);
      await pg.query(`DELETE FROM fl_finance_leases WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.financeLeases]);
      await pg.query(`DELETE FROM fl_asset_events WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.assetEvents]);
      await pg.query(`DELETE FROM fl_stock_movements WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.stockMovements]);
      await pg.query(`DELETE FROM fl_inventory_units WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.inventoryUnits]);
      await pg.query(`DELETE FROM fl_purchase_lines WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.purchaseLines]);
      await pg.query(`DELETE FROM fl_purchases WHERE tenant_id = $1 AND NOT (id = ANY($2))`, [DEFAULT_TENANT_ID, STARTER_IDS.purchases]);
      await pg.query(`DELETE FROM fl_catalog_packages WHERE tenant_id = $1 AND id LIKE 'CAT-ORG-%'`, [DEFAULT_TENANT_ID]);
      await pg.query(`DELETE FROM fl_partner_sites WHERE tenant_id = $1 AND id LIKE 'SITE-ORG-%'`, [DEFAULT_TENANT_ID]);
      await pg.query(`DELETE FROM fl_partners WHERE tenant_id = $1 AND id LIKE 'PRT-ORG-%'`, [DEFAULT_TENANT_ID]);
      await pg.query(`DELETE FROM fl_item_masters WHERE tenant_id = $1 AND id LIKE 'CSM-ORG-%'`, [DEFAULT_TENANT_ID]);

      // Fix 3 starter defects
      await pg.query(`UPDATE fl_inventory_units SET qty_on_hand = 0, updated_at = NOW() WHERE id = 'UNIT-TR-001'`);
      await pg.query(`UPDATE fl_ap_payables SET fx_gain_loss_krw = -110000, updated_at = NOW() WHERE id = 'AP-2610-001'`);
      await pg.query(
        `INSERT INTO fl_ap_payables (
          id, tenant_id, payable_no, payable_type, partner_id, partner_name,
          ref_table, ref_id, currency_code, booked_fx_rate, foreign_amount,
          supply_amount_krw, vat_amount_krw, total_amount_krw, paid_amount_krw,
          settled_fx_rate, fx_gain_loss_krw, status, due_date, accrual_date, memo
        ) VALUES (
          'AP-LOG-2611-001', $1, 'AP-LOG-2611-001', 'LOGISTICS', 'TCOM-0000001', '평택항만중량화물',
          'fl_logistics_dispatches', 'LOG-2611-001', 'KRW', 1, 0,
          250000, 25000, 275000, 0, NULL, 0, 'UNPAID', '2026-12-02', '2026-11-02',
          '기초 배차 LOG-2611-001 정산 미지급금 동기화'
        ) ON CONFLICT (id) DO NOTHING`,
        [DEFAULT_TENANT_ID]
      );

      // Enrich masters: 25 consumables + update 35 parts item_domain='BOTH' + 13 specialized partners + 3 catalog packages
      for (const [id, sku, name, subSpec, cost] of NEW_CONSUMABLES) {
        const dealer = Math.round(cost * 1.35);
        const retail = Math.round(cost * 1.65);
        await pg.query(
          `INSERT INTO fl_item_masters (
            id, tenant_id, sku, name, item_category, item_domain, management_type,
            manufacturer, model_name, tonnage, power_type, spec_summary, unit_name,
            standard_cost_krw, dealer_price_krw, retail_price_krw,
            standard_monthly_rental_krw, standard_daily_rental_krw,
            depreciation_months, residual_value_krw, warehouse_location,
            vdi_specs, mast_specs, battery_options, oem_cross_ref_codes, compatible_models,
            is_active, memo
          ) VALUES (
            $1, $2, $3, $4, '소모품', 'BOTH', 'LOT',
            '국내협력사', $5, 0, '공통', $6, 'EA',
            $7, $8, $9, 0, 0, 0, 0, '평택 소모품 창고',
            '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            true, '정비·유통 겸용 표준 소모품'
          )`,
          [id, DEFAULT_TENANT_ID, sku, name, subSpec, `${subSpec} 규격 소모품`, cost, dealer, retail]
        );
      }

      await pg.query(`
        UPDATE fl_item_masters
        SET item_domain = 'BOTH', updated_at = NOW()
        WHERE id IN (
          SELECT id FROM fl_item_masters
          WHERE tenant_id = $1 AND item_category = '부품'
          ORDER BY id LIMIT 35
        )
      `, [DEFAULT_TENANT_ID]);

      for (let i = 0; i < SPECIALIZED_PARTNERS.length; i++) {
        const [id, name, bizRegNo, rep, bizType, bizItem, addr, phone, email, roles] = SPECIALIZED_PARTNERS[i];
        await pg.query(
          `INSERT INTO fl_partners (
            id, tenant_id, name, biz_reg_no, representative, biz_type, biz_item,
            address, phone, email, tax_email, partner_roles,
            default_closing_day, default_payment_cycle, default_payment_month_offset,
            default_payment_due_day, payment_method, bank_name, bank_account, bank_holder,
            credit_grade, is_active, nts_status, nts_tax_type, nts_checked_at, memo
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $10, $11::jsonb,
            25, '익월', 1, 10, '계좌이체', '기업은행', $12, $3,
            'A', true, '정상', '부가가치세 일반과세자', NOW(), '특화 파트너'
          )`,
          [id, DEFAULT_TENANT_ID, name, bizRegNo, rep, bizType, bizItem, addr, phone, email, JSON.stringify(roles), `010-${1100 + i}-004412`]
        );
        const siteId = id.replace('PRT-ORG-', 'SITE-ORG-');
        await pg.query(
          `INSERT INTO fl_partner_sites (
            id, tenant_id, partner_id, site_name, address, contact_name, contact_phone, contact_email, is_primary, is_active, memo
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, true, true, '본사 거점'
          )`,
          [siteId, DEFAULT_TENANT_ID, id, `${name} 본사`, addr, rep, phone, email]
        );
      }

      const catRows = [
        ['CAT-ORG-01', 'CAT-ORG-01', '2026 리튬 전동지게차 대리점 공급 카탈로그', '1.5~7.0톤 리튬 지게차 및 어태치먼트 공급 단가표', '대리점', ['CPD18-XEY2HA-SI', 'CPD25-XEY2HA-SI', 'CPD30-XEY2HA-SI', 'CPD70-XEY2-SI'], ['MJ-XE-18', 'MJ-XE-25', 'MJ-XE-3', 'MJ-X-7', 'MJ-OPT-01', 'MJ-OPT-04'], true, true, false],
        ['CAT-ORG-02', 'CAT-ORG-02', '물류창고 리치·파레트트럭 임대 패키지', '냉동·저온 창고 대응 입승식 리치트럭 및 안전 옵션', '매출처', ['CQD18-XEY2-SI', 'CQD15-XEY2-SI', 'CBD20-Li'], ['MJ-CQD-18', 'MJ-CQD-15', 'MJ-CBD-2', 'MJ-OPT-06', 'MJ-OPT-07'], true, true, false],
        ['CAT-ORG-03', 'CAT-ORG-03', '현장 정비 부품 · 소모품 정기 보충 카탈로그', '타이어·포크·필터·유압유 현장 긴급 조달 품목', '매출처', ['공통'], ['FL-TIRE-70012-BLK', 'FL-TIRE-6009-BLK', 'FL-CSM-001', 'FL-CSM-006', 'FL-CSM-007'], true, true, false],
      ];
      for (const [id, code, title, sub, role, models, skus, showPrice, showStock, isDef] of catRows) {
        await pg.query(
          `INSERT INTO fl_catalog_packages (
            id, tenant_id, catalog_code, title, subtitle, target_partner_role,
            target_models, selected_item_skus, show_unit_price, show_stock,
            header_notice, footer_contact, is_default
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10,
            '당사 보유 실물 재고 및 즉시 출고 가능 대수 기준 안내입니다.',
            '영업지원팀 031-682-0041 · sales@ebrofl.co.kr', $11
          )`,
          [id, DEFAULT_TENANT_ID, code, title, sub, role, JSON.stringify(models), JSON.stringify(skus), showPrice, showStock, isDef]
        );
      }

      await pg.query('COMMIT');
    } catch (e) {
      await pg.query('ROLLBACK');
      throw e;
    }

    const fetchAllCamel = async (table, options) => {
      const res = await selectAllFlRows(table, options);
      if (res.error) throw new Error(`${table} 조회 실패: ${res.error.message || JSON.stringify(res.error)}`);
      return (res.data || []).map((r) => snakeToCamelRow(r));
    };

    // Reload master tables via selectAllFlRows
    const [items, partners, sites, users] = await Promise.all([
      fetchAllCamel('item_masters', { orderCol: 'id', ascending: true }),
      fetchAllCamel('partners', { orderCol: 'id', ascending: true }),
      fetchAllCamel('partner_sites', { orderCol: 'id', ascending: true }),
      fetchAllCamel('users', { orderCol: 'tier_level', ascending: false }),
    ]);

    const itemById = new Map(items.map((x) => [x.id, x]));
    const partnerById = new Map(partners.map((x) => [x.id, x]));
    const siteByPartner = new Map();
    for (const s of sites) {
      if (!siteByPartner.has(s.partnerId)) siteByPartner.set(s.partnerId, s);
    }

    const finishedItems = items.filter((x) => x.itemCategory === '완제품' && x.managementType === 'SERIAL' && Number(x.standardCostKrw) > 0);
    const attachItems = items.filter((x) => x.itemCategory === '어태치먼트' && x.managementType === 'LOT' && Number(x.standardCostKrw) > 0);
    const partItems = items.filter((x) => x.itemCategory === '부품' && x.managementType === 'LOT' && Number(x.standardCostKrw) > 0);
    const consumableItems = items.filter((x) => x.id.startsWith('CSM-ORG-'));

    const activeCustomers = partners.filter(
      (p) =>
        p.isActive &&
        p.ntsStatus !== '폐업' &&
        p.ntsStatus !== '휴업' &&
        (p.partnerRoles.includes('매출처') || p.partnerRoles.includes('대리점')) &&
        p.id !== 'CUST-MJ-002'
    );
    const dealers = partners.filter((p) => p.partnerRoles.includes('대리점'));
    const suppliers = [
      partnerById.get('VEND-FL-001'),
      partnerById.get('VEND-FL-002'),
      partnerById.get('VEND-FL-003'),
      partnerById.get('VEND-FL-004'),
      partnerById.get('VND-MJ-001'),
      partnerById.get('VND-MJ-002'),
    ].filter(Boolean);
    const lenders = [
      partnerById.get('PRT-FIN-KB'),
      partnerById.get('CUST-MJ-002'),
      partnerById.get('PRT-FIN-KDB'),
    ].filter(Boolean);
    const carriers = ['TCOM-0000001', 'TCOM-0000002', 'TCOM-0000003', 'TCOM-0000004']
      .map((id) => partnerById.get(id))
      .filter(Boolean);
    const subleaseSuppliers = ['PRT-ORG-06', 'PRT-ORG-07', 'PRT-ORG-08', 'PRT-ORG-09']
      .map((id) => partnerById.get(id))
      .filter(Boolean);
    const extRepairVendors = ['PRT-ORG-10', 'PRT-ORG-11', 'PRT-ORG-12', 'PRT-ORG-13']
      .map((id) => partnerById.get(id))
      .filter(Boolean);

    const adminUser = users.find((u) => u.id === 'u-1') || users[0];
    const mechUser = users.find((u) => u.id === 'u-demo-mech') || adminUser;
    const salesUsers = users.filter((u) => u.tierLevel >= 2 && u.tierLevel <= 5);
    const getSalesperson = (idx) => (salesUsers.length ? salesUsers[idx % salesUsers.length] : adminUser);

    // Track all newly created objects cleanly in memory
    const seededTradeUnits = [];
    const seededAttachLots = [];
    const seededPartLots = [];
    const seededConsLots = [];
    const seededRentalUnits = [];
    const seededSubleaseUnits = [];
    const seededPayables = [];
    const seededLeases = [];
    const seededLeaseSchedules = [];

    console.log('2) Confirming 14 TRADE purchases (forklifts, attachments, parts, consumables)...');
    let snCounter = 1001;
    const nextSerial = (prefix) => `${prefix}-${String(snCounter++).padStart(4, '0')}`;

    const tradePurchaseConfigs = [
      // Import USD/CNY/EUR/JPY purchases for forklifts (ancillary on SERIAL only so every LOT line divides evenly by qty)
      { date: '2026-03-04', type: 'IMPORT', curr: 'USD', fx: 1360, supIdx: 0, duty: 2400000, ocean: 1400000, clear: 450000, inland: 350000, forklifts: [[0, 6], [1, 6]], attachments: [] },
      { date: '2026-04-06', type: 'IMPORT', curr: 'CNY', fx: 190, supIdx: 4, duty: 2100000, ocean: 1200000, clear: 420000, inland: 380000, forklifts: [[2, 5], [3, 5]], attachments: [] },
      { date: '2026-05-08', type: 'IMPORT', curr: 'USD', fx: 1375, supIdx: 5, duty: 1950000, ocean: 1150000, clear: 400000, inland: 300000, forklifts: [[4, 5], [5, 3]], attachments: [] },
      { date: '2026-06-05', type: 'IMPORT', curr: 'EUR', fx: 1490, supIdx: 1, duty: 1600000, ocean: 950000, clear: 350000, inland: 300000, forklifts: [[6, 5], [7, 4]], attachments: [] },
      { date: '2026-07-07', type: 'IMPORT', curr: 'USD', fx: 1390, supIdx: 0, duty: 1800000, ocean: 1100000, clear: 380000, inland: 320000, forklifts: [[8, 4], [9, 4]], attachments: [] },
      { date: '2026-08-06', type: 'IMPORT', curr: 'CNY', fx: 194, supIdx: 4, duty: 1500000, ocean: 900000, clear: 350000, inland: 250000, forklifts: [[10, 6], [11, 4]], attachments: [] },
      { date: '2026-09-04', type: 'IMPORT', curr: 'USD', fx: 1365, supIdx: 2, duty: 1200000, ocean: 800000, clear: 320000, inland: 280000, forklifts: [[0, 4], [1, 4]], attachments: [] },
      { date: '2026-10-08', type: 'IMPORT', curr: 'JPY', fx: 9, supIdx: 1, duty: 900000, ocean: 650000, clear: 280000, inland: 220000, forklifts: [[2, 3]], attachments: [] },
      // Domestic KRW purchases with 0 ancillary -> exact integer unitCost per LOT unit (0 KRW rounding drift)
      { date: '2026-04-12', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 2, duty: 0, ocean: 0, clear: 0, inland: 0, forklifts: [], attachments: [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6]] },
      { date: '2026-07-14', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 2, duty: 0, ocean: 0, clear: 0, inland: 0, forklifts: [], attachments: [[6, 8], [7, 8], [8, 6], [9, 6], [10, 6], [11, 6]] },
      { date: '2026-03-10', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 3, duty: 0, ocean: 0, clear: 0, inland: 0, parts: Array.from({ length: 15 }, (_, k) => [k, 48]), cons: [] },
      { date: '2026-06-12', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 3, duty: 0, ocean: 0, clear: 0, inland: 0, parts: Array.from({ length: 15 }, (_, k) => [k + 15, 42]), cons: [] },
      { date: '2026-03-16', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 3, duty: 0, ocean: 0, clear: 0, inland: 0, parts: [], cons: Array.from({ length: 13 }, (_, k) => [k, 65]) },
      { date: '2026-07-20', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 3, duty: 0, ocean: 0, clear: 0, inland: 0, parts: [], cons: Array.from({ length: 13 }, (_, k) => [k === 12 ? 0 : k + 13, 60]) },
    ];

    for (let i = 0; i < tradePurchaseConfigs.length; i++) {
      const cfg = tradePurchaseConfigs[i];
      const sup = suppliers[cfg.supIdx % suppliers.length];
      const lines = [];
      for (const [fIdx, qty] of cfg.forklifts || []) {
        const it = finishedItems[fIdx % finishedItems.length];
        const fUnit = Math.max(100, Math.round(Number(it.standardCostKrw) * 0.88 / cfg.fx));
        lines.push({
          itemId: it.id,
          sku: it.sku,
          itemName: it.name,
          itemCategory: '완제품',
          managementType: 'SERIAL',
          quantity: qty,
          foreignUnitPrice: fUnit,
          serialList: Array.from({ length: qty }, () => nextSerial('TR')),
          warehouseLocation: '평택 제1창고',
        });
      }
      for (const [aIdx, qty] of cfg.attachments || []) {
        const it = attachItems[aIdx % attachItems.length];
        lines.push({
          itemId: it.id,
          sku: it.sku,
          itemName: it.name,
          itemCategory: '어태치먼트',
          managementType: 'LOT',
          quantity: qty,
          foreignUnitPrice: Math.round(Number(it.standardCostKrw)),
          lotNo: `LOT-ATT-${pad2(i + 1)}-${pad2(aIdx + 1)}`,
          warehouseLocation: '평택 어태치먼트랙',
        });
      }
      for (const [pIdx, qty] of cfg.parts || []) {
        const it = partItems[pIdx % partItems.length];
        lines.push({
          itemId: it.id,
          sku: it.sku,
          itemName: it.name,
          itemCategory: '부품',
          managementType: 'LOT',
          quantity: qty,
          foreignUnitPrice: Math.round(Number(it.standardCostKrw)),
          lotNo: `LOT-PRT-${pad2(i + 1)}-${pad2(pIdx + 1)}`,
          warehouseLocation: '평택 부품창고',
        });
      }
      for (const [cIdx, qty] of cfg.cons || []) {
        const it = consumableItems[cIdx % consumableItems.length];
        lines.push({
          itemId: it.id,
          sku: it.sku,
          itemName: it.name,
          itemCategory: '소모품',
          managementType: 'LOT',
          quantity: qty,
          foreignUnitPrice: Math.round(Number(it.standardCostKrw)),
          lotNo: `LOT-CSM-${pad2(i + 1)}-${pad2(cIdx + 1)}`,
          warehouseLocation: '평택 소모품창고',
        });
      }

      const res = await confirmPurchaseInbound({
        purchaseType: cfg.type,
        supplier: sup,
        targetDomain: 'TRADE',
        blNo: cfg.type === 'IMPORT' ? `BL-TR-26-${pad2(i + 1)}` : undefined,
        currencyCode: cfg.curr,
        fxRate: cfg.fx,
        fxDate: cfg.date,
        customsDutyKrw: cfg.duty,
        oceanFreightKrw: cfg.ocean,
        clearanceFeeKrw: cfg.clear,
        inlandFreightKrw: cfg.inland,
        effectiveDate: cfg.date,
        actorId: adminUser.id,
        actorName: adminUser.name,
        memo: `유통 실물 매입입고 #${i + 1}`,
        lines,
      });
      seededPayables.push(res.payable);
      for (const u of res.units) {
        if (u.itemCategory === '완제품') seededTradeUnits.push(u);
        else if (u.itemCategory === '어태치먼트') seededAttachLots.push(u);
        else if (u.itemCategory === '부품') seededPartLots.push(u);
        else if (u.itemCategory === '소모품') seededConsLots.push(u);
      }
    }

    console.log('3) Acquiring 52 Rental/Sublease Assets (8 Rental Purchases, 12 Finance Leases, 6 Subleases, 2 Account Transfers)...');
    const rentalPurchaseCfgs = [
      { date: '2026-03-10', type: 'IMPORT', curr: 'USD', fx: 1355, supIdx: 0, duty: 1600000, ocean: 900000, clear: 350000, inland: 250000, specs: [[0, 2], [1, 2]] },
      { date: '2026-04-08', type: 'IMPORT', curr: 'CNY', fx: 190, supIdx: 4, duty: 1400000, ocean: 850000, clear: 320000, inland: 230000, specs: [[2, 2], [4, 2]] },
      { date: '2026-05-12', type: 'IMPORT', curr: 'USD', fx: 1370, supIdx: 5, duty: 1500000, ocean: 900000, clear: 300000, inland: 250000, specs: [[1, 2], [6, 2]] },
      { date: '2026-06-10', type: 'IMPORT', curr: 'EUR', fx: 1485, supIdx: 1, duty: 1300000, ocean: 750000, clear: 300000, inland: 200000, specs: [[7, 2], [8, 2]] },
      { date: '2026-07-09', type: 'IMPORT', curr: 'USD', fx: 1385, supIdx: 0, duty: 1450000, ocean: 850000, clear: 320000, inland: 220000, specs: [[9, 2], [10, 2]] },
      { date: '2026-08-11', type: 'IMPORT', curr: 'CNY', fx: 193, supIdx: 4, duty: 1300000, ocean: 800000, clear: 280000, inland: 200000, specs: [[3, 2], [11, 2]] },
      { date: '2026-09-08', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 2, duty: 0, ocean: 0, clear: 0, inland: 0, specs: [[0, 2], [2, 2]] },
      { date: '2026-10-10', type: 'DOMESTIC', curr: 'KRW', fx: 1, supIdx: 2, duty: 0, ocean: 0, clear: 0, inland: 0, specs: [[1, 2], [4, 2]] },
    ];
    for (let i = 0; i < rentalPurchaseCfgs.length; i++) {
      const cfg = rentalPurchaseCfgs[i];
      const sup = suppliers[cfg.supIdx % suppliers.length];
      const lines = cfg.specs.map(([fIdx, qty]) => {
        const it = finishedItems[fIdx % finishedItems.length];
        const fUnit = Math.max(100, Math.round(Number(it.standardCostKrw) * 0.9 / cfg.fx));
        return {
          itemId: it.id,
          sku: it.sku,
          itemName: it.name,
          itemCategory: '완제품',
          managementType: 'SERIAL',
          quantity: qty,
          foreignUnitPrice: fUnit,
          serialList: Array.from({ length: qty }, () => nextSerial('RN')),
          warehouseLocation: '평택 렌탈주기장',
        };
      });
      const res = await confirmPurchaseInbound({
        purchaseType: cfg.type,
        supplier: sup,
        targetDomain: 'RENTAL',
        blNo: cfg.type === 'IMPORT' ? `BL-RN-26-${pad2(i + 1)}` : undefined,
        currencyCode: cfg.curr,
        fxRate: cfg.fx,
        fxDate: cfg.date,
        customsDutyKrw: cfg.duty,
        oceanFreightKrw: cfg.ocean,
        clearanceFeeKrw: cfg.clear,
        inlandFreightKrw: cfg.inland,
        effectiveDate: cfg.date,
        actorId: adminUser.id,
        actorName: adminUser.name,
        memo: `렌탈자산 실물 매입입고 #${i + 1}`,
        lines,
      });
      seededPayables.push(res.payable);
      for (const u of res.units) {
        const it = itemById.get(u.itemId);
        const mRent = Math.max(450000, Math.round(Number(it?.standardMonthlyRentalKrw || 680000) / 1000) * 1000);
        const dRent = Math.max(25000, Math.round(mRent / 22 / 100) * 100);
        await execDbMutation('렌탈 표준단가 지정', () =>
          flSupabase.from('inventory_units').update(camelToSnakeRow({
            monthlyRentalFeeKrw: mRent,
            dailyRentalFeeKrw: dRent,
          })).eq('id', u.id)
        );
        u.monthlyRentalFeeKrw = mRent;
        u.dailyRentalFeeKrw = dRent;
        seededRentalUnits.push(u);
      }
    }

    // 12 Finance Leases across 2026-03 ~ 2026-10
    const leaseStartDates = [
      '2026-03-18', '2026-04-12', '2026-04-22', '2026-05-15',
      '2026-06-10', '2026-06-20', '2026-07-14', '2026-07-24',
      '2026-08-12', '2026-09-10', '2026-09-22', '2026-10-12',
    ];
    for (let i = 0; i < leaseStartDates.length; i++) {
      const it = finishedItems[i % Math.min(8, finishedItems.length)];
      const lender = lenders[i % lenders.length];
      const principal = Math.round(Number(it.standardCostKrw) * 1.15 / 100000) * 100000;
      const mRent = Math.max(550000, Math.round(Number(it.standardMonthlyRentalKrw || 780000) / 1000) * 1000);
      const dRent = Math.max(30000, Math.round(mRent / 22 / 100) * 100);
      const res = await createFinanceLeaseWithAsset({
        lender,
        itemId: it.id,
        sku: it.sku,
        itemName: it.name,
        serialNo: nextSerial('FLS'),
        principalAmountKrw: Math.max(12000000, principal),
        annualInterestRate: 5.2 + (i % 4) * 0.4,
        termMonths: i % 3 === 0 ? 24 : i % 3 === 1 ? 36 : 48,
        repaymentMethod: i < 8 ? '원리금균등' : '원금균등',
        startDate: leaseStartDates[i],
        paymentDay: (i % 2 === 0 ? 15 : 22),
        monthlyRentalFeeKrw: mRent,
        dailyRentalFeeKrw: dRent,
        actorName: adminUser.name,
        memo: `${lender.name} 금융리스 장비 취득 #${i + 1}`,
      });
      seededLeases.push(res.lease);
      seededLeaseSchedules.push(...res.schedules);
      seededRentalUnits.push(res.unit);
    }

    // Pay lease installments <= 2026-10 AND first 5 leases' 2026-11 installment (leaving 7 unpaid in 2026-11 for BankMatchingPage OUT candidates)
    for (let li = 0; li < seededLeases.length; li++) {
      let curLease = seededLeases[li];
      const schs = seededLeaseSchedules.filter((s) => s.leaseId === curLease.id).sort((a, b) => a.installmentNo - b.installmentNo);
      for (const sch of schs) {
        if (sch.dueYm > '2026-11') break;
        if (sch.dueYm === '2026-11' && li >= 5) continue;
        const paidDate = sch.dueDate <= '2026-11-15' ? sch.dueDate : '2026-11-14';
        const btxId = newId('BTX');
        await execDbMutation('리스 할부 출금 통장내역', () =>
          flSupabase.from('bank_transactions').insert(camelToSnakeRow({
            id: btxId,
            tenantId: DEFAULT_TENANT_ID,
            txDate: paidDate,
            txDirection: 'OUT',
            bankName: '기업은행',
            accountNo: '214-081234-01-011',
            counterpartyName: curLease.lenderName,
            amountKrw: Math.round(sch.totalInstallmentKrw),
            matchedType: 'LEASE_INSTALLMENT',
            matchedId: sch.id,
            matchStatus: 'MATCHED',
            memo: `${curLease.leaseNo} #${sch.installmentNo} 자동이체`,
          }))
        );
        const payRes = await payLeaseInstallment({
          lease: curLease,
          schedule: sch,
          paidDate,
          bankTxId: btxId,
        });
        curLease = payRes.updatedLease;
        sch.isPaid = true;
        sch.paidDate = paidDate;
        sch.bankTxId = btxId;
      }
      seededLeases[li] = curLease;
    }

    // 6 SUBLEASE units
    const subleaseDates = ['2026-05-04', '2026-06-02', '2026-07-03', '2026-08-05', '2026-09-02', '2026-09-18'];
    for (let i = 0; i < subleaseDates.length; i++) {
      const it = finishedItems[(i + 1) % finishedItems.length];
      const subSup = subleaseSuppliers[i % subleaseSuppliers.length];
      const subCost = 420000 + i * 35000;
      const mRent = subCost + 380000;
      const dRent = Math.round(mRent / 22 / 100) * 100;
      const uid = newId('UNIT');
      const subUnit = {
        id: uid,
        tenantId: DEFAULT_TENANT_ID,
        unitCode: uid,
        itemId: it.id,
        sku: it.sku,
        itemName: it.name,
        itemCategory: '완제품',
        managementType: 'SERIAL',
        ownershipDomain: '전대자산',
        serialNo: nextSerial('SUB'),
        lotNo: null,
        qtyOnHand: 1,
        qtyReserved: 0,
        unitCostKrw: 0,
        accumulatedDepreciationKrw: 0,
        bookValueKrw: 0,
        depreciationMonths: 0,
        residualValueKrw: 0,
        status: '보유중',
        acquisitionType: 'SUBLEASE',
        acquisitionDate: subleaseDates[i],
        purchaseLineId: null,
        financeLeaseId: null,
        subleaseSupplierId: subSup.id,
        subleaseSupplierName: subSup.name,
        subleaseMonthlyCostKrw: subCost,
        currentContractId: null,
        currentPartnerId: null,
        currentSiteId: null,
        warehouseLocation: '평택 전대주기장',
        operatingHours: 120 + i * 30,
        monthlyRentalFeeKrw: mRent,
        dailyRentalFeeKrw: dRent,
        memo: `${subSup.name} 타사 전대 장비`,
      };
      await execDbMutation('전대자산 등록', () =>
        flSupabase.from('inventory_units').insert(camelToSnakeRow({ ...subUnit }))
      );
      seededSubleaseUnits.push(subUnit);
    }

    // 2 Account Transfers (유통재고 -> 렌탈자산) in 2026-06 and 2026-08
    const transferDates = ['2026-06-15', '2026-08-18'];
    for (let i = 0; i < transferDates.length; i++) {
      const idx = seededTradeUnits.findIndex((u) => u.status === '보유중' && u.acquisitionDate <= transferDates[i]);
      if (idx === -1) throw new Error('계정대체용 유통재고 부족');
      const [trUnit] = seededTradeUnits.splice(idx, 1);
      const it = itemById.get(trUnit.itemId);
      const mRent = Math.max(480000, Math.round(Number(it?.standardMonthlyRentalKrw || 650000) / 1000) * 1000);
      const dRent = Math.max(25000, Math.round(mRent / 22 / 100) * 100);
      const transferred = await executeAccountTransfer({
        unit: trUnit,
        toDomain: '렌탈자산',
        effectiveDate: transferDates[i],
        actorId: adminUser.id,
        actorName: adminUser.name,
        memo: `렌탈 수요 대응 계정대체 #${i + 1}`,
      });
      await execDbMutation('계정대체 자산 렌탈단가 설정', () =>
        flSupabase.from('inventory_units').update(camelToSnakeRow({
          monthlyRentalFeeKrw: mRent,
          dailyRentalFeeKrw: dRent,
        })).eq('id', transferred.id)
      );
      transferred.monthlyRentalFeeKrw = mRent;
      transferred.dailyRentalFeeKrw = dRent;
      seededRentalUnits.push(transferred);
    }

    console.log(`   -> Trade SERIAL=${seededTradeUnits.length}, AttachLots=${seededAttachLots.length}, PartLots=${seededPartLots.length}, ConsLots=${seededConsLots.length}, Rental=${seededRentalUnits.length}, Sublease=${seededSubleaseUnits.length}`);

    // Helper to create quotations
    console.log('4) Creating 27 Quotations + 36 TRADE Contracts (fulfilled + unfulfilled + aftercare)...');
    const createQuotation = async ({ domain, partner, salesperson, date, rentalMonths, lines, status, convertedContractId, memo }) => {
      const qid = newId(domain === 'TRADE' ? 'QT-TR' : 'QT-RN');
      const supply = lines.reduce((s, l) => s + Math.round(l.supplyAmountKrw), 0);
      const vat = Math.round(supply * 0.1);
      const row = {
        id: qid,
        tenantId: DEFAULT_TENANT_ID,
        quoteNo: qid,
        quoteDomain: domain,
        partnerId: partner.id,
        partnerName: partner.name,
        siteId: siteByPartner.get(partner.id)?.id || null,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        quoteDate: date,
        validUntil: addDaysIso(date, 30),
        rentalMonths: domain === 'RENTAL' ? rentalMonths : 0,
        supplyAmountKrw: supply,
        vatAmountKrw: vat,
        totalAmountKrw: supply + vat,
        lines,
        status,
        convertedContractId: convertedContractId || null,
        memo: memo || null,
      };
      await execDbMutation('견적서 저장', () =>
        flSupabase.from('quotations').insert(camelToSnakeRow({ ...row }))
      );
      return row;
    };

    const createContractWithLines = async ({ domain, partner, salesperson, quotationId, contractDate, startDate, endDate, status, lineSpecs, memo }) => {
      const cid = newId(domain === 'TRADE' ? 'CTR-TR' : 'CTR-RN');
      const site = siteByPartner.get(partner.id);
      const closingDay = partner.defaultClosingDay || 25;
      const cycle = partner.defaultPaymentCycle || '익월';
      const dueDay = cycle === '선입금' ? 0 : (partner.defaultPaymentDueDay || 10);
      const offset = partner.defaultPaymentMonthOffset ?? 1;
      const payMethod = partner.paymentMethod || '계좌이체';

      const builtLines = lineSpecs.map((sp, idx) => {
        const sup = Math.round(sp.qty * sp.unitPriceKrw);
        const vat = Math.round(sup * 0.1);
        return {
          id: newId('CL'),
          tenantId: DEFAULT_TENANT_ID,
          contractId: cid,
          lineNo: idx + 1,
          itemId: sp.item.id,
          sku: sp.item.sku,
          itemName: sp.item.name,
          itemCategory: sp.item.itemCategory,
          managementType: sp.item.managementType,
          quantity: sp.qty,
          fulfilledQty: 0,
          unitPriceKrw: Math.round(sp.unitPriceKrw),
          supplyAmountKrw: sup,
          vatAmountKrw: vat,
          totalAmountKrw: sup + vat,
          optionSummary: sp.optionSummary || null,
          assignedUnitId: null,
          assignedSerialNo: null,
          assignedLotNo: null,
          lineStatus: 'ACTIVE',
          effectiveStartDate: null,
          effectiveEndDate: null,
          predecessorUnitId: null,
          memo: sp.memo || null,
        };
      });

      const supplySum = builtLines.reduce((s, l) => s + l.supplyAmountKrw, 0);
      const vatSum = builtLines.reduce((s, l) => s + l.vatAmountKrw, 0);
      const mRentSum = domain === 'RENTAL' ? builtLines.reduce((s, l) => s + l.supplyAmountKrw, 0) : 0;
      const dRentSum = domain === 'RENTAL' ? Math.round(mRentSum / 22 / 100) * 100 : 0;

      const contract = {
        id: cid,
        tenantId: DEFAULT_TENANT_ID,
        contractNo: cid,
        contractDomain: domain,
        quotationId: quotationId || null,
        partnerId: partner.id,
        partnerName: partner.name,
        siteId: site?.id || null,
        siteName: site?.siteName || partner.name,
        siteAddress: site?.address || partner.address || '경기도 평택시 포승읍',
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        contractDate,
        startDate,
        endDate,
        closingDay,
        paymentCycle: cycle,
        paymentDueDay: dueDay,
        paymentMonthOffset: offset,
        paymentMethod: payMethod,
        supplyAmountKrw: supplySum,
        vatAmountKrw: vatSum,
        totalAmountKrw: supplySum + vatSum,
        monthlyRentalKrw: mRentSum,
        dailyRentalKrw: dRentSum,
        status,
        specialTerms: domain === 'RENTAL' ? '정기 순회정비 포함 · 안전옵션 출고 기준' : '현장 인도 조건',
        memo: memo || null,
      };

      await execDbMutation('계약서 저장', () =>
        flSupabase.from('contracts').insert(camelToSnakeRow({ ...contract }))
      );
      await execDbMutation('계약 품목 저장', () =>
        flSupabase.from('contract_lines').insert(builtLines.map((l) => camelToSnakeRow({ ...l })))
      );
      return { contract, lines: builtLines };
    };

    const createRequestedFulfillment = async ({ domain, actionType, contract, line, unit, qty, memo }) => {
      const fid = newId('FUL');
      const f = {
        id: fid,
        tenantId: DEFAULT_TENANT_ID,
        fulfillmentNo: fid,
        fulfillmentDomain: domain,
        actionType,
        contractId: contract.id,
        contractLineId: line.id,
        partnerId: contract.partnerId,
        partnerName: contract.partnerName,
        siteId: contract.siteId || null,
        itemId: line.itemId,
        unitId: unit?.id || null,
        replacementUnitId: null,
        quantity: qty,
        cogsAmountKrw: 0,
        status: 'REQUESTED',
        effectiveDate: null,
        recordedAt: null,
        executedBy: null,
        memo: memo || null,
      };
      await execDbMutation('출고·회수 의뢰 생성', () =>
        flSupabase.from('fulfillments').insert(camelToSnakeRow({ ...f }))
      );
      return f;
    };

    const tradeContractsCreated = [];
    const refundContractTracker = { contract: null, unit: null, maxRefundSupply: 0 };
    const exchangeCaseTracker = { contract: null, unit: null };
    const supplierBrokerCases = [];

    // 25 Fulfilled TRADE contracts across 2026-03 ~ 2026-11-12
    const pickAvailableTradeForklift = (itemIdOpt, maxDate) => {
      let idx = seededTradeUnits.findIndex(
        (u) => u.status === '보유중' && u.qtyOnHand === 1 && (!itemIdOpt || u.itemId === itemIdOpt) && u.acquisitionDate <= maxDate
      );
      if (idx === -1) {
        idx = seededTradeUnits.findIndex((u) => u.status === '보유중' && u.qtyOnHand === 1 && u.acquisitionDate <= maxDate);
      }
      if (idx === -1) {
        idx = seededTradeUnits.findIndex((u) => u.status === '보유중' && u.qtyOnHand === 1);
      }
      return idx >= 0 ? seededTradeUnits[idx] : null;
    };

    const tradeFulfilledDates = [
      '2026-03-18', '2026-03-25', '2026-04-15', '2026-04-22', '2026-05-14',
      '2026-05-24', '2026-06-12', '2026-06-21', '2026-06-26', '2026-07-16',
      '2026-07-23', '2026-07-28', '2026-08-12', '2026-08-20', '2026-08-26',
      '2026-09-10', '2026-09-18', '2026-09-25', '2026-10-08', '2026-10-16',
      '2026-10-22', '2026-10-28', '2026-11-04', '2026-11-08', '2026-11-12',
    ];

    for (let i = 0; i < tradeFulfilledDates.length; i++) {
      const fDate = tradeFulfilledDates[i];
      const cDate = addDaysIso(fDate, -3);
      const customer = i % 5 === 0 ? dealers[i % dealers.length] : activeCustomers[(i * 3) % activeCustomers.length];
      const sp = getSalesperson(i);

      const lineUnits = [];
      const lineSpecs = [];

      if (i % 7 === 6 && seededAttachLots.length > 0) {
        // Attachment LOT sale
        const uAtt = seededAttachLots.find((u) => u.qtyOnHand >= 2 && u.acquisitionDate <= fDate);
        if (uAtt) {
          const it = itemById.get(uAtt.itemId);
          const sellPrice = Math.max(Math.round(Number(it?.retailPriceKrw || uAtt.unitCostKrw * 1.45)), Math.round(uAtt.unitCostKrw * 1.35));
          lineSpecs.push({ item: it, qty: 2, unitPriceKrw: sellPrice, unit: uAtt });
          lineUnits.push({ unit: uAtt, qty: 2 });
        }
      } else if (i % 9 === 5 && seededPartLots.length > 0 && seededConsLots.length > 0) {
        // Parts + Consumables direct trade sale
        const uPart = seededPartLots.find((u) => u.qtyOnHand >= 8 && u.acquisitionDate <= fDate);
        const uCons = seededConsLots.find((u) => u.qtyOnHand >= 10 && u.acquisitionDate <= fDate);
        if (uPart && uCons) {
          const itP = itemById.get(uPart.itemId);
          const itC = itemById.get(uCons.itemId);
          lineSpecs.push({ item: itP, qty: 6, unitPriceKrw: Math.round(Number(itP.retailPriceKrw) || uPart.unitCostKrw * 1.5), unit: uPart });
          lineUnits.push({ unit: uPart, qty: 6 });
          lineSpecs.push({ item: itC, qty: 8, unitPriceKrw: Math.round(Number(itC.retailPriceKrw) || uCons.unitCostKrw * 1.5), unit: uCons });
          lineUnits.push({ unit: uCons, qty: 8 });
        }
      }

      if (lineSpecs.length === 0) {
        // Finished forklift sale (single or 2-unit multi-line)
        const desiredCount = i % 4 === 1 ? 2 : 1;
        for (let k = 0; k < desiredCount; k++) {
          const uFork = pickAvailableTradeForklift(null, fDate);
          if (!uFork) break;
          // Reserve immediately in memory
          uFork.status = '출고대기';
          const it = itemById.get(uFork.itemId);
          const margin = customer.partnerRoles.includes('대리점') ? 1.24 : 1.34;
          const sellPrice = Math.round((uFork.unitCostKrw * margin) / 10000) * 10000;
          lineSpecs.push({ item: it, qty: 1, unitPriceKrw: sellPrice, unit: uFork });
          lineUnits.push({ unit: uFork, qty: 1 });
        }
      }

      let qId = null;
      if (i < 10) {
        const q = await createQuotation({
          domain: 'TRADE',
          partner: customer,
          salesperson: sp,
          date: addDaysIso(cDate, -4),
          rentalMonths: 0,
          lines: lineSpecs.map((s) => ({
            itemId: s.item.id,
            sku: s.item.sku,
            itemName: s.item.name,
            qty: s.qty,
            unitPriceKrw: s.unitPriceKrw,
            supplyAmountKrw: s.qty * s.unitPriceKrw,
          })),
          status: 'CONVERTED',
          memo: `유통 계약 전환 견적 #${i + 1}`,
        });
        qId = q.id;
      }

      const { contract, lines } = await createContractWithLines({
        domain: 'TRADE',
        partner: customer,
        salesperson: sp,
        quotationId: qId,
        contractDate: cDate,
        startDate: fDate,
        endDate: fDate,
        status: 'ACTIVE',
        lineSpecs,
        memo: `유통 실물 매매계약 #${i + 1}`,
      });
      if (qId) {
        await execDbMutation('견적 전환계약 연결', () =>
          flSupabase.from('quotations').update({ converted_contract_id: contract.id }).eq('id', qId)
        );
      }

      for (let li = 0; li < lines.length; li++) {
        const { unit, qty } = lineUnits[li];
        if (unit.managementType === 'SERIAL') unit.status = '보유중'; // pass valid 보유중 for completeFulfillment
        const req = await createRequestedFulfillment({
          domain: 'TRADE',
          actionType: '유통출고',
          contract,
          line: lines[li],
          unit,
          qty,
          memo: `${contract.contractNo} 출고 의뢰`,
        });
        const comp = await completeFulfillment({
          fulfillment: req,
          contractLine: lines[li],
          unit,
          effectiveDate: fDate,
          actorId: adminUser.id,
          actorName: adminUser.name,
          memo: `${contract.contractNo} 출고 실행완료`,
        });
        Object.assign(unit, comp.unit);
        lines[li].fulfilledQty = qty;
        lines[li].lineStatus = 'FULFILLED';
        lines[li].assignedUnitId = unit.id;
        lines[li].assignedSerialNo = unit.serialNo;
        lines[li].assignedLotNo = unit.lotNo;
        lines[li].effectiveStartDate = fDate;
      }
      contract.status = 'COMPLETED';
      tradeContractsCreated.push({ contract, lines });

      // Designate aftercare candidates on 1-unit SERIAL forklift contracts
      if (lineUnits.length === 1 && lineUnits[0].unit.managementType === 'SERIAL' && lineUnits[0].unit.itemCategory === '완제품') {
        if (!refundContractTracker.contract && fDate >= '2026-08-01' && fDate <= '2026-09-30') {
          refundContractTracker.contract = contract;
          refundContractTracker.unit = lineUnits[0].unit;
          refundContractTracker.maxRefundSupply = lines[0].supplyAmountKrw;
        } else if (!exchangeCaseTracker.contract && fDate >= '2026-09-01' && fDate <= '2026-10-15') {
          const sameModelSpare = seededTradeUnits.find(
            (u) => u.status === '보유중' && u.qtyOnHand === 1 && u.itemId === lineUnits[0].unit.itemId && u.id !== lineUnits[0].unit.id
          );
          if (sameModelSpare) {
            exchangeCaseTracker.contract = contract;
            exchangeCaseTracker.unit = lineUnits[0].unit;
          }
        } else if (supplierBrokerCases.length < 2 && fDate >= '2026-07-01') {
          supplierBrokerCases.push({ contract, unit: lineUnits[0].unit, date: addDaysIso(fDate, 10) });
        }
      }
    }

    // 5 additional non-converted TRADE quotations (SENT, ACCEPTED, DRAFT)
    const extraTradeQStatuses = ['SENT', 'ACCEPTED', 'SENT', 'DRAFT', 'DRAFT'];
    for (let i = 0; i < extraTradeQStatuses.length; i++) {
      const cust = activeCustomers[(i + 5) % activeCustomers.length];
      const it = finishedItems[(i + 2) % finishedItems.length];
      const sp = getSalesperson(i + 1);
      const price = Math.round(Number(it.retailPriceKrw) * 1.05 / 10000) * 10000;
      await createQuotation({
        domain: 'TRADE',
        partner: cust,
        salesperson: sp,
        date: `2026-11-${pad2(4 + i * 2)}`,
        rentalMonths: 0,
        lines: [{ itemId: it.id, sku: it.sku, itemName: it.name, qty: 1 + (i % 2), unitPriceKrw: price, supplyAmountKrw: price * (1 + (i % 2)) }],
        status: extraTradeQStatuses[i],
        memo: `진행중 유통 견적 (${extraTradeQStatuses[i]})`,
      });
    }

    // 11 Pre-Fulfillment / Partial TRADE Contracts (2026-11-10 ~ 2026-11-15) -> pre-fulfillment MUST generate 0 billings
    const tradePendingDates = [
      { date: '2026-11-10', kind: 'FULFILLING_REQ' },
      { date: '2026-11-11', kind: 'FULFILLING_REQ' },
      { date: '2026-11-12', kind: 'FULFILLING_REQ' },
      { date: '2026-11-13', kind: 'FULFILLING_REQ' },
      { date: '2026-11-14', kind: 'FULFILLING_REQ' },
      { date: '2026-11-11', kind: 'PARTIAL_2LINE' },
      { date: '2026-11-13', kind: 'PARTIAL_2LINE' },
      { date: '2026-11-14', kind: 'ACTIVE_NO_REQ' },
      { date: '2026-11-15', kind: 'ACTIVE_NO_REQ' },
      { date: '2026-11-14', kind: 'DRAFT' },
      { date: '2026-11-15', kind: 'DRAFT' },
    ];
    for (let i = 0; i < tradePendingDates.length; i++) {
      const { date, kind } = tradePendingDates[i];
      const cust = activeCustomers[(i + 10) % activeCustomers.length];
      const sp = getSalesperson(i + 2);
      const it1 = finishedItems[(i + 3) % finishedItems.length];
      const price1 = Math.round(Number(it1.retailPriceKrw) * 1.15 / 10000) * 10000;

      if (kind === 'PARTIAL_2LINE') {
        const u1 = pickAvailableTradeForklift(it1.id, date) || pickAvailableTradeForklift(null, date);
        const itReal1 = itemById.get(u1.itemId);
        const it2 = finishedItems[(i + 6) % finishedItems.length];
        const p1 = Math.round((u1.unitCostKrw * 1.32) / 10000) * 10000;
        const p2 = Math.round(Number(it2.retailPriceKrw) * 1.15 / 10000) * 10000;
        const { contract, lines } = await createContractWithLines({
          domain: 'TRADE',
          partner: cust,
          salesperson: sp,
          contractDate: date,
          startDate: date,
          endDate: date,
          status: 'FULFILLING',
          lineSpecs: [
            { item: itReal1, qty: 1, unitPriceKrw: p1 },
            { item: it2, qty: 1, unitPriceKrw: p2 },
          ],
          memo: `부분출고 유통 계약 #${i + 1}`,
        });
        const req1 = await createRequestedFulfillment({
          domain: 'TRADE',
          actionType: '유통출고',
          contract,
          line: lines[0],
          unit: u1,
          qty: 1,
          memo: '1호기 선출고 완료',
        });
        const comp1 = await completeFulfillment({
          fulfillment: req1,
          contractLine: lines[0],
          unit: u1,
          effectiveDate: date,
          actorId: adminUser.id,
          actorName: adminUser.name,
          memo: '부분출고 1호기 완료',
        });
        Object.assign(u1, comp1.unit);
        await createRequestedFulfillment({
          domain: 'TRADE',
          actionType: '유통출고',
          contract,
          line: lines[1],
          unit: null,
          qty: 1,
          memo: '2호기 출고 대기',
        });
      } else {
        const initStatus = kind === 'DRAFT' ? 'DRAFT' : kind === 'FULFILLING_REQ' ? 'FULFILLING' : 'ACTIVE';
        const { contract, lines } = await createContractWithLines({
          domain: 'TRADE',
          partner: cust,
          salesperson: sp,
          contractDate: date,
          startDate: date,
          endDate: addDaysIso(date, 5),
          status: initStatus,
          lineSpecs: [{ item: it1, qty: 1, unitPriceKrw: price1 }],
          memo: `출고전 유통 계약 (${kind})`,
        });
        if (kind === 'FULFILLING_REQ') {
          await createRequestedFulfillment({
            domain: 'TRADE',
            actionType: '유통출고',
            contract,
            line: lines[0],
            unit: null,
            qty: 1,
            memo: '출고 지시 대기',
          });
        }
      }
    }

    // 4 Trade Aftercare cases: 2 공급사 정비중개, 1 반품환불, 1 반품교환
    for (let i = 0; i < supplierBrokerCases.length; i++) {
      const sc = supplierBrokerCases[i];
      await recordTradeAftercare({
        contract: sc.contract,
        unit: sc.unit,
        caseType: '공급사 정비중개',
        supplier: suppliers[i % suppliers.length],
        refundSupplyKrw: 0,
        effectiveDate: sc.date,
        actorId: adminUser.id,
        actorName: adminUser.name,
        memo: '제조사 보증수리 중개 처리',
      });
    }
    if (refundContractTracker.contract) {
      await recordTradeAftercare({
        contract: refundContractTracker.contract,
        unit: refundContractTracker.unit,
        caseType: '반품환불',
        supplier: null,
        refundSupplyKrw: refundContractTracker.maxRefundSupply,
        effectiveDate: '2026-10-12',
        actorId: adminUser.id,
        actorName: adminUser.name,
        memo: '현장 사양 불일치 전액 반품 환불',
      });
      refundContractTracker.unit.status = '보유중';
      refundContractTracker.unit.qtyOnHand = 1;
    }
    if (exchangeCaseTracker.contract) {
      const repUnit = seededTradeUnits.find(
        (u) => u.status === '보유중' && u.qtyOnHand === 1 && u.itemId === exchangeCaseTracker.unit.itemId && u.id !== exchangeCaseTracker.unit.id
      );
      if (repUnit) {
        await recordTradeAftercare({
          contract: exchangeCaseTracker.contract,
          unit: exchangeCaseTracker.unit,
          caseType: '반품교환',
          supplier: null,
          refundSupplyKrw: 0,
          replacementUnit: repUnit,
          effectiveDate: '2026-10-20',
          actorId: adminUser.id,
          actorName: adminUser.name,
          memo: '초기 소음 이슈로 동일모델 신품 반품교환',
        });
        exchangeCaseTracker.unit.status = '보유중';
        exchangeCaseTracker.unit.qtyOnHand = 1;
        repUnit.status = '판매완료';
        repUnit.qtyOnHand = 0;
      }
    }

    console.log('5) Creating 34 RENTAL Contracts (20 ACTIVE fulfilled [top 2026-11-16], 4 Exchange chains, 4 RETURNED, 10 pre-fulfillment)...');
    const allLeasePool = [...seededRentalUnits, ...seededSubleaseUnits];
    const pickAvailableRentalUnit = (maxDate) => {
      let u = allLeasePool.find((x) => x.status === '보유중' && x.acquisitionDate <= maxDate);
      if (!u) u = allLeasePool.find((x) => x.status === '보유중');
      return u || null;
    };

    const rentalActiveDates = [
      '2026-03-22', '2026-04-10', '2026-04-20', '2026-05-15', '2026-05-25',
      '2026-06-12', '2026-06-22', '2026-07-08', '2026-07-20', '2026-08-08',
      '2026-08-18', '2026-09-05', '2026-09-16', '2026-09-25', '2026-10-05',
      '2026-10-15', '2026-10-24', '2026-11-02', '2026-11-08', '2026-11-16',
    ];
    const fulfilledRentalLines = []; // { contract, line, unit }

    for (let i = 0; i < rentalActiveDates.length; i++) {
      const fDate = rentalActiveDates[i];
      const cDate = i === rentalActiveDates.length - 1 ? '2026-11-16' : addDaysIso(fDate, -2);
      const cust = activeCustomers[(i * 2 + 1) % activeCustomers.length];
      const sp = getSalesperson(i);
      const unitCount = i % 5 === 1 ? 2 : 1;
      const chosenUnits = [];
      for (let k = 0; k < unitCount; k++) {
        const u = pickAvailableRentalUnit(fDate);
        if (!u) break;
        u.status = '출고대기';
        chosenUnits.push(u);
      }
      if (chosenUnits.length === 0) throw new Error(`렌탈 가용자산 부족 (index=${i})`);

      const lineSpecs = chosenUnits.map((u) => {
        const it = itemById.get(u.itemId);
        const mRent = u.monthlyRentalFeeKrw > 0 ? u.monthlyRentalFeeKrw : Math.max(520000, Math.round(Number(it.standardMonthlyRentalKrw || 650000) / 1000) * 1000);
        return { item: it, qty: 1, unitPriceKrw: mRent };
      });

      let qId = null;
      if (i < 7) {
        const q = await createQuotation({
          domain: 'RENTAL',
          partner: cust,
          salesperson: sp,
          date: addDaysIso(cDate, -3),
          rentalMonths: 12 + (i % 3) * 12,
          lines: lineSpecs.map((s) => ({
            itemId: s.item.id,
            sku: s.item.sku,
            itemName: s.item.name,
            qty: 1,
            unitPriceKrw: s.unitPriceKrw,
            supplyAmountKrw: s.unitPriceKrw,
          })),
          status: 'CONVERTED',
          memo: `렌탈 계약 전환 견적 #${i + 1}`,
        });
        qId = q.id;
      }

      const endDt = `${Number(fDate.slice(0, 4)) + 1}${fDate.slice(4)}`;
      const { contract, lines } = await createContractWithLines({
        domain: 'RENTAL',
        partner: cust,
        salesperson: sp,
        quotationId: qId,
        contractDate: cDate,
        startDate: fDate,
        endDate: endDt,
        status: 'ACTIVE',
        lineSpecs,
        memo: i === rentalActiveDates.length - 1 ? '당일 신규 렌탈 출고완료 계약 (E2E 최상단)' : `렌탈 운용 계약 #${i + 1}`,
      });
      if (qId) {
        await execDbMutation('렌탈 견적 계약연결', () =>
          flSupabase.from('quotations').update({ converted_contract_id: contract.id }).eq('id', qId)
        );
      }

      for (let li = 0; li < lines.length; li++) {
        const u = chosenUnits[li];
        u.status = '보유중';
        const req = await createRequestedFulfillment({
          domain: 'RENTAL',
          actionType: '렌탈출고',
          contract,
          line: lines[li],
          unit: u,
          qty: 1,
          memo: `${contract.contractNo} 렌탈출고 의뢰`,
        });
        const comp = await completeFulfillment({
          fulfillment: req,
          contractLine: lines[li],
          unit: u,
          effectiveDate: fDate,
          actorId: adminUser.id,
          actorName: adminUser.name,
          memo: `${contract.contractNo} 렌탈출고 완료`,
        });
        Object.assign(u, comp.unit);
        lines[li].fulfilledQty = 1;
        lines[li].lineStatus = 'FULFILLED';
        lines[li].assignedUnitId = u.id;
        lines[li].assignedSerialNo = u.serialNo;
        lines[li].effectiveStartDate = fDate;
        fulfilledRentalLines.push({ contract, line: lines[li], unit: u });
      }
    }

    // 4 Returned (COMPLETED) rental contracts across 2026-04 ~ 2026-10
    const returnCycles = [
      { start: '2026-04-05', end: '2026-07-18', toRepair: true },
      { start: '2026-05-06', end: '2026-08-22', toRepair: false },
      { start: '2026-06-08', end: '2026-09-24', toRepair: true },
      { start: '2026-07-06', end: '2026-10-20', toRepair: false },
    ];
    for (let i = 0; i < returnCycles.length; i++) {
      const cy = returnCycles[i];
      const u = pickAvailableRentalUnit(cy.start);
      if (!u) throw new Error('회수 시나리오용 가용 렌탈자산 부족');
      const it = itemById.get(u.itemId);
      const mRent = u.monthlyRentalFeeKrw > 0 ? u.monthlyRentalFeeKrw : 650000;
      const cust = activeCustomers[(i + 15) % activeCustomers.length];
      const sp = getSalesperson(i + 2);
      const { contract, lines } = await createContractWithLines({
        domain: 'RENTAL',
        partner: cust,
        salesperson: sp,
        contractDate: addDaysIso(cy.start, -2),
        startDate: cy.start,
        endDate: addDaysIso(cy.start, 180),
        status: 'ACTIVE',
        lineSpecs: [{ item: it, qty: 1, unitPriceKrw: mRent }],
        memo: `단기·중기 렌탈 완료(회수) 계약 #${i + 1}`,
      });
      const reqOut = await createRequestedFulfillment({
        domain: 'RENTAL',
        actionType: '렌탈출고',
        contract,
        line: lines[0],
        unit: u,
        qty: 1,
        memo: '단기 렌탈 출고',
      });
      const compOut = await completeFulfillment({
        fulfillment: reqOut,
        contractLine: lines[0],
        unit: u,
        effectiveDate: cy.start,
        actorId: adminUser.id,
        actorName: adminUser.name,
        memo: '단기 렌탈 출고 완료',
      });
      Object.assign(u, compOut.unit);
      lines[0].fulfilledQty = 1;
      lines[0].lineStatus = 'FULFILLED';
      lines[0].assignedUnitId = u.id;
      lines[0].assignedSerialNo = u.serialNo;
      lines[0].effectiveStartDate = cy.start;

      const reqRet = await createRequestedFulfillment({
        domain: 'RENTAL',
        actionType: '렌탈회수',
        contract,
        line: lines[0],
        unit: u,
        qty: 1,
        memo: '렌탈 계약 종료 회수',
      });
      const compRet = await completeFulfillment({
        fulfillment: reqRet,
        contractLine: lines[0],
        unit: u,
        effectiveDate: cy.end,
        actorId: adminUser.id,
        actorName: adminUser.name,
        returnToRepair: cy.toRepair,
        memo: cy.toRepair ? '외관·구동부 점검 위해 정비입고 회수' : '정상 상태 주기장 회수',
      });
      Object.assign(u, compRet.unit);
      lines[0].lineStatus = 'RETURNED';
      lines[0].effectiveEndDate = cy.end;
    }

    // 4 Rental Exchanges via executeRentalExchange (in 2026-06, 2026-08, 2026-09, 2026-10)
    const exchangeDates = ['2026-06-25', '2026-08-22', '2026-09-24', '2026-10-18'];
    const repairQueueUnits = [];
    for (let i = 0; i < exchangeDates.length; i++) {
      const exDate = exchangeDates[i];
      const candidate = fulfilledRentalLines.find(
        (x) =>
          x.line.lineStatus === 'FULFILLED' &&
          x.line.effectiveStartDate <= addDaysIso(exDate, -10) &&
          x.contract.contractDate < '2026-11-01'
      );
      const spareUnit = pickAvailableRentalUnit(exDate);
      if (!candidate || !spareUnit) throw new Error(`교환 시나리오 자산 부족 (${exDate})`);
      const toRepair = i < 3;
      const exRes = await executeRentalExchange({
        contract: candidate.contract,
        oldLine: candidate.line,
        oldUnit: candidate.unit,
        newUnit: spareUnit,
        exchangeDate: exDate,
        actorId: adminUser.id,
        actorName: adminUser.name,
        oldUnitToRepair: toRepair,
        memo: toRepair ? '유압계통 이상 발생으로 대차 교환 및 정비입고' : '고객 요청 사양 변경 대차 교환',
      });
      candidate.line.lineStatus = 'REPLACED_OUT';
      candidate.line.effectiveEndDate = addDaysIso(exDate, -1);
      candidate.unit.status = toRepair ? '정비중' : '보유중';
      candidate.unit.currentContractId = null;
      candidate.unit.currentPartnerId = null;
      spareUnit.status = '대여중';
      spareUnit.currentContractId = candidate.contract.id;
      spareUnit.currentPartnerId = candidate.contract.partnerId;
      if (toRepair) repairQueueUnits.push(candidate.unit);
      fulfilledRentalLines.push({ contract: candidate.contract, line: exRes.newLine, unit: spareUnit });
    }

    // 5 additional non-converted RENTAL quotations (SENT, ACCEPTED, DRAFT)
    const extraRentalQStatuses = ['SENT', 'ACCEPTED', 'SENT', 'DRAFT', 'DRAFT'];
    for (let i = 0; i < extraRentalQStatuses.length; i++) {
      const cust = activeCustomers[(i + 8) % activeCustomers.length];
      const it = finishedItems[(i + 1) % finishedItems.length];
      const sp = getSalesperson(i + 1);
      const mRent = Math.round(Number(it.standardMonthlyRentalKrw || 600000) / 1000) * 1000;
      await createQuotation({
        domain: 'RENTAL',
        partner: cust,
        salesperson: sp,
        date: `2026-11-${pad2(3 + i * 2)}`,
        rentalMonths: 24,
        lines: [{ itemId: it.id, sku: it.sku, itemName: it.name, qty: 1, unitPriceKrw: mRent, supplyAmountKrw: mRent }],
        status: extraRentalQStatuses[i],
        memo: `진행중 렌탈 견적 (${extraRentalQStatuses[i]})`,
      });
    }

    // 10 Pre-Fulfillment / Partial RENTAL contracts strictly with contract_date <= 2026-11-14 (leaving 2026-11-16 ACTIVE+FULFILLED at top)
    const rentalPendingCfgs = [
      { date: '2026-11-11', kind: 'FULFILLING_REQ' },
      { date: '2026-11-11', kind: 'FULFILLING_REQ' },
      { date: '2026-11-12', kind: 'FULFILLING_REQ' },
      { date: '2026-11-12', kind: 'FULFILLING_REQ' },
      { date: '2026-11-13', kind: 'FULFILLING_REQ' },
      { date: '2026-11-12', kind: 'PARTIAL_2LINE' },
      { date: '2026-11-13', kind: 'ACTIVE_NO_REQ' },
      { date: '2026-11-14', kind: 'ACTIVE_NO_REQ' },
      { date: '2026-11-13', kind: 'DRAFT' },
      { date: '2026-11-14', kind: 'DRAFT' },
    ];
    for (let i = 0; i < rentalPendingCfgs.length; i++) {
      const { date, kind } = rentalPendingCfgs[i];
      const cust = activeCustomers[(i + 18) % activeCustomers.length];
      const sp = getSalesperson(i + 1);
      const endDt = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;

      if (kind === 'PARTIAL_2LINE') {
        const u1 = pickAvailableRentalUnit(date);
        const it1 = itemById.get(u1.itemId);
        const it2 = finishedItems[(i + 4) % finishedItems.length];
        const mRent1 = u1.monthlyRentalFeeKrw > 0 ? u1.monthlyRentalFeeKrw : 680000;
        const mRent2 = Math.round(Number(it2.standardMonthlyRentalKrw || 600000) / 1000) * 1000;
        const { contract, lines } = await createContractWithLines({
          domain: 'RENTAL',
          partner: cust,
          salesperson: sp,
          contractDate: date,
          startDate: date,
          endDate: endDt,
          status: 'FULFILLING',
          lineSpecs: [
            { item: it1, qty: 1, unitPriceKrw: mRent1 },
            { item: it2, qty: 1, unitPriceKrw: mRent2 },
          ],
          memo: '복수 대수 중 1대 선출고 · 1대 출고대기 렌탈계약',
        });
        const req1 = await createRequestedFulfillment({
          domain: 'RENTAL',
          actionType: '렌탈출고',
          contract,
          line: lines[0],
          unit: u1,
          qty: 1,
          memo: '1호기 렌탈 선출고',
        });
        const comp1 = await completeFulfillment({
          fulfillment: req1,
          contractLine: lines[0],
          unit: u1,
          effectiveDate: date,
          actorId: adminUser.id,
          actorName: adminUser.name,
          memo: '부분출고 1호기 완료',
        });
        Object.assign(u1, comp1.unit);
        await createRequestedFulfillment({
          domain: 'RENTAL',
          actionType: '렌탈출고',
          contract,
          line: lines[1],
          unit: null,
          qty: 1,
          memo: '2호기 렌탈출고 대기',
        });
      } else {
        const it = finishedItems[(i + 2) % finishedItems.length];
        const mRent = Math.round(Number(it.standardMonthlyRentalKrw || 650000) / 1000) * 1000;
        const initStatus = kind === 'DRAFT' ? 'DRAFT' : kind === 'FULFILLING_REQ' ? 'FULFILLING' : 'ACTIVE';
        const { contract, lines } = await createContractWithLines({
          domain: 'RENTAL',
          partner: cust,
          salesperson: sp,
          contractDate: date,
          startDate: date,
          endDate: endDt,
          status: initStatus,
          lineSpecs: [{ item: it, qty: 1, unitPriceKrw: mRent }],
          memo: `출고전 렌탈 계약 (${kind})`,
        });
        if (kind === 'FULFILLING_REQ') {
          await createRequestedFulfillment({
            domain: 'RENTAL',
            actionType: '렌탈출고',
            contract,
            line: lines[0],
            unit: null,
            qty: 1,
            memo: '렌탈 출고 배정 대기',
          });
        }
      }
    }

    console.log('6) Recording 28 Rental Maintenances (parts + consumables, 6 external AP, 5 customer-billable)...');
    const allSeededRentalPool = [...seededRentalUnits, ...seededSubleaseUnits];
    const rentedOrExUnits = fulfilledRentalLines
      .filter((x) => x.line.lineStatus === 'FULFILLED')
      .map((x) => x);

    const maintDates = [
      '2026-04-24', '2026-05-12', '2026-05-26', '2026-06-08', '2026-06-19',
      '2026-06-28', '2026-07-05', '2026-07-14', '2026-07-22', '2026-07-29',
      '2026-08-06', '2026-08-14', '2026-08-21', '2026-08-28', '2026-09-07',
      '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-14',
      '2026-10-21', '2026-10-27', '2026-11-03', '2026-11-05', '2026-11-07',
      '2026-11-09', '2026-11-11', '2026-11-14',
    ];

    for (let i = 0; i < maintDates.length; i++) {
      const mDate = maintDates[i];
      // Find appropriate rental unit existing on mDate
      let targetEntry = null;
      if (i < 2 && repairQueueUnits[i] && repairQueueUnits[i].acquisitionDate <= mDate) {
        // Bring 2 '정비중' units back to '보유중' (periodic yard repair after exchange)
        const ru = allSeededRentalPool.find((x) => x.status === '정비중' && x.acquisitionDate <= mDate);
        if (ru) targetEntry = { unit: ru, contract: null };
      }
      if (!targetEntry) {
        const activeOnDate = rentedOrExUnits.filter(
          (x) => x.line.effectiveStartDate <= mDate && x.unit.status === '대여중'
        );
        if (activeOnDate.length > 0) {
          targetEntry = activeOnDate[i % activeOnDate.length];
        } else {
          const fallbackUnit = allSeededRentalPool.find((x) => x.acquisitionDate <= mDate) || allSeededRentalPool[0];
          targetEntry = { unit: fallbackUnit, contract: null };
        }
      }

      const partLot = seededPartLots.find((p, idx) => idx >= (i % 15) && p.qtyOnHand >= 2 && p.acquisitionDate <= mDate)
        || seededPartLots.find((p) => p.qtyOnHand >= 2 && p.acquisitionDate <= mDate)
        || seededPartLots.find((p) => p.qtyOnHand >= 2);
      const consLot = seededConsLots.find((c, idx) => idx >= (i % 13) && c.qtyOnHand >= 3 && c.acquisitionDate <= mDate)
        || seededConsLots.find((c) => c.qtyOnHand >= 3 && c.acquisitionDate <= mDate)
        || seededConsLots.find((c) => c.qtyOnHand >= 3);
      const partsUsed = [];
      if (partLot && i % 2 === 0) partsUsed.push({ unit: partLot, qty: 2 });
      if (consLot) partsUsed.push({ unit: consLot, qty: 2 + (i % 2) });

      const isExt = i % 5 === 1 && i <= 26; // 6 external repairs (indices 1,6,11,16,21,26)
      const isBillable = Boolean(targetEntry.contract) && mDate >= '2026-07-01' && (i === 7 || i === 12 || i === 17 || i === 22 || i === 25);
      const extVendor = isExt ? extRepairVendors[i % extRepairVendors.length] : undefined;
      const extCost = isExt ? 240000 + (i % 3) * 80000 : 0;
      const laborCost = isExt ? 60000 : 110000 + (i % 4) * 30000;
      const partsCostEst = partsUsed.reduce((s, p) => s + Math.round(p.unit.unitCostKrw * p.qty), 0);
      const billCharge = isBillable ? Math.round((partsCostEst + laborCost + extCost) * 1.25 / 1000) * 1000 : 0;

      const partnerObj = targetEntry.contract
        ? partnerById.get(targetEntry.contract.partnerId)
        : targetEntry.unit.currentPartnerId
          ? partnerById.get(targetEntry.unit.currentPartnerId)
          : undefined;

      const maintType = targetEntry.unit.status === '정비중' || targetEntry.unit.status === '보유중'
        ? '주기장정비'
        : i % 3 === 0
          ? '현장정비'
          : '순회정비';

      await recordRentalMaintenance({
        maintType,
        unit: targetEntry.unit,
        contract: targetEntry.contract || undefined,
        partner: partnerObj,
        mechanicId: mechUser.id,
        mechanicName: mechUser.name,
        vendorPartner: extVendor,
        operatingHours: targetEntry.unit.operatingHours + 65 + i * 12,
        partsUsed,
        laborCostKrw: laborCost,
        externalCostKrw: extCost,
        isCustomerBillable: isBillable,
        customerChargeKrw: billCharge,
        effectiveDate: mDate,
        memo: isBillable
          ? '현장 과실 파손 유상 정비'
          : isExt
            ? `${extVendor.name} 외주 전문 정비`
            : `${maintType} 부품·소모품 교체 점검`,
      });

      targetEntry.unit.operatingHours += 65 + i * 12;
      if (targetEntry.unit.status === '정비중') targetEntry.unit.status = '보유중';
      for (const pu of partsUsed) {
        pu.unit.qtyOnHand -= pu.qty;
      }
      if (isExt) {
        const latestAp = await flSupabase
          .from('ap_payables')
          .select('*')
          .eq('ref_table', 'fl_rental_maintenances')
          .order('created_at', { ascending: false })
          .limit(1);
        if (latestAp.data?.[0]) seededPayables.push(snakeToCamelRow(latestAp.data[0]));
      }
    }

    console.log('7) Recording 18 Logistics Dispatches (OURS + 4 CUSTOMER linked to fulfilled contracts)...');
    const customerContractsTrade = tradeContractsCreated.filter((x) => x.contract.contractDate >= '2026-06-01');
    const customerContractsRental = fulfilledRentalLines.filter((x) => x.contract.contractDate >= '2026-06-01' && x.contract.status !== 'DRAFT');

    for (let i = 0; i < 18; i++) {
      const carrier = carriers[i % carriers.length];
      let dDate = `2026-${pad2(4 + (i % 8))}-${pad2(10 + (i % 15))}`;
      if (dDate > '2026-11-14') dDate = `2026-11-${pad2(3 + (i % 10))}`;
      let bearer = 'OURS';
      let charge = 0;
      let refContract = null;

      if (i === 4 || i === 10) {
        // CUSTOMER-borne TRADE logistics charge in exact same YM as fulfillment
        const tc = customerContractsTrade[i % customerContractsTrade.length];
        refContract = tc.contract;
        dDate = tc.lines[0].effectiveStartDate;
        bearer = 'CUSTOMER';
        charge = 260000 + i * 10000;
      } else if (i === 7 || i === 14) {
        // CUSTOMER-borne RENTAL logistics charge in active rental month <= 2026-11
        const rc = customerContractsRental[i % customerContractsRental.length];
        refContract = rc.contract;
        dDate = rc.line.effectiveStartDate;
        bearer = 'CUSTOMER';
        charge = 290000 + i * 5000;
      } else if (i % 2 === 0 && tradeContractsCreated[i % tradeContractsCreated.length]) {
        refContract = tradeContractsCreated[i % tradeContractsCreated.length].contract;
      } else if (fulfilledRentalLines[i % fulfilledRentalLines.length]) {
        refContract = fulfilledRentalLines[i % fulfilledRentalLines.length].contract;
      }

      const purpose = i % 5 === 2 ? '교환' : i % 5 === 3 ? '회수운송' : i % 5 === 4 ? '자체이동' : '납품운송';
      const cost = 210000 + (i % 5) * 45000;
      const dRes = await recordLogisticsDispatch({
        dispatchPurpose: purpose,
        carrier,
        driverName: ['김기사', '이운전', '최특수', '정중기'][i % 4],
        driverPhone: `010-77${pad2(10 + i)}-${pad2(30 + i)}11`,
        vehicleNo: `경기88바${2100 + i}`,
        originAddress: purpose === '회수운송' ? (refContract?.siteAddress || '고객사 현장') : '평택 주기장',
        destinationAddress: purpose === '자체이동' ? '평택 제2정비고' : (refContract?.siteAddress || '경기도 용인시 물류센터'),
        relatedRefType: refContract ? 'fl_contracts' : undefined,
        relatedRefId: refContract ? refContract.id : undefined,
        transportCostKrw: cost,
        costBearer: bearer,
        customerChargeKrw: charge,
        dispatchDate: dDate,
        memo: `${purpose} 배차 실운송`,
      });
      seededPayables.push(dRes.payable);
    }

    console.log('8) Generating Monthly Billings via buildContractBillingLines (0 billings for unfulfilled contracts)...');
    const [allContractsRaw, allContractLines, allFulfillments, allMaintenances, allDispatches, existingBillings] = await Promise.all([
      fetchAllCamel('contracts'),
      fetchAllCamel('contract_lines'),
      fetchAllCamel('fulfillments'),
      fetchAllCamel('rental_maintenances'),
      fetchAllCamel('logistics_dispatches'),
      fetchAllCamel('billings'),
    ]);
    const allContracts = allContractsRaw.sort((a, b) => a.contractDate.localeCompare(b.contractDate));

    const billingMonths = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    const seededBillings = [];
    let taxSeq = 1;

    for (const c of allContracts) {
      if (STARTER_IDS.contracts.includes(c.id)) continue;
      for (const ym of billingMonths) {
        const bLines = buildContractBillingLines({
          contract: c,
          contractLines: allContractLines,
          fulfillments: allFulfillments,
          rentalMaintenances: allMaintenances,
          logisticsDispatches: allDispatches,
          existingBillings,
          ym,
        });
        if (!bLines || bLines.length === 0) continue;

        const supply = bLines.reduce((s, l) => s + Math.round(l.supplyAmountKrw), 0);
        const vat = bLines.reduce((s, l) => s + Math.round(l.vatAmountKrw), 0);
        const total = supply + vat;
        const bDate = billingDateForYm(ym);
        const dueDate = addDaysIso(bDate, 15);
        const bid = newId(c.contractDomain === 'TRADE' ? 'BIL-TR' : 'BIL-RN');
        const issuedTax = ym <= '2026-10' || seededBillings.length % 2 === 0;
        const bRec = {
          id: bid,
          tenantId: DEFAULT_TENANT_ID,
          billingNo: bid,
          billingYm: ym,
          billingDomain: c.contractDomain,
          contractId: c.id,
          partnerId: c.partnerId,
          partnerName: c.partnerName,
          billingDate: bDate,
          dueDate,
          supplyAmountKrw: supply,
          vatAmountKrw: vat,
          totalAmountKrw: total,
          paidAmountKrw: 0,
          unpaidBalanceKrw: total,
          taxInvoiceIssued: issuedTax,
          taxInvoiceNo: issuedTax ? `TI-${ym.replace('-', '')}-${String(taxSeq++).padStart(4, '0')}` : null,
          taxInvoiceIssuedAt: issuedTax ? bDate : null,
          statementSentAt: null,
          lines: bLines,
          status: 'UNPAID',
          memo: `${ym} ${c.contractDomain === 'TRADE' ? '유통' : '렌탈'} 확정 청구`,
        };
        await execDbMutation('월말 청구 생성', () =>
          flSupabase.from('billings').insert(camelToSnakeRow({ ...bRec }))
        );
        existingBillings.push(bRec);
        seededBillings.push(bRec);
      }
    }
    console.log(`   -> Created ${seededBillings.length} billings.`);

    console.log('9) Collecting AR Billings + Settling AP (with FX Gains & Losses) + Creating UNMATCHED Bank Candidates...');
    const unmatchedInCandidates = [];
    for (let i = 0; i < seededBillings.length; i++) {
      const b = seededBillings[i];
      // Leave refund contract's billing UNPAID so AR deduction stays positive & clean
      if (refundContractTracker.contract && b.contractId === refundContractTracker.contract.id) {
        continue;
      }
      let mode = 'PAID';
      if (b.billingYm === '2026-11') {
        mode = i % 3 === 0 ? 'PAID' : i % 3 === 1 ? 'PARTIAL' : 'UNPAID';
      } else if (b.billingYm === '2026-10') {
        mode = i % 5 === 0 ? 'UNPAID' : i % 5 === 1 ? 'PARTIAL' : 'PAID';
      }
      if (mode === 'UNPAID') {
        if (unmatchedInCandidates.length < 3) unmatchedInCandidates.push(b);
        continue;
      }
      const payAmt = mode === 'PAID' ? b.totalAmountKrw : Math.round(b.totalAmountKrw * 0.5 / 1000) * 1000;
      const colDate = b.billingDate <= '2026-11-14' ? addDaysIso(b.billingDate, 1) : '2026-11-15';
      const btxId = newId('BTX');
      await execDbMutation('수납 입금 통장내역', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({
          id: btxId,
          tenantId: DEFAULT_TENANT_ID,
          txDate: colDate,
          txDirection: 'IN',
          bankName: '국민은행',
          accountNo: '123-01-456789',
          counterpartyName: b.partnerName,
          amountKrw: payAmt,
          matchedType: 'AR_BILLING',
          matchedId: b.id,
          matchStatus: 'MATCHED',
          memo: `${b.billingNo} ${mode === 'PAID' ? '완납' : '부분수납'}`,
        }))
      );
      const colRes = await recordBillingCollection({
        billing: b,
        amountKrw: payAmt,
        collectionDate: colDate,
        paymentMethod: i % 6 === 0 ? '전자어음' : '계좌이체',
        bankTxId: btxId,
        recordedBy: adminUser.name,
        memo: `${b.billingNo} 통장 입금 수납`,
      });
      seededBillings[i] = colRes.billing;
    }

    // Settle ~65% of AP payables: generate both FX gain (fxGainLoss > 0) and FX loss (fxGainLoss < 0)
    // Pay early APs first, keeping cash strongly positive (> 400M KRW)
    const fxAps = seededPayables.filter((ap) => ap.currencyCode !== 'KRW');
    const krwAps = seededPayables.filter((ap) => ap.currencyCode === 'KRW');
    const unmatchedOutApCandidates = [];

    for (let i = 0; i < fxAps.length; i++) {
      const ap = fxAps[i];
      if (i >= 11) {
        if (unmatchedOutApCandidates.length < 2) unmatchedOutApCandidates.push(ap);
        continue;
      }
      // Alternate FX Gain (settledFxRate < booked) & FX Loss (settledFxRate > booked) cleanly with integer math
      let settledFx = ap.bookedFxRate;
      if (ap.currencyCode === 'USD') settledFx = i % 2 === 0 ? ap.bookedFxRate - 25 : ap.bookedFxRate + 20;
      else if (ap.currencyCode === 'CNY') settledFx = i % 2 === 0 ? ap.bookedFxRate - 4 : ap.bookedFxRate + 3;
      else if (ap.currencyCode === 'EUR') settledFx = i % 2 === 0 ? ap.bookedFxRate - 30 : ap.bookedFxRate + 25;
      else if (ap.currencyCode === 'JPY') settledFx = ap.bookedFxRate + 0.2;

      const isPartial = i === 10;
      const settleForeign = isPartial ? Math.round((ap.foreignAmount * 0.5) * 100) / 100 : undefined;
      const paidDate = addDaysIso(ap.accrualDate, 18) <= '2026-11-15' ? addDaysIso(ap.accrualDate, 18) : '2026-11-14';

      const upd = await settleApPayable({
        payable: ap,
        settledFxRate: settledFx,
        settleForeignOrKrwAmount: settleForeign,
        paidDate,
      });
      const cashOut = Math.round(upd.paidAmountKrw - upd.fxGainLossKrw);
      await execDbMutation('외화AP 결제 통장내역', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({
          id: newId('BTX'),
          tenantId: DEFAULT_TENANT_ID,
          txDate: paidDate,
          txDirection: 'OUT',
          bankName: '기업은행',
          accountNo: '214-081234-01-011',
          counterpartyName: ap.partnerName,
          amountKrw: cashOut,
          matchedType: 'AP_PAYABLE',
          matchedId: ap.id,
          matchStatus: 'MATCHED',
          memo: `${ap.payableNo} 외화 송금 (${ap.currencyCode}@${settledFx})`,
        }))
      );
      if (upd.status === 'PARTIAL' && unmatchedOutApCandidates.length < 2) {
        unmatchedOutApCandidates.push(upd);
      }
    }

    for (let i = 0; i < krwAps.length; i++) {
      const ap = krwAps[i];
      if (i % 3 === 2) {
        if (unmatchedOutApCandidates.length < 2) unmatchedOutApCandidates.push(ap);
        continue;
      }
      const paidDate = addDaysIso(ap.accrualDate, 15) <= '2026-11-15' ? addDaysIso(ap.accrualDate, 15) : '2026-11-14';
      const upd = await settleApPayable({
        payable: ap,
        settledFxRate: 1,
        paidDate,
      });
      await execDbMutation('원화AP 결제 통장내역', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({
          id: newId('BTX'),
          tenantId: DEFAULT_TENANT_ID,
          txDate: paidDate,
          txDirection: 'OUT',
          bankName: '기업은행',
          accountNo: '214-081234-01-011',
          counterpartyName: ap.partnerName,
          amountKrw: Math.round(upd.paidAmountKrw),
          matchedType: 'AP_PAYABLE',
          matchedId: ap.id,
          matchStatus: 'MATCHED',
          memo: `${ap.payableNo} 매입·물류 대금 지급`,
        }))
      );
    }

    // Add 6 UNMATCHED bank transactions (3 IN matching unpaid billings, 2 OUT matching unpaid AP, 1 OUT matching unpaid 2026-11 Lease installment)
    for (const b of unmatchedInCandidates.slice(0, 3)) {
      await execDbMutation('미대사 입금 통장내역', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({
          id: newId('BTX'),
          tenantId: DEFAULT_TENANT_ID,
          txDate: '2026-11-15',
          txDirection: 'IN',
          bankName: '국민은행',
          accountNo: '123-01-456789',
          counterpartyName: b.partnerName,
          amountKrw: Math.round(b.unpaidBalanceKrw),
          matchedType: null,
          matchedId: null,
          matchStatus: 'UNMATCHED',
          memo: `${b.partnerName} 입금 확인 대기 (${b.billingNo})`,
        }))
      );
    }
    for (const ap of unmatchedOutApCandidates.slice(0, 2)) {
      const rem = Math.round(ap.totalAmountKrw - ap.paidAmountKrw);
      if (rem <= 0) continue;
      await execDbMutation('미대사 출금 AP 통장내역', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({
          id: newId('BTX'),
          tenantId: DEFAULT_TENANT_ID,
          txDate: '2026-11-15',
          txDirection: 'OUT',
          bankName: '기업은행',
          accountNo: '214-081234-01-011',
          counterpartyName: ap.partnerName,
          amountKrw: rem,
          matchedType: null,
          matchedId: null,
          matchStatus: 'UNMATCHED',
          memo: `${ap.partnerName} 지급 대사 대기 (${ap.payableNo})`,
        }))
      );
    }
    const openNovSch = seededLeaseSchedules.find((s) => s.dueYm === '2026-11' && !s.isPaid);
    if (openNovSch) {
      const leaseObj = seededLeases.find((l) => l.id === openNovSch.leaseId);
      await execDbMutation('미대사 출금 리스회차 통장내역', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({
          id: newId('BTX'),
          tenantId: DEFAULT_TENANT_ID,
          txDate: '2026-11-15',
          txDirection: 'OUT',
          bankName: '기업은행',
          accountNo: '214-081234-01-011',
          counterpartyName: leaseObj?.lenderName || 'KB캐피탈',
          amountKrw: Math.round(openNovSch.totalInstallmentKrw),
          matchedType: null,
          matchedId: null,
          matchStatus: 'UNMATCHED',
          memo: `${leaseObj?.leaseNo || ''} #${openNovSch.installmentNo} 금융리스 회차 대사 대기`,
        }))
      );
    }

    console.log('10) Creating 8 Approval Requests + Syncing Rental Asset Depreciation as of 2026-11...');
    const execUser = users.find((u) => u.tierLevel >= 6 && u.id !== 'u-1') || adminUser;
    const reqUser = getSalesperson(0);
    const approvalSpecs = [
      ['PURCHASE_CONFIRM', 'fl_purchases', seededTradeUnits[0]?.purchaseLineId || 'PUR-2610-001', '수입 컨테이너 매입 입고 확정 승인', 'APPROVED', null],
      ['LEASE_CREATE', 'fl_finance_leases', seededLeases[0]?.id || 'FLS-2610-001', '금융리스 36개월 신규 차량 도입 승인', 'APPROVED', null],
      ['EXCHANGE_EXECUTE', 'fl_fulfillments', 'EXCHANGE-01', '현장 장애 장비 대차 교환 출고 승인', 'APPROVED', null],
      ['TRADE_REFUND', 'fl_trade_aftercare_cases', refundContractTracker.contract?.id || 'TAC-01', '유통 납품 반품 환불 및 매출 차감 승인', 'APPROVED', null],
      ['ASSET_DISPOSAL', 'fl_inventory_units', 'UNIT-DISP-HOLD', '유휴 부속품 폐기 처분 상신', 'REJECTED', '재사용 가능 부품 선별 검사 후 재상신 요망'],
      ['BILLING_CREATE', 'fl_billings', seededBillings[0]?.id || 'BIL-01', '2026-11월분 일괄 청구 발행 확정 요청', 'PENDING', null],
      ['AP_SETTLEMENT_PAY', 'fl_ap_payables', seededPayables[0]?.id || 'AP-01', '해외 본사 수입 외상매입금 외환 송금 승인', 'PENDING', null],
      ['ACCOUNT_TRANSFER', 'fl_inventory_units', seededRentalUnits[0]?.id || 'UNIT-RN-001', '유통재고 렌탈 전환 계정대체 상신', 'PENDING', null],
    ];
    for (let i = 0; i < approvalSpecs.length; i++) {
      const [code, tbl, tid, title, status, rejectReason] = approvalSpecs[i];
      await execDbMutation('결재 이력 생성', () =>
        flSupabase.from('approval_requests').insert(camelToSnakeRow({
          id: newId('APR'),
          tenantId: DEFAULT_TENANT_ID,
          actionCode: code,
          targetTable: tbl,
          targetId: tid,
          title,
          payload: { seq: i + 1, source: 'ORGSEED' },
          requiredTier: 4,
          requesterId: reqUser.id,
          requesterName: reqUser.name,
          requesterTier: reqUser.tierLevel,
          approverId: status === 'PENDING' ? null : execUser.id,
          approverName: status === 'PENDING' ? null : execUser.name,
          approverTier: status === 'PENDING' ? null : execUser.tierLevel,
          status,
          rejectReason,
          requestedAt: `2026-11-${pad2(5 + i)}T02:00:00Z`,
          decidedAt: status === 'PENDING' ? null : `2026-11-${pad2(5 + i)}T05:30:00Z`,
          executedAt: status === 'APPROVED' ? `2026-11-${pad2(5 + i)}T05:31:00Z` : null,
        }))
      );
    }

    await syncRentalAssetsDepreciationInDb('2026-11');

    // Quick financial self-check right after seeding
    const keys = [
      'purchases', 'purchase_lines', 'inventory_units', 'stock_movements',
      'finance_leases', 'finance_lease_schedules', 'fulfillments', 'billings',
      'collections', 'ap_payables', 'logistics_dispatches', 'rental_maintenances', 'trade_aftercare_cases',
    ];
    const dsArr = await Promise.all(keys.map((t) => fetchAllCamel(t)));
    const ds = {
      purchases: dsArr[0],
      purchaseLines: dsArr[1],
      inventoryUnits: dsArr[2],
      stockMovements: dsArr[3],
      financeLeases: dsArr[4],
      financeLeaseSchedules: dsArr[5],
      fulfillments: dsArr[6],
      billings: dsArr[7],
      collections: dsArr[8],
      apPayables: dsArr[9],
      logisticsDispatches: dsArr[10],
      rentalMaintenances: dsArr[11],
      tradeAftercareCases: dsArr[12],
    };

    const report = generateFinancialStatements(ds, '2026-01', '2026-11');
    console.log('=== SEED SUMMARY ===');
    console.log({
      purchases: ds.purchases.length,
      units: ds.inventoryUnits.length,
      contracts: allContracts.length,
      fulfillments: ds.fulfillments.length,
      maintenances: ds.rentalMaintenances.length,
      dispatches: ds.logisticsDispatches.length,
      billings: ds.billings.length,
      collections: ds.collections.length,
      apPayables: ds.apPayables.length,
      leases: ds.financeLeases.length,
      bsDiff: report.balanceSheet.balanceDiff,
      cfDiff: report.cashFlow.cashCheckDiff,
      endingCash: report.cashFlow.endingCash,
      tradeRevenue: report.incomeStatement.tradeRevenue,
      rentalRevenue: report.incomeStatement.rentalRevenue,
      netIncome: report.incomeStatement.netIncome,
    });
  } finally {
    await viteServer.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});

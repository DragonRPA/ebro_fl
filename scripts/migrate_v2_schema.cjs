require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const TENANT_ID = 'tenant-ebro-fl';
const SYSTEM_SALT = 'ebro_erp_secure_salt_2026';

const CANONICAL_FL_PAGES = [
  'dashboard', 'approval_inbox',
  'partners', 'item_masters', 'exchange_rates', 'catalogs',
  'purchases', 'logistics_costs',
  'quotations', 'trade_contracts', 'trade_inventory', 'trade_fulfillment', 'trade_performance',
  'rental_contracts', 'rental_assets', 'rental_fulfillment', 'rental_maintenance', 'rental_performance',
  'ar_billing_collection', 'ap_settlements', 'bank_matching', 'financial_statements', 'operation_manual', 'system_settings',
];

function hashPassword(plain) {
  return crypto.createHash('sha256').update(`${plain}:${SYSTEM_SALT}`, 'utf8').digest('hex');
}

function normBizNo(v) {
  return String(v || '').replace(/[^0-9]/g, '').trim();
}

function normName(v) {
  return String(v || '').replace(/\s+/g, '').replace(/[()주식회사㈜]/g, '').trim().toLowerCase();
}

function parseNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function extractTonnageFromText(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:톤|t\b)/i);
  return m ? Number(m[1]) : null;
}

// 36-month annuity or equal-principal lease schedule generator matching domainEngine math
function buildLeaseSchedule(lease) {
  const rows = [];
  const P = Math.round(lease.principalAmountKrw);
  const n = lease.termMonths;
  const r = (lease.annualInterestRate / 100) / 12;
  const [sy, sm] = lease.startDate.split('-').map(Number);

  let bal = P;
  const monthlyAnnuity = r > 0
    ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    : P / n;
  const fixedPrincipal = Math.floor(P / n);

  for (let i = 1; i <= n; i++) {
    const dt = new Date(Date.UTC(sy, (sm - 1) + (i - 1), Math.min(lease.paymentDay || 25, 28)));
    const dueYm = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    const dueDate = `${dueYm}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    const opening = bal;
    const interest = Math.round(opening * r);

    let principalPay;
    if (i === n) {
      principalPay = opening;
    } else if (lease.repaymentMethod === '원금균등') {
      principalPay = fixedPrincipal;
    } else {
      principalPay = Math.round(monthlyAnnuity - interest);
      if (principalPay > opening) principalPay = opening;
    }

    const total = principalPay + interest;
    const ending = opening - principalPay;
    bal = ending;

    rows.push({
      id: `${lease.id}-SCH-${String(i).padStart(3, '0')}`,
      leaseId: lease.id,
      installmentNo: i,
      dueYm,
      dueDate,
      openingPrincipalKrw: opening,
      principalPaymentKrw: principalPay,
      interestExpenseKrw: interest,
      totalInstallmentKrw: total,
      endingPrincipalKrw: ending,
      isPaid: dueYm < '2026-11',
      paidDate: dueYm < '2026-11' ? dueDate : null,
    });
  }
  return rows;
}

async function safeQueryTable(client, tableName) {
  const exists = await client.query(
    `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1`,
    [tableName]
  );
  if (exists.rowCount === 0) return [];
  const res = await client.query(`SELECT * FROM public."${tableName}"`);
  return res.rows;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('[1/5] Connected to Supabase Postgres.');

  // ==========================================================================
  // Step 1: Rename non-empty legacy fl_* -> fl_backup_* (only if backup doesn't exist)
  //         and drop all non-backup fl_* tables
  // ==========================================================================
  const allFlRes = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'fl_%'
    ORDER BY tablename
  `);

  let renamedCount = 0;
  for (const row of allFlRes.rows) {
    const tbl = row.tablename;
    if (tbl.startsWith('fl_backup_')) continue;
    const backupName = `fl_backup_${tbl.slice(3)}`;
    const bExists = allFlRes.rows.some((r) => r.tablename === backupName);
    if (bExists) continue;

    const cntRes = await client.query(`SELECT count(*)::int AS cnt FROM public."${tbl}"`);
    if (cntRes.rows[0].cnt > 0) {
      await client.query(`ALTER TABLE public."${tbl}" RENAME TO "${backupName}"`);
      renamedCount++;
    }
  }
  console.log(`[1/5] Renamed ${renamedCount} non-empty legacy tables to fl_backup_*.`);

  const dropRes = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'fl_%' AND tablename NOT LIKE 'fl_backup_%'
  `);
  for (const row of dropRes.rows) {
    await client.query(`DROP TABLE IF EXISTS public."${row.tablename}" CASCADE`);
  }
  console.log(`[2/5] Dropped ${dropRes.rowCount} obsolete fl_* tables. Applying schema.sql...`);

  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await client.query(schemaSql);
  console.log('[2/5] Applied schema.sql cleanly (29 tables + indexes + RLS).');

  // Truncate new tables cleanly so re-running migration is 100% idempotent
  const newTables = [
    'fl_finance_lease_schedules', 'fl_finance_leases', 'fl_bank_transactions',
    'fl_collections', 'fl_billings', 'fl_asset_events', 'fl_rental_maintenances',
    'fl_trade_aftercare_cases', 'fl_fulfillments', 'fl_contract_lines', 'fl_contracts',
    'fl_quotations', 'fl_stock_movements', 'fl_inventory_units', 'fl_ap_payables',
    'fl_logistics_dispatches', 'fl_purchase_lines', 'fl_purchases', 'fl_exchange_rates',
    'fl_catalog_packages', 'fl_item_masters', 'fl_partner_sites', 'fl_partners',
    'fl_document_templates', 'fl_approval_requests', 'fl_approval_policies',
    'fl_user_permissions', 'fl_users', 'fl_departments',
  ];
  await client.query(`TRUNCATE TABLE ${newTables.map((t) => `public."${t}"`).join(', ')} CASCADE`);

  // ==========================================================================
  // Step 2: Migrate Departments & 7-Tier Users
  // ==========================================================================
  const oldDepts = await safeQueryTable(client, 'fl_backup_departments');
  for (const d of oldDepts) {
    const cleanDeptName = d.name === '기연리프트' ? '이브로지게차 본사' : d.name;
    await client.query(
      `INSERT INTO public.fl_departments (id, tenant_id, name, parent_department_id, manager_id, functional_tags, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, true) ON CONFLICT (id) DO NOTHING`,
      [d.id, TENANT_ID, cleanDeptName, d.parentDepartmentId || null, d.managerId || null, JSON.stringify(d.functional_tags || [])]
    );
  }

  const TIER_OVERRIDE_BY_LOGIN = {
    admin: { tier: 7, passwordHash: hashPassword('admin123'), maskSalesPrice: false },
    '이수용': { tier: 7 },
    '강상안': { tier: 6 },
    '최수호': { tier: 5 },
    '김원진': { tier: 4 },
    '김관주': { tier: 4 },
    '김동우': { tier: 4 },
    '한상찬': { tier: 4, maskSalesPrice: false },
    '정수아': { tier: 3 },
    '이민석': { tier: 3 },
    '최영석': { tier: 3, maskSalesPrice: true },
    '장세현': { tier: 3, maskSalesPrice: true },
    '김재현': { tier: 2 },
    '이규탁': { tier: 2, maskSalesPrice: true },
    '비안타': { tier: 1 },
    '띠발': { tier: 1 },
    '까순': { tier: 1 },
    '라이': { tier: 1 },
    '김테스트': { tier: 1 },
  };

  const oldUsers = await safeQueryTable(client, 'fl_backup_users');
  const seenLogins = new Set();
  for (const u of oldUsers) {
    const ov = TIER_OVERRIDE_BY_LOGIN[u.loginId] || {};
    const tierLevel = ov.tier || Math.min(7, Math.max(1, Number(u.tier_level) || 1));
    const pwHash = ov.passwordHash || u.passwordHash || hashPassword('1234');
    const maskPrice = ov.maskSalesPrice !== undefined ? ov.maskSalesPrice : u.customRoleId === 'role_mechanic';
    seenLogins.add(u.loginId);
    await client.query(
      `INSERT INTO public.fl_users (id, tenant_id, login_id, password_hash, name, department_id, position, duty, tier_level, mask_sales_price, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
       ON CONFLICT (login_id) DO NOTHING`,
      [
        u.id, TENANT_ID, u.loginId, pwHash, u.name || u.loginId,
        u.departmentId || null, u.position || null, u.duty || null,
        tierLevel, maskPrice, u.status || 'ACTIVE',
      ]
    );
  }

  const demoAccounts = [
    { id: 'u-demo-mgr', loginId: 'manager', password: 'mgr123', name: '관리팀장', deptId: 'DEPT-0000002', pos: '팀장', tier: 4, mask: false },
    { id: 'u-demo-user', loginId: 'user', password: 'user123', name: '영업대리', deptId: 'DEPT-0000003', pos: '대리', tier: 2, mask: false },
    { id: 'u-demo-mech', loginId: 'mechanic', password: 'mech123', name: '정비기사', deptId: 'DEPT-0000005', pos: '기사', tier: 1, mask: true },
  ];
  for (const acc of demoAccounts) {
    if (seenLogins.has(acc.loginId)) continue;
    await client.query(
      `INSERT INTO public.fl_users (id, tenant_id, login_id, password_hash, name, department_id, position, tier_level, mask_sales_price, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', true)`,
      [acc.id, TENANT_ID, acc.loginId, hashPassword(acc.password), acc.name, acc.deptId, acc.pos, acc.tier, acc.mask]
    );
  }
  console.log(`[3/5] Migrated ${oldDepts.length} departments and ${seenLogins.size + 3} 7-tier users.`);

  // ==========================================================================
  // Step 3: Migrate & Deduplicate Partners & Partner Sites
  // ==========================================================================
  const partnerByKey = new Map();
  const oldPartnerIdMap = new Map();
  const partnersList = [];

  function upsertPartner(rec) {
    const bizKey = normBizNo(rec.biz_reg_no);
    const key = bizKey ? `BIZ:${bizKey}` : `NAME:${normName(rec.name)}`;
    let existing = partnerByKey.get(key);
    if (!existing) {
      existing = {
        id: rec.id,
        name: rec.name,
        biz_reg_no: rec.biz_reg_no || null,
        representative: rec.representative || null,
        biz_type: rec.biz_type || null,
        biz_item: rec.biz_item || null,
        address: rec.address || null,
        phone: rec.phone || null,
        email: rec.email || null,
        tax_email: rec.tax_email || rec.email || null,
        partner_roles: Array.from(new Set(rec.roles)),
        default_closing_day: rec.closingDay || 25,
        default_payment_due_day: rec.dueDay || 10,
        default_payment_month_offset: rec.dueOffset ?? 1,
        payment_method: rec.paymentMethod || '계좌이체',
        bank_name: rec.bankName || null,
        bank_account: rec.bankAccount || null,
        bank_holder: rec.bankHolder || null,
        memo: rec.memo || null,
      };
      partnerByKey.set(key, existing);
      partnersList.push(existing);
    } else {
      for (const r of rec.roles) {
        if (!existing.partner_roles.includes(r)) existing.partner_roles.push(r);
      }
      if (!existing.address && rec.address) existing.address = rec.address;
      if (!existing.phone && rec.phone) existing.phone = rec.phone;
      if (!existing.email && rec.email) existing.email = rec.email;
      if (!existing.bank_account && rec.bankAccount) {
        existing.bank_name = rec.bankName || existing.bank_name;
        existing.bank_account = rec.bankAccount;
        existing.bank_holder = rec.bankHolder || existing.bank_holder;
      }
    }
    if (rec.id) oldPartnerIdMap.set(rec.id, existing.id);
    return existing.id;
  }

  const oldCustomers = await safeQueryTable(client, 'fl_backup_customers');
  for (const c of oldCustomers) {
    const roles = ['매출처'];
    if (String(c.name || '').includes('커머셜') || String(c.name || '').includes('캐피탈')) roles.push('금융사');
    if (String(c.memo || '').includes('대리점')) roles.push('대리점');
    upsertPartner({
      id: c.id,
      name: c.name,
      biz_reg_no: c.bizRegNo || c.businessNumber,
      representative: c.representative,
      biz_type: c.bizType,
      biz_item: c.bizItem,
      address: c.address,
      phone: c.repContact,
      email: c.repEmail || c.email,
      roles,
      closingDay: c.defaultStatementClosingDay || 25,
      dueDay: c.defaultPaymentDueDay || c.paymentDueDay || 10,
      dueOffset: c.defaultPaymentDueMonthOffset ?? c.paymentDueMonthOffset ?? 1,
      paymentMethod: c.paymentMethod || '계좌이체',
      memo: c.memo || c.specialNotes,
    });
  }

  const oldVendors = await safeQueryTable(client, 'fl_backup_vendors');
  for (const v of oldVendors) {
    const roles = [];
    const cat = String(v.type || v.category || 'PURCHASE').toUpperCase();
    if (cat.includes('PURCHASE')) roles.push('매입처');
    if (cat.includes('REPAIR') || cat.includes('MAINT')) roles.push('외주정비처');
    if (cat.includes('SUBLEASE') || cat.includes('RENT')) roles.push('전대공급처');
    if (roles.length === 0) roles.push('매입처');
    upsertPartner({
      id: v.id,
      name: v.name,
      biz_reg_no: v.bizRegNo || v.businessNumber,
      representative: v.representative,
      biz_type: v.bizType,
      biz_item: v.bizItem,
      address: v.address,
      phone: v.contact,
      email: v.email,
      roles,
      bankName: v.bankName,
      bankAccount: v.accountNumber || v.bankAccount,
      bankHolder: v.accountHolder,
      memo: v.memo,
    });
  }

  const sampleCarriers = [
    {
      id: 'TCOM-0000001',
      name: '평택항만중량화물',
      biz_reg_no: '125-81-99001',
      representative: '박상현',
      biz_type: '운수업',
      biz_item: '특수화물 및 지게차 탁송',
      address: '경기도 평택시 포승읍 평택항만길 142',
      phone: '031-682-4401',
      email: 'dispatch1@sample-freight.kr',
      roles: ['운송사'],
      bankName: '기업은행',
      bankAccount: '010-990011-01-011',
      bankHolder: '평택항만중량화물',
      memo: '수도권·충청권 지게차 셀프로더 및 카캐리어 샘플 운송사',
    },
    {
      id: 'TCOM-0000002',
      name: '서해특수운송',
      biz_reg_no: '131-86-99002',
      representative: '최진우',
      biz_type: '운수업',
      biz_item: '중량기계 및 산업차량 운송',
      address: '인천광역시 중구 서해대로 218',
      phone: '032-884-4402',
      email: 'dispatch2@sample-freight.kr',
      roles: ['운송사'],
      bankName: '국민은행',
      bankAccount: '412-990022-04-012',
      bankHolder: '서해특수운송',
      memo: '인천항·경인권 수입 지게차 보세운송 샘플 운송사',
    },
    {
      id: 'TCOM-0000003',
      name: '중부카캐리어물류',
      biz_reg_no: '312-81-99003',
      representative: '정태호',
      biz_type: '운수업',
      biz_item: '산업장비 전국 탁송',
      address: '충청남도 천안시 서북구 직산읍 산단로 55',
      phone: '041-583-4403',
      email: 'dispatch3@sample-freight.kr',
      roles: ['운송사'],
      bankName: '신한은행',
      bankAccount: '110-990-033403',
      bankHolder: '중부카캐리어물류',
      memo: '중부·호남권 지게차 광역 배차 샘플 운송사',
    },
    {
      id: 'TCOM-0000004',
      name: '남부로우베드탁송',
      biz_reg_no: '605-81-99004',
      representative: '강민규',
      biz_type: '운수업',
      biz_item: '대형 지게차 로우베드 특수운송',
      address: '경상남도 김해시 주촌면 서부로 1120',
      phone: '055-338-4404',
      email: 'dispatch4@sample-freight.kr',
      roles: ['운송사'],
      bankName: '우리은행',
      bankAccount: '1005-990-044404',
      bankHolder: '남부로우베드탁송',
      memo: '5톤~10톤급 대형 지게차 저상트레일러 샘플 운송사',
    },
  ];
  for (const t of sampleCarriers) {
    upsertPartner(t);
  }

  // Seed core finance lease & sublease counterparties
  upsertPartner({
    id: 'PRT-FIN-KB',
    name: 'KB캐피탈',
    biz_reg_no: '214-81-81753',
    representative: '빈중일',
    address: '서울특별시 서초구 서초대로 301',
    phone: '1544-1200',
    email: 'lease@kbfg.com',
    roles: ['금융사'],
    memo: '지게차 금융리스 여신사',
  });
  upsertPartner({
    id: 'PRT-FIN-KDB',
    name: '산은캐피탈',
    biz_reg_no: '211-81-24419',
    representative: '양기현',
    address: '서울특별시 영등포구 은행로 16',
    phone: '02-6330-0114',
    email: 'lease@kdbc.co.kr',
    roles: ['금융사'],
    memo: '산업차량 금융리스 여신사',
  });

  for (const p of partnersList) {
    await client.query(
      `INSERT INTO public.fl_partners (
        id, tenant_id, name, biz_reg_no, representative, biz_type, biz_item, address,
        phone, email, tax_email, partner_roles, default_closing_day, default_payment_due_day,
        default_payment_month_offset, payment_method, bank_name, bank_account, bank_holder, memo
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        p.id, TENANT_ID, p.name, p.biz_reg_no, p.representative, p.biz_type, p.biz_item,
        p.address, p.phone, p.email, p.tax_email, JSON.stringify(p.partner_roles),
        p.default_closing_day, p.default_payment_due_day, p.default_payment_month_offset,
        p.payment_method, p.bank_name, p.bank_account, p.bank_holder, p.memo,
      ]
    );
  }

  const oldSites = await safeQueryTable(client, 'fl_backup_customer_sites');
  const insertedSiteIds = new Set();
  for (const s of oldSites) {
    const pid = oldPartnerIdMap.get(s.customerId);
    if (!pid) continue;
    insertedSiteIds.add(s.id);
    await client.query(
      `INSERT INTO public.fl_partner_sites (id, tenant_id, partner_id, site_name, address, contact_name, contact_phone, contact_email, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT (id) DO NOTHING`,
      [s.id, TENANT_ID, pid, s.name || '본사', s.address || '', s.contactName || '', s.contact || '', s.email || '']
    );
  }

  const oldContacts = await safeQueryTable(client, 'fl_backup_customer_contacts');
  for (const ct of oldContacts) {
    const pid = oldPartnerIdMap.get(ct.customerId);
    if (!pid || insertedSiteIds.has(ct.id)) continue;
    await client.query(
      `INSERT INTO public.fl_partner_sites (id, tenant_id, partner_id, site_name, contact_name, contact_phone, contact_email, is_primary, memo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [ct.id, TENANT_ID, pid, ct.department || '담당자', ct.name || '', ct.contact || '', ct.email || '', Boolean(ct.isPrimary), ct.memo || '']
    );
  }
  console.log(`[3/5] Deduplicated ${partnersList.length} partners and migrated partner sites/contacts.`);

  // ==========================================================================
  // Step 4: Merge Item Masters (Equipment + Attachments + Parts + Consumables)
  // ==========================================================================
  const itemBySku = new Map();
  const seenModelKey = new Set();

  function addItem(item) {
    const skuKey = String(item.sku || '').trim();
    if (!skuKey || itemBySku.has(skuKey)) return;
    itemBySku.set(skuKey, item);
  }

  const oldTradeProducts = await safeQueryTable(client, 'fl_backup_trade_products');
  for (const tp of oldTradeProducts) {
    const isEquip = tp.itemType === 'EQUIPMENT' || tp.managementType === 'SERIAL' || tp.inventoryAssetClass === 'PRODUCT';
    const sku = tp.skuCode || tp.modelName || tp.id;
    seenModelKey.add(normName(tp.modelName || sku));
    addItem({
      id: tp.id,
      sku,
      name: tp.name || tp.modelName,
      item_category: isEquip ? '완제품' : '부품',
      management_type: isEquip ? 'SERIAL' : 'LOT',
      manufacturer: tp.manufacturer || '',
      model_name: tp.modelName || '',
      tonnage: tp.ratedCapacityKg ? Number((tp.ratedCapacityKg / 1000).toFixed(2)) : extractTonnageFromText(tp.name || tp.spec),
      power_type: tp.powerType || '',
      spec_summary: tp.spec || '',
      unit_name: tp.unit || (isEquip ? '대' : 'EA'),
      standard_cost_krw: parseNum(tp.standardCost),
      dealer_price_krw: parseNum(tp.dealerPrice),
      retail_price_krw: parseNum(tp.standardPrice),
      standard_monthly_rental_krw: Math.round(parseNum(tp.standardPrice) * 0.035),
      standard_daily_rental_krw: Math.round(parseNum(tp.standardPrice) * 0.003),
      safety_stock: parseNum(tp.safetyStock, isEquip ? 1 : 2),
      warehouse_location: tp.defaultWarehouse || '평택 주기장',
      spec_sheet_url: tp.specSheetUrl || null,
      manual_url: tp.manualUrl || null,
      vdi_specs: [],
      mast_specs: [],
      battery_options: [],
      oem_cross_ref_codes: [],
      compatible_models: [],
      memo: tp.memo || null,
    });
  }

  const oldProducts = await safeQueryTable(client, 'fl_backup_products');
  for (const pr of oldProducts) {
    const mKey = normName(pr.modelName || pr.shortName);
    if (mKey) {
      // Enrich matching trade product with VDI/mast/battery specs if same modelName
      let matched = null;
      for (const existing of itemBySku.values()) {
        if (normName(existing.model_name) === mKey) {
          matched = existing;
          break;
        }
      }
      if (matched) {
        matched.vdi_specs = pr.vdiSpecs || [];
        matched.mast_specs = pr.mastSpecs || [];
        matched.battery_options = pr.batteryOptions || [];
        if (!matched.spec_sheet_url && pr.specSheetUrl) matched.spec_sheet_url = pr.specSheetUrl;
        if (!matched.manual_url && pr.operatorManualUrl) matched.manual_url = pr.operatorManualUrl;
        if (parseNum(pr.standardMonthlyRentalKrw) > 0) matched.standard_monthly_rental_krw = parseNum(pr.standardMonthlyRentalKrw);
        if (parseNum(pr.standardDailyRentalKrw) > 0) matched.standard_daily_rental_krw = parseNum(pr.standardDailyRentalKrw);
        continue;
      }
    }
    const sku = `EQ-${pr.modelName || pr.id}`;
    addItem({
      id: pr.id,
      sku,
      name: pr.seriesName || pr.modelName,
      item_category: '완제품',
      management_type: 'SERIAL',
      manufacturer: pr.manufacturer || '',
      model_name: pr.modelName || '',
      tonnage: pr.ratedCapacityKg ? Number((pr.ratedCapacityKg / 1000).toFixed(2)) : extractTonnageFromText(pr.seriesName || pr.spec),
      power_type: pr.powerSource || pr.powerType || '',
      spec_summary: pr.spec || '',
      unit_name: '대',
      standard_cost_krw: Math.round(parseNum(pr.baseListPriceKrw, 15000000) * 0.78),
      dealer_price_krw: Math.round(parseNum(pr.baseListPriceKrw, 15000000) * 0.9),
      retail_price_krw: parseNum(pr.baseListPriceKrw, 15000000),
      standard_monthly_rental_krw: parseNum(pr.standardMonthlyRentalKrw, 550000),
      standard_daily_rental_krw: parseNum(pr.standardDailyRentalKrw, 45000),
      safety_stock: 1,
      warehouse_location: '평택 주기장',
      spec_sheet_url: pr.specSheetUrl || pr.brochureUrl || null,
      manual_url: pr.operatorManualUrl || pr.manualUrl || null,
      vdi_specs: pr.vdiSpecs || [],
      mast_specs: pr.mastSpecs || [],
      battery_options: pr.batteryOptions || [],
      oem_cross_ref_codes: [],
      compatible_models: [],
    });
  }

  const oldOptions = await safeQueryTable(client, 'fl_backup_forklift_option_masters');
  for (const op of oldOptions) {
    const sku = op.optionCode || op.code || op.id;
    addItem({
      id: op.id,
      sku,
      name: op.name,
      item_category: '어태치먼트',
      management_type: 'LOT',
      manufacturer: '공용 옵션',
      model_name: op.applicableTonnage || '전 톤수',
      spec_summary: op.specDetail || op.subVariant || '',
      unit_name: op.unit || '식',
      standard_cost_krw: parseNum(op.costPrice),
      dealer_price_krw: parseNum(op.dealerPrice),
      retail_price_krw: parseNum(op.unitPrice),
      standard_monthly_rental_krw: Math.round(parseNum(op.unitPrice) * 0.08),
      standard_daily_rental_krw: Math.round(parseNum(op.unitPrice) * 0.01),
      safety_stock: 2,
      warehouse_location: '평택 주기장',
      vdi_specs: [],
      mast_specs: [],
      battery_options: [],
      oem_cross_ref_codes: [],
      compatible_models: op.applicableModels ? [op.applicableModels] : [],
      memo: op.memo || null,
    });
  }

  const oldTvh = await safeQueryTable(client, 'fl_backup_tvh_catalog_items');
  for (const tv of oldTvh) {
    addItem({
      id: tv.id,
      sku: tv.sku || tv.id,
      name: tv.partName,
      item_category: '부품',
      management_type: 'LOT',
      manufacturer: tv.manufacturer || tv.tvhBrand || '',
      model_name: tv.tvhRefNo || '',
      spec_summary: tv.specSummary || '',
      unit_name: tv.unitName || 'EA',
      standard_cost_krw: parseNum(tv.landedCostKrw),
      dealer_price_krw: parseNum(tv.dealerPriceKrw),
      retail_price_krw: parseNum(tv.retailPriceKrw),
      safety_stock: parseNum(tv.moq, 2),
      warehouse_location: tv.warehouseLocation || '평택 부품창고',
      diagram_type: tv.diagramType || null,
      image_url: tv.imageUrl || null,
      vdi_specs: tv.detailedSpecs || [],
      mast_specs: [],
      battery_options: [],
      oem_cross_ref_codes: tv.oemCrossRefCodes || [],
      compatible_models: tv.compatibleModels || [],
      memo: tv.technicalNote || null,
    });
  }

  const oldConsumables = await safeQueryTable(client, 'fl_backup_consumables');
  for (const cs of oldConsumables) {
    const sku = cs.skuCode || cs.id;
    const isConsumable = String(cs.category || '').includes('소모') || String(cs.category || '').includes('필터') || String(cs.partName || '').includes('FILTER');
    addItem({
      id: cs.id,
      sku,
      name: cs.partName || cs.name || cs.modelName,
      item_category: isConsumable ? '소모품' : '부품',
      management_type: 'LOT',
      manufacturer: cs.brand || cs.supplier || '',
      model_name: cs.skuCode || '',
      spec_summary: cs.spec || '',
      unit_name: cs.unit || 'EA',
      standard_cost_krw: parseNum(cs.exactUnitCost || cs.unitPrice),
      dealer_price_krw: parseNum(cs.dealerPrice || Math.round(parseNum(cs.unitPrice) * 1.15)),
      retail_price_krw: parseNum(cs.standardPrice || cs.saleUnitPrice || Math.round(parseNum(cs.unitPrice) * 1.3)),
      safety_stock: parseNum(cs.minStock || cs.safetyStock, 1),
      warehouse_location: cs.location || '평택 부품창고',
      vdi_specs: [],
      mast_specs: [],
      battery_options: [],
      oem_cross_ref_codes: [],
      compatible_models: cs.compatibleModels ? [cs.compatibleModels] : [],
      memo: cs.note || null,
    });
  }

  const itemsList = Array.from(itemBySku.values());
  for (const it of itemsList) {
    await client.query(
      `INSERT INTO public.fl_item_masters (
        id, tenant_id, sku, name, item_category, management_type, manufacturer, model_name,
        tonnage, power_type, spec_summary, unit_name, standard_cost_krw, dealer_price_krw,
        retail_price_krw, standard_monthly_rental_krw, standard_daily_rental_krw,
        safety_stock, warehouse_location, diagram_type, image_url, spec_sheet_url, manual_url,
        vdi_specs, mast_specs, battery_options, oem_cross_ref_codes, compatible_models, memo
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24::jsonb,$25::jsonb,$26::jsonb,$27::jsonb,$28::jsonb,$29
      )`,
      [
        it.id, TENANT_ID, it.sku, it.name, it.item_category, it.management_type,
        it.manufacturer || null, it.model_name || null, it.tonnage || null, it.power_type || null,
        it.spec_summary || '', it.unit_name || 'EA',
        it.standard_cost_krw || 0, it.dealer_price_krw || 0, it.retail_price_krw || 0,
        it.standard_monthly_rental_krw || 0, it.standard_daily_rental_krw || 0,
        it.safety_stock || 0, it.warehouse_location || '평택 주기장',
        it.diagram_type || null, it.image_url || null, it.spec_sheet_url || null, it.manual_url || null,
        JSON.stringify(it.vdi_specs || []), JSON.stringify(it.mast_specs || []),
        JSON.stringify(it.battery_options || []), JSON.stringify(it.oem_cross_ref_codes || []),
        JSON.stringify(it.compatible_models || []), it.memo || null,
      ]
    );
  }
  console.log(`[4/5] Unified ${itemsList.length} item masters cleanly.`);

  // Catalog Packages
  const oldCatalogs = await safeQueryTable(client, 'fl_backup_custom_catalogs');
  for (const cat of oldCatalogs) {
    await client.query(
      `INSERT INTO public.fl_catalog_packages (
        id, tenant_id, catalog_code, title, subtitle, target_partner_role,
        target_models, selected_item_skus, show_unit_price, show_stock,
        header_notice, footer_contact, is_default
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13)
      ON CONFLICT (catalog_code) DO NOTHING`,
      [
        cat.id, TENANT_ID, cat.catalogCode, cat.title, cat.subtitle || '',
        cat.targetCustomerType === 'DEALER' ? '대리점' : '매출처',
        JSON.stringify(cat.targetModels || []),
        JSON.stringify(cat.selectedItemIds || []),
        Boolean(cat.showUnitPrice ?? true), Boolean(cat.showStockAndLeadTime ?? true),
        cat.headerNotice || '', cat.footerContact || '', Boolean(cat.isDefault),
      ]
    );
  }

  // Exchange Rates
  const seedRates = [
    { id: 'FX-20261015-USD', date: '2026-10-15', cur: 'USD', rate: 1380.0, tt: 1393.8 },
    { id: 'FX-20261015-CNY', date: '2026-10-15', cur: 'CNY', rate: 194.2, tt: 196.1 },
    { id: 'FX-20261015-EUR', date: '2026-10-15', cur: 'EUR', rate: 1502.5, tt: 1517.5 },
    { id: 'FX-20261015-JPY', date: '2026-10-15', cur: 'JPY', rate: 9.18, tt: 9.27 },
    { id: 'FX-20261115-USD', date: '2026-11-15', cur: 'USD', rate: 1395.5, tt: 1409.5 },
    { id: 'FX-20261115-CNY', date: '2026-11-15', cur: 'CNY', rate: 196.8, tt: 198.7 },
    { id: 'FX-20261115-EUR', date: '2026-11-15', cur: 'EUR', rate: 1518.0, tt: 1533.2 },
    { id: 'FX-20261115-JPY', date: '2026-11-15', cur: 'JPY', rate: 9.24, tt: 9.33 },
  ];
  for (const fx of seedRates) {
    await client.query(
      `INSERT INTO public.fl_exchange_rates (id, tenant_id, rate_date, currency_code, base_rate_krw, tt_selling_rate)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [fx.id, TENANT_ID, fx.date, fx.cur, fx.rate, fx.tt]
    );
  }

  // 12 Canonical 7-Tier Approval Policies
  const policies = [
    ['AP-01', 'PURCHASE_CONFIRM', '매입 입고 확정', '수입/내수 매입원가 확정 및 재고 원장 생성', 3, true],
    ['AP-02', 'LEASE_CREATE', '금융리스 계약 등록', '금융사 리스 원리금 상환 스케줄 및 렌탈자산 등록', 5, true],
    ['AP-03', 'ACCOUNT_TRANSFER', '계정대체 실행', '유통재고와 렌탈자산 간 소유계정 전환', 4, true],
    ['AP-04', 'TRADE_CONTRACT_CONFIRM', '유통 계약 확정', '판매 단가 및 수량 확정', 3, true],
    ['AP-05', 'RENTAL_CONTRACT_CONFIRM', '렌탈 계약 확정', '렌탈 기간, 월단가 및 청구조건 확정', 3, true],
    ['AP-06', 'FULFILLMENT_COMPLETE', '출고·회수 실행완료', '희망완료일 기준 출고·회수 확정 처리', 2, true],
    ['AP-07', 'EXCHANGE_EXECUTE', '렌탈 교환 실행', '기존 자산 회수 및 교체 자산 투입 및 조건 승계', 3, true],
    ['AP-08', 'TRADE_REFUND', '유통 반품 환불', '기판매 유통 품목 반품 입고 및 매출/부가세 차감', 4, true],
    ['AP-09', 'BILLING_CREATE', '월말 청구 발행', '계약 기준 청구 생성 및 세금계산서 연동', 3, true],
    ['AP-10', 'AP_SETTLEMENT_PAY', '매입·물류 대금 지급', '매입채무·운송비·정비외주비 지급 확정', 4, true],
    ['AP-11', 'ASSET_DISPOSAL', '자산 폐기 처분', '보유 자산 장부가 제각 및 폐기 확정', 6, true],
    ['AP-12', 'POLICY_CONFIG_SAVE', '권한·결재 기준 변경', '7단계 직급 결재선 및 메뉴 접근권한 변경', 7, true],
  ];
  for (const [id, code, name, desc, tier, reqApp] of policies) {
    await client.query(
      `INSERT INTO public.fl_approval_policies (id, tenant_id, action_code, action_name, description, required_tier, requires_approval)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, TENANT_ID, code, name, desc, tier, reqApp]
    );
  }

  // Tier-based Page Permissions Matrix (Tiers 1..7 across 24 canonical pages)
  for (let t = 1; t <= 7; t++) {
    for (const pId of CANONICAL_FL_PAGES) {
      const isFinanceRestricted = ['financial_statements', 'bank_matching', 'system_settings'].includes(pId);
      const canView = t >= 4 || !isFinanceRestricted || (t >= 3 && pId === 'bank_matching');
      const canEdit = t >= 2 && (t >= 4 || !isFinanceRestricted);
      const canApprove = t >= 3;
      await client.query(
        `INSERT INTO public.fl_user_permissions (id, tenant_id, tier_level, page_id, can_view, can_edit, can_approve)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`PERM-T${t}-${pId}`, TENANT_ID, t, pId, canView, canEdit, canApprove]
      );
    }
  }

  // 5 Canonical Document Templates
  const docTemplates = [
    ['DOC-TPL-QT-TRADE', '견적서_유통', '표준 유통 견적서 양식', '/거래명세서양식.xlsx', '부가세 별도 · 발주 확정 후 납기 협의', '주식회사 이브로지게차렌탈 영업본부'],
    ['DOC-TPL-QT-RENTAL', '견적서_렌탈', '표준 렌탈 견적서 양식', '/거래명세서양식.xlsx', '월간 임대료 · 무상 정기점검 포함', '주식회사 이브로지게차렌탈 렌탈영업본부'],
    ['DOC-TPL-CT-TRADE', '계약서_유통', '표준 물품공급 계약서', '/01.계약서.xlsx', '매도인과 매수인은 하기 특약에 합의한다', '주식회사 이브로지게차렌탈 유통사업부'],
    ['DOC-TPL-CT-RENTAL', '계약서_렌탈', '표준 건설기계 임대차 계약서', '/01.계약서.xlsx', '임대인과 임차인은 지게차 임대차 계약을 체결한다', '주식회사 이브로지게차렌탈 렌탈사업부'],
    ['DOC-TPL-STMT', '거래명세서', '표준 거래명세서 양식', '/거래명세서양식.xlsx', '청구 내역 및 공급가액·세액 명세', '계산서 문의: 회계팀'],
  ];
  for (const [id, dtype, name, tpath, head, foot] of docTemplates) {
    await client.query(
      `INSERT INTO public.fl_document_templates (id, tenant_id, doc_type, template_name, template_path, header_note, footer_note, is_default, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,'시스템')`,
      [id, TENANT_ID, dtype, name, tpath, head, foot]
    );
  }

  // ==========================================================================
  // Step 5: Seed Balanced Starter Operational Data (2026-10 ~ 2026-11)
  // Zero orphaned IDs, 100% balanced financials + 36-month Finance Lease schedule
  // ==========================================================================
  const firstCustomer = partnersList.find((p) => p.partner_roles.includes('매출처')) || partnersList[0];
  const firstVendor = partnersList.find((p) => p.partner_roles.includes('매입처')) || partnersList[0];
  const firstCarrier = partnersList.find((p) => p.partner_roles.includes('운송사')) || partnersList[0];
  const firstLender = partnersList.find((p) => p.partner_roles.includes('금융사')) || partnersList[0];

  const equipItem = itemsList.find((i) => i.item_category === '완제품') || itemsList[0];
  const equipItem2 = itemsList.find((i) => i.item_category === '완제품' && i.id !== equipItem.id) || equipItem;
  const attachItem = itemsList.find((i) => i.item_category === '어태치먼트') || itemsList[0];
  const partItem = itemsList.find((i) => i.item_category === '부품') || itemsList[0];
  const consumItem = itemsList.find((i) => i.item_category === '소모품') || partItem;

  // 1) Import Purchase (USD 22,000 * 1,380 = 30,360,000 KRW + 2,640,000 ancillary = 33,000,000 KRW across 2 units = 16,500,000/unit)
  await client.query(
    `INSERT INTO public.fl_purchases (
      id, tenant_id, purchase_no, purchase_type, supplier_id, supplier_name, target_domain,
      bl_no, currency_code, fx_rate, fx_date, foreign_merchandise_total, krw_merchandise_total,
      customs_duty_krw, ocean_freight_krw, clearance_fee_krw, inland_freight_krw,
      total_landed_cost_krw, status, effective_date, memo
    ) VALUES ($1,$2,$3,'IMPORT',$4,$5,'TRADE','BL-HC-261001','USD',1380,'2026-10-15',22000,30360000,1200000,900000,340000,200000,33000000,'CONFIRMED','2026-10-15','정기 컨테이너 직수입')`,
    ['PUR-2610-001', TENANT_ID, 'PUR-2610-001', firstVendor.id, firstVendor.name]
  );
  await client.query(
    `INSERT INTO public.fl_purchase_lines (
      id, tenant_id, purchase_id, item_id, sku, item_name, item_category, management_type,
      quantity, foreign_unit_price, foreign_amount, allocated_merchandise_krw, allocated_ancillary_krw,
      landed_unit_cost_krw, landed_total_cost_krw, serial_list, warehouse_location
    ) VALUES ($1,$2,'PUR-2610-001',$3,$4,$5,'완제품','SERIAL',2,11000,22000,30360000,2640000,16500000,33000000,'["HC26-2501","HC26-2502"]'::jsonb,'평택 주기장')`,
    ['PURL-2610-001-1', TENANT_ID, equipItem.id, equipItem.sku, equipItem.name]
  );
  await client.query(
    `INSERT INTO public.fl_ap_payables (
      id, tenant_id, payable_no, payable_type, partner_id, partner_name, ref_table, ref_id,
      currency_code, booked_fx_rate, foreign_amount, supply_amount_krw, vat_amount_krw,
      total_amount_krw, paid_amount_krw, settled_fx_rate, fx_gain_loss_krw, status, due_date, accrual_date, paid_date
    ) VALUES ($1,$2,'AP-2610-001','PURCHASE',$3,$4,'fl_purchases','PUR-2610-001','USD',1380,22000,30360000,0,30360000,15180000,1390,110000,'PARTIAL','2026-11-30','2026-10-15','2026-11-05')`,
    ['AP-2610-001', TENANT_ID, firstVendor.id, firstVendor.name]
  );

  // 2) Inventory Units (2 Trade SERIAL + 1 Rental Owned + 1 Finance Lease + 1 Sublease + 1 Parts LOT + 1 Consumable LOT)
  const starterUnits = [
    ['UNIT-TR-001', 'UNIT-TR-001', equipItem.id, equipItem.sku, equipItem.name, '완제품', 'SERIAL', '유통재고', 'HC26-2501', null, 1, 0, 16500000, 0, 16500000, '판매완료', 'PURCHASE', '2026-10-15', 'PURL-2610-001-1', null, null, null, 0, 'CTR-TR-2611-01', firstCustomer.id, null, 0, 0],
    ['UNIT-TR-002', 'UNIT-TR-002', equipItem.id, equipItem.sku, equipItem.name, '완제품', 'SERIAL', '유통재고', 'HC26-2502', null, 1, 0, 16500000, 0, 16500000, '보유중', 'PURCHASE', '2026-10-15', 'PURL-2610-001-1', null, null, null, 0, null, null, null, 0, 0],
    ['UNIT-RN-001', 'UNIT-RN-001', equipItem2.id, equipItem2.sku, equipItem2.name, '완제품', 'SERIAL', '렌탈자산', 'FL26-25R01', null, 1, 0, 21000000, 350000, 20650000, '대여중', 'PURCHASE', '2026-10-01', null, null, null, null, 0, 'CTR-RN-2611-01', firstCustomer.id, null, 850000, 45000],
    ['UNIT-RN-002', 'UNIT-RN-002', equipItem.id, equipItem.sku, equipItem.name, '완제품', 'SERIAL', '렌탈자산', 'FL26-25R02', null, 1, 0, 24000000, 400000, 23600000, '보유중', 'FINANCE_LEASE', '2026-10-01', null, 'FLS-2610-001', null, null, 0, null, null, null, 920000, 48000],
    ['UNIT-SUB-001', 'UNIT-SUB-001', equipItem2.id, equipItem2.sku, equipItem2.name, '완제품', 'SERIAL', '전대자산', 'SUB26-3001', null, 1, 0, 0, 0, 0, '보유중', 'SUBLEASE', '2026-10-20', null, null, firstVendor.id, firstVendor.name, 480000, null, null, null, 890000, 46000],
    ['UNIT-LOT-PART-1', 'UNIT-LOT-PART-1', partItem.id, partItem.sku, partItem.name, '부품', 'LOT', '유통재고', null, 'LOT-2610-P1', 20, 0, partItem.standard_cost_krw || 120000, 0, partItem.standard_cost_krw || 120000, '보유중', 'PURCHASE', '2026-10-15', null, null, null, null, 0, null, null, null, 0, 0],
    ['UNIT-LOT-ATT-1', 'UNIT-LOT-ATT-1', attachItem.id, attachItem.sku, attachItem.name, '어태치먼트', 'LOT', '유통재고', null, 'LOT-2610-A1', 5, 0, attachItem.standard_cost_krw || 520000, 0, attachItem.standard_cost_krw || 520000, '보유중', 'PURCHASE', '2026-10-15', null, null, null, null, 0, null, null, null, 0, 0],
    ['UNIT-LOT-CSM-1', 'UNIT-LOT-CSM-1', consumItem.id, consumItem.sku, consumItem.name, '소모품', 'LOT', '유통재고', null, 'LOT-2610-C1', 15, 0, consumItem.standard_cost_krw || 45000, 0, consumItem.standard_cost_krw || 45000, '보유중', 'PURCHASE', '2026-10-15', null, null, null, null, 0, null, null, null, 0, 0],
  ];
  for (const u of starterUnits) {
    await client.query(
      `INSERT INTO public.fl_inventory_units (
        id, tenant_id, unit_code, item_id, sku, item_name, item_category, management_type, ownership_domain,
        serial_no, lot_no, qty_on_hand, qty_reserved, unit_cost_krw, accumulated_depreciation_krw, book_value_krw,
        status, acquisition_type, acquisition_date, purchase_line_id, finance_lease_id,
        sublease_supplier_id, sublease_supplier_name, sublease_monthly_cost_krw,
        current_contract_id, current_partner_id, current_site_id, monthly_rental_fee_krw, daily_rental_fee_krw
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [u[0], TENANT_ID, u[1], u[2], u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10], u[11], u[12], u[13], u[14], u[15], u[16], u[17], u[18], u[19], u[20], u[21], u[22], u[23], u[24], u[25], u[26], u[27]]
    );
  }

  // 3) Finance Lease + 36-month schedule
  const starterLease = {
    id: 'FLS-2610-001',
    leaseNo: 'FLS-2610-001',
    lenderPartnerId: firstLender.id,
    lenderName: firstLender.name,
    unitId: 'UNIT-RN-002',
    serialNo: 'FL26-25R02',
    principalAmountKrw: 24000000,
    annualInterestRate: 5.8,
    termMonths: 36,
    repaymentMethod: '원리금균등',
    startDate: '2026-10-25',
    endDate: '2029-09-25',
    paymentDay: 25,
  };
  const leaseRows = buildLeaseSchedule(starterLease);
  const octRow = leaseRows[0];
  await client.query(
    `INSERT INTO public.fl_finance_leases (
      id, tenant_id, lease_no, lender_partner_id, lender_name, unit_id, unit_ids, serial_no,
      principal_amount_krw, annual_interest_rate, term_months, repayment_method,
      start_date, end_date, payment_day, remaining_principal_krw, status, memo
    ) VALUES ($1,$2,$3,$4,$5,$6,'["UNIT-RN-002"]'::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ACTIVE','36개월 원리금균등 금융리스')`,
    [
      starterLease.id, TENANT_ID, starterLease.leaseNo, starterLease.lenderPartnerId,
      starterLease.lenderName, starterLease.unitId, starterLease.serialNo,
      starterLease.principalAmountKrw, starterLease.annualInterestRate, starterLease.termMonths,
      starterLease.repaymentMethod, starterLease.startDate, starterLease.endDate,
      starterLease.paymentDay, octRow.endingPrincipalKrw,
    ]
  );
  for (const sr of leaseRows) {
    await client.query(
      `INSERT INTO public.fl_finance_lease_schedules (
        id, tenant_id, lease_id, installment_no, due_ym, due_date,
        opening_principal_krw, principal_payment_krw, interest_expense_krw,
        total_installment_krw, ending_principal_krw, is_paid, paid_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        sr.id, TENANT_ID, sr.leaseId, sr.installmentNo, sr.dueYm, sr.dueDate,
        sr.openingPrincipalKrw, sr.principalPaymentKrw, sr.interestExpenseKrw,
        sr.totalInstallmentKrw, sr.endingPrincipalKrw, sr.isPaid, sr.paidDate,
      ]
    );
  }

  // 4) Logistics Dispatch (pure transport cost settlement)
  await client.query(
    `INSERT INTO public.fl_logistics_dispatches (
      id, tenant_id, dispatch_no, dispatch_purpose, carrier_partner_id, carrier_name,
      driver_name, driver_phone, vehicle_no, origin_address, destination_address,
      related_ref_type, related_ref_id, transport_cost_krw, vat_krw, cost_bearer,
      customer_charge_krw, settlement_status, settlement_ym, dispatch_date, memo
    ) VALUES ($1,$2,'LOG-2611-001','납품운송',$3,$4,'박기사','010-4455-6677','경기88아1234','평택 주기장','용산구 현장','fl_contracts','CTR-TR-2611-01',250000,25000,'OURS',0,'SETTLED','2026-11','2026-11-02','지게차 1대 평택-서울 편도 카캐리어')`,
    ['LOG-2611-001', TENANT_ID, firstCarrier.id, firstCarrier.name]
  );

  // 5) Quotations (Trade + Rental)
  await client.query(
    `INSERT INTO public.fl_quotations (
      id, tenant_id, quote_no, quote_domain, partner_id, partner_name, salesperson_id, salesperson_name,
      quote_date, valid_until, rental_months, supply_amount_krw, vat_amount_krw, total_amount_krw, lines, status
    ) VALUES
    ('QT-TR-2611-01',$1,'QT-TR-2611-01','TRADE',$2,$3,'u-1','개발자','2026-11-01','2026-11-30',1,21000000,2100000,23100000,$4::jsonb,'CONVERTED'),
    ('QT-RN-2611-01',$1,'QT-RN-2611-01','RENTAL',$2,$3,'u-1','개발자','2026-10-28','2026-11-27',12,850000,85000,935000,$5::jsonb,'CONVERTED')`,
    [
      TENANT_ID, firstCustomer.id, firstCustomer.name,
      JSON.stringify([{ itemId: equipItem.id, sku: equipItem.sku, itemName: equipItem.name, qty: 1, unitPriceKrw: 21000000, supplyAmountKrw: 21000000 }]),
      JSON.stringify([{ itemId: equipItem2.id, sku: equipItem2.sku, itemName: equipItem2.name, qty: 1, unitPriceKrw: 850000, supplyAmountKrw: 850000 }]),
    ]
  );

  // 6) Contracts + Lines + Fulfillments + Movements + Events
  await client.query(
    `INSERT INTO public.fl_contracts (
      id, tenant_id, contract_no, contract_domain, quotation_id, partner_id, partner_name, site_name,
      salesperson_id, salesperson_name, contract_date, start_date, end_date,
      supply_amount_krw, vat_amount_krw, total_amount_krw, monthly_rental_krw, status, special_terms
    ) VALUES
    ('CTR-TR-2611-01',$1,'CTR-TR-2611-01','TRADE','QT-TR-2611-01',$2,$3,'본사 현장','u-1','개발자','2026-11-01','2026-11-02','2026-11-02',21000000,2100000,23100000,0,'COMPLETED','납품 후 인도완료 조건'),
    ('CTR-RN-2611-01',$1,'CTR-RN-2611-01','RENTAL','QT-RN-2611-01',$2,$3,'본사 현장','u-1','개발자','2026-10-30','2026-11-01','2027-10-31',850000,85000,935000,850000,'ACTIVE','월 1회 정기점검 포함')`,
    [TENANT_ID, firstCustomer.id, firstCustomer.name]
  );

  await client.query(
    `INSERT INTO public.fl_contract_lines (
      id, tenant_id, contract_id, line_no, item_id, sku, item_name, item_category, management_type,
      quantity, fulfilled_qty, unit_price_krw, supply_amount_krw, vat_amount_krw, total_amount_krw,
      assigned_unit_id, assigned_serial_no, line_status, effective_start_date
    ) VALUES
    ('CL-TR-2611-01-1',$1,'CTR-TR-2611-01',1,$2,$3,$4,'완제품','SERIAL',1,1,21000000,21000000,2100000,23100000,'UNIT-TR-001','HC26-2501','FULFILLED','2026-11-02'),
    ('CL-RN-2611-01-1',$1,'CTR-RN-2611-01',1,$5,$6,$7,'완제품','SERIAL',1,1,850000,850000,85000,935000,'UNIT-RN-001','FL26-25R01','FULFILLED','2026-11-01')`,
    [TENANT_ID, equipItem.id, equipItem.sku, equipItem.name, equipItem2.id, equipItem2.sku, equipItem2.name]
  );

  await client.query(
    `INSERT INTO public.fl_fulfillments (
      id, tenant_id, fulfillment_no, fulfillment_domain, action_type, contract_id, contract_line_id,
      partner_id, partner_name, item_id, unit_id, quantity, cogs_amount_krw, status, effective_date, recorded_at, executed_by
    ) VALUES
    ('FUL-TR-2611-01',$1,'FUL-TR-2611-01','TRADE','유통출고','CTR-TR-2611-01','CL-TR-2611-01-1',$2,$3,$4,'UNIT-TR-001',1,16500000,'COMPLETED','2026-11-02','2026-11-02T14:30:00Z','개발자'),
    ('FUL-RN-2611-01',$1,'FUL-RN-2611-01','RENTAL','렌탈출고','CTR-RN-2611-01','CL-RN-2611-01-1',$2,$3,$5,'UNIT-RN-001',1,0,'COMPLETED','2026-11-01','2026-11-01T10:15:00Z','개발자')`,
    [TENANT_ID, firstCustomer.id, firstCustomer.name, equipItem.id, equipItem2.id]
  );

  await client.query(
    `INSERT INTO public.fl_stock_movements (
      id, tenant_id, movement_type, unit_id, item_id, from_domain, to_domain, from_status, to_status,
      qty_delta, unit_cost_krw, amount_krw, ref_table, ref_id, actor_id, actor_name, effective_date, memo
    ) VALUES
    ('MOV-001',$1,'INBOUND','UNIT-TR-001',$2,null,'유통재고',null,'보유중',1,16500000,16500000,'fl_purchases','PUR-2610-001','u-1','개발자','2026-10-15','수입 입고'),
    ('MOV-002',$1,'INBOUND','UNIT-TR-002',$2,null,'유통재고',null,'보유중',1,16500000,16500000,'fl_purchases','PUR-2610-001','u-1','개발자','2026-10-15','수입 입고'),
    ('MOV-003',$1,'TRADE_OUTBOUND','UNIT-TR-001',$2,'유통재고','유통재고','보유중','판매완료',-1,16500000,16500000,'fl_fulfillments','FUL-TR-2611-01','u-1','개발자','2026-11-02','유통 출고 완료'),
    ('MOV-004',$1,'RENTAL_OUTBOUND','UNIT-RN-001',$3,'렌탈자산','렌탈자산','보유중','대여중',0,21000000,0,'fl_fulfillments','FUL-RN-2611-01','u-1','개발자','2026-11-01','렌탈 출고 완료')`,
    [TENANT_ID, equipItem.id, equipItem2.id]
  );

  // 7) Rental Maintenance (with operating hours & parts cost)
  await client.query(
    `INSERT INTO public.fl_rental_maintenances (
      id, tenant_id, maint_no, maint_type, unit_id, serial_no, contract_id, partner_id, partner_name,
      mechanic_id, mechanic_name, operating_hours, parts_used, parts_cost_krw, labor_cost_krw,
      external_cost_krw, total_cost_krw, is_customer_billable, customer_charge_krw, status, effective_date, memo
    ) VALUES ($1,$2,'MNT-2611-001','순회정비','UNIT-RN-001','FL26-25R01','CTR-RN-2611-01',$3,$4,'u-demo-mech','정비기사',142.5,'[]'::jsonb,0,120000,0,120000,false,0,'COMPLETED','2026-11-10','월간 정기 순회점검 및 브레이크 유격 조정')`,
    ['MNT-2611-001', TENANT_ID, firstCustomer.id, firstCustomer.name]
  );

  await client.query(
    `INSERT INTO public.fl_asset_events (id, tenant_id, unit_id, contract_id, event_type, operating_hours, delta_amount_krw, effective_date, actor_name, memo)
     VALUES
     ('EVT-001',$1,'UNIT-RN-001','CTR-RN-2611-01','RENTAL_START',0,0,'2026-11-01','개발자','렌탈 출고 개시'),
     ('EVT-002',$1,'UNIT-RN-001','CTR-RN-2611-01','MAINTENANCE',142.5,120000,'2026-11-10','정비기사','순회정비 완료')`,
    [TENANT_ID]
  );

  // 8) Billings & Collections & Bank Transactions
  await client.query(
    `INSERT INTO public.fl_billings (
      id, tenant_id, billing_no, billing_ym, billing_domain, contract_id, partner_id, partner_name,
      billing_date, due_date, supply_amount_krw, vat_amount_krw, total_amount_krw,
      paid_amount_krw, unpaid_balance_krw, tax_invoice_issued, tax_invoice_no, tax_invoice_issued_at, status, lines
    ) VALUES
    ('BIL-TR-2611-01',$1,'BIL-TR-2611-01','2026-11','TRADE','CTR-TR-2611-01',$2,$3,'2026-11-02','2026-11-30',21000000,2100000,23100000,15000000,8100000,true,'TX-20261102-001','2026-11-02','PARTIAL',$4::jsonb),
    ('BIL-RN-2611-01',$1,'BIL-RN-2611-01','2026-11','RENTAL','CTR-RN-2611-01',$2,$3,'2026-11-25','2026-12-10',850000,85000,935000,935000,0,true,'TX-20261125-002','2026-11-25','PAID',$5::jsonb)`,
    [
      TENANT_ID, firstCustomer.id, firstCustomer.name,
      JSON.stringify([{ description: `${equipItem.name} 납품대금`, qty: 1, supplyAmountKrw: 21000000, vatAmountKrw: 2100000 }]),
      JSON.stringify([{ description: `${equipItem2.name} 11월 렌탈료`, qty: 1, supplyAmountKrw: 850000, vatAmountKrw: 85000 }]),
    ]
  );

  await client.query(
    `INSERT INTO public.fl_collections (
      id, tenant_id, collection_no, billing_id, partner_id, partner_name, collection_date, amount_krw, payment_method, bank_tx_id, recorded_by
    ) VALUES
    ('COL-2611-001',$1,'COL-2611-001','BIL-TR-2611-01',$2,$3,'2026-11-05',15000000,'계좌이체','BTX-2611-001','개발자'),
    ('COL-2611-002',$1,'COL-2611-002','BIL-RN-2611-01',$2,$3,'2026-11-26',935000,'계좌이체','BTX-2611-002','개발자')`,
    [TENANT_ID, firstCustomer.id, firstCustomer.name]
  );

  await client.query(
    `INSERT INTO public.fl_bank_transactions (
      id, tenant_id, tx_date, tx_direction, bank_name, account_no, counterparty_name, amount_krw, matched_type, matched_id, match_status
    ) VALUES
    ('BTX-2611-001',$1,'2026-11-05','IN','국민은행','123-01-456789',$2,15000000,'AR_BILLING','BIL-TR-2611-01','MATCHED'),
    ('BTX-2611-002',$1,'2026-11-26','IN','국민은행','123-01-456789',$2,935000,'AR_BILLING','BIL-RN-2611-01','MATCHED'),
    ('BTX-2611-003',$1,'2026-11-12','IN','국민은행','123-01-456789',$2,8100000,null,null,'UNMATCHED')`,
    [TENANT_ID, firstCustomer.name]
  );

  // 9) Update core_tenants (tenant-ebro-fl) allowedPages
  await client.query(
    `UPDATE public.core_tenants
     SET "allowedPages" = $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(CANONICAL_FL_PAGES), TENANT_ID]
  );

  const summaryRes = await client.query(`
    SELECT
      (SELECT count(*)::int FROM fl_departments) AS departments,
      (SELECT count(*)::int FROM fl_users) AS users,
      (SELECT count(*)::int FROM fl_partners) AS partners,
      (SELECT count(*)::int FROM fl_partner_sites) AS partner_sites,
      (SELECT count(*)::int FROM fl_item_masters) AS item_masters,
      (SELECT count(*)::int FROM fl_approval_policies) AS approval_policies,
      (SELECT count(*)::int FROM fl_inventory_units) AS inventory_units,
      (SELECT count(*)::int FROM fl_finance_lease_schedules) AS lease_schedules,
      (SELECT count(*)::int FROM fl_billings) AS billings
  `);
  console.log('[5/5] Migration & starter seed complete:', JSON.stringify(summaryRes.rows[0]));
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

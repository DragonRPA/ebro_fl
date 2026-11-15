const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const raw = fs.readFileSync(path.resolve('.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
}

const ATTR_TAG_MAP = {
  ATTR_ADMIN: '경영관리',
  ATTR_SALES: '영업',
  ATTR_OUTBOUND: '유통출고',
  ATTR_INBOUND: '유통출고',
  ATTR_ASSET: '렌탈자산',
  ATTR_PRODUCTION: '렌탈자산',
  ATTR_AFTER_SERVICE: '정비',
  ATTR_DISPATCH: '물류',
  ATTR_BILLING: '재무회계',
};

const VALID_KOREAN_TAGS = new Set(['경영관리', '영업', '유통출고', '렌탈자산', '정비', '물류', '재무회계']);

function normalizeDeptTags(rawTags) {
  let list = [];
  if (Array.isArray(rawTags)) list = rawTags;
  else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [rawTags];
    }
  }
  const out = [];
  for (const tag of list) {
    const mapped = ATTR_TAG_MAP[tag] || (VALID_KOREAN_TAGS.has(tag) ? tag : null);
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function validDateOrNull(val) {
  if (!val) return null;
  const s = String(val).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function cleanTextOrNull(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s ? s : null;
}

(async () => {
  const env = loadEnv();
  const vault = await import(pathToFileURL(path.resolve('src/utils/cryptoVault.ts')).href);

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  console.log('[migrate_hr_v2] Connected to FL Postgres');

  await client.query(`
    ALTER TABLE public.fl_departments
      ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS memo TEXT;

    ALTER TABLE public.fl_users
      ADD COLUMN IF NOT EXISTS employee_no TEXT,
      ADD COLUMN IF NOT EXISTS birth_date TEXT,
      ADD COLUMN IF NOT EXISTS join_date TEXT,
      ADD COLUMN IF NOT EXISTS retire_date TEXT,
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
      ADD COLUMN IF NOT EXISTS base_salary_krw NUMERIC(18, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payroll_bank_name TEXT,
      ADD COLUMN IF NOT EXISTS payroll_account_no TEXT,
      ADD COLUMN IF NOT EXISTS memo TEXT;

    CREATE TABLE IF NOT EXISTS public.fl_hr_histories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      prev_summary TEXT,
      next_summary TEXT,
      reason TEXT,
      actor_id TEXT,
      actor_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_fl_hr_histories_user
      ON public.fl_hr_histories(user_id, created_at DESC);

    ALTER TABLE public.fl_hr_histories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS fl_hr_histories_all_anon ON public.fl_hr_histories;
    DROP POLICY IF EXISTS fl_hr_histories_all_auth ON public.fl_hr_histories;
    CREATE POLICY fl_hr_histories_all_anon ON public.fl_hr_histories FOR ALL TO anon USING (true) WITH CHECK (true);
    CREATE POLICY fl_hr_histories_all_auth ON public.fl_hr_histories FOR ALL TO authenticated USING (true) WITH CHECK (true);
  `);
  console.log('[migrate_hr_v2] Schema & RLS updated');

  await client.query(`
    INSERT INTO public.fl_departments (id, tenant_id, name, parent_department_id, manager_id, functional_tags, sort_order, is_active)
    VALUES ('DEPT-0000006', 'tenant-ebro-fl', '현장지원팀', 'DEPT-0000001', NULL, '["유통출고","렌탈자산"]'::jsonb, 60, true)
    ON CONFLICT (id) DO NOTHING;
  `);

  const deptSortMap = {
    'DEPT-0000001': 10,
    'DEPT-0000002': 20,
    'DEPT-0000003': 30,
    'DEPT-0000004': 40,
    'DEPT-0000005': 50,
    'DEPT-0000006': 60,
  };

  const deptRows = (await client.query('SELECT id, name, functional_tags, sort_order FROM public.fl_departments ORDER BY id')).rows;
  for (const d of deptRows) {
    const normalized = normalizeDeptTags(d.functional_tags);
    const nextSort = d.sort_order === 100 && deptSortMap[d.id] ? deptSortMap[d.id] : d.sort_order;
    await client.query(
      'UPDATE public.fl_departments SET functional_tags = $1::jsonb, sort_order = $2, updated_at = now() WHERE id = $3',
      [JSON.stringify(normalized), nextSort, d.id]
    );
  }
  console.log(`[migrate_hr_v2] Normalized functional_tags & sort_order for ${deptRows.length} departments`);

  const backupUsersRes = await client.query(
    'SELECT id, "loginId", "baseSalary", phone, email, address, "birthDate", "joinDate", "retireDate" FROM public.fl_backup_users'
  );
  const backupById = new Map(backupUsersRes.rows.map((r) => [r.id, r]));

  const flUsersRes = await client.query(
    'SELECT * FROM public.fl_users ORDER BY CASE WHEN id = \'u-1\' THEN 0 WHEN id LIKE \'USR-%\' THEN 1 ELSE 2 END, id'
  );

  const usedEmpNos = new Set(
    flUsersRes.rows.map((u) => cleanTextOrNull(u.employee_no)).filter(Boolean)
  );
  let seqNum = 2601;
  function nextEmployeeNo() {
    while (usedEmpNos.has(`EMP-${seqNum}`)) seqNum++;
    const code = `EMP-${seqNum}`;
    usedEmpNos.add(code);
    seqNum++;
    return code;
  }

  let updatedUsers = 0;
  let seededHistories = 0;
  for (const u of flUsersRes.rows) {
    const b = backupById.get(u.id);
    const decPhone = cleanTextOrNull(u.phone) || cleanTextOrNull(b && b.phone ? vault.decryptSecret(b.phone) : null);
    const decEmail = cleanTextOrNull(u.email) || cleanTextOrNull(b && b.email ? vault.decryptSecret(b.email) : null);
    const decAddress = cleanTextOrNull(u.address) || cleanTextOrNull(b && b.address ? vault.decryptSecret(b.address) : null);
    const decBirth =
      validDateOrNull(u.birth_date) ||
      validDateOrNull(b && b.birthDate ? vault.decryptSecret(b.birthDate) : null);
    const createdDate = u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : '2026-01-01';
    const joinDate = validDateOrNull(u.join_date) || validDateOrNull(b?.joinDate) || createdDate;
    const retireDate = validDateOrNull(u.retire_date) || validDateOrNull(b?.retireDate);
    const empNo = cleanTextOrNull(u.employee_no) || nextEmployeeNo();
    const salary = Number(u.base_salary_krw || 0) > 0 ? Number(u.base_salary_krw) : Math.max(0, Number(b?.baseSalary || 0));

    await client.query(
      `UPDATE public.fl_users
       SET employee_no = $1,
           phone = $2,
           email = $3,
           address = $4,
           birth_date = $5,
           join_date = $6,
           retire_date = $7,
           base_salary_krw = $8,
           updated_at = now()
       WHERE id = $9`,
      [empNo, decPhone, decEmail, decAddress, decBirth, joinDate, retireDate, salary, u.id]
    );
    updatedUsers++;

    const histCount = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM public.fl_hr_histories WHERE user_id = $1 AND event_type = '입사등록'",
      [u.id]
    );
    if (histCount.rows[0].cnt === 0) {
      await client.query(
        `INSERT INTO public.fl_hr_histories (
           id, tenant_id, user_id, event_type, effective_date,
           prev_summary, next_summary, reason, actor_id, actor_name
         ) VALUES ($1, $2, $3, '입사등록', $4, NULL, $5, '초기 인사원장 이관 등록', 'u-1', '시스템')`,
        [
          `HRH-INIT-${u.id}`,
          u.tenant_id || 'tenant-ebro-fl',
          u.id,
          joinDate,
          `${empNo} · ${u.name} · ${u.position || '사원'} · T${u.tier_level}`,
        ]
      );
      seededHistories++;
    }
  }
  console.log(`[migrate_hr_v2] Backfilled ${updatedUsers} users, seeded ${seededHistories} baseline HR history rows`);

  const existingPolicy = await client.query(
    "SELECT id FROM public.fl_approval_policies WHERE action_code = 'HR_APPOINTMENT' AND tenant_id = 'tenant-ebro-fl'"
  );
  if (existingPolicy.rows.length === 0) {
    await client.query(
      `INSERT INTO public.fl_approval_policies (
         id, tenant_id, action_code, action_name, description, required_tier, requires_approval, is_active
       ) VALUES (
         'AP-13', 'tenant-ebro-fl', 'HR_APPOINTMENT', '인사 발령 · 직급 변경',
         '임직원 부서이동·직책·티어·재직상태 인사발령 확정', 5, true, true
       )
       ON CONFLICT (id) DO NOTHING`
    );
    console.log('[migrate_hr_v2] Inserted HR_APPOINTMENT policy (AP-13, Tier 5)');
  } else {
    console.log('[migrate_hr_v2] HR_APPOINTMENT policy already exists');
  }

  for (let tier = 1; tier <= 7; tier++) {
    const canView = tier >= 4;
    const canEdit = tier >= 4;
    const canApprove = tier >= 5;
    await client.query(
      `INSERT INTO public.fl_user_permissions (
         id, tenant_id, user_id, tier_level, page_id, can_view, can_edit, can_approve
       ) VALUES ($1, 'tenant-ebro-fl', NULL, $2, 'organization_hr', $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET can_view = EXCLUDED.can_view,
           can_edit = EXCLUDED.can_edit,
           can_approve = EXCLUDED.can_approve,
           updated_at = now()`,
      [`PERM-T${tier}-organization_hr`, tier, canView, canEdit, canApprove]
    );
  }
  console.log('[migrate_hr_v2] Upserted 7-tier permissions for organization_hr (T1..T3 hidden, T4 view/edit, T5..T7 approve)');

  function appendOrgHrPage(pages) {
    const arr = Array.isArray(pages) ? [...pages] : [];
    if (arr.includes('organization_hr')) return arr;
    const idx = arr.indexOf('operation_manual');
    if (idx >= 0) arr.splice(idx, 0, 'organization_hr');
    else arr.push('organization_hr');
    return arr;
  }

  const localTenant = await client.query('SELECT id, "allowedPages" FROM public.core_tenants WHERE id = $1', ['tenant-ebro-fl']);
  if (localTenant.rows.length > 0) {
    const nextPages = appendOrgHrPage(localTenant.rows[0].allowedPages);
    await client.query(
      'UPDATE public.core_tenants SET "allowedPages" = $1::jsonb WHERE id = $2',
      [JSON.stringify(nextPages), 'tenant-ebro-fl']
    );
    console.log(`[migrate_hr_v2] Updated FL DB core_tenants allowedPages (${nextPages.length} pages)`);
  }

  await client.end();

  if (env.VITE_CENTRAL_SUPABASE_URL && env.VITE_CENTRAL_SUPABASE_ANON_KEY) {
    const central = createClient(env.VITE_CENTRAL_SUPABASE_URL, env.VITE_CENTRAL_SUPABASE_ANON_KEY);
    const { data, error } = await central
      .from('core_tenants')
      .select('id, allowedPages')
      .eq('id', 'tenant-ebro-fl')
      .single();
    if (!error && data) {
      const nextPages = appendOrgHrPage(data.allowedPages);
      const { error: updErr } = await central
        .from('core_tenants')
        .update({ allowedPages: nextPages })
        .eq('id', 'tenant-ebro-fl');
      if (updErr) {
        console.warn('[migrate_hr_v2] Central core_tenants update warning:', updErr.message);
      } else {
        console.log(`[migrate_hr_v2] Updated Central core_tenants allowedPages (${nextPages.length} pages)`);
      }
    }
  }

  console.log('[migrate_hr_v2] Complete');
})();

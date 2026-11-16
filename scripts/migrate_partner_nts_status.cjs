'use strict';

require('dotenv').config();
const { Client } = require('pg');

const DEFAULT_NTS_KEY = '7f24250bd002412aaa152a6e3ec63e556604f75be0fa9181983c33a618cb2e03';

function formatYmd(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  }
  const s = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function mapNtsItem(item) {
  const code = String(item?.b_stt_cd || '').trim();
  if (code === '01') {
    return {
      ntsStatus: '정상',
      ntsClosedDate: null,
      ntsTaxType: item?.tax_type ? String(item.tax_type).trim() : null,
    };
  }
  if (code === '02') {
    return {
      ntsStatus: '휴업',
      ntsClosedDate: formatYmd(item?.end_dt || item?.tax_type_change_dt),
      ntsTaxType: item?.tax_type ? String(item.tax_type).trim() : null,
    };
  }
  if (code === '03') {
    return {
      ntsStatus: '폐업',
      ntsClosedDate: formatYmd(item?.end_dt || item?.tax_type_change_dt),
      ntsTaxType: item?.tax_type ? String(item.tax_type).trim() : null,
    };
  }
  return {
    ntsStatus: '미등록',
    ntsClosedDate: null,
    ntsTaxType: item?.tax_type ? String(item.tax_type).trim() : null,
  };
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      ALTER TABLE public.fl_partners
        ADD COLUMN IF NOT EXISTS nts_status TEXT,
        ADD COLUMN IF NOT EXISTS nts_closed_date TEXT,
        ADD COLUMN IF NOT EXISTS nts_tax_type TEXT,
        ADD COLUMN IF NOT EXISTS nts_checked_at TIMESTAMPTZ;
    `);
    await client.query(`
      ALTER TABLE public.fl_partners DROP CONSTRAINT IF EXISTS fl_partners_nts_status_check;
      ALTER TABLE public.fl_partners
        ADD CONSTRAINT fl_partners_nts_status_check
        CHECK (nts_status IS NULL OR nts_status IN ('정상', '휴업', '폐업', '미등록'));
    `);

    const rows = (
      await client.query(`SELECT id, name, biz_reg_no FROM public.fl_partners ORDER BY name`)
    ).rows;

    const validDigitsSet = new Set();
    for (const r of rows) {
      const digits = String(r.biz_reg_no || '').replace(/[^0-9]/g, '');
      if (digits.length === 10) {
        validDigitsSet.add(digits);
      }
    }

    const activeKey = (process.env.NTS_API_KEY || process.env.PUBLIC_DATA_PORTAL_KEY || DEFAULT_NTS_KEY).trim();
    const ntsMap = new Map();
    const validList = Array.from(validDigitsSet);

    for (let i = 0; i < validList.length; i += 100) {
      const chunk = validList.slice(i, i + 100);
      const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(activeKey)}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ b_no: chunk }),
      });
      if (!resp.ok) {
        throw new Error(`NTS API HTTP ${resp.status}`);
      }
      const json = await resp.json();
      for (const item of json.data || []) {
        const clean = String(item.b_no || '').replace(/[^0-9]/g, '');
        if (clean.length === 10) {
          ntsMap.set(clean, mapNtsItem(item));
        }
      }
    }

    const summary = { 정상: 0, 휴업: 0, 폐업: 0, 미등록: 0, 미입력: 0 };
    const nowIso = new Date().toISOString();

    await client.query('BEGIN');
    for (const r of rows) {
      const raw = String(r.biz_reg_no || '').trim();
      if (!raw) {
        await client.query(
          `UPDATE public.fl_partners SET nts_status = NULL, nts_closed_date = NULL, nts_tax_type = NULL, nts_checked_at = NULL WHERE id = $1`,
          [r.id]
        );
        summary.미입력 += 1;
        continue;
      }
      const digits = raw.replace(/[^0-9]/g, '');
      const mapped =
        digits.length === 10 && ntsMap.has(digits)
          ? ntsMap.get(digits)
          : { ntsStatus: '미등록', ntsClosedDate: null, ntsTaxType: '형식 오류 또는 국세청 미등록' };

      await client.query(
        `UPDATE public.fl_partners SET nts_status = $1, nts_closed_date = $2, nts_tax_type = $3, nts_checked_at = $4 WHERE id = $5`,
        [mapped.ntsStatus, mapped.ntsClosedDate, mapped.ntsTaxType, nowIso, r.id]
      );
      summary[mapped.ntsStatus] = (summary[mapped.ntsStatus] || 0) + 1;
    }
    await client.query('COMMIT');
    await client.query(`NOTIFY pgrst, 'reload schema';`);

    const checkClosed = await client.query(
      `SELECT id, name, biz_reg_no, nts_status, nts_closed_date FROM public.fl_partners WHERE nts_status IN ('휴업', '폐업') ORDER BY name`
    );
    console.log('Migration summary:', summary);
    console.log('Suspended/Closed partners:', checkClosed.rows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

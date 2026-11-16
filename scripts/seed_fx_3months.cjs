const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

function roundByCurrency(currencyCode, val) {
  const factor = currencyCode === 'JPY' ? 10000 : 100;
  return Math.round(Number(val) * factor) / factor;
}

(async () => {
  const env = loadEnv();
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const currencies = ['USD', 'CNY', 'EUR', 'JPY'];

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  console.log(`[seed_fx_3months] Connected. Range=${startDate}..${endDate}`);

  let insertedTotal = 0;
  for (const cur of currencies) {
    const url = `https://api.frankfurter.dev/v1/${startDate}..${endDate}?base=${cur}&symbols=KRW`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Frankfurter fetch failed for ${cur}: HTTP ${resp.status}`);
    }
    const json = await resp.json();
    const ratesMap = json?.rates || {};
    const dates = Object.keys(ratesMap).sort();
    let curInserted = 0;
    for (const dt of dates) {
      const rawKrw = Number(ratesMap[dt]?.KRW || 0);
      if (!(rawKrw > 0)) continue;
      const baseRate = roundByCurrency(cur, rawKrw);
      const ttSelling = roundByCurrency(cur, baseRate * 1.01);
      const id = `FX-${dt.replace(/-/g, '')}-${cur}`;
      const res = await client.query(
        `INSERT INTO public.fl_exchange_rates (
           id, tenant_id, rate_date, currency_code, base_rate_krw, tt_selling_rate, source
         ) VALUES ($1, 'tenant-ebro-fl', $2::date, $3, $4, $5, '외환시장 고시환율')
         ON CONFLICT (tenant_id, rate_date, currency_code) DO NOTHING`,
        [id, dt, cur, baseRate, ttSelling]
      );
      curInserted += res.rowCount || 0;
    }
    insertedTotal += curInserted;
    console.log(`[seed_fx_3months] ${cur}: fetched ${dates.length} days, inserted ${curInserted} new rows`);
  }

  const summary = await client.query(
    `SELECT currency_code, COUNT(*)::int AS cnt, MIN(rate_date)::text AS min_dt, MAX(rate_date)::text AS max_dt
     FROM public.fl_exchange_rates GROUP BY currency_code ORDER BY currency_code`
  );
  console.log('[seed_fx_3months] Summary:', summary.rows, `Total new=${insertedTotal}`);
  await client.end();
})();

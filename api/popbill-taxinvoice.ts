// d:\01.AntiGravity\ebro_FL\api\popbill-taxinvoice.ts
// 멀티테넌트 팝빌(Popbill) 전자세금계산서 발행 · 국세청 즉시전송 · 상태조회 · 포털/인증서 관리 API
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createRequire } from 'module';
import popbill from 'popbill';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TaxinvoiceServiceCtor: any = require('popbill/lib/TaxinvoiceService');
const MGT_KEY_TYPE_SELL = popbill?.MgtKeyType?.SELL || 'SELL';

const VAULT_PREFIX = '__EBRO_ENC__v1__';
const VAULT_CIPHER_KEY = 0x4f;

const HUB_SUPABASE_URL = 'https://lkohpffieaanwhohttbu.supabase.co';
const HUB_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2hwZmZpZWFhbndob2h0dGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5ODkxOTQsImV4cCI6MjEwODU2NTE5NH0.lOXz6JWfLNcfH4ApH74F7qtlPky8lVwGiAqY_ybSZ6E';
const RETIRED_PROJECT_REFS = [
  'nyfashwbdcepncpdwpdb',
  'idfecoovqkjopgbezcpo',
  'uvmhqwpkmzxrrlkeguul',
  'mluhhrbcogvsalkchrdp',
];

function resolveCentralSupabaseConfig(): { url: string; anonKey: string } {
  const rawUrl = String(process.env.VITE_CENTRAL_SUPABASE_URL || '').trim();
  const rawKey = String(process.env.VITE_CENTRAL_SUPABASE_ANON_KEY || '').trim();
  if (!rawUrl || !rawKey || RETIRED_PROJECT_REFS.some((ref) => rawUrl.includes(ref))) {
    return { url: HUB_SUPABASE_URL, anonKey: HUB_SUPABASE_ANON_KEY };
  }
  return { url: rawUrl, anonKey: rawKey };
}

interface TenantPopbillConfig {
  corpNum?: string;
  userId?: string;
  isTest?: boolean;
  useCustomKey?: boolean;
  linkId?: string;
  secretKey?: string;
  defaultPurposeType?: '청구' | '영수';
  autoSendToNts?: boolean;
}

interface CentralTenantRow {
  id: string;
  tenantCode?: string;
  corporateName?: string;
  businessNumber?: string;
  representativeName?: string;
  businessAddress?: string;
  businessCategory?: string;
  businessItem?: string;
  tel?: string;
  taxEmail?: string;
  specialFeatures?: string[];
  features?: {
    popbillTaxInvoice?: boolean;
    popbillConfig?: TenantPopbillConfig;
    specialFeatures?: string[];
    [key: string]: unknown;
  };
}

interface ResolvedPopbillContext {
  tenant: CentralTenantRow;
  linkId: string;
  secretKey: string;
  isTest: boolean;
  corpNum: string;
  userId: string;
  defaultPurposeType: '청구' | '영수';
  autoSendToNts: boolean;
}

const tenantStatusCache = new Map<string, { expiresAt: number; row: CentralTenantRow }>();

function decryptVaultSecret(cipherText: string): string {
  const rawInput = String(cipherText || '').trim();
  if (!rawInput || !rawInput.startsWith(VAULT_PREFIX)) {
    return rawInput;
  }
  try {
    const raw = rawInput.slice(VAULT_PREFIX.length);
    const sepIdx = raw.indexOf('__');
    if (sepIdx === -1) return '';
    const checksum = raw.slice(0, sepIdx);
    const b64 = raw.slice(sepIdx + 2);
    const buf = Buffer.from(b64, 'base64');
    const out = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = buf[i] ^ (VAULT_CIPHER_KEY + (i % 7));
    }
    const plainText = out.toString('utf8');
    const digest = crypto.createHash('sha256').update(plainText, 'utf8').digest('hex').slice(0, 8);
    return digest === checksum ? plainText : '';
  } catch {
    return '';
  }
}

function normalizeDigits(raw?: string | null): string {
  return String(raw || '').replace(/[^0-9]/g, '');
}

function cutStr(val: string | undefined | null, maxLen: number): string {
  const s = String(val || '').trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeBuyerBizNo(rawBizNo?: string | null): string {
  const digits = normalizeDigits(rawBizNo);
  if (digits.length !== 10 || digits === '0000000000' || digits === '1000000000') {
    throw new Error(
      `유효하지 않은 거래처 사업자등록번호(${rawBizNo || '미입력'})입니다. 10자리 사업자등록번호를 확인해 주세요.`
    );
  }
  return digits;
}

function isPopbillEnabledForTenant(row: CentralTenantRow): boolean {
  const explicit = row.features?.popbillTaxInvoice;
  if (typeof explicit === 'boolean') return explicit;
  const sf = Array.isArray(row.specialFeatures)
    ? row.specialFeatures
    : Array.isArray(row.features?.specialFeatures)
      ? row.features.specialFeatures
      : [];
  return sf.includes('feat:billings:popbill_tax_invoice');
}

async function fetchCentralTenant(
  tenantId?: string,
  tenantCode?: string,
  allowShortCache = false
): Promise<CentralTenantRow | null> {
  const cleanId = String(tenantId || '').trim();
  const cleanCode = String(tenantCode || '')
    .trim()
    .toUpperCase();
  if (!cleanId && !cleanCode) return null;

  const cacheKey = `${cleanId}|${cleanCode}`;
  if (allowShortCache) {
    const cached = tenantStatusCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.row;
    }
  }

  const filterExpr = cleanId
    ? `id=eq.${encodeURIComponent(cleanId)}`
    : `tenantCode=eq.${encodeURIComponent(cleanCode)}`;

  const centralCfg = resolveCentralSupabaseConfig();
  const url = `${centralCfg.url}/rest/v1/core_tenants?select=id,tenantCode,corporateName,businessNumber,representativeName,businessAddress,businessCategory,businessItem,tel,taxEmail,specialFeatures,features&${filterExpr}&limit=1`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: centralCfg.anonKey,
      Authorization: `Bearer ${centralCfg.anonKey}`,
      'Cache-Control': 'no-cache',
    },
  });
  if (!resp.ok) {
    throw new Error(`테넌트 마스터 조회 실패 (${resp.status})`);
  }
  const rows = (await resp.json()) as CentralTenantRow[];
  const matched = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (matched) {
    tenantStatusCache.set(cacheKey, {
      expiresAt: Date.now() + 5000,
      row: matched,
    });
  }
  return matched;
}

function resolvePopbillContext(tenant: CentralTenantRow): ResolvedPopbillContext {
  const cfg = tenant.features?.popbillConfig || {};
  const useCustom = Boolean(cfg.useCustomKey && cfg.linkId && cfg.secretKey);
  const linkId = (useCustom ? String(cfg.linkId) : process.env.POPBILL_LINK_ID || '').trim();
  const secretKey = (
    useCustom ? decryptVaultSecret(String(cfg.secretKey)) : process.env.POPBILL_SECRET_KEY || ''
  ).trim();

  if (!linkId || !secretKey) {
    throw new Error('팝빌 연동 키(LinkID / SecretKey)가 설정되어 있지 않습니다.');
  }

  const isTest =
    typeof cfg.isTest === 'boolean' ? cfg.isTest : process.env.POPBILL_IS_TEST === 'true';
  const corpNum = normalizeDigits(cfg.corpNum || tenant.businessNumber);
  if (corpNum.length !== 10) {
    throw new Error(
      `공급자(테넌트) 사업자등록번호가 10자리가 아닙니다: ${cfg.corpNum || tenant.businessNumber || '미입력'}`
    );
  }

  return {
    tenant,
    linkId,
    secretKey,
    isTest,
    corpNum,
    userId: String(cfg.userId || '').trim(),
    defaultPurposeType: cfg.defaultPurposeType === '영수' ? '영수' : '청구',
    autoSendToNts: cfg.autoSendToNts !== false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTaxService(ctx: ResolvedPopbillContext): any {
  return new TaxinvoiceServiceCtor({
    LinkID: ctx.linkId,
    SecretKey: ctx.secretKey,
    IsTest: ctx.isTest,
    IPRestrictOnOff: false,
    UseStaticIP: false,
    UseLocalTimeYN: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultErrorHandler: (err: any) => {
      console.warn('[Popbill FL SDK Error]', err?.code, err?.message);
    },
  });
}

function callSdk<T>(fn: (svc: ReturnType<typeof createTaxService>, resolve: (v: T) => void, reject: (e: Error) => void) => void, ctx: ResolvedPopbillContext): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const svc = createTaxService(ctx);
      fn(svc, resolve, reject);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPopbillError(prefix: string, err: any): Error & { code?: number } {
  const codeNum = err?.code !== undefined ? Number(err.code) : undefined;
  const e = new Error(`${prefix}${codeNum !== undefined ? ` (${codeNum})` : ''}: ${err?.message || '알 수 없는 오류'}`) as Error & { code?: number };
  e.code = codeNum;
  return e;
}

interface InvoiceDetailInput {
  month?: string;
  day?: string;
  itemName: string;
  spec?: string;
  qty?: number;
  unitPrice?: number;
  supplyAmount: number;
  vatAmount: number;
  remark?: string;
}

interface InvoiceIssueInput {
  mgtKey: string;
  writeDate: string;
  purposeType?: string;
  customerName: string;
  customerBizNo: string;
  customerCeoName?: string;
  customerAddr?: string;
  customerBizType?: string;
  customerBizClass?: string;
  customerEmail?: string;
  customerEmail2?: string;
  itemName: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  memo?: string;
  taxItems?: InvoiceDetailInput[];
}

function buildPopbillTaxinvoicePayload(ctx: ResolvedPopbillContext, input: InvoiceIssueInput) {
  const mgtKey = cutStr(input.mgtKey, 24);
  if (!mgtKey) {
    throw new Error('세금계산서 문서관리번호(mgtKey)가 누락되었습니다.');
  }

  const writeDateClean = normalizeDigits(input.writeDate || new Date().toISOString().slice(0, 10)).slice(0, 8);
  if (writeDateClean.length !== 8) {
    throw new Error(`유효하지 않은 작성일자(${input.writeDate})입니다.`);
  }

  const yyyy = writeDateClean.slice(0, 4);
  const mm = writeDateClean.slice(4, 6);
  const dd = writeDateClean.slice(6, 8);

  const supplyTotal = Math.round(Number(input.supplyAmount || 0));
  const vatTotal = Math.round(Number(input.vatAmount || 0));
  const totalAmt = Math.round(Number(input.totalAmount || supplyTotal + vatTotal));
  if (supplyTotal <= 0 && totalAmt <= 0) {
    throw new Error('세금계산서 공급가액 및 합계금액은 0원보다 커야 합니다.');
  }

  const buyerBizNo = sanitizeBuyerBizNo(input.customerBizNo);
  const t = ctx.tenant;

  const detailList =
    Array.isArray(input.taxItems) && input.taxItems.length > 0
      ? input.taxItems.slice(0, 99).map((it, idx) => {
          const itemMm = String(it.month || mm).padStart(2, '0').slice(0, 2);
          const itemDd = String(it.day || dd).padStart(2, '0').slice(0, 2);
          const lineSupply = Math.round(Number(it.supplyAmount || 0));
          const lineVat = Math.round(Number(it.vatAmount || 0));
          const qtyVal = Number(it.qty ?? 1);
          const unitVal =
            it.unitPrice !== undefined ? Math.round(Number(it.unitPrice)) : lineSupply;
          return {
            serialNum: idx + 1,
            purchaseDT: `${yyyy}${itemMm}${itemDd}`,
            itemName: cutStr(it.itemName || input.itemName || '지게차 판매·임대', 100),
            spec: cutStr(it.spec || '', 60),
            qty: String(Number.isFinite(qtyVal) && qtyVal > 0 ? qtyVal : 1),
            unitCost: String(unitVal),
            supplyCost: String(lineSupply),
            tax: String(lineVat),
            remark: cutStr(it.remark || '', 100),
          };
        })
      : [
          {
            serialNum: 1,
            purchaseDT: writeDateClean,
            itemName: cutStr(input.itemName || '지게차 판매·임대', 100),
            spec: '식',
            qty: '1',
            unitCost: String(supplyTotal),
            supplyCost: String(supplyTotal),
            tax: String(vatTotal),
            remark: '',
          },
        ];

  const purpose = input.purposeType === '영수' || input.purposeType === '청구'
    ? input.purposeType
    : ctx.defaultPurposeType;

  return {
    writeDate: writeDateClean,
    chargeDirection: '정과금',
    issueType: '정발행',
    purposeType: purpose,
    issueTiming: '직접발행',
    taxType: '과세',

    invoicerCorpNum: ctx.corpNum,
    invoicerMgtKey: mgtKey,
    invoicerCorpName: cutStr(t.corporateName || '주식회사 이브로지게차', 200),
    invoicerCEOName: cutStr(t.representativeName || '대표자', 100),
    invoicerAddr: cutStr(t.businessAddress || '', 300),
    invoicerBizType: cutStr(t.businessCategory || '', 100),
    invoicerBizClass: cutStr(t.businessItem || '', 100),
    invoicerContactName: cutStr(t.representativeName || '정산담당', 100),
    invoicerTEL: cutStr(t.tel || '', 20),
    invoicerEmail: cutStr(t.taxEmail || '', 100),

    invoiceeType: '사업자',
    invoiceeCorpNum: buyerBizNo,
    invoiceeCorpName: cutStr(input.customerName, 200),
    invoiceeCEOName: cutStr(input.customerCeoName || '대표자', 100),
    invoiceeAddr: cutStr(input.customerAddr || '', 300),
    invoiceeBizType: cutStr(input.customerBizType || '', 100),
    invoiceeBizClass: cutStr(input.customerBizClass || '', 100),
    invoiceeContactName1: cutStr(input.customerCeoName || '담당자', 100),
    invoiceeEmail1: cutStr(input.customerEmail || '', 100),
    invoiceeEmail2: cutStr(input.customerEmail2 || '', 100),

    supplyCostTotal: String(supplyTotal),
    taxTotal: String(vatTotal),
    totalAmount: String(totalAmt),
    memo: cutStr(input.memo || '', 150),
    businessLicenseYN: false,
    bankBookYN: false,
    detailList,
  };
}

function getInfoSdk(ctx: ResolvedPopbillContext, mgtKey: string) {
  return callSdk<Record<string, unknown>>((svc, resolve, reject) => {
    const onOk = (info: Record<string, unknown>) => resolve(info || {});
    const onErr = (err: unknown) => reject(toPopbillError('팝빌 상태조회 오류', err));
    if (ctx.userId) svc.getInfo(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, ctx.userId, onOk, onErr);
    else svc.getInfo(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, onOk, onErr);
  }, ctx);
}

function getPopupUrlSdk(ctx: ResolvedPopbillContext, mgtKey: string, isPrint = false) {
  return callSdk<string>((svc, resolve, reject) => {
    const fn = isPrint ? svc.getPrintURL : svc.getPopUpURL;
    const onOk = (url: string) => resolve(String(url || ''));
    const onErr = (err: unknown) => reject(toPopbillError('팝빌 URL 조회 오류', err));
    if (ctx.userId) fn.call(svc, ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, ctx.userId, onOk, onErr);
    else fn.call(svc, ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, onOk, onErr);
  }, ctx);
}

function sendToNtsSdk(ctx: ResolvedPopbillContext, mgtKey: string) {
  return callSdk<Record<string, unknown>>((svc, resolve, reject) => {
    const onOk = (res: Record<string, unknown>) => resolve(res || {});
    const onErr = (err: unknown) => reject(toPopbillError('국세청 즉시전송 오류', err));
    if (ctx.userId) svc.sendToNTS(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, ctx.userId, onOk, onErr);
    else svc.sendToNTS(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, onOk, onErr);
  }, ctx);
}

function issueTempSdk(ctx: ResolvedPopbillContext, mgtKey: string, memo: string) {
  return callSdk<Record<string, unknown>>((svc, resolve, reject) => {
    svc.issue(
      ctx.corpNum,
      MGT_KEY_TYPE_SELL,
      mgtKey,
      memo || '전자서명 발행',
      '',
      false,
      ctx.userId || '',
      (res: Record<string, unknown>) => resolve(res || {}),
      (err: unknown) => reject(toPopbillError('팝빌 전자서명 발행 오류', err))
    );
  }, ctx);
}

function mapStateCodeToStatus(stateCodeRaw: unknown, ntsResultRaw?: unknown): string {
  const sc = Number(stateCodeRaw || 0);
  const ntsRes = String(ntsResultRaw || '').trim();
  if (sc >= 600) return 'CANCELLED';
  if (ntsRes === '전송성공' || sc >= 301) return 'SENT_NTS';
  if (sc === 300) return 'ISSUED';
  return 'TEMP_SAVED';
}

async function getCertValidation(ctx: ResolvedPopbillContext) {
  return callSdk<{ registered: boolean; validMessage: string; certInfo: unknown }>((svc, resolve) => {
    const onValidOk = (validRes: Record<string, unknown>) => {
      const onCertOk = (certInfo: unknown) => {
        resolve({
          registered: true,
          validMessage: String(validRes?.message || '인증서 등록 정상'),
          certInfo: certInfo || null,
        });
      };
      const onCertErr = (err: { message?: string }) => {
        resolve({
          registered: false,
          validMessage: String(err?.message || '공동인증서 미등록'),
          certInfo: null,
        });
      };
      if (ctx.userId) svc.getTaxCertInfo(ctx.corpNum, ctx.userId, onCertOk, onCertErr);
      else svc.getTaxCertInfo(ctx.corpNum, onCertOk, onCertErr);
    };
    const onValidErr = (err: { message?: string }) => {
      resolve({
        registered: false,
        validMessage: String(err?.message || '공동인증서 미등록'),
        certInfo: null,
      });
    };
    if (ctx.userId) svc.checkCertValidation(ctx.corpNum, ctx.userId, onValidOk, onValidErr);
    else svc.checkCertValidation(ctx.corpNum, onValidOk, onValidErr);
  }, ctx);
}

async function handleLiveStatus(ctx: ResolvedPopbillContext) {
  const [isMemberRes, partnerBalance, memberBalance, cert] = await Promise.all([
    callSdk<boolean>((svc, resolve) => {
      svc.checkIsMember(
        ctx.corpNum,
        (r: { exist?: boolean }) => resolve(Boolean(r?.exist)),
        () => resolve(false)
      );
    }, ctx),
    callSdk<number>((svc, resolve) => {
      svc.getPartnerBalance(
        ctx.corpNum,
        (bal: unknown) => resolve(Number(bal || 0)),
        () => resolve(0)
      );
    }, ctx),
    callSdk<number>((svc, resolve) => {
      svc.getBalance(
        ctx.corpNum,
        (bal: unknown) => resolve(Number(bal || 0)),
        () => resolve(0)
      );
    }, ctx),
    getCertValidation(ctx),
  ]);

  return {
    success: true,
    isLiveProduction: !ctx.isTest,
    isTest: ctx.isTest,
    serviceId: ctx.isTest ? 'POPBILL_TEST' : 'POPBILL',
    baseUrl: ctx.isTest ? 'https://popbill-test.linkhub.co.kr' : 'https://popbill.linkhub.co.kr',
    corpNum: ctx.corpNum,
    isMember: isMemberRes,
    partnerBalance,
    memberBalance,
    certRegistered: cert.registered,
    certInfo: cert.certInfo,
    certMessage: cert.validMessage,
    defaultPurposeType: ctx.defaultPurposeType,
    autoSendToNts: ctx.autoSendToNts,
  };
}

async function handlePortalUrl(ctx: ResolvedPopbillContext, action: string) {
  const url = await callSdk<string>((svc, resolve, reject) => {
    const onOk = (u: string) => resolve(String(u || ''));
    const onErr = (err: unknown) => reject(toPopbillError('팝빌 포털 URL 오류', err));
    if (action === 'CERT_URL') {
      if (ctx.userId) svc.getTaxCertURL(ctx.corpNum, ctx.userId, onOk, onErr);
      else svc.getTaxCertURL(ctx.corpNum, onOk, onErr);
      return;
    }
    if (action === 'CHARGE_URL') {
      svc.getPartnerURL(ctx.corpNum, 'CHRG', onOk, onErr);
      return;
    }
    if (ctx.userId) svc.getPopbillURL(ctx.corpNum, ctx.userId, 'LOGIN', onOk, onErr);
    else svc.getPopbillURL(ctx.corpNum, 'LOGIN', onOk, onErr);
  }, ctx);

  return { success: true, url, isTest: ctx.isTest };
}

async function handleRegistIssue(
  ctx: ResolvedPopbillContext,
  invoiceInput: InvoiceIssueInput,
  memoInput?: string,
  forceIssue = false
) {
  const payload = buildPopbillTaxinvoicePayload(ctx, invoiceInput);
  const mgtKey = payload.invoicerMgtKey;
  const memo = String(memoInput || '팝빌 전자세금계산서 발행').trim();

  let status = 'ISSUED';
  let mode = 'ISSUED';
  let ntsConfirmNo: string | null = null;
  let message = '';

  try {
    const res = await callSdk<Record<string, unknown>>((svc, resolve, reject) => {
      svc.registIssue(
        ctx.corpNum,
        payload,
        false,
        Boolean(forceIssue),
        memo,
        '',
        '',
        ctx.userId || '',
        (okRes: Record<string, unknown>) => resolve(okRes || {}),
        (err: unknown) => reject(toPopbillError('팝빌 발행 오류', err))
      );
    }, ctx);

    ntsConfirmNo = String(res?.ntsConfirmNum || res?.ntsconfirmNum || '').trim() || null;

    if (ctx.autoSendToNts) {
      try {
        await sendToNtsSdk(ctx, mgtKey);
        status = 'SENT_NTS';
        try {
          const latest = await getInfoSdk(ctx, mgtKey);
          ntsConfirmNo = String(latest?.ntsconfirmNum || latest?.ntsConfirmNum || ntsConfirmNo || '').trim() || ntsConfirmNo;
        } catch {
          // 상태 재조회 실패 시 기존 승인번호 유지
        }
        message = `[팝빌 정식 발행 및 국세청 즉시전송 완료]${ntsConfirmNo ? ` 승인번호: ${ntsConfirmNo}` : ''}`;
      } catch {
        status = 'ISSUED';
        message = `[팝빌 발행 완료]${ntsConfirmNo ? ` 승인번호: ${ntsConfirmNo}` : ''}`;
      }
    } else {
      status = 'ISSUED';
      message = `[팝빌 발행 완료 (국세청 전송 대기)]${ntsConfirmNo ? ` 승인번호: ${ntsConfirmNo}` : ''}`;
    }
  } catch (rawErr) {
    const sdkErr = rawErr as Error & { code?: number };
    const code = Number(sdkErr?.code);
    const errText = String(sdkErr?.message || '');

    if (code === -10002009 || errText.includes('인증서')) {
      try {
        await callSdk<Record<string, unknown>>((svc, resolve, reject) => {
          svc.register(
            ctx.corpNum,
            payload,
            ctx.userId || '',
            false,
            (regRes: Record<string, unknown>) => resolve(regRes || {}),
            (err: unknown) => reject(toPopbillError('팝빌 임시등록 오류', err))
          );
        }, ctx);
        mode = 'REGISTERED_IN_POPBILL';
        status = 'TEMP_SAVED';
        ntsConfirmNo = null;
        message =
          '[팝빌 임시문서함 등록 완료] 공동인증서가 등록되지 않아 임시저장 상태로 보관되었습니다. 공동인증서 등록 후 발행해 주세요.';
      } catch (regErrRaw) {
        const regErr = regErrRaw as Error & { code?: number };
        if (regErr?.code === -11000003 || String(regErr?.message || '').includes('이미')) {
          const info = await getInfoSdk(ctx, mgtKey);
          ntsConfirmNo = String(info?.ntsconfirmNum || info?.ntsConfirmNum || '').trim() || null;
          status = mapStateCodeToStatus(info?.stateCode, info?.ntsresult);
          mode = ntsConfirmNo ? 'ALREADY_IN_POPBILL' : 'REGISTERED_IN_POPBILL';
          message = ntsConfirmNo
            ? `[팝빌 기존 발행 확인] 승인번호: ${ntsConfirmNo}`
            : '[팝빌 임시문서함 보관중] 공동인증서 서명 대기 상태입니다.';
        } else {
          throw regErrRaw;
        }
      }
    } else if (code === -11000003 || errText.includes('이미')) {
      const info = await getInfoSdk(ctx, mgtKey);
      const existingNts = String(info?.ntsconfirmNum || info?.ntsConfirmNum || '').trim() || null;
      if (existingNts) {
        ntsConfirmNo = existingNts;
        status = mapStateCodeToStatus(info?.stateCode, info?.ntsresult);
        mode = 'ALREADY_IN_POPBILL';
        message = `[팝빌 기존 발행 확인] 승인번호: ${existingNts}`;
      } else {
        const issueRes = await issueTempSdk(ctx, mgtKey, memo);
        ntsConfirmNo = String(issueRes?.ntsConfirmNum || issueRes?.ntsconfirmNum || '').trim() || null;
        mode = 'ISSUED_FROM_TEMP';
        status = 'ISSUED';
        if (ctx.autoSendToNts) {
          try {
            await sendToNtsSdk(ctx, mgtKey);
            status = 'SENT_NTS';
          } catch {
            // 이미 자동전송 대기 중인 경우 무시
          }
        }
        message = `[팝빌 임시문서 발행 완료]${ntsConfirmNo ? ` 승인번호: ${ntsConfirmNo}` : ''}`;
      }
    } else {
      throw sdkErr;
    }
  }

  let popupUrl = '';
  try {
    popupUrl = await getPopupUrlSdk(ctx, mgtKey, false);
  } catch {
    popupUrl = '';
  }

  return {
    success: true,
    isLiveProduction: !ctx.isTest,
    isTest: ctx.isTest,
    mgtKey,
    ntsConfirmNo,
    status,
    mode,
    purposeType: payload.purposeType,
    receiverEmail: payload.invoiceeEmail1 || '',
    popupUrl,
    message,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '지원하지 않는 요청 방식입니다.' });
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const action = String(body.action || 'LIVE_STATUS')
      .trim()
      .toUpperCase();
    const tenantId = String(body.tenantId || '').trim();
    const tenantCode = String(body.tenantCode || '').trim();

    if (!tenantId && !tenantCode) {
      return res.status(400).json({
        success: false,
        error: '테넌트 식별 정보(tenantId 또는 tenantCode)가 필요합니다.',
      });
    }

    const tenant = await fetchCentralTenant(tenantId, tenantCode, action === 'LIVE_STATUS');
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: '테넌트 정보를 확인할 수 없습니다.',
      });
    }

    if (!isPopbillEnabledForTenant(tenant)) {
      return res.status(403).json({
        success: false,
        disabledByTenant: true,
        error:
          '해당 테넌트는 팝빌 전자세금계산서 발행 기능이 비활성화되어 있습니다. 테넌트관리센터에서 활성 여부를 확인해 주세요.',
      });
    }

    const ctx = resolvePopbillContext(tenant);

    if (action === 'LIVE_STATUS' || action === 'CERT_INFO' || action === 'STATUS_CHECK') {
      const data = await handleLiveStatus(ctx);
      return res.status(200).json(data);
    }

    if (action === 'PORTAL_URL' || action === 'CERT_URL' || action === 'CHARGE_URL') {
      const data = await handlePortalUrl(ctx, action);
      return res.status(200).json(data);
    }

    if (action === 'REGIST_ISSUE') {
      const invoiceInput = (body.invoice || {}) as InvoiceIssueInput;
      const result = await handleRegistIssue(
        ctx,
        invoiceInput,
        typeof body.memo === 'string' ? body.memo : undefined,
        Boolean(body.forceIssue)
      );
      return res.status(200).json(result);
    }

    if (action === 'REGISTER_TEMP') {
      const invoiceInput = (body.invoice || {}) as InvoiceIssueInput;
      const payload = buildPopbillTaxinvoicePayload(ctx, invoiceInput);
      await callSdk<Record<string, unknown>>((svc, resolve, reject) => {
        svc.register(
          ctx.corpNum,
          payload,
          ctx.userId || '',
          false,
          (r: Record<string, unknown>) => resolve(r || {}),
          (err: unknown) => reject(toPopbillError('팝빌 임시등록 오류', err))
        );
      }, ctx);
      return res.status(200).json({
        success: true,
        isTest: ctx.isTest,
        mgtKey: payload.invoicerMgtKey,
        status: 'TEMP_SAVED',
        ntsConfirmNo: null,
        message: '팝빌 임시문서함 등록 완료',
      });
    }

    if (action === 'SYNC_STATUS' || action === 'GET_INFO') {
      const mgtKey = String(body.mgtKey || '').trim();
      if (!mgtKey) {
        return res.status(400).json({ success: false, error: '세금계산서 관리번호(mgtKey)가 필요합니다.' });
      }
      const info = await getInfoSdk(ctx, mgtKey);
      const ntsConfirmNo = String(info?.ntsconfirmNum || info?.ntsConfirmNum || '').trim() || null;
      const status = mapStateCodeToStatus(info?.stateCode, info?.ntsresult);
      return res.status(200).json({
        success: true,
        isTest: ctx.isTest,
        mgtKey,
        status,
        ntsConfirmNo,
        info,
      });
    }

    if (action === 'SEND_TO_NTS') {
      const keys = Array.isArray(body.mgtKeys)
        ? body.mgtKeys.map((k) => String(k || '').trim()).filter(Boolean)
        : body.mgtKey
          ? [String(body.mgtKey).trim()]
          : [];
      if (keys.length === 0) {
        return res.status(400).json({ success: false, error: '국세청 전송할 관리번호가 필요합니다.' });
      }

      const results: Array<{ mgtKey: string; ntsConfirmNo: string | null; status: string }> = [];
      const errors: string[] = [];

      for (const k of keys) {
        try {
          try {
            await sendToNtsSdk(ctx, k);
          } catch (firstErr) {
            const code = (firstErr as Error & { code?: number })?.code;
            const msg = String((firstErr as Error)?.message || '');
            if (code === -11000015 || msg.includes('발행')) {
              await issueTempSdk(ctx, k, '전자서명 발행 후 국세청 전송');
              await sendToNtsSdk(ctx, k);
            } else {
              throw firstErr;
            }
          }
          const info = await getInfoSdk(ctx, k).catch(() => ({} as Record<string, unknown>));
          const ntsNo = String(info?.ntsconfirmNum || info?.ntsConfirmNum || '').trim() || null;
          results.push({ mgtKey: k, ntsConfirmNo: ntsNo, status: 'SENT_NTS' });
        } catch (err) {
          errors.push(`[${k}] ${err instanceof Error ? err.message : '전송 오류'}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return res.status(400).json({ success: false, error: errors.join('\n') });
      }

      return res.status(200).json({
        success: true,
        isTest: ctx.isTest,
        sentCount: results.length,
        errorCount: errors.length,
        ntsConfirmNo: results[0]?.ntsConfirmNo || null,
        status: 'SENT_NTS',
        results,
        errors,
        message:
          keys.length === 1
            ? `[${keys[0]}] 국세청 즉시전송 요청 완료`
            : `총 ${results.length}건 국세청 즉시전송 완료${errors.length > 0 ? ` (${errors.length}건 실패)` : ''}`,
      });
    }

    if (action === 'VIEW_URL' || action === 'PRINT_URL' || action === 'GET_POPUP_URL' || action === 'GET_PRINT_URL') {
      const mgtKey = String(body.mgtKey || '').trim();
      if (!mgtKey) {
        return res.status(400).json({ success: false, error: '세금계산서 관리번호(mgtKey)가 필요합니다.' });
      }
      const isPrint = action === 'PRINT_URL' || action === 'GET_PRINT_URL';
      const url = await getPopupUrlSdk(ctx, mgtKey, isPrint);
      return res.status(200).json({ success: true, isTest: ctx.isTest, url });
    }

    if (action === 'SEND_EMAIL' || action === 'RESEND_EMAIL') {
      const mgtKey = String(body.mgtKey || '').trim();
      const receiverEmail = String(body.receiverEmail || '').trim();
      if (!mgtKey || !receiverEmail) {
        return res.status(400).json({
          success: false,
          error: '관리번호(mgtKey)와 수신자 이메일(receiverEmail)이 필요합니다.',
        });
      }
      await callSdk<Record<string, unknown>>((svc, resolve, reject) => {
        const onOk = (r: Record<string, unknown>) => resolve(r || {});
        const onErr = (err: unknown) => reject(toPopbillError('팝빌 이메일 재전송 오류', err));
        if (ctx.userId) svc.sendEmail(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, receiverEmail, ctx.userId, onOk, onErr);
        else svc.sendEmail(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, receiverEmail, onOk, onErr);
      }, ctx);
      return res.status(200).json({
        success: true,
        isTest: ctx.isTest,
        receiverEmail,
        message: `[${receiverEmail}]로 세금계산서 안내 이메일 발송 완료`,
      });
    }

    if (action === 'CANCEL_ISSUE') {
      const mgtKey = String(body.mgtKey || '').trim();
      const memo = String(body.memo || '세금계산서 발행 취소').trim();
      if (!mgtKey) {
        return res.status(400).json({ success: false, error: '세금계산서 관리번호(mgtKey)가 필요합니다.' });
      }
      let cancelledByDelete = false;
      try {
        await callSdk<Record<string, unknown>>((svc, resolve, reject) => {
          const onOk = (r: Record<string, unknown>) => resolve(r || {});
          const onErr = (err: unknown) => reject(toPopbillError('팝빌 발행취소 오류', err));
          if (ctx.userId) svc.cancelIssue(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, memo, ctx.userId, onOk, onErr);
          else svc.cancelIssue(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, memo, onOk, onErr);
        }, ctx);
      } catch (cancelErr) {
        const code = (cancelErr as Error & { code?: number })?.code;
        if (code === -11000015 || code === -11000009 || String((cancelErr as Error)?.message || '').includes('임시저장')) {
          await callSdk<Record<string, unknown>>((svc, resolve, reject) => {
            const onOk = (r: Record<string, unknown>) => resolve(r || {});
            const onErr = (err: unknown) => reject(toPopbillError('팝빌 임시문서 삭제 오류', err));
            if (ctx.userId) svc.delete(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, ctx.userId, onOk, onErr);
            else svc.delete(ctx.corpNum, MGT_KEY_TYPE_SELL, mgtKey, onOk, onErr);
          }, ctx);
          cancelledByDelete = true;
        } else {
          throw cancelErr;
        }
      }
      return res.status(200).json({
        success: true,
        isTest: ctx.isTest,
        mgtKey,
        status: 'CANCELLED',
        message: cancelledByDelete
          ? `[${mgtKey}] 팝빌 임시문서 삭제 완료`
          : `[${mgtKey}] 팝빌 세금계산서 발행 취소 완료`,
      });
    }

    return res.status(400).json({
      success: false,
      error: `지원하지 않는 팝빌 작업입니다: ${action}`,
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : '팝빌 연동 처리 중 오류가 발생했습니다.';
    const causeObj =
      err && typeof err === 'object' && 'cause' in err ? (err as { cause?: { message?: string; code?: string } }).cause : undefined;
    const causeDetail = causeObj?.message || causeObj?.code || '';
    const message = causeDetail && !rawMsg.includes(causeDetail) ? `${rawMsg} (${causeDetail})` : rawMsg;
    const statusCode = (err as { code?: number })?.code ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
}

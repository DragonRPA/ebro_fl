import { camelToSnakeRow, execDbMutation, flSupabase } from '../core/supabase';
import type { FlBilling, FlPartner, TenantProfile } from '../types/domain';

export const POPBILL_TEST_DEVELOPER_EMAIL = '77.victor.lee@gmail.com';

export interface PopbillLiveStatus {
  isLiveProduction: boolean;
  isTest: boolean;
  serviceId: string;
  baseUrl: string;
  corpNum: string;
  isMember: boolean;
  partnerBalance: number;
  memberBalance: number;
  certRegistered: boolean;
  certMessage: string;
  defaultPurposeType: '청구' | '영수';
  autoSendToNts: boolean;
}

export interface PopbillLineDraft {
  month: string;
  day: string;
  itemName: string;
  spec: string;
  qty: number;
  unitPrice: number;
  supplyAmount: number;
  vatAmount: number;
  remark: string;
}

export interface PopbillIssueDraft {
  writeDate: string;
  purposeType: '청구' | '영수';
  customerName: string;
  customerBizNo: string;
  customerCeoName: string;
  customerAddr: string;
  customerBizType: string;
  customerBizClass: string;
  customerEmail: string;
  customerEmail2: string;
  memo: string;
  taxItems: PopbillLineDraft[];
}

export interface PopbillIssueResult {
  success: boolean;
  isLiveProduction: boolean;
  isTest: boolean;
  mgtKey: string;
  ntsConfirmNo: string | null;
  status: string;
  mode: string;
  purposeType: string;
  receiverEmail: string;
  popupUrl: string;
  message: string;
}

export function formatPopbillStatusLabel(status?: string | null): {
  label: string;
  tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
} {
  switch (status) {
    case 'SENT_NTS':
      return { label: '국세청 전송완료', tone: 'success' };
    case 'ISSUED':
      return { label: '팝빌 발행완료', tone: 'info' };
    case 'TEMP_SAVED':
      return { label: '임시저장', tone: 'warning' };
    case 'CANCELLED':
      return { label: '발행취소', tone: 'danger' };
    default:
      return { label: '미발행', tone: 'neutral' };
  }
}

export function generatePopbillMgtKey(billing: FlBilling): string {
  if (billing.taxInvoiceMgtKey && billing.taxInvoiceStatus !== 'CANCELLED') {
    return billing.taxInvoiceMgtKey.slice(0, 24);
  }
  const cleanBase = String(billing.billingNo || billing.id || 'FLBIL')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 14);
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  return `${cleanBase}_${suffix}`.slice(0, 24);
}

export function buildDefaultPopbillDraft(params: {
  billing: FlBilling;
  partner?: FlPartner;
  tenant: TenantProfile;
}): PopbillIssueDraft {
  const { billing, partner, tenant } = params;
  const writeDate = (billing.billingDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const [, mm = '01', dd = '01'] = writeDate.split('-');
  const defaultPurpose: '청구' | '영수' =
    billing.unpaidBalanceKrw <= 0 && billing.paidAmountKrw >= billing.totalAmountKrw
      ? '영수'
      : tenant.features?.popbillConfig?.defaultPurposeType === '영수'
        ? '영수'
        : '청구';

  const rawLines = Array.isArray(billing.lines) ? billing.lines : [];
  const taxItems: PopbillLineDraft[] =
    rawLines.length > 0
      ? rawLines.map((line) => {
          const qty = Number(line.qty || 1) > 0 ? Number(line.qty || 1) : 1;
          const supply = Math.round(Number(line.supplyAmountKrw || 0));
          const vat = Math.round(Number(line.vatAmountKrw ?? Math.round(supply * 0.1)));
          return {
            month: mm,
            day: dd,
            itemName: String(line.description || '지게차 임대·판매 공급').slice(0, 100),
            spec: '대/식',
            qty,
            unitPrice: Math.round(supply / qty),
            supplyAmount: supply,
            vatAmount: vat,
            remark: billing.billingYm ? `${billing.billingYm}월분` : '',
          };
        })
      : [
          {
            month: mm,
            day: dd,
            itemName: `${billing.billingYm} 지게차 공급·임대 청구`,
            spec: '식',
            qty: 1,
            unitPrice: Math.round(billing.supplyAmountKrw),
            supplyAmount: Math.round(billing.supplyAmountKrw),
            vatAmount: Math.round(billing.vatAmountKrw),
            remark: '',
          },
        ];

  const isTestMode = Boolean(tenant.features?.popbillConfig?.isTest);

  return {
    writeDate,
    purposeType: defaultPurpose,
    customerName: (partner?.name || billing.partnerName || '').trim(),
    customerBizNo: (partner?.bizRegNo || '').trim(),
    customerCeoName: (partner?.representative || '대표자').trim(),
    customerAddr: (partner?.address || '').trim(),
    customerBizType: (partner?.bizType || '').trim(),
    customerBizClass: (partner?.bizItem || '').trim(),
    customerEmail: isTestMode
      ? POPBILL_TEST_DEVELOPER_EMAIL
      : (partner?.taxEmail || partner?.email || '').trim(),
    customerEmail2: isTestMode
      ? ''
      : partner?.taxEmail && partner?.email && partner.taxEmail !== partner.email
        ? partner.email.trim()
        : '',
    memo: `${billing.billingYm} ${billing.billingNo}`,
    taxItems,
  };
}

async function callPopbillApi<T extends { success?: boolean; error?: string }>(
  payload: Record<string, unknown>
): Promise<T> {
  const resp = await fetch('/api/popbill-taxinvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await resp.json().catch(() => ({}))) as T;
  if (!resp.ok || data.success === false) {
    throw new Error(data.error || `팝빌 연동 요청 실패 (${resp.status})`);
  }
  return data;
}

export async function fetchPopbillLiveStatus(tenant: TenantProfile): Promise<PopbillLiveStatus> {
  return callPopbillApi<PopbillLiveStatus & { success: boolean; error?: string }>({
    action: 'LIVE_STATUS',
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
  });
}

export async function openPopbillPortal(
  tenant: TenantProfile,
  action: 'PORTAL_URL' | 'CERT_URL' | 'CHARGE_URL'
): Promise<void> {
  const data = await callPopbillApi<{ success: boolean; url: string; error?: string }>({
    action,
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
  });
  if (!data.url) throw new Error('팝빌 포털 주소를 수신하지 못했습니다.');
  window.open(data.url, '_blank', 'noopener,noreferrer,width=1100,height=820');
}

function validateBillingForPopbill(partner: FlPartner | undefined, buyerBizNo: string): void {
  if (partner?.ntsStatus === '폐업') {
    throw new Error(`[${partner.name}] 폐업 거래처에는 세금계산서를 발행할 수 없습니다.`);
  }
  const digits = buyerBizNo.replace(/[^0-9]/g, '');
  if (digits.length !== 10 || digits === '0000000000' || digits === '1000000000') {
    throw new Error(
      `거래처 사업자등록번호(${buyerBizNo || '미입력'})가 10자리가 아닙니다. 거래처 관리에서 사업자등록번호를 먼저 등록해 주세요.`
    );
  }
}

export async function issuePopbillTaxInvoiceForBilling(params: {
  tenant: TenantProfile;
  billing: FlBilling;
  partner?: FlPartner;
  draft: PopbillIssueDraft;
}): Promise<PopbillIssueResult> {
  const { tenant, billing, partner, draft } = params;
  validateBillingForPopbill(partner, draft.customerBizNo);

  const mgtKey = generatePopbillMgtKey(billing);
  const firstItemName = draft.taxItems[0]?.itemName || `${billing.billingYm} 지게차 청구`;
  const summaryItemName =
    draft.taxItems.length > 1 ? `${firstItemName} 외 ${draft.taxItems.length - 1}건` : firstItemName;

  const result = await callPopbillApi<PopbillIssueResult>({
    action: 'REGIST_ISSUE',
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
    memo: draft.memo,
    invoice: {
      mgtKey,
      writeDate: draft.writeDate,
      purposeType: draft.purposeType,
      customerName: draft.customerName,
      customerBizNo: draft.customerBizNo,
      customerCeoName: draft.customerCeoName || '대표자',
      customerAddr: draft.customerAddr,
      customerBizType: draft.customerBizType,
      customerBizClass: draft.customerBizClass,
      customerEmail: draft.customerEmail,
      customerEmail2: draft.customerEmail2,
      itemName: summaryItemName,
      supplyAmount: billing.supplyAmountKrw,
      vatAmount: billing.vatAmountKrw,
      totalAmount: billing.totalAmountKrw,
      memo: draft.memo,
      taxItems: draft.taxItems,
    },
  });

  const nowIso = new Date().toISOString();
  const issuedFlag = result.status !== 'TEMP_SAVED' && result.status !== 'CANCELLED';

  await execDbMutation('팝빌 세금계산서 발행 결과 저장', () =>
    flSupabase
      .from('billings')
      .update(
        camelToSnakeRow({
          taxInvoiceIssued: issuedFlag,
          taxInvoiceNo: result.ntsConfirmNo || result.mgtKey,
          taxInvoiceIssuedAt: issuedFlag ? draft.writeDate.slice(0, 10) : null,
          taxInvoiceMgtKey: result.mgtKey,
          taxInvoiceStatus: result.status,
          taxInvoiceChannel: 'POPBILL',
          taxInvoicePurpose: result.purposeType || draft.purposeType,
          taxInvoiceEmail: result.receiverEmail || draft.customerEmail || null,
          taxInvoiceNtsSentAt: result.status === 'SENT_NTS' ? nowIso : null,
          updatedAt: nowIso,
        })
      )
      .eq('id', billing.id)
  );

  return result;
}

export async function batchIssuePopbillTaxInvoices(params: {
  tenant: TenantProfile;
  billings: FlBilling[];
  partnersById: Map<string, FlPartner>;
}): Promise<{ succeeded: number; tempSaved: number; failed: string[] }> {
  const { tenant, billings, partnersById } = params;
  let succeeded = 0;
  let tempSaved = 0;
  const failed: string[] = [];

  for (const billing of billings) {
    const partner = partnersById.get(billing.partnerId);
    try {
      const draft = buildDefaultPopbillDraft({ billing, partner, tenant });
      const res = await issuePopbillTaxInvoiceForBilling({
        tenant,
        billing,
        partner,
        draft,
      });
      if (res.status === 'TEMP_SAVED') tempSaved++;
      else succeeded++;
    } catch (err) {
      failed.push(
        `${billing.billingNo}(${billing.partnerName}): ${err instanceof Error ? err.message : '발행 오류'}`
      );
    }
  }

  return { succeeded, tempSaved, failed };
}

export async function syncPopbillTaxInvoiceStatus(
  tenant: TenantProfile,
  billing: FlBilling
): Promise<{ status: string; ntsConfirmNo: string | null }> {
  const mgtKey = billing.taxInvoiceMgtKey || billing.taxInvoiceNo;
  if (!mgtKey) throw new Error('팝빌 문서관리번호가 없습니다.');

  const res = await callPopbillApi<{
    success: boolean;
    status: string;
    ntsConfirmNo: string | null;
    error?: string;
  }>({
    action: 'SYNC_STATUS',
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
    mgtKey,
  });

  const nowIso = new Date().toISOString();
  const isIssued = res.status !== 'TEMP_SAVED' && res.status !== 'CANCELLED';

  await execDbMutation('팝빌 세금계산서 상태 동기화 저장', () =>
    flSupabase
      .from('billings')
      .update(
        camelToSnakeRow({
          taxInvoiceIssued: isIssued,
          taxInvoiceNo: res.ntsConfirmNo || billing.taxInvoiceNo || mgtKey,
          taxInvoiceStatus: res.status,
          taxInvoiceNtsSentAt:
            res.status === 'SENT_NTS' ? billing.taxInvoiceNtsSentAt || nowIso : billing.taxInvoiceNtsSentAt || null,
          updatedAt: nowIso,
        })
      )
      .eq('id', billing.id)
  );

  return { status: res.status, ntsConfirmNo: res.ntsConfirmNo };
}

export async function sendPopbillTaxInvoiceToNts(
  tenant: TenantProfile,
  billing: FlBilling
): Promise<{ ntsConfirmNo: string | null; message: string }> {
  const mgtKey = billing.taxInvoiceMgtKey || billing.taxInvoiceNo;
  if (!mgtKey) throw new Error('국세청 전송할 팝빌 문서관리번호가 없습니다.');

  const res = await callPopbillApi<{
    success: boolean;
    ntsConfirmNo: string | null;
    message: string;
    error?: string;
  }>({
    action: 'SEND_TO_NTS',
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
    mgtKey,
  });

  const nowIso = new Date().toISOString();
  await execDbMutation('국세청 전송 결과 저장', () =>
    flSupabase
      .from('billings')
      .update(
        camelToSnakeRow({
          taxInvoiceIssued: true,
          taxInvoiceNo: res.ntsConfirmNo || billing.taxInvoiceNo || mgtKey,
          taxInvoiceStatus: 'SENT_NTS',
          taxInvoiceNtsSentAt: nowIso,
          updatedAt: nowIso,
        })
      )
      .eq('id', billing.id)
  );

  return { ntsConfirmNo: res.ntsConfirmNo, message: res.message };
}

export async function openPopbillInvoicePopup(
  tenant: TenantProfile,
  billing: FlBilling,
  mode: 'VIEW_URL' | 'PRINT_URL'
): Promise<void> {
  const mgtKey = billing.taxInvoiceMgtKey || billing.taxInvoiceNo;
  if (!mgtKey) throw new Error('팝빌 문서관리번호가 없습니다.');

  const res = await callPopbillApi<{ success: boolean; url: string; error?: string }>({
    action: mode,
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
    mgtKey,
  });
  if (!res.url) throw new Error('팝빌 문서 보기 주소를 수신하지 못했습니다.');
  window.open(res.url, '_blank', 'noopener,noreferrer,width=920,height=780');
}

export async function resendPopbillTaxInvoiceEmail(
  tenant: TenantProfile,
  billing: FlBilling,
  receiverEmail: string
): Promise<string> {
  const mgtKey = billing.taxInvoiceMgtKey || billing.taxInvoiceNo;
  if (!mgtKey) throw new Error('팝빌 문서관리번호가 없습니다.');
  const isTestMode = Boolean(tenant.features?.popbillConfig?.isTest);
  const cleanEmail = isTestMode ? POPBILL_TEST_DEVELOPER_EMAIL : receiverEmail.trim();
  if (!cleanEmail) throw new Error('수신 이메일 주소를 입력해 주세요.');

  const res = await callPopbillApi<{
    success: boolean;
    receiverEmail?: string;
    message: string;
    error?: string;
  }>({
    action: 'SEND_EMAIL',
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
    mgtKey,
    receiverEmail: cleanEmail,
  });

  await execDbMutation('세금계산서 수신 이메일 기록', () =>
    flSupabase
      .from('billings')
      .update(
        camelToSnakeRow({
          taxInvoiceEmail: res.receiverEmail || cleanEmail,
          updatedAt: new Date().toISOString(),
        })
      )
      .eq('id', billing.id)
  );

  return res.message;
}

export async function cancelPopbillTaxInvoice(
  tenant: TenantProfile,
  billing: FlBilling,
  memo?: string
): Promise<string> {
  const mgtKey = billing.taxInvoiceMgtKey || billing.taxInvoiceNo;
  if (!mgtKey) throw new Error('취소할 팝빌 문서관리번호가 없습니다.');

  const res = await callPopbillApi<{ success: boolean; message: string; error?: string }>({
    action: 'CANCEL_ISSUE',
    tenantId: tenant.id,
    tenantCode: tenant.tenantCode,
    mgtKey,
    memo: memo || '청구 담당자 발행 취소',
  });

  await execDbMutation('세금계산서 취소 상태 반영', () =>
    flSupabase
      .from('billings')
      .update(
        camelToSnakeRow({
          taxInvoiceIssued: false,
          taxInvoiceStatus: 'CANCELLED',
          updatedAt: new Date().toISOString(),
        })
      )
      .eq('id', billing.id)
  );

  return res.message;
}

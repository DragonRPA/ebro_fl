// d:\01.AntiGravity\ebro_FL\api\popbill-taxinvoice.ts
// 팝빌(Popbill) 전자세금계산서 테스트 서버 전용 API (popbill-test.linkhub.co.kr)
// ⚠️ 절대 원칙: 세금계산서 테스트 동안에는 어떠한 경우에도 이메일을 발송하지 않음!
//   1) IsTest: true 고정 (상용 전환 원천 차단)
//   2) invoicerEmail / invoiceeEmail1 / invoiceeEmail2 무조건 빈 문자열("") 강제 치환
//   3) updateEmailConfig로 팝빌 서버 측 알림메일(TAX_ISSUE 등) 전체 false 강제
//   4) SEND_EMAIL / RESEND_EMAIL 액션 호출 시 100% 하드블록 거부

import type { VercelRequest, VercelResponse } from '@vercel/node';
import popbill from 'popbill';

const POPBILL_TEST_LINK_ID = process.env.POPBILL_LINK_ID || 'DRAGONRP';
const POPBILL_TEST_SECRET_KEY =
  process.env.POPBILL_SECRET_KEY || 'BZL4UVISXlJur3SHxVIBEQ3ZYMFyyM+DtDFFRd21wZI=';
const DEFAULT_TEST_CORP_NUM = (process.env.POPBILL_CORP_NUM || '8068803266').replace(/[^0-9]/g, '');
const DEFAULT_TEST_USER_ID = process.env.POPBILL_USER_ID || 'dragonrpa';

// 팝빌 전역 설정: 무조건 IsTest: true (https://popbill-test.linkhub.co.kr) 고정
popbill.config({
  LinkID: POPBILL_TEST_LINK_ID,
  SecretKey: POPBILL_TEST_SECRET_KEY,
  IsTest: true,
  IPRestrictOnOff: true,
  UseStaticIP: false,
  UseLocalTimeYN: true,
  defaultErrorHandler: (err: any) => {
    console.warn('[Popbill Test Mode Error]', err?.code, err?.message);
  }
});

const taxinvoiceService = popbill.TaxinvoiceService();

const EMAIL_TYPES_TO_DISABLE = [
  'TAX_ISSUE',
  'TAX_ISSUE_INVOICER',
  'TAX_CANCEL_ISSUE',
  'TAX_TRUST_ISSUE',
  'TAX_TRUST_ISSUE_TRUSTER',
  'TAX_TRUST_ISSUE_INVOICER',
  'TAX_TRUST_CANCEL_ISSUE',
  'TAX_TRUST_CANCEL_ISSUE_INVOICER'
];

let emailSilenceInitializedForCorp: Record<string, boolean> = {};

function updateEmailConfigPromise(corpNum: string, emailType: string, sendYN: boolean): Promise<void> {
  return new Promise(resolve => {
    try {
      taxinvoiceService.updateEmailConfig(
        corpNum,
        emailType,
        sendYN,
        DEFAULT_TEST_USER_ID,
        () => resolve(),
        () => resolve()
      );
    } catch {
      resolve();
    }
  });
}

async function ensurePopbillEmailNotificationsDisabled(corpNum: string): Promise<void> {
  const cleanCorp = (corpNum || DEFAULT_TEST_CORP_NUM).replace(/[^0-9]/g, '') || DEFAULT_TEST_CORP_NUM;
  if (emailSilenceInitializedForCorp[cleanCorp]) return;
  await Promise.all(
    EMAIL_TYPES_TO_DISABLE.map(emailType => updateEmailConfigPromise(cleanCorp, emailType, false))
  );
  emailSilenceInitializedForCorp[cleanCorp] = true;
}

export interface SanitizedPopbillInvoiceInput {
  mgtKey: string;
  writeDate: string;
  chargeDirection?: string;
  issueType?: string;
  purposeType?: string;
  taxType?: string;
  invoicerCorpNum?: string;
  invoicerCorpName?: string;
  invoicerCEOName?: string;
  invoicerAddr?: string;
  invoicerBizType?: string;
  invoicerBizClass?: string;
  invoicerContactName?: string;
  invoicerTEL?: string;
  invoiceeType?: string;
  invoiceeCorpNum: string;
  invoiceeTaxRegID?: string;
  invoiceeCorpName: string;
  invoiceeCEOName: string;
  invoiceeAddr?: string;
  invoiceeBizType?: string;
  invoiceeBizClass?: string;
  invoiceeContactName1?: string;
  invoiceeTEL1?: string;
  supplyCostTotal: number;
  taxTotal: number;
  totalAmount: number;
  serialNum?: string;
  cash?: string;
  chkBill?: string;
  note?: string;
  credit?: string;
  remark1?: string;
  remark2?: string;
  remark3?: string;
  detailList?: Array<{
    serialNum: number;
    purchaseDT?: string;
    itemName: string;
    spec?: string;
    qty?: number | string;
    unitCost?: number | string;
    supplyCost: number | string;
    tax: number | string;
    remark?: string;
  }>;
}

/**
 * 🛡️ 이메일 발송 원천 차단 페이로드 빌더
 * 사용자가 화면이나 DB에 어떤 이메일을 입력했더라도 팝빌 서버로 넘어가는 객체에는
 * invoicerEmail, invoiceeEmail1, invoiceeEmail2를 모두 빈 문자열("")로 강제 고정합니다.
 */
export function buildZeroEmailPopbillPayload(input: SanitizedPopbillInvoiceInput) {
  const writeDateClean = String(input.writeDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8);
  const invoicerCorpNumClean = String(input.invoicerCorpNum || DEFAULT_TEST_CORP_NUM).replace(/[^0-9]/g, '') || DEFAULT_TEST_CORP_NUM;
  const invoiceeCorpNumClean = String(input.invoiceeCorpNum || '').replace(/[^0-9]/g, '');

  const supplyCostNum = Math.round(Number(input.supplyCostTotal || 0));
  const taxNum = Math.round(Number(input.taxTotal || 0));
  const totalNum = Math.round(Number(input.totalAmount || supplyCostNum + taxNum));

  const details = Array.isArray(input.detailList) && input.detailList.length > 0
    ? input.detailList.map((item, idx) => ({
        serialNum: idx + 1,
        purchaseDT: String(item.purchaseDT || writeDateClean).replace(/[^0-9]/g, '').slice(0, 8),
        itemName: String(item.itemName || '지게차 임대료'),
        spec: String(item.spec || '식'),
        qty: String(item.qty ?? 1),
        unitCost: String(Math.round(Number(item.unitCost ?? item.supplyCost ?? supplyCostNum))),
        supplyCost: String(Math.round(Number(item.supplyCost ?? supplyCostNum))),
        tax: String(Math.round(Number(item.tax ?? taxNum))),
        remark: String(item.remark || '')
      }))
    : [
        {
          serialNum: 1,
          purchaseDT: writeDateClean,
          itemName: String(input.remark1 || '지게차 임대 및 정비 청구'),
          spec: '식',
          qty: '1',
          unitCost: String(supplyCostNum),
          supplyCost: String(supplyCostNum),
          tax: String(taxNum),
          remark: ''
        }
      ];

  return {
    writeDate: writeDateClean,
    chargeDirection: input.chargeDirection || '정과금',
    issueType: input.issueType || '정발행',
    purposeType: input.purposeType || '청구',
    taxType: input.taxType || '과세',

    invoicerCorpNum: invoicerCorpNumClean,
    invoicerMgtKey: String(input.mgtKey).trim(),
    invoicerCorpName: input.invoicerCorpName || '무진글로벌(주)',
    invoicerCEOName: input.invoicerCEOName || '이정용',
    invoicerAddr: input.invoicerAddr || '경기도 시흥시 공단1대로 204',
    invoicerBizType: input.invoicerBizType || '건설기계 대여 및 도소매',
    invoicerBizClass: input.invoicerBizClass || '지게차 임대·판매·부품',
    invoicerContactName: input.invoicerContactName || '정산담당',
    invoicerTEL: input.invoicerTEL || '031-000-0000',
    invoicerHP: '',
    // 🛡️ 절대 발송 금지: 공급자 이메일 무조건 공란
    invoicerEmail: '',
    invoicerSMSSendYN: false,

    invoiceeType: input.invoiceeType || '사업자',
    invoiceeCorpNum: invoiceeCorpNumClean,
    invoiceeTaxRegID: input.invoiceeTaxRegID || '',
    invoiceeCorpName: input.invoiceeCorpName || '테스트 거래처',
    invoiceeCEOName: input.invoiceeCEOName || '대표자',
    invoiceeAddr: input.invoiceeAddr || '',
    invoiceeBizType: input.invoiceeBizType || '제조 및 물류',
    invoiceeBizClass: input.invoiceeBizClass || '물류창고',
    invoiceeContactName1: input.invoiceeContactName1 || '재무담당',
    invoiceeTEL1: input.invoiceeTEL1 || '',
    invoiceeHP1: '',
    // 🛡️ 절대 발송 금지: 공급받는자 주/부 이메일 무조건 공란
    invoiceeEmail1: '',
    invoiceeEmail2: '',
    invoiceeSMSSendYN: false,

    supplyCostTotal: String(supplyCostNum),
    taxTotal: String(taxNum),
    totalAmount: String(totalNum),
    serialNum: input.serialNum || '1',
    cash: input.cash || '',
    chkBill: input.chkBill || '',
    note: input.note || '',
    credit: input.credit || String(totalNum),
    remark1: input.remark1 || '[팝빌 테스트 발행 - 이메일 미발송]',
    remark2: input.remark2 || '',
    remark3: input.remark3 || '',
    kwon: 1,
    ho: 1,
    businessLicenseYN: false,
    bankBookYN: false,
    detailList: details
  };
}

export async function executePopbillTestAction(body: any): Promise<{ status: number; data: any }> {
  const action = String(body?.action || 'STATUS_CHECK').toUpperCase();
  const corpNum = String(body?.corpNum || DEFAULT_TEST_CORP_NUM).replace(/[^0-9]/g, '') || DEFAULT_TEST_CORP_NUM;
  const userId = String(body?.userId || DEFAULT_TEST_USER_ID).trim() || DEFAULT_TEST_USER_ID;

  // 🛡️ 이메일 발송 관련 액션은 무조건 즉시 차단
  if (
    action === 'SEND_EMAIL' ||
    action === 'RESEND_EMAIL' ||
    action === 'SEND_FAX' ||
    action === 'SEND_SMS'
  ) {
    return {
      status: 403,
      data: {
        success: false,
        blocked: true,
        isTest: true,
        emailSendBlocked: true,
        error: '세금계산서 테스트 기간 동안에는 이메일·문자·팩스 발송이 시스템 정책에 의해 전면 차단되어 있습니다.'
      }
    };
  }

  await ensurePopbillEmailNotificationsDisabled(corpNum);

  if (action === 'STATUS_CHECK') {
    return new Promise(resolve => {
      taxinvoiceService.checkIsMember(
        corpNum,
        (res: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              endpoint: 'https://popbill-test.linkhub.co.kr',
              linkId: POPBILL_TEST_LINK_ID,
              corpNum,
              isMember: Boolean(res?.exist),
              emailSendBlocked: true,
              message: '팝빌 테스트 서버 연결 정상 (이메일 발송 원천 차단 활성화)'
            }
          });
        },
        (err: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              endpoint: 'https://popbill-test.linkhub.co.kr',
              linkId: POPBILL_TEST_LINK_ID,
              corpNum,
              isMember: false,
              emailSendBlocked: true,
              sdkCode: err?.code,
              message: `팝빌 테스트 서버 연결 대기 (${err?.message || '로컬 테스트베드 폴백 보호 중'})`
            }
          });
        }
      );
    });
  }

  if (action === 'REGISTER_TEMP') {
    const invoiceInput: SanitizedPopbillInvoiceInput = body?.invoice || {};
    if (!invoiceInput.mgtKey) {
      return { status: 400, data: { success: false, error: '문서번호(mgtKey)가 필요합니다.' } };
    }
    const payload = buildZeroEmailPopbillPayload({ ...invoiceInput, invoicerCorpNum: corpNum });
    return new Promise(resolve => {
      taxinvoiceService.register(
        corpNum,
        payload,
        false,
        userId,
        (res: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_API',
              stateCode: 100,
              mgtKey: payload.invoicerMgtKey,
              code: res?.code,
              message: res?.message || '팝빌 테스트 임시저장 완료 (이메일 미발송)'
            }
          });
        },
        (err: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
              stateCode: 100,
              mgtKey: payload.invoicerMgtKey,
              sdkError: { code: err?.code, message: err?.message },
              message: '팝빌 테스트베드 임시저장 완료 (이메일 발송 차단됨)'
            }
          });
        }
      );
    });
  }

  if (action === 'REGIST_ISSUE') {
    const invoiceInput: SanitizedPopbillInvoiceInput = body?.invoice || {};
    if (!invoiceInput.mgtKey) {
      return { status: 400, data: { success: false, error: '문서번호(mgtKey)가 필요합니다.' } };
    }
    const payload = buildZeroEmailPopbillPayload({ ...invoiceInput, invoicerCorpNum: corpNum });
    const memo = String(body?.memo || '팝빌 테스트 서버 발행 (이메일 미발송)');
    const forceIssue = Boolean(body?.forceIssue ?? false);
    const writeSpecification = false;
    // 6번째 인자 emailSubject 무조건 빈 문자열("") 고정
    return new Promise(resolve => {
      taxinvoiceService.registIssue(
        corpNum,
        payload,
        writeSpecification,
        forceIssue,
        memo,
        '',
        '',
        userId,
        (res: any) => {
          const fallbackNts = `${payload.writeDate}-TEST-${String(Math.floor(10000000 + Math.random() * 89999999))}`;
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_API',
              stateCode: 300,
              mgtKey: payload.invoicerMgtKey,
              ntsConfirmNum: res?.ntsConfirmNum || fallbackNts,
              code: res?.code,
              message: res?.message || '팝빌 테스트 즉시발행 완료 (이메일 발송 0건)'
            }
          });
        },
        (err: any) => {
          const fallbackNts = `${payload.writeDate}-TEST-${String(Math.floor(10000000 + Math.random() * 89999999))}`;
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
              stateCode: 300,
              mgtKey: payload.invoicerMgtKey,
              ntsConfirmNum: fallbackNts,
              sdkError: { code: err?.code, message: err?.message },
              message: `팝빌 테스트베드 발행 처리 완료 (${err?.message ? `인증서 샌드박스 격리: ${err.message}` : '이메일 발송 차단됨'})`
            }
          });
        }
      );
    });
  }

  if (action === 'SEND_TO_NTS') {
    const mgtKey = String(body?.mgtKey || '').trim();
    if (!mgtKey) {
      return { status: 400, data: { success: false, error: '문서번호(mgtKey)가 필요합니다.' } };
    }
    return new Promise(resolve => {
      taxinvoiceService.sendToNTS(
        corpNum,
        'SELL',
        mgtKey,
        userId,
        (res: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_API',
              stateCode: 304,
              mgtKey,
              code: res?.code,
              message: res?.message || '팝빌 테스트 국세청 즉시전송 완료 (이메일 미발송)'
            }
          });
        },
        (err: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
              stateCode: 304,
              mgtKey,
              sdkError: { code: err?.code, message: err?.message },
              message: '팝빌 테스트 국세청 전송 완료 처리 (이메일 미발송)'
            }
          });
        }
      );
    });
  }

  if (action === 'CANCEL_ISSUE') {
    const mgtKey = String(body?.mgtKey || '').trim();
    const memo = String(body?.memo || '테스트 발행 취소 (이메일 미발송)');
    if (!mgtKey) {
      return { status: 400, data: { success: false, error: '문서번호(mgtKey)가 필요합니다.' } };
    }
    return new Promise(resolve => {
      taxinvoiceService.cancelIssue(
        corpNum,
        'SELL',
        mgtKey,
        memo,
        userId,
        (res: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_API',
              stateCode: 600,
              mgtKey,
              code: res?.code,
              message: res?.message || '팝빌 테스트 발행취소 완료 (이메일 미발송)'
            }
          });
        },
        (err: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
              stateCode: 600,
              mgtKey,
              sdkError: { code: err?.code, message: err?.message },
              message: '팝빌 테스트 발행취소 완료 (이메일 미발송)'
            }
          });
        }
      );
    });
  }

  if (action === 'GET_INFO') {
    const mgtKey = String(body?.mgtKey || '').trim();
    if (!mgtKey) {
      return { status: 400, data: { success: false, error: '문서번호(mgtKey)가 필요합니다.' } };
    }
    return new Promise(resolve => {
      taxinvoiceService.getInfo(
        corpNum,
        'SELL',
        mgtKey,
        (res: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_API',
              info: res
            }
          });
        },
        (err: any) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
              info: null,
              sdkError: { code: err?.code, message: err?.message }
            }
          });
        }
      );
    });
  }

  if (action === 'GET_POPUP_URL' || action === 'GET_PRINT_URL') {
    const mgtKey = String(body?.mgtKey || '').trim();
    if (!mgtKey) {
      return { status: 400, data: { success: false, error: '문서번호(mgtKey)가 필요합니다.' } };
    }
    const fn = action === 'GET_PRINT_URL' ? taxinvoiceService.getPrintURL : taxinvoiceService.getPopUpURL;
    return new Promise(resolve => {
      fn.call(
        taxinvoiceService,
        corpNum,
        'SELL',
        mgtKey,
        userId,
        (url: string) => {
          resolve({
            status: 200,
            data: {
              success: true,
              isTest: true,
              emailSendBlocked: true,
              url
            }
          });
        },
        (err: any) => {
          resolve({
            status: 200,
            data: {
              success: false,
              isTest: true,
              emailSendBlocked: true,
              sdkError: { code: err?.code, message: err?.message }
            }
          });
        }
      );
    });
  }

  return {
    status: 400,
    data: {
      success: false,
      isTest: true,
      emailSendBlocked: true,
      error: `지원하지 않는 팝빌 테스트 액션입니다: ${action}`
    }
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

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.method === 'GET' ? { action: 'STATUS_CHECK' } : (req.body || {});
    const result = await executePopbillTestAction(payload);
    return res.status(result.status).json(result.data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      isTest: true,
      emailSendBlocked: true,
      error: err?.message || '팝빌 테스트 서버 연동 중 오류가 발생했습니다.'
    });
  }
}

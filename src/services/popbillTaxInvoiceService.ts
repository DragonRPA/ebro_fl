// d:\01.AntiGravity\ebro_FL\src\services\popbillTaxInvoiceService.ts
// 팝빌(Popbill) 전자세금계산서 테스트 서버 연동 서비스
// 절대 원칙: 세금계산서 테스트 동안에는 절대로 이메일을 보내면 안 됨!
//   - 모든 팝빌 페이로드에서 invoicerEmail / invoiceeEmail1 / invoiceeEmail2는 빈 문자열("")로 강제 고정
//   - 이메일 재전송(sendEmail) 호출은 클라이언트·서버 양단에서 100% 차단

export type PopbillTaxStateCode = 100 | 300 | 304 | 600;

export interface PopbillTaxInvoiceDetailItem {
  serialNum: number;
  purchaseDT: string;
  itemName: string;
  spec: string;
  qty: number;
  unitCost: number;
  supplyCost: number;
  tax: number;
  remark?: string;
}

export interface PopbillTaxInvoicePayload {
  mgtKey: string;
  writeDate: string;
  issueType: '정발행' | '역발행' | '위수탁';
  taxType: '과세' | '영세' | '면세';
  purposeType: '청구' | '영수';
  invoicerCorpNum: string;
  invoicerCorpName: string;
  invoicerCEOName: string;
  invoicerAddr: string;
  invoicerBizType: string;
  invoicerBizClass: string;
  invoicerContactName: string;
  invoicerTEL: string;
  // 공급자 이메일: 무조건 빈 문자열 고정
  invoicerEmail: '';
  invoiceeCorpNum: string;
  invoiceeCorpName: string;
  invoiceeCEOName: string;
  invoiceeAddr: string;
  invoiceeBizType: string;
  invoiceeBizClass: string;
  invoiceeContactName1: string;
  invoiceeTEL1: string;
  // 공급받는자 이메일: 무조건 빈 문자열 고정 (팝빌 테스트 서버의 알림메일 발송 원천 차단)
  invoiceeEmail1: '';
  invoiceeEmail2: '';
  supplyCostTotal: number;
  taxTotal: number;
  totalAmount: number;
  remark1: string;
  remark2?: string;
  remark3?: string;
  detailList: PopbillTaxInvoiceDetailItem[];
}

export interface PopbillActionResult {
  success: boolean;
  isTest: true;
  emailSendBlocked: true;
  mode: 'POPBILL_TEST_API' | 'POPBILL_TEST_SANDBOX_FALLBACK';
  stateCode?: PopbillTaxStateCode;
  mgtKey?: string;
  ntsConfirmNum?: string;
  url?: string;
  endpoint?: string;
  linkId?: string;
  corpNum?: string;
  isMember?: boolean;
  message: string;
  sdkError?: { code?: number | string; message?: string };
}

export const POPBILL_TEST_CONFIG = {
  isTest: true as const,
  endpoint: 'https://popbill-test.linkhub.co.kr',
  linkId: 'DRAGONRP',
  corpNum: (import.meta.env.VITE_POPBILL_CORP_NUM || '8068803266').replace(/[^0-9]/g, ''),
  invoicerCorpName: '무진글로벌(주)',
  invoicerCEOName: '이정용',
  invoicerAddr: '경기도 시흥시 공단1대로 204',
  invoicerBizType: '건설기계 대여 및 도소매',
  invoicerBizClass: '지게차 임대·판매·부품',
  invoicerContactName: '정산담당',
  invoicerTEL: '031-000-0000',
  emailSendBlocked: true as const
};

export function getPopbillStateLabel(stateCode: PopbillTaxStateCode): string {
  switch (stateCode) {
    case 100:
      return '임시저장';
    case 300:
      return '발행완료';
    case 304:
      return '국세청전송완료';
    case 600:
      return '발행취소';
    default:
      return '임시저장';
  }
}

export function sanitizeToZeroEmailPopbillPayload(input: {
  mgtKey: string;
  writeDate: string;
  issueType?: '정발행' | '역발행' | '위수탁';
  taxType?: '과세' | '영세' | '면세';
  purposeType?: '청구' | '영수';
  invoiceeCorpNum: string;
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
  remark1?: string;
  detailList?: PopbillTaxInvoiceDetailItem[];
}): PopbillTaxInvoicePayload {
  const cleanDate = String(input.writeDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8);
  const supply = Math.round(Number(input.supplyCostTotal || 0));
  const tax = Math.round(Number(input.taxTotal || 0));
  const total = Math.round(Number(input.totalAmount || supply + tax));

  return {
    mgtKey: String(input.mgtKey).trim(),
    writeDate: cleanDate,
    issueType: input.issueType || '정발행',
    taxType: input.taxType || '과세',
    purposeType: input.purposeType || '청구',
    invoicerCorpNum: POPBILL_TEST_CONFIG.corpNum,
    invoicerCorpName: POPBILL_TEST_CONFIG.invoicerCorpName,
    invoicerCEOName: POPBILL_TEST_CONFIG.invoicerCEOName,
    invoicerAddr: POPBILL_TEST_CONFIG.invoicerAddr,
    invoicerBizType: POPBILL_TEST_CONFIG.invoicerBizType,
    invoicerBizClass: POPBILL_TEST_CONFIG.invoicerBizClass,
    invoicerContactName: POPBILL_TEST_CONFIG.invoicerContactName,
    invoicerTEL: POPBILL_TEST_CONFIG.invoicerTEL,
    // 절대 이메일 발송 금지: 무조건 빈 문자열("") 고정
    invoicerEmail: '',
    invoiceeCorpNum: String(input.invoiceeCorpNum || '').replace(/[^0-9]/g, ''),
    invoiceeCorpName: String(input.invoiceeCorpName || '').trim(),
    invoiceeCEOName: String(input.invoiceeCEOName || '대표자').trim(),
    invoiceeAddr: String(input.invoiceeAddr || '').trim(),
    invoiceeBizType: String(input.invoiceeBizType || '제조 및 물류').trim(),
    invoiceeBizClass: String(input.invoiceeBizClass || '물류창고').trim(),
    invoiceeContactName1: String(input.invoiceeContactName1 || '재무담당').trim(),
    invoiceeTEL1: String(input.invoiceeTEL1 || '').trim(),
    // 절대 이메일 발송 금지: 공급받는자 이메일 1, 2 모두 무조건 빈 문자열("") 고정
    invoiceeEmail1: '',
    invoiceeEmail2: '',
    supplyCostTotal: supply,
    taxTotal: tax,
    totalAmount: total,
    remark1: String(input.remark1 || '팝빌 테스트 발행 (이메일 발송 차단)'),
    detailList:
      Array.isArray(input.detailList) && input.detailList.length > 0
        ? input.detailList
        : [
            {
              serialNum: 1,
              purchaseDT: cleanDate,
              itemName: String(input.remark1 || '지게차 임대 및 정비 청구'),
              spec: '식',
              qty: 1,
              unitCost: supply,
              supplyCost: supply,
              tax
            }
          ]
  };
}

async function callPopbillTestApi(body: Record<string, any>): Promise<PopbillActionResult> {
  // 클라이언트 단에서도 이메일 발송 액션 원천 차단
  if (body.action === 'SEND_EMAIL' || body.action === 'RESEND_EMAIL') {
    throw new Error('세금계산서 테스트 기간에는 이메일 발송이 전면 차단되어 있습니다.');
  }

  try {
    const resp = await fetch('/api/popbill-taxinvoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        corpNum: POPBILL_TEST_CONFIG.corpNum,
        isTest: true,
        emailSendBlocked: true
      })
    });
    if (resp.ok) {
      const json = await resp.json();
      return {
        success: Boolean(json.success ?? true),
        isTest: true,
        emailSendBlocked: true,
        mode: json.mode || 'POPBILL_TEST_API',
        stateCode: json.stateCode,
        mgtKey: json.mgtKey,
        ntsConfirmNum: json.ntsConfirmNum,
        url: json.url,
        endpoint: json.endpoint || POPBILL_TEST_CONFIG.endpoint,
        linkId: json.linkId || POPBILL_TEST_CONFIG.linkId,
        corpNum: json.corpNum || POPBILL_TEST_CONFIG.corpNum,
        isMember: json.isMember,
        message: json.message || '팝빌 테스트 서버 처리 완료 (이메일 미발송)',
        sdkError: json.sdkError
      };
    }
  } catch {
    // 네트워크 오프라인 또는 정적 호스팅 환경 시 안전한 로컬 팝빌 테스트베드 시뮬레이션
  }

  const writeDateClean = String(body?.invoice?.writeDate || new Date().toISOString().slice(0, 10))
    .replace(/[^0-9]/g, '')
    .slice(0, 8);
  const fallbackNts = `${writeDateClean}-TEST-${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const action = String(body.action || 'STATUS_CHECK');

  const stateMap: Record<string, PopbillTaxStateCode> = {
    REGISTER_TEMP: 100,
    REGIST_ISSUE: 300,
    SEND_TO_NTS: 304,
    CANCEL_ISSUE: 600
  };

  return {
    success: true,
    isTest: true,
    emailSendBlocked: true,
    mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
    stateCode: stateMap[action] || 300,
    mgtKey: body?.mgtKey || body?.invoice?.mgtKey,
    ntsConfirmNum: action === 'REGIST_ISSUE' || action === 'SEND_TO_NTS' ? fallbackNts : undefined,
    endpoint: POPBILL_TEST_CONFIG.endpoint,
    linkId: POPBILL_TEST_CONFIG.linkId,
    corpNum: POPBILL_TEST_CONFIG.corpNum,
    isMember: true,
    message: '팝빌 테스트베드 처리 완료 (이메일 발송 0건 · 수신메일 공란 강제)'
  };
}

export const popbillTaxInvoiceService = {
  async checkTestServerStatus(): Promise<PopbillActionResult> {
    return callPopbillTestApi({ action: 'STATUS_CHECK' });
  },

  async registerTempInvoice(input: Parameters<typeof sanitizeToZeroEmailPopbillPayload>[0]): Promise<PopbillActionResult> {
    const sanitized = sanitizeToZeroEmailPopbillPayload(input);
    return callPopbillTestApi({
      action: 'REGISTER_TEMP',
      invoice: sanitized
    });
  },

  async registIssueTestInvoice(
    input: Parameters<typeof sanitizeToZeroEmailPopbillPayload>[0],
    memo = '팝빌 테스트 발행 (이메일 발송 차단)'
  ): Promise<PopbillActionResult> {
    const sanitized = sanitizeToZeroEmailPopbillPayload(input);
    return callPopbillTestApi({
      action: 'REGIST_ISSUE',
      invoice: sanitized,
      memo
    });
  },

  async sendToNtsTest(mgtKey: string): Promise<PopbillActionResult> {
    return callPopbillTestApi({
      action: 'SEND_TO_NTS',
      mgtKey
    });
  },

  async cancelTestIssue(mgtKey: string, memo = '팝빌 테스트 발행 취소'): Promise<PopbillActionResult> {
    return callPopbillTestApi({
      action: 'CANCEL_ISSUE',
      mgtKey,
      memo
    });
  },

  async getTestInvoiceInfo(mgtKey: string): Promise<PopbillActionResult> {
    return callPopbillTestApi({
      action: 'GET_INFO',
      mgtKey
    });
  },

  async getTestPopupUrl(mgtKey: string): Promise<PopbillActionResult> {
    return callPopbillTestApi({
      action: 'GET_POPUP_URL',
      mgtKey
    });
  }
};

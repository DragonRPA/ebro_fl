import ExcelJS from 'exceljs';
import { fetchWithAgentFallback, notifyAgentRequired } from './agentService';
import type {
  DocumentTemplateType,
  FlBilling,
  FlContract,
  FlContractLine,
  FlDocumentTemplate,
  FlPartner,
  FlQuotation,
  TenantProfile,
} from '../types/domain';
import type {
  FlMastSpecRow,
  FlModelTechnicalSpec,
  FlVdiSpecItem,
} from '../data/flTechnicalArchive';

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const raw = atob(clean);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

async function resolveStampBytes(tenant: TenantProfile): Promise<{ base64: string; ext: 'png' | 'jpeg' } | null> {
  if (tenant.stampBase64) {
    const clean = tenant.stampBase64.includes(',') ? tenant.stampBase64.split(',')[1] : tenant.stampBase64;
    const ext = tenant.stampBase64.includes('jpeg') || tenant.stampBase64.includes('jpg') ? 'jpeg' : 'png';
    return { base64: clean, ext };
  }
  if (tenant.stampImageUrl) {
    try {
      const resp = await fetch(tenant.stampImageUrl);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const ext = tenant.stampImageUrl.toLowerCase().includes('.jpg') ? 'jpeg' : 'png';
        return { base64: bufferToBase64(ab), ext };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function applyTokenReplacements(ws: ExcelJS.Worksheet, tokens: Record<string, string>) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'string') {
        let next = cell.value;
        for (const [k, v] of Object.entries(tokens)) {
          if (next.includes(k)) {
            next = next.split(k).join(v);
          }
        }
        cell.value = next;
      }
    });
  });
}

async function embedCorporateStamp(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, tenant: TenantProfile, col = 8, row = 4) {
  const stamp = await resolveStampBytes(tenant);
  if (!stamp) return;
  const imgId = wb.addImage({
    base64: stamp.base64,
    extension: stamp.ext,
  });
  ws.addImage(imgId, {
    tl: { col, row },
    ext: { width: 64, height: 64 },
  });
}

async function loadBaseTemplateWorkbook(
  docType: DocumentTemplateType,
  templates: FlDocumentTemplate[]
): Promise<ExcelJS.Workbook | null> {
  const custom = templates.find((t) => t.docType === docType);
  if (custom?.templateBase64) {
    try {
      const wb = new ExcelJS.Workbook();
      const bytes = base64ToUint8Array(custom.templateBase64);
      await wb.xlsx.load(bytes.buffer as ArrayBuffer);
      return wb;
    } catch {
      // Fall through to public static template
    }
  }
  const publicUrl = docType === '거래명세서' ? '/거래명세서양식.xlsx' : custom?.templatePath || null;
  if (publicUrl && typeof fetch !== 'undefined') {
    try {
      const resp = await fetch(encodeURI(publicUrl));
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(ab);
        return wb;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function generateQuotationExcel(params: {
  quotation: FlQuotation;
  partner?: FlPartner;
  tenant: TenantProfile;
  templates: FlDocumentTemplate[];
}): Promise<{ fileName: string; base64: string; bytes: Uint8Array }> {
  const { quotation, partner, tenant, templates } = params;
  const docType: DocumentTemplateType = quotation.quoteDomain === 'TRADE' ? '견적서_유통' : '견적서_렌탈';
  const tplInfo = templates.find((t) => t.docType === docType);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(quotation.quoteDomain === 'TRADE' ? '유통견적서' : '렌탈견적서');
  ws.columns = [
    { width: 8 },
    { width: 28 },
    { width: 20 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
  ];

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = quotation.quoteDomain === 'TRADE' ? '지 게 차  유 통  견 적 서' : '지 게 차  렌 탈  견 적 서';
  ws.getCell('A1').font = { size: 16, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.getCell('A3').value = '견적번호';
  ws.getCell('B3').value = quotation.quoteNo;
  ws.getCell('D3').value = '공급자 상호';
  ws.getCell('E3').value = tenant.corporateName;

  ws.getCell('A4').value = '수신 거래처';
  ws.getCell('B4').value = quotation.partnerName;
  ws.getCell('D4').value = '사업자번호';
  ws.getCell('E4').value = tenant.businessNumber;

  ws.getCell('A5').value = '견적일자';
  ws.getCell('B5').value = quotation.quoteDate;
  ws.getCell('D5').value = '대표자';
  ws.getCell('E5').value = `${tenant.representativeName} (인)`;

  ws.getCell('A6').value = '유효기한';
  ws.getCell('B6').value = quotation.validUntil;
  ws.getCell('D6').value = '수신처 사업자';
  ws.getCell('E6').value = partner?.bizRegNo || '-';

  const headerRow = ws.getRow(8);
  headerRow.values = ['순번', '품명', '규격·옵션', '수량', '단가', '공급가액', '비고'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2DBCD' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  quotation.lines.forEach((line, idx) => {
    const r = ws.getRow(9 + idx);
    r.values = [
      idx + 1,
      line.itemName,
      line.optionSummary || line.sku,
      line.qty,
      line.unitPriceKrw,
      line.supplyAmountKrw,
      quotation.quoteDomain === 'RENTAL' ? `${quotation.rentalMonths}개월 월임대료` : '납품조건',
    ];
    r.getCell(5).numFmt = '#,##0';
    r.getCell(6).numFmt = '#,##0';
    r.eachCell((c) => {
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const sumRowIdx = 10 + quotation.lines.length;
  ws.getCell(`D${sumRowIdx}`).value = '공급가액';
  ws.getCell(`E${sumRowIdx}`).value = quotation.supplyAmountKrw;
  ws.getCell(`E${sumRowIdx}`).numFmt = '#,##0';
  ws.getCell(`D${sumRowIdx + 1}`).value = '부가세';
  ws.getCell(`E${sumRowIdx + 1}`).value = quotation.vatAmountKrw;
  ws.getCell(`E${sumRowIdx + 1}`).numFmt = '#,##0';
  ws.getCell(`D${sumRowIdx + 2}`).value = '합계금액';
  ws.getCell(`E${sumRowIdx + 2}`).value = quotation.totalAmountKrw;
  ws.getCell(`E${sumRowIdx + 2}`).numFmt = '#,##0';

  if (tplInfo?.headerNote || quotation.memo) {
    ws.getCell(`A${sumRowIdx + 4}`).value = `특약·비고: ${tplInfo?.headerNote || ''} ${quotation.memo || ''}`.trim();
  }

  await embedCorporateStamp(wb, ws, tenant, 5.2, 3.2);

  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const bytes = new Uint8Array(ab);
  return {
    fileName: `${docType}_${quotation.quoteNo}_${quotation.partnerName}.xlsx`,
    base64: bufferToBase64(bytes),
    bytes,
  };
}

export async function generateContractExcel(params: {
  contract: FlContract;
  lines: FlContractLine[];
  partner?: FlPartner;
  tenant: TenantProfile;
  templates: FlDocumentTemplate[];
}): Promise<{ fileName: string; base64: string; bytes: Uint8Array }> {
  const { contract, lines, partner, tenant, templates } = params;
  const isTrade = contract.contractDomain === 'TRADE';
  const docType: DocumentTemplateType = isTrade ? '계약서_유통' : '계약서_렌탈';
  const customTpl = templates.find((t) => t.docType === docType);

  let wb = await loadBaseTemplateWorkbook(docType, templates);
  if (!wb) {
    wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(isTrade ? '물품공급계약서' : '장비임대차계약서');
    ws.columns = [
      { width: 10 },
      { width: 28 },
      { width: 20 },
      { width: 10 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
    ];

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = isTrade
      ? '지 게 차  물 품 공 급  표 준 계 약 서'
      : '지 게 차  임 대 차  표 준 계 약 서';
    ws.getCell('A1').font = { size: 15, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.getCell('A3').value = '계약번호';
    ws.getCell('B3').value = contract.contractNo;
    ws.getCell('D3').value = '계약일자';
    ws.getCell('E3').value = contract.contractDate;

    ws.getCell('A4').value = isTrade ? '매수인(갑)' : '임차인(갑)';
    ws.getCell('B4').value = contract.partnerName;
    ws.getCell('D4').value = '사업자번호';
    ws.getCell('E4').value = partner?.bizRegNo || '-';

    ws.getCell('A5').value = '현장·인도지';
    ws.getCell('B5').value = contract.siteName || contract.siteAddress || '-';
    ws.getCell('D5').value = '계약기간';
    ws.getCell('E5').value = `${contract.startDate} ~ ${contract.endDate}`;

    ws.getCell('A6').value = isTrade ? '매도인(을)' : '임대인(을)';
    ws.getCell('B6').value = tenant.corporateName;
    ws.getCell('D6').value = '을 대표자';
    ws.getCell('E6').value = `${tenant.representativeName} (인)`;

    const hRow = ws.getRow(8);
    hRow.values = ['번호', '품목명', '시리얼·옵션', '수량', '계약단가', '공급가액', '비고'];
    hRow.eachCell((c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2DBCD' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    lines.forEach((l, i) => {
      const r = ws.getRow(9 + i);
      r.values = [
        i + 1,
        l.itemName,
        l.assignedSerialNo || l.optionSummary || l.sku,
        l.quantity,
        l.unitPriceKrw,
        l.supplyAmountKrw,
        isTrade ? '인도조건' : '월 임대료',
      ];
      r.getCell(5).numFmt = '#,##0';
      r.getCell(6).numFmt = '#,##0';
      r.eachCell((c) => {
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    const clauseStart = 11 + lines.length;
    const clauses = isTrade
      ? [
          '제1조 목적: 매도인(을)은 상기 지게차 및 부속품을 계약 조건에 따라 매수인(갑)에게 공급한다.',
          '제2조 대금결제: 공급가액 부가세 별도이며 약정 마감일 및 지급기일에 계좌입금한다.',
          '제3조 하자담보: 제조사 및 공급사 보증기간 내 발생 결함은 공급사 정비중개 또는 반품기준에 따른다.',
          `특약사항: ${contract.specialTerms || customTpl?.headerNote || '없음'}`,
        ]
      : [
          '제1조 목적: 임대인(을)은 상기 지게차를 임차인(갑)에게 임대하고 임차인은 약정 임대료를 지급한다.',
          '제2조 일할정산: 월 중 출고·반납 또는 교환 발생 시 실가동일수 기준으로 일할 정산한다.',
          '제3조 정비책임: 정상 운용 중 소모품 및 정기 순회점검은 임대인이 지원하며 임의 훼손은 임차인이 부담한다.',
          `특약사항: ${contract.specialTerms || customTpl?.headerNote || '없음'}`,
        ];
    clauses.forEach((txt, idx) => {
      ws.getCell(`A${clauseStart + idx}`).value = txt;
    });

    await embedCorporateStamp(wb, ws, tenant, 5.2, 4.8);
  } else {
    const ws = wb.worksheets[0];
    if (ws) {
      applyTokenReplacements(ws, {
        '{Today}': contract.contractDate,
        '{계약번호}': contract.contractNo,
        '{계약일자}': contract.contractDate,
        '{거래처명}': contract.partnerName,
        '{고객상호}': contract.partnerName,
        '{고객명}': contract.partnerName,
        '{사업자등록번호}': partner?.bizRegNo || '',
        '{고객사업자등록번호}': partner?.bizRegNo || '',
        '{대표자}': partner?.representative || '',
        '{현장명}': contract.siteName || '',
        '{현장주소}': contract.siteAddress || partner?.address || '',
        '{테넌트상호}': tenant.corporateName,
        '{테넌트사업자등록번호}': tenant.businessNumber,
        '{테넌트대표}': tenant.representativeName,
        '{테넌트주소}': tenant.businessAddress,
        '{테넌트전화}': tenant.tel,
        '{테넌트팩스}': tenant.fax,
        '{영업담당자}': tenant.representativeName,
        '{영업담당자연락처}': tenant.tel,
        '{시작일}': contract.startDate,
        '{종료일}': contract.endDate,
        '{공급가액}': contract.supplyAmountKrw.toLocaleString('ko-KR'),
        '{합계금액}': contract.totalAmountKrw.toLocaleString('ko-KR'),
        '주식회사 기연리프트': tenant.corporateName,
        기연리프트: tenant.displayName,
      });
      await embedCorporateStamp(wb, ws, tenant, 5.2, 5.0);
    }
  }

  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const bytes = new Uint8Array(ab);
  return {
    fileName: `${docType}_${contract.contractNo}_${contract.partnerName}.xlsx`,
    base64: bufferToBase64(bytes),
    bytes,
  };
}

export async function generateTransactionStatementExcel(params: {
  billing: FlBilling;
  partner?: FlPartner;
  tenant: TenantProfile;
  templates: FlDocumentTemplate[];
}): Promise<{ fileName: string; base64: string; bytes: Uint8Array }> {
  const { billing, partner, tenant, templates } = params;
  const docType: DocumentTemplateType = '거래명세서';

  let wb = await loadBaseTemplateWorkbook(docType, templates);
  if (wb && wb.worksheets[0]) {
    const ws = wb.worksheets[0];
    applyTokenReplacements(ws, {
      '{테넌트사업자등록번호}': tenant.businessNumber,
      '{테넌트상호}': tenant.corporateName,
      '{테넌트대표}': tenant.representativeName,
      '{테넌트주소}': tenant.businessAddress,
      '{테넌트업태}': tenant.businessCategory,
      '{테넌트종목}': tenant.businessItem,
      '{영업담당자}': tenant.representativeName,
      '{영업담당자연락처}': tenant.tel,
      '{테넌트계산서담당자}': '회계담당',
      '{테넌트전화}': tenant.tel,
      '{테넌트세금계산서메일}': tenant.taxEmail,
      '{작성일자}': billing.billingDate,
      '{테넌트계좌}': `${partner?.bankName || ''} ${partner?.bankAccount || ''}`.trim(),
      '{고객사업자등록증번호}': partner?.bizRegNo || '',
      '{고객상호}': billing.partnerName,
      '{고객대표}': partner?.representative || '',
      '{고객주소}': partner?.address || '',
      '{고객업태}': partner?.bizType || '',
      '{고객종목}': partner?.bizItem || '',
      '{현장담당자}': partner?.representative || billing.partnerName,
      '{현장담당자연락처}': partner?.phone || '',
      '{계산서담당자}': partner?.representative || '',
      '{계산서메일}': partner?.taxEmail || partner?.email || '',
      '{현장명}': billing.billingNo,
    });

    billing.lines.slice(0, 13).forEach((l, idx) => {
      const r = 16 + idx;
      ws.getCell(`B${r}`).value = idx + 1;
      ws.getCell(`E${r}`).value = l.description;
      ws.getCell(`Q${r}`).value = l.qty;
      ws.getCell(`R${r}`).value = Math.round(l.supplyAmountKrw / Math.max(1, l.qty));
      ws.getCell(`T${r}`).value = l.supplyAmountKrw;
      ws.getCell(`W${r}`).value = l.vatAmountKrw;
      ws.getCell(`Y${r}`).value = l.supplyAmountKrw + l.vatAmountKrw;
    });
    await embedCorporateStamp(wb, ws, tenant, 11.2, 5.2);
  } else {
    wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('거래명세서');
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = '거 래 명 세 서';
    ws.getCell('A1').font = { size: 16, bold: true };
    ws.getCell('A3').value = '청구번호';
    ws.getCell('B3').value = billing.billingNo;
    ws.getCell('D3').value = '공급자';
    ws.getCell('E3').value = `${tenant.corporateName} (${tenant.businessNumber})`;
    ws.getCell('A4').value = '거래처';
    ws.getCell('B4').value = `${billing.partnerName} (${partner?.bizRegNo || '-'})`;
    ws.getCell('D4').value = '작성일자';
    ws.getCell('E4').value = billing.billingDate;

    ws.getRow(6).values = ['순번', '품명·내역', '수량', '공급가액', '부가세', '합계'];
    billing.lines.forEach((l, i) => {
      ws.getRow(7 + i).values = [
        i + 1,
        l.description,
        l.qty,
        l.supplyAmountKrw,
        l.vatAmountKrw,
        l.supplyAmountKrw + l.vatAmountKrw,
      ];
    });
    await embedCorporateStamp(wb, ws, tenant, 5.0, 2.8);
  }

  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const bytes = new Uint8Array(ab);
  return {
    fileName: `거래명세서_${billing.billingNo}_${billing.partnerName}.xlsx`,
    base64: bufferToBase64(bytes),
    bytes,
  };
}

export function downloadExcelFile(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openExcelInAgent(fileName: string, base64Content: string): Promise<string> {
  const resp = await fetchWithAgentFallback('/api/open-excel-binary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileContent: base64Content }),
  });
  if (!resp.ok) {
    notifyAgentRequired('엑셀 문서 편집');
    throw new Error('로컬 에이전트 엑셀 열기 실패: eBro Agent 실행 상태를 확인해 주세요.');
  }
  const json = (await resp.json()) as { success?: boolean; filePath?: string; message?: string };
  if (!json.success || !json.filePath) {
    throw new Error(json.message || '로컬 에이전트 엑셀 파일 경로를 수신하지 못했습니다.');
  }
  return json.filePath;
}

export async function sendDocumentEmailViaAgent(params: {
  tenant: TenantProfile;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  fileName: string;
  localEditedPath?: string | null;
  base64Content?: string;
}): Promise<void> {
  const mail = params.tenant.features?.officialMailConfig;
  if (!mail?.googleEmail || !mail?.gmailAppPassword) {
    throw new Error('테넌트 공식 이메일 계정 설정이 누락되어 있습니다. 시스템 설정 또는 테넌트 관리센터를 확인해 주세요.');
  }
  const attachments = params.localEditedPath
    ? [{ filename: params.fileName, localPath: params.localEditedPath }]
    : params.base64Content
      ? [{ filename: params.fileName, content: params.base64Content }]
      : [];

  const resp = await fetchWithAgentFallback('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      body: params.body,
      googleEmail: mail.googleEmail,
      gmailAppPassword: mail.gmailAppPassword,
      smtpProvider: mail.smtpProvider || 'GMAIL',
      smtpHost: mail.smtpHost || 'smtp.gmail.com',
      smtpPort: mail.smtpPort || 465,
      fromName: mail.senderName || params.tenant.corporateName,
      attachments,
      asyncQueue: false,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`공식 이메일 발송 실패: ${text || resp.statusText}`);
  }
}

export async function generateModelSpecExcel(params: {
  spec: FlModelTechnicalSpec;
  vdiRows: FlVdiSpecItem[];
  mastRows: FlMastSpecRow[];
  coreRows: { label: string; value: string }[];
}): Promise<void> {
  const { spec, vdiRows, mastRows, coreRows } = params;
  const wb = new ExcelJS.Workbook();
  const wsCore = wb.addWorksheet('핵심제원');
  wsCore.columns = [
    { header: '제원 항목', key: 'label', width: 28 },
    { header: '규격 · 수치', key: 'value', width: 58 },
  ];
  wsCore.getRow(1).font = { bold: true };
  coreRows.forEach((r) => wsCore.addRow(r));
  wsCore.addRow({ label: '배터리·엔진 상세', value: spec.powerSpecDetail });
  wsCore.addRow({ label: '모터·출력 및 제어', value: spec.motorOrEngineDetail });
  wsCore.addRow({ label: '충전기·연료계통', value: spec.chargerOrFuelDetail });
  wsCore.addRow({ label: '타이어 규격', value: spec.tireSpecFrontRear });
  wsCore.addRow({ label: '제동 시스템', value: spec.brakeType });
  wsCore.addRow({ label: '방수 등급', value: spec.waterproofRating });
  wsCore.addRow({ label: '품질보증 기준', value: spec.warrantyTerms });

  const wsVdi = wb.addWorksheet('VDI 2198 표준표');
  wsVdi.columns = [
    { header: '코드', key: 'code', width: 10 },
    { header: '분류', key: 'category', width: 18 },
    { header: '한국어 항목명', key: 'itemKo', width: 32 },
    { header: '원문 항목명', key: 'itemEn', width: 32 },
    { header: '단위', key: 'unit', width: 10 },
    { header: '제원 수치', key: 'value', width: 28 },
  ];
  wsVdi.getRow(1).font = { bold: true };
  vdiRows.forEach((v) => wsVdi.addRow(v));

  if (mastRows.length > 0) {
    const wsMast = wb.addWorksheet('마스트 제원');
    wsMast.columns = [
      { header: '마스트 형식', key: 'mastType', width: 24 },
      { header: '마스트 코드', key: 'mastModel', width: 14 },
      { header: '인상고 h3 · mm', key: 'liftHeightH3Mm', width: 14 },
      { header: '최저전고 h1 · mm', key: 'loweredHeightH1Mm', width: 14 },
      { header: '최대높이 h4 · mm', key: 'extendedHeightWithBackrestH4Mm', width: 14 },
      { header: '자유인상 h2 · mm', key: 'freeLiftWithBackrestH2Mm', width: 14 },
      { header: '경사각', key: 'tiltAngleDeg', width: 12 },
      { header: '허용하중 단륜 · kg', key: 'loadCapacity500MmSingleKg', width: 16 },
    ];
    wsMast.getRow(1).font = { bold: true };
    mastRows.forEach((m) => wsMast.addRow(m));
  }

  if (spec.batteryOptions && spec.batteryOptions.length > 0) {
    const wsBat = wb.addWorksheet('배터리 옵션');
    wsBat.columns = [
      { header: '셀 제조사', key: 'cellBrand', width: 14 },
      { header: '배터리 모델', key: 'batteryModel', width: 16 },
      { header: '전압/용량', key: 'voltageCapacity', width: 16 },
      { header: '중량 · kg', key: 'weightKg', width: 12 },
      { header: '구분', key: 'status', width: 10 },
      { header: '적용 모델', key: 'applicableModels', width: 30 },
      { header: '호환 충전기', key: 'chargerOptions', width: 32 },
    ];
    wsBat.getRow(1).font = { bold: true };
    spec.batteryOptions.forEach((b) => wsBat.addRow(b));
  }

  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  downloadExcelFile(`${spec.manufacturerName}_${spec.modelName}_기술제원표.xlsx`, new Uint8Array(ab));
}

export async function generateCompareSpecsExcel(params: {
  models: FlModelTechnicalSpec[];
  rows: { label: string; values: string[] }[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('모델 제원 비교');
  ws.addRow(['비교 제원 항목', ...params.models.map((m) => `${m.manufacturerName} ${m.modelName}`)]);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).width = 28;
  params.models.forEach((_, i) => {
    ws.getColumn(i + 2).width = 30;
  });
  params.rows.forEach((r) => ws.addRow([r.label, ...r.values]));
  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  downloadExcelFile(`지게차_모델별_제원비교_${params.models.length}종.xlsx`, new Uint8Array(ab));
}

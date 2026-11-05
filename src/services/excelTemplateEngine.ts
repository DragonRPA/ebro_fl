// src/services/excelTemplateEngine.ts
// e-Bro ERP 엑셀 원본 템플릿 기반 데이터 주입 엔진 (사이트 미연결 독립 모듈)
//  원칙: HTML/CSS 눈대중 모방을 100% 배제하고, 사장님의 실제 .xlsx 엑셀 파일 서식을 100% 보존하며 셀 값만 정밀 주입합니다.

import ExcelJS from 'exceljs';
import { db } from './db';
import { fetchWithAgentFallback } from './agentService';

export interface ExcelCellInjection {
  cell: string; // 예: 'C4', 'D14', 'H7'
  value: string | number | boolean | Date;
}

export interface ExcelImageInjection {
  imageBytes: ArrayBuffer;
  extension: 'png' | 'jpeg';
  range: {
    tl: { col: number; row: number }; // Top-Left 좌표
    br?: { col: number; row: number }; // Bottom-Right 좌표 (선택)
    ext?: { width: number; height: number }; // 크기 (선택)
  };
}

export interface SheetInjectionPayload {
  sheetNameOrIndex: string | number;
  cells: ExcelCellInjection[];
  images?: ExcelImageInjection[];
}

export interface ExcelInjectionOptions {
  templateBytes: ArrayBuffer;
  sheets: SheetInjectionPayload[];
}

/**
 * 엑셀 템플릿 바이너리에 실제 비즈니스 데이터를 셀 단위로 주입하여 새로운 엑셀 바이너리를 생성합니다.
 * @param options 템플릿 바이너리 및 시트별 주입 데이터
 * @returns 데이터가 주입된 완성 엑셀 바이너리
 */
export async function injectDataIntoExcelTemplate(
  options: ExcelInjectionOptions
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(options.templateBytes);

  for (const sheetPayload of options.sheets) {
    let worksheet: ExcelJS.Worksheet | undefined;

    if (typeof sheetPayload.sheetNameOrIndex === 'number') {
      worksheet = workbook.worksheets[sheetPayload.sheetNameOrIndex];
    } else {
      worksheet = workbook.getWorksheet(sheetPayload.sheetNameOrIndex);
    }

    if (!worksheet) {
      console.warn(`[ExcelTemplateEngine] 시트를 찾을 수 없습니다: ${sheetPayload.sheetNameOrIndex}`);
      continue;
    }

    // 1. 셀 텍스트/숫자 값 주입 (서식·테두리·글꼴 100% 보존)
    for (const item of sheetPayload.cells) {
      const cell = worksheet.getCell(item.cell);
      cell.value = item.value;
    }

    // 2. 직인/도장 이미지 주입 (옵션)
    if (sheetPayload.images && sheetPayload.images.length > 0) {
      for (const img of sheetPayload.images) {
        const imageId = workbook.addImage({
          buffer: img.imageBytes,
          extension: img.extension
        });

        if (img.range.ext) {
          worksheet.addImage(imageId, {
            tl: img.range.tl as any,
            ext: img.range.ext
          });
        } else if (img.range.br) {
          worksheet.addImage(imageId, {
            tl: img.range.tl as any,
            br: img.range.br as any
          });
        }
      }
    }
  }

  const resultBuffer = await workbook.xlsx.writeBuffer();
  return resultBuffer;
}

/**
 * 계약서 양식 데이터 주입 맵퍼 규격 (설계 참고용 인터페이스)
 */
export interface ContractExcelData {
  contractDate: string;        // 계약일자 (YYYY년 MM월 DD일)
  lessorName: string;          // 임대인 상호
  lessorCeo: string;           // 임대인 대표자
  lessorBizNo: string;         // 임대인 사업자등록번호
  lesseeName: string;          // 임차인 상호
  lesseeCeo: string;           // 임차인 대표자
  lesseeBizNo: string;         // 임차인 등록번호
  deliveryLocation: string;    // 장비 인도장소
  siteAddress: string;         // 현장 상세 위치
  deliveryDateTime: string;    // 장비 인도 일시
  managerName: string;         // 현장 담당자
  managerPhone: string;        // 현장 담당자 연락처
  /**
   * 체결 장비 목록
   *  비즈니스 룰:
   * - 12대 이하: 본문 테이블 12줄 내 1:1 직접 표기
   * - 13대 이상: 본문 1행 요약 ('GS-1930 외 N대 (총 N대)') + [별지 제1호: 체결 장비 상세 명세표] 자동 생성
   */
  assets: Array<{
    modelName: string;         // 품목(모델명)
    quantity: number;          // 수량
    serialNo: string;          // 제조번호
    monthlyFee: number;        // 임대료 (월)
    subtotal: number;          // 소계
  }>;
  totalMonthlyFee: number;     // 총 합계
  transportTerms: string;      // 운송료 청구 기준
  hasAnnexList?: boolean;      // 13대 이상 시 별지 생성 여부 (자동 산출)
}

/**
 * 반입전 체크리스트 데이터 주입 맵퍼 규격
 *  실무 규칙:
 * - 점검자(김관주) 및 점검결과(양호), 충전기 작동값은 원본 템플릿에 고정 인쇄되어 있으므로 편집 불필요.
 * - 도장 날인하지 않음.
 * - 오직 상단의 [모델명]과 [관리번호] 2개 항목만 동적 주입.
 */
export interface PreDeliveryChecklistExcelData {
  modelName: string;           // 모델명 (예: 'Z-45/25J', 'GS-1930')
  serialNo: string;            // 관리번호 및 S/N (예: 'G19052 (GS30D-13533)')
  inspectionDate?: string;     // 점검일시
  inspectorName?: string;      // 점검자
}

/**
 * 안전점검 결과서 데이터 주입 맵퍼 규격
 *  실무 규칙:
 * - 제조사/장비중량/운행속도/작업높이/안전인증일은 ERP [제품관리] 마스터에서 100% 자동 호출.
 * - 점검자(김관주) 및 도장 날인은 원본 템플릿에 이미 박혀 있으므로 수정 불필요 (100% 원본 보존).
 */
export interface SafetyInspectionExcelData {
  siteName: string;            // 사업장명
  clientName: string;          // 사용업체
  manufacturer: string;        // 제 조 사 (ERP [제품관리] 마스터에서 자동 호출, 예: 'GENIE', 'SINOBOOM', 'DINGLI', 'SKYJACK')
  lessorName?: string;         // 렌탈사 (기본값: 테넌트 상호)
  modelName: string;           // 모델명
  serialNo: string;            // 차량/장비번호
  weight: string;              // 장비중량 (ERP [제품관리] 마스터에서 자동 호출)
  speed: string;               // 운행속도 (ERP [제품관리] 마스터에서 자동 호출)
  maxHeightCapacity: string;   // 작업최대높이/적재용량 (ERP [제품관리] 마스터에서 자동 호출)
  safetyCertDate: string;      // 안전인증년월일 (ERP [제품관리] 마스터에서 자동 호출)
  inspectionDate: string;      // 안전점검일시 (출고일자)
  manufactureYear?: string;    // 제조년도 (ERP [자산대장] 마스터에서 자동 호출)
  inspectorName?: string;      // 점검자 (상시 '김관주' 고정, 원본 보존)
  results?: Record<string, string>; // 검사결과 목록
}

/**
 * 텍스트 오버레이용 투명 캔버스 레이어를 생성하여 PNG 바이트로 반환합니다.
 */
function createTextCanvasLayer(
  width: number,
  height: number,
  drawFn: (ctx: CanvasRenderingContext2D) => void
): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = 'middle';
      drawFn(ctx);
    }
    canvas.toBlob(async (blob) => {
      if (blob) {
        const buffer = await blob.arrayBuffer();
        resolve(new Uint8Array(buffer));
      } else {
        resolve(new Uint8Array());
      }
    }, 'image/png');
  });
}

/**
 * 1. 고소작업대 임대차 계약서 PDF 생성 (12줄 수용 및 13개 이상 별지 자동 분기)
 * - 기존 셀 내 잔존 텍스트 영역을 100% 화이트아웃 마스킹하여 겹침/낙서 현상 완전 제거
 */
export async function generateContractPdf(data: ContractExcelData): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const tenantId = import.meta.env.VITE_TENANT_ID || 'giyuen';
  const res = await fetch(`/tenants/${tenantId}/templates/임대차계약서_양식_원본.pdf`);
  if (!res.ok) throw new Error(`계약서 원본 템플릿 로드 실패: HTTP ${res.status}`);

  const templateBytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();

  // ── [1단계] 기존 템플릿에 들어있던 잔존 텍스트 영역 순백색 마스킹 ──
  // (pdf-lib 좌표계: 좌측 하단이 0, 0)
  const white = rgb(1, 1, 1);

  // 상단 계약일자 마스킹
  page.drawRectangle({ x: 200, y: height - 105, width: 200, height: 16, color: white });

  // 임차인(을) 등록번호, 상호, 대표자 마스킹
  page.drawRectangle({ x: 380, y: height - 130, width: 180, height: 15, color: white });
  page.drawRectangle({ x: 380, y: height - 150, width: 180, height: 15, color: white });
  page.drawRectangle({ x: 380, y: height - 170, width: 180, height: 15, color: white });

  // 인도장소, 인도일시, 상세주소, 담당자, 연락처 마스킹
  page.drawRectangle({ x: 120, y: height - 222, width: 200, height: 15, color: white });
  page.drawRectangle({ x: 395, y: height - 222, width: 165, height: 15, color: white });
  page.drawRectangle({ x: 120, y: height - 240, width: 440, height: 15, color: white });
  page.drawRectangle({ x: 120, y: height - 276, width: 200, height: 15, color: white });
  page.drawRectangle({ x: 395, y: height - 276, width: 165, height: 15, color: white });

  // 체결 장비 그리드 12행 전체 화이트아웃 마스킹 (기존 옛날 데이터 전면 삭제)
  page.drawRectangle({ x: 35, y: height - 528, width: 525, height: 218, color: white });

  // 합계 금액 영역 마스킹
  page.drawRectangle({ x: 395, y: height - 425, width: 165, height: 18, color: white });

  // 하단 영업담당자 영역 마스킹
  page.drawRectangle({ x: 375, y: height - 765, width: 180, height: 15, color: white });

  // ── [2단계] 정밀 폰트 텍스트 렌더링 ──
  const scale = 3.5;
  const canvasW = width * scale;
  const canvasH = height * scale;

  const overlayPng = await createTextCanvasLayer(canvasW, canvasH, (ctx) => {
    ctx.fillStyle = '#111827';

    // 1. 계약 체결일자 (상단 중앙)
    ctx.font = 'bold 30px "Malgun Gothic", "맑은 고딕", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.contractDate || new Date().toISOString().split('T')[0], canvasW * 0.5, canvasH * 0.115);

    // 2. 임차인(을) 정보
    ctx.textAlign = 'left';
    ctx.font = '500 24px "Malgun Gothic", "맑은 고딕", sans-serif';
    ctx.fillText(data.lesseeBizNo || '', canvasW * 0.65, canvasH * 0.144);
    ctx.fillText(data.lesseeName || '', canvasW * 0.65, canvasH * 0.168);
    ctx.fillText(data.lesseeCeo || '', canvasW * 0.65, canvasH * 0.192);

    // 3. 임대차 계약 내용 (현장 및 대리인)
    ctx.fillText(data.deliveryLocation || '', canvasW * 0.21, canvasH * 0.254);
    ctx.fillText(data.deliveryDateTime || '', canvasW * 0.67, canvasH * 0.254);
    ctx.fillText(data.siteAddress || '', canvasW * 0.21, canvasH * 0.276);
    ctx.fillText(data.managerName || '', canvasW * 0.21, canvasH * 0.318);
    ctx.fillText(data.managerPhone || '', canvasW * 0.67, canvasH * 0.318);

    // 4. 체결 장비 12줄 그리드
    const isOver12 = data.assets.length >= 13;
    const startY = canvasH * 0.380;
    const rowHeight = canvasH * 0.0216;

    if (isOver12) {
      ctx.fillText(`${data.assets[0]?.modelName || '고소작업대'} 외 ${data.assets.length - 1}대 (총 ${data.assets.length}대)`, canvasW * 0.08, startY);
      ctx.textAlign = 'center';
      ctx.fillText(`${data.assets.length}`, canvasW * 0.22, startY);
      ctx.textAlign = 'left';
      ctx.fillText('[별지 제1호: 체결 장비 상세 명세표 참조]', canvasW * 0.27, startY);
      ctx.textAlign = 'right';
      ctx.fillText(data.totalMonthlyFee ? data.totalMonthlyFee.toLocaleString() : '-', canvasW * 0.58, startY);
    } else {
      data.assets.forEach((asset, idx) => {
        if (idx >= 12) return;
        const currentY = startY + idx * rowHeight;
        ctx.textAlign = 'left';
        ctx.fillText(asset.modelName || '', canvasW * 0.08, currentY);
        ctx.textAlign = 'center';
        ctx.fillText(`${asset.quantity || 1}`, canvasW * 0.22, currentY);
        ctx.textAlign = 'left';
        ctx.fillText(asset.serialNo || '', canvasW * 0.26, currentY);
        ctx.textAlign = 'right';
        ctx.fillText(asset.monthlyFee ? asset.monthlyFee.toLocaleString() : '', canvasW * 0.49, currentY);
        ctx.fillText(asset.subtotal ? asset.subtotal.toLocaleString() : '', canvasW * 0.58, currentY);
      });
    }

    // 5. 합계 금액
    ctx.font = 'bold 28px "Malgun Gothic", "맑은 고딕", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`₩ ${(data.totalMonthlyFee || 0).toLocaleString()}`, canvasW * 0.92, canvasH * 0.494);

    // 6. 영업 담당자 정보
    ctx.textAlign = 'left';
    ctx.font = '500 24px "Malgun Gothic", "맑은 고딕", sans-serif';
    if (data.managerName) {
      ctx.fillText(data.managerName, canvasW * 0.65, canvasH * 0.900);
    }
  });

  const embeddedImage = await pdfDoc.embedPng(overlayPng);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height
  });

  return await pdfDoc.save();
}

/**
 * 2. 반입 전 CHECK LIST PDF 생성
 * - 상단 [모델명], [관리번호] 셀 영역 화이트아웃 마스킹 후 정밀 주입
 */
export async function generateChecklistPdf(data: PreDeliveryChecklistExcelData): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const tenantId = import.meta.env.VITE_TENANT_ID || 'giyuen';
  const res = await fetch(`/tenants/${tenantId}/templates/반입자체점검리스트_양식_원본.pdf`);
  if (!res.ok) throw new Error(`체크리스트 원본 템플릿 로드 실패: HTTP ${res.status}`);

  const templateBytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();
  const white = rgb(1, 1, 1);

  // 상단 모델명 및 관리번호 기존 텍스트 셀 화이트아웃 마스킹
  page.drawRectangle({ x: 180, y: height - 46, width: 140, height: 16, color: white });
  page.drawRectangle({ x: 410, y: height - 46, width: 150, height: 16, color: white });

  const scale = 3.5;
  const canvasW = width * scale;
  const canvasH = height * scale;

  const overlayPng = await createTextCanvasLayer(canvasW, canvasH, (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 26px "Malgun Gothic", "맑은 고딕", sans-serif';

    // 1. 상단 모델명 (가로/세로 중앙 맞춤)
    ctx.textAlign = 'left';
    ctx.fillText(data.modelName || '', canvasW * 0.32, canvasH * 0.045);

    // 2. 상단 관리번호
    ctx.fillText(data.serialNo || '', canvasW * 0.71, canvasH * 0.045);
  });

  const embeddedImage = await pdfDoc.embedPng(overlayPng);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height
  });

  return await pdfDoc.save();
}

/**
 * 3. 고소작업대 안전점검 결과서 PDF 생성
 * - 상단 헤더 5행의 기존 텍스트 셀 전체 화이트아웃 마스킹 후 ERP 마스터 제원 정밀 주입
 * - 점검자(김관주) 및 도장 날인은 원본 보존
 */
export async function generateSafetyInspectionPdf(data: SafetyInspectionExcelData): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const tenantId = import.meta.env.VITE_TENANT_ID || 'giyuen';
  const res = await fetch(`/tenants/${tenantId}/templates/안전점검결과표_양식_원본.pdf`);
  if (!res.ok) throw new Error(`안전점검결과표 원본 템플릿 로드 실패: HTTP ${res.status}`);

  const templateBytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();
  const white = rgb(1, 1, 1);

  // 상단 헤더 5개 행의 데이터 영역 화이트아웃 마스킹
  // Row 1: 사업장명, 제조사
  page.drawRectangle({ x: 105, y: height - 58, width: 220, height: 14, color: white });
  page.drawRectangle({ x: 420, y: height - 58, width: 140, height: 14, color: white });

  // Row 2: 사용업체, 모델명
  page.drawRectangle({ x: 105, y: height - 73, width: 220, height: 14, color: white });
  page.drawRectangle({ x: 420, y: height - 73, width: 140, height: 14, color: white });

  // Row 3: 장비중량, 운행속도, 작업높이/용량
  page.drawRectangle({ x: 105, y: height - 88, width: 100, height: 14, color: white });
  page.drawRectangle({ x: 270, y: height - 88, width: 60, height: 14, color: white });
  page.drawRectangle({ x: 420, y: height - 88, width: 140, height: 14, color: white });

  // Row 4: 차량(관리)번호, 제조년도, 안전인증년월일
  page.drawRectangle({ x: 105, y: height - 103, width: 100, height: 14, color: white });
  page.drawRectangle({ x: 270, y: height - 103, width: 60, height: 14, color: white });
  page.drawRectangle({ x: 420, y: height - 103, width: 140, height: 14, color: white });

  // Row 5: 안전점검일시
  page.drawRectangle({ x: 105, y: height - 118, width: 220, height: 14, color: white });

  const scale = 3.5;
  const canvasW = width * scale;
  const canvasH = height * scale;

  const overlayPng = await createTextCanvasLayer(canvasW, canvasH, (ctx) => {
    ctx.fillStyle = '#111827';
    ctx.font = '500 23px "Malgun Gothic", "맑은 고딕", sans-serif';
    ctx.textAlign = 'left';

    // Row 1: 사업장명, 제조사 (렌탈사)
    ctx.fillText(data.siteName || '', canvasW * 0.19, canvasH * 0.059);
    const mfgText = `${data.manufacturer || 'GENIE'} ${data.lessorName || db.currentTenant?.tradeName || '(주)임대인'}`;
    ctx.fillText(mfgText, canvasW * 0.72, canvasH * 0.059);

    // Row 2: 사용업체, 모델명
    ctx.fillText(data.clientName || '', canvasW * 0.19, canvasH * 0.076);
    ctx.fillText(data.modelName || '', canvasW * 0.72, canvasH * 0.076);

    // Row 3: 장비중량, 운행속도, 작업높이/적재용량
    ctx.fillText(data.weight || '', canvasW * 0.19, canvasH * 0.093);
    ctx.fillText(data.speed || '', canvasW * 0.46, canvasH * 0.093);
    ctx.fillText(data.maxHeightCapacity || '', canvasW * 0.72, canvasH * 0.093);

    // Row 4: 차량(관리)번호, 제조년도, 안전인증년월일
    ctx.fillText(data.serialNo || '', canvasW * 0.19, canvasH * 0.111);
    ctx.fillText(data.manufactureYear || '', canvasW * 0.46, canvasH * 0.111);
    ctx.fillText(data.safetyCertDate || '', canvasW * 0.72, canvasH * 0.111);

    // Row 5: 안전점검일시
    ctx.fillText(data.inspectionDate || new Date().toISOString().split('T')[0], canvasW * 0.19, canvasH * 0.129);
  });

  const embeddedImage = await pdfDoc.embedPng(overlayPng);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height
  });

  return await pdfDoc.save();
}

/**
 * 거래명세서 정품 A4 PDF / Excel 렌더링 규격 인터페이스 (00.거래명세서양식.xlsx 27열 B1:AA30 기준)
 */
export interface TransactionStatementItem {
  month: number | string;
  day: number | string;
  modelName?: string;        // {모델} 또는 품목명
  workingHeight?: string;    // {높이} / 사양
  assetNo?: string;          // {자산번호} (렌탈) 또는 제조번호/품목코드 (유통)
  serialOrCode?: string;     // 유통 전용: 제조번호 / 품목코드
  itemCategoryLabel?: string;// 유통 전용: 완제품 / 설치옵션 / 호환부품 / 운반비
  unit?: string;             // 유통 전용: 대 / 식 / EA / 건
  statementMode?: 'TRADE' | 'RENTAL';
  siteEntryDate?: string;    // {현장투입일} (렌탈 전용)
  periodStart?: string;      // {청구시작일} (렌탈 전용)
  periodEnd?: string;        // {청구종료일} (렌탈 전용)
  billingCategory?: string;  // {청구구분} (임대료 / 유상옵션 / 운반비 / 수리비 / 매각 / 기타)
  itemDescription: string;   // 레거시/이메일 본문 요약 호환용
  quantity: number;          // {수량}
  unitPrice: number;         // {단가}
  supplyAmount: number;      // {공급가}
  vatAmount: number;         // {세액}
  notes?: string;            // 비고 (Y열)
}

export interface TransactionStatementPdfData {
  billingDate: string; // YYYY-MM-DD
  billingYm: string;   // YYYY-MM
  contractNo?: string;
  statementMode?: 'TRADE' | 'RENTAL'; // 유통('TRADE') vs 렌탈('RENTAL') 양식 구분
  supplySummary?: string;             // 공급내역 요약 문구

  // 공급자 (당사 테넌트)
  lessorBizNo?: string;          // {테넌트사업자등록번호}
  lessorName?: string;           // {테넌트상호}
  lessorCeo?: string;            // {테넌트대표}
  lessorAddress?: string;        // {테넌트주소}
  lessorBizType?: string;        // {테넌트업태}
  lessorBizItem?: string;        // {테넌트종목}
  lessorTel?: string;            // {테넌트전화}
  lessorFax?: string;
  salespersonName?: string;      // {영업담당자}
  salespersonPhone?: string;     // {영업담당자연락처}
  billingManagerName?: string;   // {테넌트계산서담당자}
  billingManagerPhone?: string;  // {테넌트전화}
  lessorEmail?: string;          // {테넌트세금계산서메일}
  stampImageUrl?: string;
  stampBase64?: string;

  // 공급받는 자 (고객사)
  customerBizNo?: string;        // {고객사업자등록증번호}
  customerName?: string;         // {고객상호}
  customerCeo?: string;          // {고객대표}
  customerAddress?: string;      // {고객주소}
  customerBizType?: string;      // {고객업태}
  customerBizItem?: string;      // {고객종목}
  siteManagerName?: string;      // {현장담당자} / 인수담당자
  siteManagerPhone?: string;     // {현장담당자연락처}
  custBillingManagerName?: string;  // {계산서담당자}
  custBillingManagerPhone?: string; // {계산서담당자연락처}
  custBillingEmail?: string;        // {계산서메일}
  siteName?: string;                // {현장명} / 납품장소
  bankAccount?: string;             // {테넌트계좌}

  // 품목 내역 (페이지당 최대 13행: Row 16 ~ Row 28)
  items: TransactionStatementItem[];

  totalSupply: number;
  totalVat: number;
  totalGrand: number;
}

/**
 * 거래명세서 데이터가 유통('TRADE')인지 렌탈('RENTAL')인지 자동 판별
 */
export function detectStatementMode(data?: Partial<TransactionStatementPdfData> | null): 'TRADE' | 'RENTAL' {
  if (!data) return 'RENTAL';
  if (data.statementMode === 'TRADE' || data.statementMode === 'RENTAL') {
    return data.statementMode;
  }
  const items = data.items || [];
  if (items.some(it => it.statementMode === 'TRADE')) return 'TRADE';
  if (items.some(it => it.statementMode === 'RENTAL')) return 'RENTAL';

  const cNo = String(data.contractNo || '').trim().toUpperCase();
  if (cNo.startsWith('T-') || cNo.startsWith('TRD-') || cNo.startsWith('SO-') || cNo.startsWith('TOUT-')) {
    return 'TRADE';
  }

  const hasTradeKeyword = items.some(it => {
    const text = `${it.modelName || ''} ${it.itemDescription || ''} ${it.billingCategory || ''} ${it.itemCategoryLabel || ''}`;
    return /\[완제품\]|\[출고설치옵션\]|\[설치옵션\]|\[유통출고|완제품|설치옵션|호환부품|매각/.test(text);
  });
  if (hasTradeKeyword) return 'TRADE';

  // 계약이 조회 가능할 경우 contractType 확인
  if (cNo && db.contracts) {
    const matchedContract = db.contracts.find((c: any) => c.contractNo === data.contractNo || c.id === data.contractNo);
    if (matchedContract && ((matchedContract as any).contractType === 'TRADE' || (matchedContract as any).contractType === 'SALE' || (matchedContract as any).tradeOrderId)) {
      return 'TRADE';
    }
  }

  return 'RENTAL';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * 거래명세서 품목 1행에서 유통('TRADE') 및 렌탈('RENTAL') 컬럼 추출 정규화 헬퍼
 */
export function resolveStatementRowColumns(
  item: TransactionStatementItem,
  _fallbackYm?: string,
  forceMode?: 'TRADE' | 'RENTAL'
) {
  const mode: 'TRADE' | 'RENTAL' = forceMode || item.statementMode || (
    /\[완제품\]|\[출고설치옵션\]|\[설치옵션\]|완제품|설치옵션|호환부품|매각/.test(
      `${item.modelName || ''} ${item.itemDescription || ''} ${item.billingCategory || ''} ${item.itemCategoryLabel || ''}`
    ) ? 'TRADE' : 'RENTAL'
  );

  let rawModel = (item.modelName || '').trim();
  let height = (item.workingHeight || '').trim();
  let assetNo = (item.assetNo || '').trim();
  let serialOrCode = (item.serialOrCode || '').trim();
  let itemCategoryLabel = (item.itemCategoryLabel || '').trim();
  let unit = (item.unit || '').trim();
  let siteEntryDate = (item.siteEntryDate || '').trim();
  let periodStart = (item.periodStart || '').trim();
  let periodEnd = (item.periodEnd || '').trim();
  let billingCategory = (item.billingCategory || '').trim();
  let notes = (item.notes || '').trim();

  const desc = (item.itemDescription || '').trim();
  if (!rawModel && desc) {
    const parts = desc.split('_');
    if (parts.length >= 3 && parts[parts.length - 1].includes('~')) {
      rawModel = parts[0];
      if (!assetNo) assetNo = parts[1];
      const [ps, pe] = parts[parts.length - 1].split('~');
      if (!periodStart && ps) periodStart = ps.trim();
      if (!periodEnd && pe) periodEnd = pe.trim();
    } else if (parts.length === 2 && parts[1].includes('~')) {
      rawModel = parts[0];
      const [ps, pe] = parts[1].split('~');
      if (!periodStart && ps) periodStart = ps.trim();
      if (!periodEnd && pe) periodEnd = pe.trim();
    } else {
      rawModel = desc;
    }
  }

  const combinedSource = `${rawModel} ${desc}`;

  // 괄호 안 제조번호/시리얼 추출: 예 "(HC-XE25-261001)" 또는 "(HL-K325-260303)"
  const parenSerialMatch = rawModel.match(/\(([A-Z]{2,}-[A-Z0-9,\s-]+)\)\s*$/);
  if (parenSerialMatch && !serialOrCode) {
    serialOrCode = parenSerialMatch[1].trim();
  }
  const descSerialMatch = combinedSource.match(/시리얼\s*[:：]?\s*([A-Z0-9_-]+(?:\s*,\s*[A-Z0-9_-]+)*)/i);
  if (descSerialMatch && !serialOrCode) {
    serialOrCode = descSerialMatch[1].trim();
  }

  // 앞쪽 태그([완제품], [출고설치옵션] 등) 및 중복 시리얼 괄호 제거
  let cleanModel = rawModel
    .replace(/^\[(완제품|출고설치옵션|설치옵션|유상옵션|부품|호환부품)\]\s*/g, '')
    .trim();
  if (parenSerialMatch) {
    cleanModel = cleanModel.replace(/\(([A-Z]{2,}-[A-Z0-9,\s-]+)\)\s*$/, '').trim();
  }

  // 제품 마스터에서 작업높이/사양 자동 보완 (렌탈 모드일 때만)
  if (mode === 'RENTAL' && !height && cleanModel && db.products && db.products.length > 0) {
    const normModel = cleanModel.replace(/\s+/g, '').toUpperCase();
    const matchedProd = db.products.find(p =>
      p.modelName && (
        p.modelName.replace(/\s+/g, '').toUpperCase() === normModel ||
        normModel.includes(p.modelName.replace(/\s+/g, '').toUpperCase())
      )
    );
    if (matchedProd?.workingHeight) {
      height = matchedProd.workingHeight;
    }
  }

  if (mode === 'TRADE') {
    if (!itemCategoryLabel) {
      if (/\[완제품\]|완제품/.test(combinedSource)) {
        itemCategoryLabel = '완제품';
      } else if (/\[출고설치옵션\]|\[설치옵션\]|\[유상옵션\]|설치옵션|풀캐빈|반캐빈|히터|에어컨|후방카메라|사이드시프트|포크포지셔너|레드라인|블루라이트/.test(combinedSource)) {
        itemCategoryLabel = '설치옵션';
      } else if (/운반|운송|배차/.test(combinedSource)) {
        itemCategoryLabel = '운반비';
      } else if (/부품|컨트롤러|포크암|작동유|필터|배터리|타이어|충전기/.test(combinedSource)) {
        itemCategoryLabel = '호환부품';
      } else {
        itemCategoryLabel = '완제품';
      }
    }
    if (!unit) {
      unit = itemCategoryLabel === '완제품' ? '대'
        : itemCategoryLabel === '설치옵션' ? '식'
        : itemCategoryLabel === '운반비' ? '건'
        : 'EA';
    }
    if (!serialOrCode) {
      if (assetNo && assetNo !== '-') {
        serialOrCode = assetNo;
      } else if (itemCategoryLabel === '설치옵션') {
        serialOrCode = '출고장착옵션';
      } else {
        serialOrCode = '-';
      }
    }
    billingCategory = itemCategoryLabel;
  } else {
    // 렌탈 모드 청구구분 판별 (ASSET_SALE의 'AS' 오매칭 방지)
    if (!billingCategory || billingCategory === '수리비') {
      if (/^\[(완제품|출고설치옵션|설치옵션)\]/.test(rawModel)) {
        billingCategory = rawModel.startsWith('[완제품]') ? '완제품' : '설치옵션';
      } else if (/운반|운송|배차|회수|상하차/.test(combinedSource)) {
        billingCategory = '운반비';
      } else if (/수리|파손|정비|(?:^|[^A-Za-z])A\/?S(?:$|[^A-Za-z])/i.test(combinedSource) && !/\[완제품\]|\[출고설치옵션\]/.test(combinedSource)) {
        billingCategory = '수리비';
      } else if (/\[유상옵션\]|\[OPT:|유상옵션|설치옵션/.test(combinedSource)) {
        billingCategory = '유상옵션';
      } else if (/매각|양도|판매/.test(combinedSource)) {
        billingCategory = '매각';
      } else {
        billingCategory = '임대료';
      }
    }
  }

  const modelAndHeight = (mode === 'RENTAL' && height)
    ? `${cleanModel} / ${height}`
    : (cleanModel || desc || '-');

  const cleanEntryDate = (siteEntryDate || periodStart || '-').replace(/T00:00:00(?:\.000)?Z$/, '');
  const cleanPStart = (periodStart || '-').replace(/T00:00:00(?:\.000)?Z$/, '');
  const cleanPEnd = (periodEnd || '-').replace(/T00:00:00(?:\.000)?Z$/, '');

  return {
    mode,
    model: cleanModel || '-',
    height: height || '',
    modelAndHeight,
    assetNo: (mode === 'TRADE' ? serialOrCode : assetNo) || '-',
    serialOrCode: serialOrCode || assetNo || '-',
    itemCategoryLabel: itemCategoryLabel || billingCategory || (mode === 'TRADE' ? '완제품' : '임대료'),
    unit: unit || (mode === 'TRADE' ? '대' : '대'),
    siteEntryDate: mode === 'TRADE' ? '-' : cleanEntryDate,
    periodStart: mode === 'TRADE' ? '-' : cleanPStart,
    periodEnd: mode === 'TRADE' ? '-' : cleanPEnd,
    billingCategory: mode === 'TRADE' ? (itemCategoryLabel || '완제품') : (billingCategory || '임대료'),
    notes
  };
}

/**
 * 4. ERP 공식 표준 거래명세서 정품 A4 PDF 생성 엔진 (MS Excel COM 전용)
 *  원칙: 2D Canvas 눈대중 모방을 100% 배제하고, 로컬 사이드카 에이전트의 정품 MS Excel COM 엔진(00.거래명세서양식.xlsx 정품 원본 기반)만을 사용합니다.
 */
export async function generateTransactionStatementPdf(data: TransactionStatementPdfData): Promise<Uint8Array> {
  try {
    const curTenant = db.currentTenant;
    const primaryAccount = curTenant?.bankAccounts?.[0];
    const defaultBankAccount = primaryAccount
      ? `${primaryAccount.bankName} ${primaryAccount.accountNumber} (${primaryAccount.accountHolder || (primaryAccount as any).holder || curTenant?.tradeName || curTenant?.corporateName || ''})`
      : '';

    const mode = detectStatementMode(data);
    const normalizedItems = (data.items || []).map(item => {
      const resolved = resolveStatementRowColumns(item, data.billingYm, mode);
      return {
        ...item,
        statementMode: mode,
        modelName: resolved.model,
        workingHeight: resolved.height,
        modelAndHeight: resolved.modelAndHeight,
        assetNo: resolved.assetNo,
        serialOrCode: resolved.serialOrCode,
        itemCategoryLabel: resolved.itemCategoryLabel,
        unit: resolved.unit,
        siteEntryDate: resolved.siteEntryDate,
        periodStart: resolved.periodStart,
        periodEnd: resolved.periodEnd,
        billingCategory: resolved.billingCategory
      };
    });

    // 프론트엔드 ExcelJS로 유통/렌탈 정밀 서식·병합·정렬이 완비된 워크북 바이너리 선행 생성
    let excelBase64: string | undefined;
    try {
      const excelBuffer = await generateTransactionStatementExcel({
        ...data,
        statementMode: mode,
        items: normalizedItems
      });
      excelBase64 = arrayBufferToBase64(excelBuffer);
    } catch (excelPreErr) {
      console.warn('[StatementPDF] 사전 엑셀 버퍼 생성 경고:', excelPreErr);
    }

    const payload = {
      ...data,
      statementMode: mode,
      excelBase64,
      items: normalizedItems,
      tenantName: data.lessorName || curTenant?.tradeName || curTenant?.corporateName || curTenant?.displayName,
      lessorName: data.lessorName || curTenant?.tradeName || curTenant?.corporateName || curTenant?.displayName,
      lessorBizNo: data.lessorBizNo || curTenant?.businessNumber,
      lessorCeo: data.lessorCeo || curTenant?.representativeName,
      lessorAddress: data.lessorAddress || curTenant?.businessAddress,
      lessorBizType: data.lessorBizType || curTenant?.businessCategory,
      lessorBizItem: data.lessorBizItem || curTenant?.businessItem,
      lessorTel: data.lessorTel || curTenant?.tel,
      lessorFax: data.lessorFax || curTenant?.fax,
      lessorEmail: data.lessorEmail || curTenant?.taxEmail || curTenant?.email,
      billingManagerName: data.billingManagerName || curTenant?.workplaces?.[0]?.managerName || '정수아',
      billingManagerPhone: data.billingManagerPhone || curTenant?.tel || '031-334-5295',
      bankAccount: data.bankAccount || defaultBankAccount,
      excelMappingRules: curTenant?.excelMappingRules,
      asyncQueue: true
    };
    
    const agentResp = await fetchWithAgentFallback('/api/generate-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      requireAgent: true,
      actionName: '거래명세서 PDF 생성'
    });

    if (agentResp.ok) {
      let agentRes = await agentResp.json();
      if (agentRes.queued && agentRes.jobId) {
        const jobId = agentRes.jobId;
        let nullJobCount = 0;
        let pollAttempts = 0;
        while (true) {
          pollAttempts++;
          if (pollAttempts > 150) {
            throw new Error(`거래명세서 PDF 생성 작업(${jobId}) 대기 시간이 초과되었습니다(2분 30초).`);
          }
          await new Promise(r => setTimeout(r, 1000));
          let pollData: any = null;
          try {
            const pollResp = await fetchWithAgentFallback(`/api/job-queue?jobId=${encodeURIComponent(jobId)}`, {
              method: 'GET',
              skipPrecheck: true
            });
            if (pollResp.ok) {
              pollData = await pollResp.json();
            }
          } catch {
            // 일시적 루프백 지연 시 다음 폴링 주기로 안전 재시도
            continue;
          }

          if (pollData) {
            const job = pollData.job;
            if (job) {
              nullJobCount = 0;
              if (job.status === 'COMPLETED' && job.result) {
                agentRes = job.result;
                break;
              } else if (job.status === 'FAILED') {
                throw new Error(job.error || '거래명세서 PDF 생성 작업 실패');
              }
            } else {
              nullJobCount++;
              if (nullJobCount >= 10) {
                throw new Error(`에이전트 작업 큐에서 거래명세서 생성 작업(${jobId})을 찾을 수 없습니다.`);
              }
            }
          }
        }
      }
      if (agentRes.success && agentRes.base64Content) {
        const binaryStr = atob(agentRes.base64Content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes;
      }
      throw new Error(agentRes.error || '엑셀 COM 엔진 PDF 변환 실패');
    }
    throw new Error(`에이전트 응답 오류 (HTTP ${agentResp.status})`);
  } catch (agentErr: any) {
    throw new Error(
      `로컬 엑셀 COM 에이전트 연결 또는 변환 실패:\n\n` +
      `거래명세서 PDF는 정품 MS Excel COM 엔진을 통해서만 생성됩니다.\n` +
      `C:\\eBroAgent\\eBroAgent.exe 가 실행 중인지 확인해 주세요.\n` +
      `(원인: ${agentErr?.message || agentErr})`
    );
  }
}

/**
 * 5. 거래명세서 정품 엑셀 파일 원본 생성 엔진
 * - 템플릿: /tenants/${tenantId}/templates/00.거래명세서양식.xlsx (또는 /거래명세서양식.xlsx)
 * - 39개 {} 플레이스홀더 및 13개 품목 행(Row 16 ~ Row 28) 정밀 매핑
 */
export async function generateTransactionStatementExcel(data: TransactionStatementPdfData): Promise<ArrayBuffer> {
  const tenantId = import.meta.env.VITE_TENANT_ID || 'giyuen';
  let resp = await fetch(`/tenants/${tenantId}/templates/00.거래명세서양식.xlsx`);
  if (!resp.ok) {
    resp = await fetch(`/거래명세서양식.xlsx`);
  }
  if (!resp.ok) {
    throw new Error(`거래명세서 엑셀 마스터 템플릿을 불러올 수 없습니다. (${tenantId})`);
  }
  const templateBytes = await resp.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes);
  const baseWs = workbook.worksheets[0];
  if (!baseWs) throw new Error('엑셀 템플릿 워크시트를 찾을 수 없습니다.');

  const curTenant = db.currentTenant;
  const primaryAccount = curTenant?.bankAccounts?.[0];
  const defaultBankAccount = primaryAccount
    ? `${primaryAccount.bankName} ${primaryAccount.accountNumber} (${primaryAccount.accountHolder || (primaryAccount as any).holder || curTenant?.tradeName || curTenant?.corporateName || ''})`
    : '';

  const lessorBizNo = data.lessorBizNo || curTenant?.businessNumber || '138-81-83251';
  const lessorName = data.lessorName || curTenant?.tradeName || curTenant?.corporateName || curTenant?.displayName || '(주)기연리프트';
  const lessorCeo = data.lessorCeo || curTenant?.representativeName || '이수용';
  const lessorAddress = data.lessorAddress || curTenant?.businessAddress || '';
  const lessorBizType = data.lessorBizType || curTenant?.businessCategory || '사업지원및임대서비스업';
  const lessorBizItem = data.lessorBizItem || curTenant?.businessItem || '고소장비임대업';
  const lessorTel = data.billingManagerPhone || data.lessorTel || curTenant?.tel || '031-334-5295';
  const lessorBillingMgr = data.billingManagerName || curTenant?.workplaces?.[0]?.managerName || '정수아';
  const lessorEmail = data.lessorEmail || curTenant?.taxEmail || curTenant?.email || 'giyeonlift@naver.com';
  const bankAccount = data.bankAccount || defaultBankAccount;

  // 13개 단위 분할 (Row 16 ~ Row 28)
  const mode = detectStatementMode(data);
  const items = data.items || [];
  const chunkSize = 13;
  const chunks: TransactionStatementItem[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;
  const pristineModel = JSON.stringify(baseWs.model);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const chunk = chunks[pageIdx];
    const pageNum = pageIdx + 1;
    const pageTag = totalPages > 1 ? ` ( ${pageNum} / ${totalPages} 쪽 )` : '';
    const startGlobalIdx = pageIdx * chunkSize;

    let ws: ExcelJS.Worksheet;
    if (pageIdx === 0) {
      ws = baseWs;
      ws.name = totalPages > 1 ? `거래명세서_1` : '거래명세서';
    } else {
      ws = workbook.addWorksheet(`거래명세서_${pageNum}`);
      ws.model = JSON.parse(pristineModel);
      ws.name = `거래명세서_${pageNum}`;
    }

    const replaceTagInSheet = (tag: string, val: string) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value && typeof cell.value === 'string' && cell.value.includes(tag)) {
            cell.value = cell.value.split(tag).join(val);
          }
        });
      });
    };

    // 1. 공급자(테넌트) {} 플레이스홀더 치환
    replaceTagInSheet('{테넌트사업자등록번호}', lessorBizNo);
    replaceTagInSheet('{테넌트상호}', lessorName);
    replaceTagInSheet('{테넌트대표}', lessorCeo);
    replaceTagInSheet('{테넌트주소}', lessorAddress);
    replaceTagInSheet('{테넌트업태}', lessorBizType);
    replaceTagInSheet('{테넌트종목}', lessorBizItem);
    replaceTagInSheet('{영업담당자}', data.salespersonName || '-');
    replaceTagInSheet('{영업담당자연락처}', data.salespersonPhone || lessorTel);
    replaceTagInSheet('{테넌트계산서담당자}', lessorBillingMgr);
    replaceTagInSheet('{테넌트전화}', lessorTel);
    replaceTagInSheet('{테넌트세금계산서메일}', lessorEmail);
    replaceTagInSheet('{테넌트계좌}', bankAccount);

    // 2. 공급받는자(고객사) {} 플레이스홀더 치환
    replaceTagInSheet('{고객사업자등록증번호}', data.customerBizNo || '-');
    replaceTagInSheet('{고객상호}', data.customerName || '-');
    replaceTagInSheet('{고객대표}', data.customerCeo || '-');
    replaceTagInSheet('{고객주소}', data.customerAddress || '-');
    replaceTagInSheet('{고객업태}', data.customerBizType || '-');
    replaceTagInSheet('{고객종목}', data.customerBizItem || '-');
    replaceTagInSheet('{현장담당자}', data.siteManagerName || '-');
    replaceTagInSheet('{현장담당자연락처}', data.siteManagerPhone || '-');
    replaceTagInSheet('{계산서담당자}', data.custBillingManagerName || '-');
    replaceTagInSheet('{계산서담당자연락처}', data.custBillingManagerPhone || '-');
    replaceTagInSheet('{계산서메일}', data.custBillingEmail || '-');
    replaceTagInSheet('{현장명}', `${data.siteName || '-'}${pageTag}`);
    replaceTagInSheet('{작성일자}', `${data.billingDate || new Date().toISOString().split('T')[0]}${pageTag}`);

    // 2-1. 영업 형태(유통 vs 렌탈)별 상단 헤더 레이블 및 공급내역 설정
    if (mode === 'TRADE') {
      ws.getCell('C9').value = '영업담당자';
      ws.getCell('P9').value = '인수담당자';
      ws.getCell('E12').value = data.supplySummary || '지게차 완제품 및 옵션·부품 공급';
      ws.getCell('P12').value = '납품장소';
    } else {
      ws.getCell('C9').value = '계약담당자';
      ws.getCell('P9').value = '현장담당자';
      ws.getCell('E12').value = data.supplySummary || '지게차 임대료 외';
      ws.getCell('P12').value = '현장명';
    }

    // 상단 공급자/공급받는자 텍스트 잘림 방지 (shrinkToFit 적용)
    for (const addr of ['E5','E6','K6','E7','E8','K8','E9','K9','E10','K10','E11','E12','E13','R5','R6','X6','R7','R8','X8','R9','X9','R10','X10','R11','R12','T13']) {
      const c = ws.getCell(addr);
      c.alignment = { ...(c.alignment || {}), horizontal: 'center', vertical: 'middle', shrinkToFit: true };
    }

    // 2-2. 품목 테이블 헤더(Row 15) 및 데이터 행(Row 16 ~ Row 28) 병합·테두리·정렬 정규화
    const clearRowMerges = (r: number) => {
      const possibleRanges = [
        `E${r}:G${r}`, `H${r}:J${r}`, `L${r}:N${r}`, `O${r}:P${r}`,
        `E${r}:J${r}`, `K${r}:M${r}`, `N${r}:O${r}`,
        `R${r}:S${r}`, `T${r}:V${r}`, `W${r}:X${r}`, `Y${r}:AA${r}`
      ];
      for (const rng of possibleRanges) {
        try { ws.unMergeCells(rng); } catch (e) {}
      }
    };

    const applyRowMerges = (r: number) => {
      clearRowMerges(r);
      const targetRanges = mode === 'TRADE'
        ? [`E${r}:J${r}`, `K${r}:M${r}`, `N${r}:O${r}`, `R${r}:S${r}`, `T${r}:V${r}`, `W${r}:X${r}`, `Y${r}:AA${r}`]
        : [`E${r}:G${r}`, `H${r}:J${r}`, ...(r === 15 ? [`L${r}:N${r}`] : []), `O${r}:P${r}`, `R${r}:S${r}`, `T${r}:V${r}`, `W${r}:X${r}`, `Y${r}:AA${r}`];
      for (const rng of targetRanges) {
        try { ws.mergeCells(rng); } catch (e) {}
      }
      // 테두리 보존 (B열~AA열: 2~27)
      for (let cIdx = 2; cIdx <= 27; cIdx++) {
        const cell = ws.getCell(r, cIdx);
        cell.border = {
          left: { style: cIdx === 2 ? 'medium' : 'hair', color: { argb: 'FF0070C0' } },
          right: { style: cIdx === 27 ? 'medium' : 'hair', color: { argb: 'FF0070C0' } },
          top: { style: r === 15 ? 'medium' : 'hair', color: { argb: 'FF0070C0' } },
          bottom: { style: (r === 15 || r === 28) ? 'medium' : 'hair', color: { argb: 'FF0070C0' } }
        };
      }
    };

    // Row 15 컬럼 헤더 설정
    applyRowMerges(15);
    const setHeaderCell = (col: string, label: string) => {
      const cell = ws.getCell(`${col}15`);
      cell.value = label;
      cell.numFmt = '@';
      cell.font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FF0070C0' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
    };

    if (mode === 'TRADE') {
      setHeaderCell('B', '순번');
      setHeaderCell('C', '월');
      setHeaderCell('D', '일');
      setHeaderCell('E', '품목명 / 모델·규격');
      setHeaderCell('K', '제조번호 / 품목코드');
      setHeaderCell('N', '품목구분');
      setHeaderCell('P', '단위');
      setHeaderCell('Q', '수량');
      setHeaderCell('R', '단가');
      setHeaderCell('T', '공급가액');
      setHeaderCell('W', '세 액');
      setHeaderCell('Y', '비고');
    } else {
      setHeaderCell('B', '순번');
      setHeaderCell('C', '월');
      setHeaderCell('D', '일');
      setHeaderCell('E', '모델 / 사양');
      setHeaderCell('H', '자산번호');
      setHeaderCell('K', '현장투입일');
      setHeaderCell('L', '사용기간');
      setHeaderCell('O', '청구구분');
      setHeaderCell('Q', '수량');
      setHeaderCell('R', '단가');
      setHeaderCell('T', '공급가액');
      setHeaderCell('W', '세 액');
      setHeaderCell('Y', '비고');
    }

    // 3. 품목 13행 기입 (Row 16 ~ Row 28)
    let pageSupply = 0;
    let pageVat = 0;

    for (let i = 0; i < 13; i++) {
      const rowNum = 16 + i;
      const item = chunk[i];
      applyRowMerges(rowNum);

      // 행 전체 초기화 및 일관된 폰트/정렬/포맷 지정
      const formatDataCell = (
        col: string,
        val: any,
        align: 'left' | 'center' | 'right',
        numFmt: string = '@',
        shrink: boolean = true,
        indent: number = 0
      ) => {
        const cell = ws.getCell(`${col}${rowNum}`);
        cell.value = val;
        cell.numFmt = numFmt;
        cell.font = { name: '맑은 고딕', size: 12, bold: false, italic: false, color: { argb: 'FF000000' } };
        cell.alignment = {
          horizontal: align,
          vertical: 'middle',
          shrinkToFit: shrink,
          ...(indent > 0 ? { indent } : {})
        };
      };

      if (item) {
        const resolved = resolveStatementRowColumns(item, data.billingYm, mode);
        const qty = Number(item.quantity ?? 1);
        const unitPrice = Number(item.unitPrice ?? 0);
        const supplyAmount = Number(item.supplyAmount ?? (unitPrice * qty));
        const vatAmount = (item.vatAmount !== undefined && Number(item.vatAmount) !== 0)
          ? Number(item.vatAmount)
          : Math.round(supplyAmount * 0.1);
        pageSupply += supplyAmount;
        pageVat += vatAmount;

        const mVal = item.month !== undefined && item.month !== '' ? String(Number(item.month)) : '';
        const dVal = item.day !== undefined && item.day !== '' ? String(Number(item.day)) : '';

        if (mode === 'TRADE') {
          // 유통 거래명세서 (사용기간 없음)
          // 중앙정렬: 순번(B), 월(C), 일(D), 제조번호/품목코드(K:M), 품목구분(N:O), 단위(P)
          // 좌측정렬: 품목명/모델·규격(E:J), 비고(Y:AA)
          // 우측정렬: 수량(Q), 단가(R:S), 공급가액(T:V), 세액(W:X)
          formatDataCell('B', startGlobalIdx + i + 1, 'center', '@', false);
          formatDataCell('C', mVal, 'center', '@', false);
          formatDataCell('D', dVal, 'center', '@', false);
          formatDataCell('E', resolved.modelAndHeight, 'left', '@', true, 1);
          formatDataCell('K', resolved.serialOrCode, 'center', '@', true);
          formatDataCell('N', resolved.itemCategoryLabel, 'center', '@', true);
          formatDataCell('P', resolved.unit, 'center', '@', false);
          formatDataCell('Q', qty, 'right', '#,##0', true, 1);
          formatDataCell('R', unitPrice, 'right', '#,##0', true, 1);
          formatDataCell('T', supplyAmount, 'right', '#,##0', true, 1);
          formatDataCell('W', vatAmount, 'right', '#,##0', true, 1);
          formatDataCell('Y', resolved.notes || '', 'left', '@', true, 1);
        } else {
          // 렌탈 거래명세서 (현장투입일 및 사용기간 포함)
          // 중앙정렬: 순번(B), 월(C), 일(D), 자산번호(H:J), 현장투입일(K), 사용기간(L,M,N), 청구구분(O:P)
          // 좌측정렬: 모델/사양(E:G), 비고(Y:AA)
          // 우측정렬: 수량(Q), 단가(R:S), 공급가액(T:V), 세액(W:X)
          const hasPeriod = resolved.periodStart !== '-' || resolved.periodEnd !== '-';
          formatDataCell('B', startGlobalIdx + i + 1, 'center', '@', false);
          formatDataCell('C', mVal, 'center', '@', false);
          formatDataCell('D', dVal, 'center', '@', false);
          formatDataCell('E', resolved.modelAndHeight, 'left', '@', true, 1);
          formatDataCell('H', resolved.assetNo, 'center', '@', true);
          formatDataCell('K', resolved.siteEntryDate, 'center', '@', true);
          formatDataCell('L', resolved.periodStart, 'center', '@', true);
          formatDataCell('M', hasPeriod ? '~' : '', 'center', '@', false);
          formatDataCell('N', resolved.periodEnd, 'center', '@', true);
          formatDataCell('O', resolved.billingCategory, 'center', '@', true);
          formatDataCell('Q', qty, 'right', '#,##0', true, 1);
          formatDataCell('R', unitPrice, 'right', '#,##0', true, 1);
          formatDataCell('T', supplyAmount, 'right', '#,##0', true, 1);
          formatDataCell('W', vatAmount, 'right', '#,##0', true, 1);
          formatDataCell('Y', resolved.notes || '', 'left', '@', true, 1);
        }
      } else {
        for (const col of ['B','C','D','E','H','K','L','M','N','O','P','Q','R','T','W','Y']) {
          const isNumCol = ['Q','R','T','W'].includes(col);
          const align = ['E','Y'].includes(col) ? 'left' : isNumCol ? 'right' : 'center';
          formatDataCell(col, null, align, isNumCol ? '#,##0' : '@', true, ['E','Y','Q','R','T','W'].includes(col) ? 1 : 0);
        }
      }
    }

    // 4. 합계 행 (Row 29: 수식 보존 및 캐시 result 기입 + 우측정렬 일관 적용)
    const finalSupply = totalPages === 1 ? (data.totalSupply || pageSupply) : pageSupply;
    const finalVat = totalPages === 1 ? (data.totalVat || pageVat) : pageVat;
    for (const sumEntry of [
      { addr: 'E29', formula: 'SUM(T16:V28)', result: finalSupply },
      { addr: 'L29', formula: 'SUM(W16:X28)', result: finalVat },
      { addr: 'Q29', formula: 'E29+L29', result: finalSupply + finalVat }
    ]) {
      const c = ws.getCell(sumEntry.addr);
      c.value = { formula: sumEntry.formula, result: sumEntry.result };
      c.numFmt = '₩#,##0;₩-#,##0;₩0';
      c.alignment = { horizontal: 'right', vertical: 'middle', shrinkToFit: true, indent: 1 };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * 엑셀 정품 PDF 템플릿 로더 (하위 호환)
 */
export async function generateSafetyInspectionPdfFromExcelTemplate(
  data?: Partial<SafetyInspectionExcelData>
): Promise<Uint8Array> {
  return generateSafetyInspectionPdf({
    siteName: data?.siteName || '',
    clientName: data?.clientName || '',
    manufacturer: data?.manufacturer || 'GENIE',
    modelName: data?.modelName || 'GS-1930',
    serialNo: data?.serialNo || 'G19052',
    weight: data?.weight || '1,500 kg',
    speed: data?.speed || '4.0 Km/h',
    maxHeightCapacity: data?.maxHeightCapacity || '7.8 M / 227 kg',
    safetyCertDate: data?.safetyCertDate || '2024-03-01',
    inspectionDate: data?.inspectionDate || new Date().toISOString().split('T')[0]
  });
}

/**
 * 유통 물품매매계약서 엑셀 양식 규격
 */
export interface TradeContractParty {
  corpName: string;
  bizNo: string;
  ceo: string;
  address: string;
  tel: string;
  manager?: string;
  email?: string;
}

export interface TradeContractItem {
  no: number;
  productName: string;
  skuCode?: string;
  spec?: string;
  qty: number;
  unitPrice: number;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  note?: string;
}

export interface TradeContractExcelData {
  contractNo: string;
  contractDate: string;
  seller: TradeContractParty;
  buyer: TradeContractParty;
  items: TradeContractItem[];
  totalSupply: number;
  totalVat: number;
  totalGrand: number;
  deliveryDate?: string;
  deliveryLocation?: string;
  paymentTerms?: string;
  specialTerms?: string;
}

/**
 * 숫자를 한글 금액 표기로 변환하는 헬퍼 (예: 33000000 -> 삼천삼백만)
 */
function numberToKoreanWon(amount: number): string {
  if (!amount || amount === 0) return '영';
  const units = ['', '만', '억', '조'];
  const smallUnits = ['', '십', '백', '천'];
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

  let result = '';
  let unitIdx = 0;
  let num = Math.floor(Math.abs(amount));

  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let c = chunk;
      for (let i = 0; i < 4; i++) {
        const d = c % 10;
        if (d > 0) {
          chunkStr = digits[d] + smallUnits[i] + chunkStr;
        }
        c = Math.floor(c / 10);
      }
      result = chunkStr + units[unitIdx] + (result ? ' ' + result : '');
    }
    unitIdx++;
    num = Math.floor(num / 10000);
  }

  return result.trim();
}

/**
 * 표준 물품매매(유통)계약서 엑셀 바이너리 동적 생성 엔진
 */
export async function generateTradeContractExcel(data: TradeContractExcelData): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'e-Bro ERP';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('물품매매계약서', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // 열 너비 설정 (B열부터 H열까지 정렬)
  ws.columns = [
    { width: 4 },   // A: 여백
    { width: 7 },   // B: 순번 / 항목명
    { width: 22 },  // C: 품명 / 상호
    { width: 14 },  // D: 규격 / 대표
    { width: 10 },  // E: 수량 / 항목명
    { width: 15 },  // F: 단가 / 상호
    { width: 18 },  // G: 공급가액 / 대표
    { width: 16 },  // H: 세액 / 비고
  ];

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' } // Slate 100
  };

  // Row 2: 제목
  ws.mergeCells('B2:H2');
  const titleCell = ws.getCell('B2');
  titleCell.value = '물 품 매 매 (유 통) 계 약 서';
  titleCell.font = { name: '맑은 고딕', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 40;

  // Row 4: 계약 기본정보
  ws.getCell('B4').value = `계약번호: ${data.contractNo}`;
  ws.getCell('B4').font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF475569' } };
  
  ws.mergeCells('G4:H4');
  const dateCell = ws.getCell('G4');
  dateCell.value = `계약일자: ${data.contractDate}`;
  dateCell.font = { name: '맑은 고딕', size: 10, color: { argb: 'FF475569' } };
  dateCell.alignment = { horizontal: 'right' };

  // Row 5: 전문
  ws.mergeCells('B5:H5');
  const preamble = ws.getCell('B5');
  preamble.value = '매도인(공급자)과 매수인(공급받는자)은 상호 신의성실의 원칙에 따라 아래와 같이 물품매매계약을 체결한다.';
  preamble.font = { name: '맑은 고딕', size: 9, italic: true, color: { argb: 'FF64748B' } };
  preamble.alignment = { horizontal: 'center' };

  // Row 7~12: 당사자 정보 테이블
  ws.mergeCells('B7:D7');
  const sellerHead = ws.getCell('B7');
  sellerHead.value = '공 급 자 (매 도 인)';
  sellerHead.fill = headerFill;
  sellerHead.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  sellerHead.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('E7:H7');
  const buyerHead = ws.getCell('E7');
  buyerHead.value = '공 급 받 는 자 (매 수 인)';
  buyerHead.fill = headerFill;
  buyerHead.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  buyerHead.alignment = { horizontal: 'center', vertical: 'middle' };

  const partyRows = [
    { labelS: '상 호', valS: data.seller.corpName, labelB: '상 호', valB: data.buyer.corpName },
    { labelS: '등록번호', valS: data.seller.bizNo, labelB: '등록번호', valB: data.buyer.bizNo },
    { labelS: '대 표 자', valS: data.seller.ceo, labelB: '대 표 자', valB: data.buyer.ceo },
    { labelS: '소 재 지', valS: data.seller.address, labelB: '소 재 지', valB: data.buyer.address },
    { labelS: '연 락 처', valS: `${data.seller.manager || '-'} (${data.seller.tel || '-'})`, labelB: '연 락 처', valB: `${data.buyer.manager || '-'} (${data.buyer.tel || '-'} / ${data.buyer.email || '-'})` }
  ];

  partyRows.forEach((r, idx) => {
    const rowNum = 8 + idx;
    ws.getCell(`B${rowNum}`).value = r.labelS;
    ws.getCell(`B${rowNum}`).fill = headerFill;
    ws.getCell(`B${rowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`B${rowNum}`).font = { name: '맑은 고딕', size: 9, bold: true };
    
    ws.mergeCells(`C${rowNum}:D${rowNum}`);
    ws.getCell(`C${rowNum}`).value = r.valS;
    ws.getCell(`C${rowNum}`).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell(`C${rowNum}`).font = { name: '맑은 고딕', size: 9 };

    ws.getCell(`E${rowNum}`).value = r.labelB;
    ws.getCell(`E${rowNum}`).fill = headerFill;
    ws.getCell(`E${rowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`E${rowNum}`).font = { name: '맑은 고딕', size: 9, bold: true };

    ws.mergeCells(`F${rowNum}:H${rowNum}`);
    ws.getCell(`F${rowNum}`).value = r.valB;
    ws.getCell(`F${rowNum}`).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell(`F${rowNum}`).font = { name: '맑은 고딕', size: 9 };
  });

  for (let r = 7; r <= 12; r++) {
    ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      ws.getCell(`${col}${r}`).border = thinBorder;
    });
  }

  // Row 14: 총 계약금액
  ws.mergeCells('B14:H14');
  const amtCell = ws.getCell('B14');
  const wonKorean = numberToKoreanWon(data.totalGrand);
  amtCell.value = `총 계약금액: 일금 ${wonKorean}원정 (₩${data.totalGrand.toLocaleString()} / 부가세 포함)`;
  amtCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' } // Slate 200
  };
  amtCell.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  amtCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(14).height = 28;
  ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
    ws.getCell(`${col}14`).border = thinBorder;
  });

  // Row 16: 품목 헤더
  const itemHeaders = [
    { col: 'B', text: '순번', align: 'center' },
    { col: 'C', text: '품목명', align: 'center' },
    { col: 'D', text: '규격/SKU', align: 'center' },
    { col: 'E', text: '수량', align: 'center' },
    { col: 'F', text: '단가 (원)', align: 'center' },
    { col: 'G', text: '공급가액 (원)', align: 'center' },
    { col: 'H', text: '세액 (원)', align: 'center' }
  ];

  itemHeaders.forEach(h => {
    const c = ws.getCell(`${h.col}16`);
    c.value = h.text;
    c.fill = headerFill;
    c.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: h.align as any, vertical: 'middle' };
    c.border = thinBorder;
  });
  ws.getRow(16).height = 24;

  // Row 17..: 품목 행 리스트
  let curRow = 17;
  (data.items || []).forEach((item, idx) => {
    ws.getCell(`B${curRow}`).value = item.no || idx + 1;
    ws.getCell(`B${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(`C${curRow}`).value = item.productName;
    ws.getCell(`C${curRow}`).alignment = { horizontal: 'left', vertical: 'middle' };

    ws.getCell(`D${curRow}`).value = item.skuCode || item.spec || '-';
    ws.getCell(`D${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getCell(`E${curRow}`).value = item.qty;
    ws.getCell(`E${curRow}`).numFmt = '#,##0';
    ws.getCell(`E${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    ws.getCell(`F${curRow}`).value = item.unitPrice;
    ws.getCell(`F${curRow}`).numFmt = '#,##0';
    ws.getCell(`F${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    ws.getCell(`G${curRow}`).value = item.supplyAmount;
    ws.getCell(`G${curRow}`).numFmt = '#,##0';
    ws.getCell(`G${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    ws.getCell(`H${curRow}`).value = item.vatAmount;
    ws.getCell(`H${curRow}`).numFmt = '#,##0';
    ws.getCell(`H${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      const c = ws.getCell(`${col}${curRow}`);
      c.font = { name: '맑은 고딕', size: 9 };
      c.border = thinBorder;
    });
    ws.getRow(curRow).height = 22;
    curRow++;
  });

  // 품목 합계 행
  ws.mergeCells(`B${curRow}:D${curRow}`);
  const sumLabel = ws.getCell(`B${curRow}`);
  sumLabel.value = '합 계';
  sumLabel.fill = headerFill;
  sumLabel.font = { name: '맑은 고딕', size: 9, bold: true };
  sumLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  const totalQty = (data.items || []).reduce((acc, i) => acc + i.qty, 0);
  ws.getCell(`E${curRow}`).value = totalQty;
  ws.getCell(`E${curRow}`).numFmt = '#,##0';
  ws.getCell(`E${curRow}`).font = { name: '맑은 고딕', size: 9, bold: true };
  ws.getCell(`E${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.getCell(`F${curRow}`).value = '-';
  ws.getCell(`F${curRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(`G${curRow}`).value = data.totalSupply;
  ws.getCell(`G${curRow}`).numFmt = '#,##0';
  ws.getCell(`G${curRow}`).font = { name: '맑은 고딕', size: 9, bold: true };
  ws.getCell(`G${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.getCell(`H${curRow}`).value = data.totalVat;
  ws.getCell(`H${curRow}`).numFmt = '#,##0';
  ws.getCell(`H${curRow}`).font = { name: '맑은 고딕', size: 9, bold: true };
  ws.getCell(`H${curRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

  ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
    ws.getCell(`${col}${curRow}`).border = thinBorder;
  });
  ws.getRow(curRow).height = 24;
  curRow += 2;

  // 계약 조항 섹션
  const clauses = [
    { title: '제1조 (목 적)', content: '본 계약은 매도인이 공급하는 상기 물품을 매수인이 정당하게 매수하고 그 대금을 지급함에 있어 필요한 제반 권리 및 의무 사항을 규정함을 목적으로 한다.' },
    { title: '제2조 (인도 장소 및 기한)', content: `1. 인도 장소: ${data.deliveryLocation || '매수인 지정 장소'}\n2. 납품 기한: ${data.deliveryDate || '계약 체결일로부터 상호 협의일 이내'}` },
    { title: '제3조 (대금 결제 조건)', content: data.paymentTerms || '물품 납품 및 검수 완료 후 세금계산서를 발행하며, 30일 이내에 매도인의 지정 계좌로 현금 입금한다.' },
    { title: '제4조 (검수 및 하자담보)', content: '매수인은 물품 인도일로부터 3영업일 이내에 검수를 완료하여야 하며, 외관 및 성능상 하자가 발견된 경우 매도인은 즉시 무상 교환 또는 정상품을 재납품한다.' },
    { title: '제5조 (특약 사항)', content: data.specialTerms || '기타 본 계약서에 명시되지 않은 사항은 상법 및 일반 상거래 관례에 따르며, 분쟁 발생 시 관할 법원은 매도인 본점 소재지 관할 법원으로 한다.' }
  ];

  clauses.forEach(cl => {
    ws.mergeCells(`B${curRow}:H${curRow}`);
    const cHead = ws.getCell(`B${curRow}`);
    cHead.value = cl.title;
    cHead.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF1E293B' } };
    curRow++;

    ws.mergeCells(`B${curRow}:H${curRow}`);
    const cBody = ws.getCell(`B${curRow}`);
    cBody.value = cl.content;
    cBody.font = { name: '맑은 고딕', size: 9, color: { argb: 'FF334155' } };
    cBody.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(curRow).height = cl.content.includes('\n') ? 34 : 22;
    curRow += 2;
  });

  // 서명 날인 블록
  ws.mergeCells(`B${curRow}:H${curRow}`);
  const signDateCell = ws.getCell(`B${curRow}`);
  signDateCell.value = `계약 체결일: ${data.contractDate}`;
  signDateCell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  signDateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  curRow += 2;

  // 매도인 / 매수인 날인 영역
  ws.mergeCells(`B${curRow}:D${curRow}`);
  const sellerSign = ws.getCell(`B${curRow}`);
  sellerSign.value = `매도인: ${data.seller.corpName} 대표이사 ${data.seller.ceo} (인)`;
  sellerSign.font = { name: '맑은 고딕', size: 9, bold: true };
  sellerSign.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(`E${curRow}:H${curRow}`);
  const buyerSign = ws.getCell(`E${curRow}`);
  buyerSign.value = `매수인: ${data.buyer.corpName} 대표이사 ${data.buyer.ceo} (인)`;
  buyerSign.font = { name: '맑은 고딕', size: 9, bold: true };
  buyerSign.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(curRow).height = 36;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}



import type { TenantProfile } from '../types/domain';
import type {
  FlMastSpecRow,
  FlModelTechnicalSpec,
  FlVdiSpecItem,
} from '../data/flTechnicalTypes';
import { downloadExcelFile, loadExcelJs } from './documentService';
export async function generateModelSpecExcel(params: {
  spec: FlModelTechnicalSpec;
  vdiRows: FlVdiSpecItem[];
  mastRows: FlMastSpecRow[];
  coreRows: { label: string; value: string }[];
}): Promise<void> {
  const { spec, vdiRows, mastRows, coreRows } = params;
  const ExcelJS = await loadExcelJs();
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
  title?: string;
  recipientName?: string;
  authorNote?: string;
}): Promise<void> {
  const ExcelJS = await loadExcelJs();
      const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('모델 제원 비교');
  const titleText = (params.title || '지게차 모델별 상세 제원 비교표').trim();
  const recipientText = (params.recipientName || '').trim();
  const noteText = (params.authorNote || '').trim();

  const titleRow = ws.addRow([titleText]);
  titleRow.font = { bold: true, size: 13 };
  if (recipientText) {
    const recRow = ws.addRow(['수신처 · 고객사', recipientText]);
    recRow.font = { bold: true };
  }
  ws.addRow([]);

  const headerRow = ws.addRow([
    '비교 제원 항목',
    ...params.models.map((m) => `${m.manufacturerName} ${m.modelName}`),
  ]);
  headerRow.font = { bold: true };
  ws.getColumn(1).width = 28;
  params.models.forEach((_, i) => {
    ws.getColumn(i + 2).width = 30;
  });
  params.rows.forEach((r) => ws.addRow([r.label, ...r.values]));
  if (noteText) {
    ws.addRow([]);
    const noteRow = ws.addRow(['검토 의견 · 특기사항', noteText]);
    noteRow.getCell(1).font = { bold: true };
  }
  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  downloadExcelFile(`지게차_모델별_제원비교_${params.models.length}종.xlsx`, new Uint8Array(ab));
}

const PDF_FONT_STACK = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export function downloadPdfFile(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PDF 캔버스 이미지 변환에 실패했습니다.'));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(new Error('PNG 바이트 읽기에 실패했습니다.'));
      reader.readAsArrayBuffer(blob);
    }, 'image/png');
  });
}

function truncateLineToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let cut = text.length;
  while (cut > 0 && ctx.measureText(`${text.slice(0, cut)}...`).width > maxW) {
    cut -= 1;
  }
  return cut > 0 ? `${text.slice(0, cut)}...` : '...';
}

function splitTextIntoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines = 2
): string[] {
  const clean = String(text || '-').replace(/\s+/g, ' ').trim() || '-';
  if (ctx.measureText(clean).width <= maxW) return [clean];
  if (maxLines <= 1) return [truncateLineToWidth(ctx, clean, maxW)];

  const lines: string[] = [];
  let cursor = 0;
  for (let lineIdx = 0; lineIdx < maxLines && cursor < clean.length; lineIdx += 1) {
    if (lineIdx === maxLines - 1) {
      lines.push(truncateLineToWidth(ctx, clean.slice(cursor).trim(), maxW));
      break;
    }
    let end = cursor + 1;
    while (end <= clean.length && ctx.measureText(clean.slice(cursor, end)).width <= maxW) {
      end += 1;
    }
    let sliceEnd = Math.max(cursor + 1, end - 1);
    const spaceBreak = clean.lastIndexOf(' ', sliceEnd);
    if (spaceBreak > cursor + 4 && sliceEnd < clean.length) {
      sliceEnd = spaceBreak;
    }
    lines.push(clean.slice(cursor, sliceEnd).trim());
    cursor = sliceEnd;
    while (cursor < clean.length && clean[cursor] === ' ') cursor += 1;
  }
  return lines.filter((l) => l.length > 0);
}

function sanitizeFileSegment(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-');
}

export async function generateCompareSpecsPdf(params: {
  models: FlModelTechnicalSpec[];
  rows: { label: string; values: string[] }[];
  tenant: TenantProfile;
  title?: string;
  recipientName?: string;
  authorNote?: string;
}): Promise<{ fileName: string; bytes: Uint8Array }> {
  const displayModels = params.models.slice(0, 5);
  if (displayModels.length === 0) {
    throw new Error('비교할 장비 기종을 1종 이상 선택해 주세요.');
  }
  if (params.rows.length === 0) {
    throw new Error('출력할 비교 제원 항목이 1개 이상 필요합니다.');
  }

  const today = new Date().toISOString().split('T')[0];
  const docTitle = (params.title || '지게차 모델별 상세 제원 비교표').trim();
  const recipient = (params.recipientName || '').trim();
  const noteText = (params.authorNote || '').trim();
  const hasNote = noteText.length > 0;

  const LOGICAL_W = 1754;
  const LOGICAL_H = 1240;
  const SCALE = 2;
  const tableLeft = 44;
  const tableTop = 130;
  const tableWidth = LOGICAL_W - 88;
  const labelColWidth = 230;
  const modelColWidth = Math.floor((tableWidth - labelColWidth) / displayModels.length);
  const headerH = 56;
  const footerH = 38;
  const noteH = hasNote ? 66 : 0;

  const minRowH = 36;
  const singlePageAvailable = LOGICAL_H - (tableTop + headerH) - noteH - footerH - 14;
  const maxRowsWithNote = Math.max(1, Math.floor(singlePageAvailable / minRowH));
  const maxRowsNoNote = Math.max(1, Math.floor((LOGICAL_H - (tableTop + headerH) - footerH - 14) / minRowH));

  const chunks: { label: string; values: string[] }[][] = [];
  if (params.rows.length <= maxRowsWithNote) {
    chunks.push(params.rows);
  } else {
    let idx = 0;
    while (idx < params.rows.length) {
      const remaining = params.rows.length - idx;
      const sliceLen = remaining <= maxRowsWithNote ? remaining : Math.min(maxRowsNoNote, remaining);
      chunks.push(params.rows.slice(idx, idx + sliceLen));
      idx += sliceLen;
    }
    // If last chunk exceeds singlePageAvailable when note is present, move overflow into a final note page
    const lastIdx = chunks.length - 1;
    if (hasNote && chunks[lastIdx].length > maxRowsWithNote) {
      const lastChunk = chunks[lastIdx];
      chunks[lastIdx] = lastChunk.slice(0, maxRowsWithNote);
      chunks.push(lastChunk.slice(maxRowsWithNote));
    }
  }

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let pageIdx = 0; pageIdx < chunks.length; pageIdx += 1) {
    const chunkRows = chunks[pageIdx];
    const isLastPage = pageIdx === chunks.length - 1;
    const activeNoteH = isLastPage && hasNote ? noteH : 0;
    const availableBodyH = LOGICAL_H - (tableTop + headerH) - activeNoteH - footerH - 14;
    const rowH = Math.max(minRowH, Math.min(54, Math.floor(availableBodyH / Math.max(1, chunkRows.length))));

    const canvas = document.createElement('canvas');
    canvas.width = LOGICAL_W * SCALE;
    canvas.height = LOGICAL_H * SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('PDF 2D 렌더링 컨텍스트를 생성하지 못했습니다.');
    }
    ctx.scale(SCALE, SCALE);

    // 용지 배경
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 상단 헤더 바 (단색 솔리드)
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, LOGICAL_W, 116);

    ctx.fillStyle = '#93C5FD';
    ctx.font = `bold 17px ${PDF_FONT_STACK}`;
    ctx.fillText(`${params.tenant.corporateName} · VDI 2198 기술제원 비교서`, 44, 38);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 30px ${PDF_FONT_STACK}`;
    const leftTitleText = truncateLineToWidth(ctx, `${docTitle} · ${displayModels.length}종`, 980);
    ctx.fillText(leftTitleText, 44, 82);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = `600 14.5px ${PDF_FONT_STACK}`;
    const metaRight1 = `발행일: ${today} · 발행처: ${params.tenant.displayName} · ${params.tenant.tel}`;
    ctx.fillText(metaRight1, LOGICAL_W - 44 - ctx.measureText(metaRight1).width, 46);
    if (recipient) {
      const recLine = truncateLineToWidth(ctx, `수신처: ${recipient}`, 640);
      ctx.fillStyle = '#FDE68A';
      ctx.font = `bold 16px ${PDF_FONT_STACK}`;
      ctx.fillText(recLine, LOGICAL_W - 44 - ctx.measureText(recLine).width, 82);
    }

    // 비교표 헤더 행
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(tableLeft, tableTop, tableWidth, headerH);
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, tableTop, tableWidth, headerH);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 16px ${PDF_FONT_STACK}`;
    ctx.fillText('비교 제원 항목', tableLeft + 14, tableTop + 34);

    displayModels.forEach((m, colIdx) => {
      const colX = tableLeft + labelColWidth + colIdx * modelColWidth;
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(colX, tableTop);
      ctx.lineTo(colX, tableTop + headerH);
      ctx.stroke();

      ctx.fillStyle = '#93C5FD';
      ctx.font = `bold 12px ${PDF_FONT_STACK}`;
      ctx.fillText(
        truncateLineToWidth(ctx, `${m.manufacturerName} · ${m.originCountry}`, modelColWidth - 20),
        colX + 10,
        tableTop + 21
      );

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold 17px ${PDF_FONT_STACK}`;
      ctx.fillText(truncateLineToWidth(ctx, m.modelName, modelColWidth - 20), colX + 10, tableTop + 44);
    });

    // 비교표 본문 행
    let currentY = tableTop + headerH;
    chunkRows.forEach((row, rIdx) => {
      ctx.fillStyle = rIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(tableLeft, currentY, tableWidth, rowH);

      ctx.fillStyle = '#EFF6FF';
      ctx.fillRect(tableLeft, currentY, labelColWidth, rowH);

      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(tableLeft, currentY, tableWidth, rowH);

      ctx.fillStyle = '#1E3A8A';
      ctx.font = `bold 13.5px ${PDF_FONT_STACK}`;
      const labelLines = splitTextIntoLines(ctx, row.label, labelColWidth - 22, 2);
      if (labelLines.length === 1) {
        ctx.fillText(labelLines[0], tableLeft + 12, currentY + Math.round(rowH * 0.62));
      } else {
        ctx.fillText(labelLines[0], tableLeft + 12, currentY + Math.round(rowH * 0.42));
        ctx.fillText(labelLines[1], tableLeft + 12, currentY + Math.round(rowH * 0.78));
      }

      displayModels.forEach((_, colIdx) => {
        const colX = tableLeft + labelColWidth + colIdx * modelColWidth;
        ctx.strokeStyle = '#CBD5E1';
        ctx.beginPath();
        ctx.moveTo(colX, currentY);
        ctx.lineTo(colX, currentY + rowH);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = `600 13px ${PDF_FONT_STACK}`;
        const val = row.values[colIdx] ?? '-';
        const lines = splitTextIntoLines(ctx, val, modelColWidth - 20, 2);
        if (lines.length === 1) {
          ctx.fillText(lines[0], colX + 10, currentY + Math.round(rowH * 0.62));
        } else {
          ctx.fillText(lines[0], colX + 10, currentY + Math.round(rowH * 0.42));
          ctx.fillText(lines[1], colX + 10, currentY + Math.round(rowH * 0.78));
        }
      });

      currentY += rowH;
    });

    // 마지막 페이지 검토 의견 박스
    if (isLastPage && hasNote) {
      const boxY = currentY + 12;
      const boxH = 54;
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(tableLeft, boxY, tableWidth, boxH);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.strokeRect(tableLeft, boxY, tableWidth, boxH);

      ctx.fillStyle = '#1E3A8A';
      ctx.font = `bold 13.5px ${PDF_FONT_STACK}`;
      ctx.fillText('검토 의견 · 특기사항:', tableLeft + 14, boxY + 23);

      ctx.fillStyle = '#0F172A';
      ctx.font = `600 13.5px ${PDF_FONT_STACK}`;
      const noteLines = splitTextIntoLines(ctx, noteText, tableWidth - 180, 2);
      ctx.fillText(noteLines[0] || '', tableLeft + 165, boxY + 23);
      if (noteLines[1]) {
        ctx.fillText(noteLines[1], tableLeft + 14, boxY + 44);
      }
    }

    // 하단 푸터
    ctx.fillStyle = '#475569';
    ctx.font = `600 13px ${PDF_FONT_STACK}`;
    const footerLeft = `${params.tenant.corporateName} · 사업자등록번호 ${params.tenant.businessNumber} · ${params.tenant.businessAddress} · 대표전화 ${params.tenant.tel}`;
    ctx.fillText(truncateLineToWidth(ctx, footerLeft, LOGICAL_W - 220), 44, LOGICAL_H - 16);
    if (chunks.length > 1) {
      const pageLabel = `페이지 ${pageIdx + 1} / ${chunks.length}`;
      ctx.fillText(pageLabel, LOGICAL_W - 44 - ctx.measureText(pageLabel).width, LOGICAL_H - 16);
    }

    const pngBytes = await canvasToPngBytes(canvas);
    const page = pdfDoc.addPage([841.89, 595.28]);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: 841.89,
      height: 595.28,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const modelSegs = displayModels.map((m) => sanitizeFileSegment(m.modelName)).join('_');
  const fileName = `지게차_제원비교표_${modelSegs}_${today}.pdf`;
  return { fileName, bytes: new Uint8Array(pdfBytes) };
}

export async function generateModelSpecPdf(params: {
  spec: FlModelTechnicalSpec;
  coreRows: { label: string; value: string }[];
  tenant: TenantProfile;
}): Promise<{ fileName: string; bytes: Uint8Array }> {
  const { spec, coreRows, tenant } = params;
  const today = new Date().toISOString().split('T')[0];
  const LOGICAL_W = 1240;
  const LOGICAL_H = 1754;
  const SCALE = 2;

  const canvas = document.createElement('canvas');
  canvas.width = LOGICAL_W * SCALE;
  canvas.height = LOGICAL_H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('PDF 2D 렌더링 컨텍스트를 생성하지 못했습니다.');
  }
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // 상단 헤더
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, LOGICAL_W, 152);

  ctx.fillStyle = '#93C5FD';
  ctx.font = `bold 19px ${PDF_FONT_STACK}`;
  ctx.fillText(`${tenant.corporateName} · ${spec.manufacturerName} · ${spec.originCountry} 공식 기술제원표`, 52, 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 34px ${PDF_FONT_STACK}`;
  ctx.fillText(truncateLineToWidth(ctx, `${spec.modelName} · ${spec.seriesName}`, LOGICAL_W - 104), 52, 94);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = `600 16px ${PDF_FONT_STACK}`;
  ctx.fillText(
    `차종구분: ${spec.equipmentClass} · 동력방식: ${spec.powerType} · 문서코드: ${spec.id}`,
    52,
    130
  );

  const tableLeft = 52;
  const tableWidth = LOGICAL_W - 104;
  let y = 196;

  // 섹션 1: 핵심 기술제원 2열 표
  ctx.fillStyle = '#0F172A';
  ctx.font = `bold 22px ${PDF_FONT_STACK}`;
  ctx.fillText('1. 표준 기술제원 요약표', tableLeft, y);
  y += 16;

  const displayCore = coreRows.slice(0, 24);
  const pairCount = Math.ceil(displayCore.length / 2);
  const labelW = 215;
  const valW = (tableWidth - labelW * 2) / 2;
  const coreRowH = 42;

  for (let i = 0; i < pairCount; i += 1) {
    const leftCell = displayCore[i * 2];
    const rightCell = displayCore[i * 2 + 1];
    const rowY = y + i * coreRowH;

    ctx.fillStyle = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    ctx.fillRect(tableLeft, rowY, tableWidth, coreRowH);

    ctx.fillStyle = '#EFF6FF';
    ctx.fillRect(tableLeft, rowY, labelW, coreRowH);
    ctx.fillRect(tableLeft + labelW + valW, rowY, labelW, coreRowH);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, rowY, tableWidth, coreRowH);

    ctx.beginPath();
    ctx.moveTo(tableLeft + labelW, rowY);
    ctx.lineTo(tableLeft + labelW, rowY + coreRowH);
    ctx.moveTo(tableLeft + labelW + valW, rowY);
    ctx.lineTo(tableLeft + labelW + valW, rowY + coreRowH);
    ctx.moveTo(tableLeft + labelW * 2 + valW, rowY);
    ctx.lineTo(tableLeft + labelW * 2 + valW, rowY + coreRowH);
    ctx.stroke();

    if (leftCell) {
      ctx.fillStyle = '#1E3A8A';
      ctx.font = `bold 14px ${PDF_FONT_STACK}`;
      ctx.fillText(truncateLineToWidth(ctx, leftCell.label, labelW - 18), tableLeft + 10, rowY + 26);

      ctx.fillStyle = '#0F172A';
      ctx.font = `600 14.5px ${PDF_FONT_STACK}`;
      ctx.fillText(truncateLineToWidth(ctx, leftCell.value, valW - 18), tableLeft + labelW + 10, rowY + 26);
    }
    if (rightCell) {
      ctx.fillStyle = '#1E3A8A';
      ctx.font = `bold 14px ${PDF_FONT_STACK}`;
      ctx.fillText(truncateLineToWidth(ctx, rightCell.label, labelW - 18), tableLeft + labelW + valW + 10, rowY + 26);

      ctx.fillStyle = '#0F172A';
      ctx.font = `600 14.5px ${PDF_FONT_STACK}`;
      ctx.fillText(
        truncateLineToWidth(ctx, rightCell.value, valW - 18),
        tableLeft + labelW * 2 + valW + 10,
        rowY + 26
      );
    }
  }

  y += pairCount * coreRowH + 36;

  // 섹션 2: 동력계 · 타이어 · 제동 · 보증 상세
  ctx.fillStyle = '#0F172A';
  ctx.font = `bold 22px ${PDF_FONT_STACK}`;
  ctx.fillText('2. 동력계 · 타이어 · 제동 · 보증 사양', tableLeft, y);
  y += 16;

  const detailItems: [string, string][] = [
    ['배터리 · 엔진 상세', spec.powerSpecDetail],
    ['모터 · 출력 및 제어', spec.motorOrEngineDetail],
    ['충전기 · 연료계통', spec.chargerOrFuelDetail],
    ['타이어 규격 전·후', spec.tireSpecFrontRear],
    ['제동 시스템', spec.brakeType],
    ['공식 보증 기준', spec.warrantyTerms],
  ];
  const detRowH = 44;
  detailItems.forEach((item, idx) => {
    const rowY = y + idx * detRowH;
    ctx.fillStyle = '#EFF6FF';
    ctx.fillRect(tableLeft, rowY, 230, detRowH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(tableLeft + 230, rowY, tableWidth - 230, detRowH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.strokeRect(tableLeft, rowY, tableWidth, detRowH);
    ctx.beginPath();
    ctx.moveTo(tableLeft + 230, rowY);
    ctx.lineTo(tableLeft + 230, rowY + detRowH);
    ctx.stroke();

    ctx.fillStyle = '#1E3A8A';
    ctx.font = `bold 14.5px ${PDF_FONT_STACK}`;
    ctx.fillText(item[0], tableLeft + 12, rowY + 27);

    ctx.fillStyle = '#0F172A';
    ctx.font = `600 14.5px ${PDF_FONT_STACK}`;
    ctx.fillText(truncateLineToWidth(ctx, item[1], tableWidth - 254), tableLeft + 242, rowY + 27);
  });

  y += detailItems.length * detRowH + 34;

  // 섹션 3: 안전 사양 · 예방정비 요약
  const boxW = Math.floor((tableWidth - 20) / 2);
  const remainingBoxH = Math.max(200, LOGICAL_H - y - 64);

  const drawListBox = (bx: number, title: string, linesList: string[]) => {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(bx, y, boxW, remainingBoxH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.strokeRect(bx, y, boxW, remainingBoxH);

    ctx.fillStyle = '#0F172A';
    ctx.font = `bold 18px ${PDF_FONT_STACK}`;
    ctx.fillText(title, bx + 16, y + 32);

    ctx.font = `500 14.5px ${PDF_FONT_STACK}`;
    ctx.fillStyle = '#334155';
    let ly = y + 66;
    for (const item of linesList.slice(0, 6)) {
      const wrapped = splitTextIntoLines(ctx, `• ${item}`, boxW - 32, 2);
      for (const wl of wrapped) {
        if (ly > y + remainingBoxH - 16) break;
        ctx.fillText(wl, bx + 16, ly);
        ly += 22;
      }
      ly += 6;
    }
  };

  drawListBox(tableLeft, '3. 주요 안전 사양', spec.safetyFeatures);
  drawListBox(tableLeft + boxW + 20, '4. 가동시간별 예방정비 기준', spec.periodicMaintenance);

  // 하단 푸터
  ctx.fillStyle = '#475569';
  ctx.font = `600 14px ${PDF_FONT_STACK}`;
  ctx.fillText(
    `${tenant.corporateName} · 사업자등록번호 ${tenant.businessNumber} · 발행일 ${today} · 대표전화 ${tenant.tel}`,
    tableLeft,
    LOGICAL_H - 22
  );

  const pngBytes = await canvasToPngBytes(canvas);
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const pngImage = await pdfDoc.embedPng(pngBytes);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: 595.28,
    height: 841.89,
  });

  const pdfBytes = await pdfDoc.save();
  const fileName = `${sanitizeFileSegment(spec.manufacturerName)}_${sanitizeFileSegment(spec.modelName)}_공식기술제원표.pdf`;
  return { fileName, bytes: new Uint8Array(pdfBytes) };
}

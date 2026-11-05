import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  FileText,
  Download,
  Eye,
  Upload,
  Search,
  RefreshCw,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Wrench,
  X,
  ExternalLink,
  CheckSquare,
  Square,
  FolderOpen
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  FL_TECHNICAL_ARCHIVE,
  FlModelTechnicalSpec,
  FlArchivedDocument
} from '../../data/flTechnicalArchive';
import { exportToExcel } from '../../services/excel';

interface R2ArchiveFile {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
}

const R2_PUBLIC_DOMAIN = 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev';

// 고해상도 한국어 공식 제원표·예방정비 지침서 A4 PDF 즉시 생성기
async function generateKoreanSpecSheetPdf(spec: FlModelTechnicalSpec): Promise<void> {
  const width = 1240;
  const height = 1754; // A4 150 DPI
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 상단 헤더 바
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, 165);

  ctx.fillStyle = '#60A5FA';
  ctx.font = 'bold 22px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText(`${spec.manufacturerName} | ${spec.originCountry} 공식 기술문서 아카이브`, 60, 52);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 38px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText(`${spec.modelName} — ${spec.seriesName}`, 60, 104);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 18px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText(`차종구분: ${spec.equipmentClass} | 동력방식: ${spec.powerType} | 문서코드: ${spec.id}`, 60, 140);

  let y = 215;

  // 섹션 1: 표준 기술제원표
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('1. 표준 기술제원표', 60, y);
  y += 18;

  const specRows: [string, string, string, string][] = [
    ['정격 적재하중', `${spec.ratedCapacityKg.toLocaleString()} kg`, '하중중심 거리', `${spec.loadCenterMm} mm`],
    ['표준 인상높이', `${spec.standardLiftHeightMm.toLocaleString()} mm`, '최대 옵션 인상높이', `${spec.maxOptionLiftHeightMm.toLocaleString()} mm`],
    ['자유 인상높이', `${spec.freeLiftHeightMm.toLocaleString()} mm`, '포크 규격', `${spec.forkDimensionsMm} mm`],
    ['전장 (포크 전면까지)', `${spec.overallLengthMm.toLocaleString()} mm`, '전폭 / 헤드가드 높이', `${spec.overallWidthMm.toLocaleString()} / ${spec.overheadGuardHeightMm.toLocaleString()} mm`],
    ['최소 회전반경', `${spec.turningRadiusMm.toLocaleString()} mm`, '직각 적재 통로폭', `${spec.aisleWidth1000x1200Mm.toLocaleString()} mm`],
    ['주행속도 (적재/공차)', `${spec.travelSpeedKmh} km/h`, '인상속도 (적재/공차)', `${spec.liftingSpeedMms} mm/s`],
    ['최대 등판능력', `${spec.gradeabilityPercent} %`, '장비 총중량 (자중)', `${spec.serviceWeightKg.toLocaleString()} kg`],
    ['제동 시스템', spec.brakeType, '방수 및 작업환경 등급', spec.waterproofRating]
  ];

  const tableLeft = 60;
  const tableWidth = width - 120;
  const colWidths = [220, 340, 220, 340];
  const rowH = 44;

  specRows.forEach((row, idx) => {
    const rowY = y + idx * rowH;
    ctx.fillStyle = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    ctx.fillRect(tableLeft, rowY, tableWidth, rowH);

    // 라벨 배경
    ctx.fillStyle = '#EFF6FF';
    ctx.fillRect(tableLeft, rowY, colWidths[0], rowH);
    ctx.fillRect(tableLeft + colWidths[0] + colWidths[1], rowY, colWidths[2], rowH);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, rowY, tableWidth, rowH);

    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 17px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(row[0], tableLeft + 14, rowY + 28);
    ctx.fillText(row[2], tableLeft + colWidths[0] + colWidths[1] + 14, rowY + 28);

    ctx.fillStyle = '#0F172A';
    ctx.font = '600 17px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(row[1], tableLeft + colWidths[0] + 14, rowY + 28);
    ctx.fillText(row[3], tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + 14, rowY + 28);
  });

  y += specRows.length * rowH + 34;

  // 섹션 2: 동력계 · 충전 · 타이어 · 보증 사양
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('2. 동력계 · 충전 · 타이어 · 품질보증 상세', 60, y);
  y += 16;

  const detailItems: [string, string][] = [
    ['배터리 / 엔진 사양', spec.powerSpecDetail],
    ['구동 및 유압 출력', spec.motorOrEngineDetail],
    ['충전기 / 연료 계통', spec.chargerOrFuelDetail],
    ['타이어 규격 (전/후)', spec.tireSpecFrontRear],
    ['공식 보증 기준', spec.warrantyTerms]
  ];

  detailItems.forEach((item, idx) => {
    const rowY = y + idx * 42;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(tableLeft, rowY, 220, 42);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(tableLeft + 220, rowY, tableWidth - 220, 42);
    ctx.strokeStyle = '#CBD5E1';
    ctx.strokeRect(tableLeft, rowY, tableWidth, 42);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 17px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(item[0], tableLeft + 14, rowY + 27);

    ctx.fillStyle = '#0F172A';
    ctx.font = '600 17px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(item[1], tableLeft + 236, rowY + 27);
  });

  y += detailItems.length * 42 + 38;

  // 섹션 3: 핵심 안전 사양 및 운전자 일일점검 수칙
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('3. 핵심 안전기능 및 작업 전 일일점검 수칙', 60, y);
  y += 16;

  const boxH = 225;
  ctx.fillStyle = '#F0FDF4';
  ctx.fillRect(tableLeft, y, tableWidth, boxH);
  ctx.strokeStyle = '#86EFAC';
  ctx.strokeRect(tableLeft, y, tableWidth, boxH);

  let lineY = y + 32;
  ctx.fillStyle = '#166534';
  ctx.font = 'bold 18px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('[표준 안전기능]', tableLeft + 18, lineY);
  lineY += 28;
  ctx.fillStyle = '#14532D';
  ctx.font = '500 16.5px "Pretendard", "Malgun Gothic", sans-serif';
  spec.safetyFeatures.forEach(s => {
    ctx.fillText(`• ${s}`, tableLeft + 24, lineY);
    lineY += 26;
  });

  lineY += 8;
  ctx.fillStyle = '#1E40AF';
  ctx.font = 'bold 18px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('[운전자 작업 전 일일점검 필수 항목]', tableLeft + 18, lineY);
  lineY += 28;
  ctx.fillStyle = '#1E3A8A';
  ctx.font = '500 16.5px "Pretendard", "Malgun Gothic", sans-serif';
  spec.dailyChecklist.forEach(c => {
    ctx.fillText(`• ${c}`, tableLeft + 24, lineY);
    lineY += 26;
  });

  y += boxH + 36;

  // 섹션 4: 가동시간별 예방정비 주기
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('4. 가동시간별 정기 예방정비 기준', 60, y);
  y += 16;

  const pmBoxH = 140;
  ctx.fillStyle = '#FFFBEB';
  ctx.fillRect(tableLeft, y, tableWidth, pmBoxH);
  ctx.strokeStyle = '#FCD34D';
  ctx.strokeRect(tableLeft, y, tableWidth, pmBoxH);

  let pmY = y + 34;
  ctx.fillStyle = '#92400E';
  ctx.font = '600 17px "Pretendard", "Malgun Gothic", sans-serif';
  spec.periodicMaintenance.forEach(pm => {
    ctx.fillText(`• ${pm}`, tableLeft + 24, pmY);
    pmY += 32;
  });

  // 하단 푸터
  ctx.fillStyle = '#64748B';
  ctx.font = '500 15px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText(
    `발급일시: ${new Date().toISOString().split('T')[0]} | 지게차 유통·기술문서 통합 아카이브 공식 출력물`,
    60,
    height - 40
  );

  const pngBytes: Uint8Array = await new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('캔버스 변환 실패'));
      const reader = new FileReader();
      reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    }, 'image/png');
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const pngImage = await pdfDoc.embedPng(pngBytes);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: 595.28,
    height: 841.89
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${spec.manufacturerName}_${spec.modelName}_공식기술제원표.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 고해상도 A4 가로 제원 비교표 PDF 생성기
async function generateCompareSpecsPdf(models: FlModelTechnicalSpec[]): Promise<void> {
  if (models.length === 0) return;

  const width = 1754; // A4 Landscape 150 DPI
  const height = 1240;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 상단 헤더 바
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, 130);

  ctx.fillStyle = '#60A5FA';
  ctx.font = 'bold 20px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('지게차 제원 · 매뉴얼 보관함 공식 출력물', 50, 44);

  const displayModels = models.slice(0, 6);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px "Pretendard", "Malgun Gothic", sans-serif';
  const modelNamesSummary = displayModels.map(m => m.modelName).join(' vs ');
  ctx.fillText(`지게차 모델별 상세 제원 비교표 · ${displayModels.length}종 (최대 6종)`, 50, 92);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 16px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText(`비교 대상: ${modelNamesSummary}`, width - 50 - Math.min(ctx.measureText(`비교 대상: ${modelNamesSummary}`).width, 700), 92);

  const tableLeft = 50;
  const tableTop = 154;
  const tableWidth = width - 100;
  const labelColWidth = 240;
  const modelColWidth = Math.floor((tableWidth - labelColWidth) / displayModels.length);

  // 테이블 헤더
  const headerH = 66;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(tableLeft, tableTop, tableWidth, headerH);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 17px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText('비교 제원 항목', tableLeft + 16, tableTop + 40);

  displayModels.forEach((m, i) => {
    const colX = tableLeft + labelColWidth + i * modelColWidth;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colX, tableTop);
    ctx.lineTo(colX, tableTop + headerH);
    ctx.stroke();

    ctx.fillStyle = '#93C5FD';
    ctx.font = 'bold 13px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(`${m.manufacturerName} · ${m.originCountry}`, colX + 14, tableTop + 25);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 19px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(m.modelName, colX + 14, tableTop + 50);
  });

  const compareRows: { label: string; render: (m: FlModelTechnicalSpec) => string }[] = [
    { label: '시리즈명', render: m => m.seriesName },
    { label: '차종 / 동력방식', render: m => `${m.equipmentClass} / ${m.powerType}` },
    { label: '정격 적재하중', render: m => `${m.ratedCapacityKg.toLocaleString()} kg · 하중중심 ${m.loadCenterMm} mm` },
    { label: '표준 / 최대 인상높이', render: m => `${m.standardLiftHeightMm.toLocaleString()} mm / ${m.maxOptionLiftHeightMm.toLocaleString()} mm` },
    { label: '포크 규격', render: m => `${m.forkDimensionsMm} mm` },
    { label: '차체 치수 (전장×전폭×전고)', render: m => `${m.overallLengthMm} × ${m.overallWidthMm} × ${m.overheadGuardHeightMm} mm` },
    { label: '최소 회전반경', render: m => `${m.turningRadiusMm.toLocaleString()} mm` },
    { label: '직각 적재 통로폭', render: m => `${m.aisleWidth1000x1200Mm.toLocaleString()} mm` },
    { label: '주행속도 / 인상속도', render: m => `${m.travelSpeedKmh} km/h | ${m.liftingSpeedMms} mm/s` },
    { label: '최대 등판능력', render: m => `${m.gradeabilityPercent} %` },
    { label: '장비 자중', render: m => `${m.serviceWeightKg.toLocaleString()} kg` },
    { label: '배터리 / 엔진 사양', render: m => m.powerSpecDetail },
    { label: '충전기 / 연료·변속기', render: m => m.chargerOrFuelDetail },
    { label: '제동장치 / 방수등급', render: m => `${m.brakeType} / ${m.waterproofRating}` },
    { label: '공식 보증기간', render: m => m.warrantyTerms }
  ];

  const rowH = 60;
  let currentY = tableTop + headerH;

  const truncateText = (text: string, maxW: number) => {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 0 && ctx.measureText(s + '...').width > maxW) {
      s = s.slice(0, -1);
    }
    return s + '...';
  };

  compareRows.forEach((row, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    ctx.fillRect(tableLeft, currentY, tableWidth, rowH);

    // 좌측 항목 라벨 셀
    ctx.fillStyle = '#EFF6FF';
    ctx.fillRect(tableLeft, currentY, labelColWidth, rowH);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, currentY, tableWidth, rowH);

    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 15px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText(row.label, tableLeft + 16, currentY + 36);

    displayModels.forEach((m, i) => {
      const colX = tableLeft + labelColWidth + i * modelColWidth;
      ctx.strokeStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.moveTo(colX, currentY);
      ctx.lineTo(colX, currentY + rowH);
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 14.5px "Pretendard", "Malgun Gothic", sans-serif';
      const val = row.render(m);
      const maxCellW = modelColWidth - 24;
      if (ctx.measureText(val).width <= maxCellW) {
        ctx.fillText(val, colX + 12, currentY + 36);
      } else {
        // 2줄 분할 렌더링
        let splitIdx = Math.floor(val.length / 2);
        for (let k = 1; k < val.length; k++) {
          if (ctx.measureText(val.slice(0, k)).width > maxCellW) {
            splitIdx = k - 1;
            break;
          }
        }
        const line1 = val.slice(0, splitIdx);
        const line2 = truncateText(val.slice(splitIdx).trim(), maxCellW);
        ctx.fillText(line1, colX + 12, currentY + 25);
        ctx.fillText(line2, colX + 12, currentY + 46);
      }
    });

    currentY += rowH;
  });

  // 하단 푸터
  ctx.fillStyle = '#64748B';
  ctx.font = '500 14px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillText(
    `발급일시: ${new Date().toISOString().split('T')[0]} | 지게차 제원 · 매뉴얼 보관함 비교 출력물`,
    50,
    height - 26
  );

  const pngBytes: Uint8Array = await new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('캔버스 변환 실패'));
      const reader = new FileReader();
      reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    }, 'image/png');
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([841.89, 595.28]); // A4 Landscape
  const pngImage = await pdfDoc.embedPng(pngBytes);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: 841.89,
    height: 595.28
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `지게차_제원비교표_${displayModels.map(m => m.modelName).join('_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const ForkliftDocArchivePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'MODELS' | 'COMPARE' | 'DOCUMENTS'>('MODELS');

  // 필터 상태
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('ALL');
  const [powerFilter, setPowerFilter] = useState<string>('ALL');
  const [capacityFilter, setCapacityFilter] = useState<string>('ALL');
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 선택된 모델 상세 도시에
  const [selectedModel, setSelectedModel] = useState<FlModelTechnicalSpec>(FL_TECHNICAL_ARCHIVE[0]);

  // 비교 대상 모델 ID 목록 (기본 3개 유명 모델 선택)
  const [compareIds, setCompareIds] = useState<string[]>([
    'FL-SPEC-HELI-CPD25-GB2LI',
    'FL-SPEC-BYD-ECB30C',
    'FL-SPEC-HYUNDAI-25B9U',
    'FL-SPEC-TOYOTA-8FB25'
  ]);

  // 인라인 PDF 미리보기 모달
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; r2Url: string } | null>(null);

  // 클라우드 R2 FL_doc 아카이브 파일 목록 및 업로드 상태
  const [r2Files, setR2Files] = useState<R2ArchiveFile[]>([]);
  const [loadingR2, setLoadingR2] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadTargetModel, setUploadTargetModel] = useState<string>('CPD25-GB2Li');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  // Cloudflare R2 FL_doc/ 폴더 조회
  const fetchR2Archive = async () => {
    setLoadingR2(true);
    try {
      const res = await fetch('/api/r2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          prefix: 'FL_doc/'
        })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        const mapped: R2ArchiveFile[] = data.files
          .filter((f: any) => !f.isDirectory && f.key !== 'FL_doc/')
          .map((f: any) => {
            const parts = String(f.key).split('/');
            const name = parts[parts.length - 1];
            return {
              key: f.key,
              name,
              size: f.size || 0,
              lastModified: f.lastModified || '',
              url: `${R2_PUBLIC_DOMAIN}/${encodeURIComponent(f.key).replace(/%2F/g, '/')}`
            };
          });
        setR2Files(mapped);
      }
    } catch {
      // 로컬 환경 또는 오프라인 시 정적 아카이브 유지
    } finally {
      setLoadingR2(false);
    }
  };

  useEffect(() => {
    fetchR2Archive();
  }, []);

  // 신규 공식문서 PDF 클라우드 R2 아카이빙 업로드
  const handleUploadNewDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const safeFileName = `${uploadTargetModel}_${file.name.replace(/\s+/g, '_')}`;
      const res = await fetch('/api/r2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload',
          key: `FL_doc/${safeFileName}`,
          contentBase64: base64,
          contentType: file.type || 'application/pdf'
        })
      });
      const json = await res.json();
      if (json.success) {
        showToast(`[${safeFileName}] 공식 문서가 클라우드 아카이브에 저장되었습니다.`);
        await fetchR2Archive();
      } else {
        showToast(json.error || '문서 업로드에 실패했습니다.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || '문서 업로드 중 오류가 발생했습니다.', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 필터링된 모델 목록
  const filteredModels = useMemo(() => {
    return FL_TECHNICAL_ARCHIVE.filter(m => {
      if (manufacturerFilter !== 'ALL' && m.manufacturerCode !== manufacturerFilter) return false;
      if (powerFilter !== 'ALL' && m.powerType !== powerFilter) return false;
      if (capacityFilter === 'LE_2000' && m.ratedCapacityKg > 2000) return false;
      if (capacityFilter === 'EQ_2500' && m.ratedCapacityKg !== 2500) return false;
      if (capacityFilter === 'EQ_3000' && m.ratedCapacityKg !== 3000) return false;
      if (capacityFilter === 'GE_3500' && m.ratedCapacityKg < 3500) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const hay = [
          m.manufacturerName,
          m.modelName,
          m.seriesName,
          m.powerSpecDetail,
          m.motorOrEngineDetail,
          ...m.documents.map(d => d.title)
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [manufacturerFilter, powerFilter, capacityFilter, searchTerm]);

  // 전체 공식 문서 플랫 목록
  const allDocuments = useMemo(() => {
    const list: Array<FlArchivedDocument & { manufacturerName: string; modelName: string; powerType: string }> = [];
    FL_TECHNICAL_ARCHIVE.forEach(m => {
      m.documents.forEach(d => {
        if (docCategoryFilter !== 'ALL' && d.docCategory !== docCategoryFilter) return;
        if (manufacturerFilter !== 'ALL' && m.manufacturerCode !== manufacturerFilter) return;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const hay = `${m.manufacturerName} ${m.modelName} ${d.title} ${d.summary}`.toLowerCase();
          if (!hay.includes(q)) return;
        }
        list.push({
          ...d,
          manufacturerName: m.manufacturerName,
          modelName: m.modelName,
          powerType: m.powerType
        });
      });
    });
    return list;
  }, [docCategoryFilter, manufacturerFilter, searchTerm]);

  const MAX_COMPARE_MODELS = 6;

  const comparedModels = useMemo(
    () => FL_TECHNICAL_ARCHIVE.filter(m => compareIds.includes(m.id)).slice(0, MAX_COMPARE_MODELS),
    [compareIds]
  );

  const toggleCompareId = (id: string) => {
    if (compareIds.includes(id)) {
      setCompareIds(prev => prev.filter(x => x !== id));
      return;
    }
    if (compareIds.length >= MAX_COMPARE_MODELS) {
      showToast(`비교 모델은 최대 ${MAX_COMPARE_MODELS}개까지만 선택 가능합니다.`, 'error');
      return;
    }
    setCompareIds(prev => [...prev, id].slice(0, MAX_COMPARE_MODELS));
  };

  // 선택된 비교 모델 제원 비교표 엑셀 내보내기
  const handleExportCompareExcel = () => {
    if (comparedModels.length === 0) {
      showToast('비교할 모델을 1개 이상 선택해 주세요.', 'error');
      return;
    }
    const compareSpecRows: { label: string; render: (m: FlModelTechnicalSpec) => string }[] = [
      { label: '제조사 · 조달구분', render: m => `${m.manufacturerName} · ${m.originCountry}` },
      { label: '시리즈명', render: m => m.seriesName },
      { label: '차종 / 동력방식', render: m => `${m.equipmentClass} / ${m.powerType}` },
      { label: '정격 적재하중', render: m => `${m.ratedCapacityKg.toLocaleString()} kg · 하중중심 ${m.loadCenterMm} mm` },
      { label: '표준 / 최대 인상높이', render: m => `${m.standardLiftHeightMm.toLocaleString()} mm / ${m.maxOptionLiftHeightMm.toLocaleString()} mm` },
      { label: '포크 규격', render: m => `${m.forkDimensionsMm} mm` },
      { label: '차체 치수 (전장×전폭×전고)', render: m => `${m.overallLengthMm} × ${m.overallWidthMm} × ${m.overheadGuardHeightMm} mm` },
      { label: '최소 회전반경', render: m => `${m.turningRadiusMm.toLocaleString()} mm` },
      { label: '직각 적재 통로폭', render: m => `${m.aisleWidth1000x1200Mm.toLocaleString()} mm` },
      { label: '주행속도 / 인상속도', render: m => `${m.travelSpeedKmh} km/h | ${m.liftingSpeedMms} mm/s` },
      { label: '최대 등판능력', render: m => `${m.gradeabilityPercent} %` },
      { label: '장비 자중', render: m => `${m.serviceWeightKg.toLocaleString()} kg` },
      { label: '배터리 / 엔진 사양', render: m => m.powerSpecDetail },
      { label: '충전기 / 연료·변속기', render: m => m.chargerOrFuelDetail },
      { label: '제동장치 / 방수등급', render: m => `${m.brakeType} / ${m.waterproofRating}` },
      { label: '공식 보증기간', render: m => m.warrantyTerms }
    ];

    const rows = compareSpecRows.map(specRow => {
      const record: Record<string, string> = { '비교 제원 항목': specRow.label };
      comparedModels.forEach(m => {
        record[`${m.manufacturerName} ${m.modelName}`] = specRow.render(m);
      });
      return record;
    });

    exportToExcel(
      rows,
      `지게차_제원비교표_${comparedModels.map(m => m.modelName).join('_')}_${new Date().toISOString().split('T')[0]}.xlsx`,
      '제원비교표'
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px', backgroundColor: 'var(--bg-app)', padding: '14px 18px', overflow: 'hidden' }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 18px',
            borderRadius: '8px',
            backgroundColor: toast.type === 'success' ? '#059669' : '#DC2626',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '13px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)'
          }}
        >
          {toast.text}
        </div>
      )}

      {/* 상단 타이틀 및 탭 전환 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <BookOpen size={20} color="#2563EB" />
            제원 · 매뉴얼 보관함
          </h2>

          <div style={{ display: 'inline-flex', backgroundColor: '#E2E8F0', padding: '3px', borderRadius: '8px', gap: '3px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('MODELS')}
              style={{
                padding: '6px 13px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: activeTab === 'MODELS' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'MODELS' ? '#1E40AF' : '#475569'
              }}
            >
              모델별 제원 ({FL_TECHNICAL_ARCHIVE.length}종)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('COMPARE')}
              style={{
                padding: '6px 13px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: activeTab === 'COMPARE' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'COMPARE' ? '#1E40AF' : '#475569'
              }}
            >
              제원 비교 ({compareIds.length}/{MAX_COMPARE_MODELS}종)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('DOCUMENTS')}
              style={{
                padding: '6px 13px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: activeTab === 'DOCUMENTS' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'DOCUMENTS' ? '#1E40AF' : '#475569'
              }}
            >
              문서 목록 ({r2Files.length || allDocuments.length}건)
            </button>
          </div>
        </div>
      </div>

      {/* 상단 필터 바 (헌장 3.4 상하 스택 배치) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '10px',
          flexWrap: 'wrap',
          padding: '10px 14px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사</label>
          <select
            value={manufacturerFilter}
            onChange={e => setManufacturerFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          >
            <option value="ALL">전체 제조사 (8개사)</option>
            <option value="HELI">안후이 헬리</option>
            <option value="BYD">비와이디</option>
            <option value="HANGCHA">항차그룹</option>
            <option value="EP">항저우 이피</option>
            <option value="HYUNDAI">현대제뉴인 · HD현대</option>
            <option value="DOOSAN">두산밥캣</option>
            <option value="CLARK">클라크</option>
            <option value="TOYOTA">도요타</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>동력 구분</label>
          <select
            value={powerFilter}
            onChange={e => setPowerFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          >
            <option value="ALL">전체 동력원</option>
            <option value="리튬인산철 전동">리튬인산철 전동</option>
            <option value="납산배터리 전동">납산배터리 전동</option>
            <option value="디젤 내연기관">디젤 내연기관</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '130px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>정격하중 톤수</label>
          <select
            value={capacityFilter}
            onChange={e => setCapacityFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          >
            <option value="ALL">전체 톤수</option>
            <option value="LE_2000">1.5톤 ~ 2.0톤</option>
            <option value="EQ_2500">2.5톤 표준형</option>
            <option value="EQ_3000">3.0톤 주력형</option>
            <option value="GE_3500">3.5톤 이상 중량형</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>모델명 · 제원 · 문서 검색</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="예: CPD25, ECB30, 8FB25, 30D-9S, 리튬인산철, 습식브레이크..."
              style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
            <Search size={14} color="#64748B" style={{ position: 'absolute', left: '9px', top: '8px' }} />
          </div>
        </div>
      </div>

      {/* 본문 영역 */}
      {activeTab === 'MODELS' && (
        <div style={{ display: 'grid', gridTemplateColumns: '410px 1fr', gap: '12px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* 좌측: 모델 리스트 */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>아카이브 수록 지게차 모델 ({filteredModels.length}종)</span>
              <span style={{ fontSize: '11px', color: compareIds.length >= MAX_COMPARE_MODELS ? '#DC2626' : '#64748B', fontWeight: 700 }}>
                비교 선택 ({compareIds.length}/{MAX_COMPARE_MODELS}종 · 최대 6개)
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredModels.map(m => {
                const isSelected = selectedModel.id === m.id;
                const isCompared = compareIds.includes(m.id);
                const isLimitReached = !isCompared && compareIds.length >= MAX_COMPARE_MODELS;
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedModel(m)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #2563EB' : '1px solid var(--border-color)',
                      backgroundColor: isSelected ? '#EFF6FF' : 'var(--bg-card)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            backgroundColor: m.originCountry.includes('중국') ? '#FEF3C7' : '#DBEAFE',
                            color: m.originCountry.includes('중국') ? '#92400E' : '#1E40AF',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {m.manufacturerName}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap' }}>{m.modelName}</span>
                      </div>

                      <button
                        type="button"
                        onClick={ev => {
                          ev.stopPropagation();
                          toggleCompareId(m.id);
                        }}
                        title={isLimitReached ? '비교 모델은 최대 6개까지만 선택 가능합니다.' : '제원 비교 선택/해제'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: isCompared ? '#1E40AF' : '#FFFFFF',
                          color: isCompared ? '#FFFFFF' : '#475569',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: isLimitReached ? 'not-allowed' : 'pointer',
                          opacity: isLimitReached ? 0.45 : 1,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isCompared ? <CheckSquare size={12} /> : <Square size={12} />}
                        비교
                      </button>
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.seriesName}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                      <span>하중 {(m.ratedCapacityKg / 1000).toFixed(1)}톤 · {m.powerType}</span>
                      <span style={{ color: '#2563EB', fontWeight: 800 }}>공식문서 {m.documents.length}건</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우측: 선택 모델 기술제원 및 공식문서 */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflowY: 'auto',
              padding: '16px 20px',
              gap: '16px'
            }}
          >
            {/* 도시에 상단 배너 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ padding: '3px 9px', borderRadius: '4px', backgroundColor: '#1E3A8A', color: '#FFFFFF', fontSize: '11px', fontWeight: 800 }}>
                    {selectedModel.manufacturerName}
                  </span>
                  <span style={{ padding: '3px 9px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#334155', fontSize: '11px', fontWeight: 800 }}>
                    {selectedModel.equipmentClass}
                  </span>
                  <span style={{ padding: '3px 9px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#047857', fontSize: '11px', fontWeight: 800 }}>
                    {selectedModel.powerType}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '21px', fontWeight: 900, color: '#0F172A' }}>
                  {selectedModel.modelName} <span style={{ fontSize: '15px', fontWeight: 700, color: '#475569' }}>— {selectedModel.seriesName}</span>
                </h3>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedModel.documents[0] && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: selectedModel.documents[0].title,
                        url: selectedModel.documents[0].localUrl || selectedModel.documents[0].r2Url,
                        r2Url: selectedModel.documents[0].r2Url
                      })
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 13px',
                      borderRadius: '6px',
                      border: '1px solid #2563EB',
                      backgroundColor: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Eye size={14} />
                    원본 카탈로그·매뉴얼 열람
 </button>
                )}
                <button
                  type="button"
                  onClick={() => generateKoreanSpecSheetPdf(selectedModel)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 13px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Download size={14} />
                  한국어 공식 제원표 PDF 다운로드
 </button>
              </div>
            </div>

            {/* 1. 수록된 공식 문서 아카이브 */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={15} color="#2563EB" />
                1. 아카이브 수록 공식 문서 (원본 브로슈어 · 오퍼레이터 매뉴얼 · 제원표)
 </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedModel.documents.map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid #BFDBFE',
                      backgroundColor: '#F8FAFC',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '4px', backgroundColor: '#DBEAFE', color: '#1E40AF', fontSize: '11px', fontWeight: 800 }}>
                          {doc.docCategoryLabel}
                        </span>
                        <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#0F172A' }}>{doc.title}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>{doc.summary}</div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                        문서번호: {doc.docNo} | 언어: {doc.language} | 분량: {doc.pageCount}쪽 ({doc.fileSizeLabel}) | 발행일: {doc.issuedDate}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: doc.title,
                            url: doc.localUrl || doc.r2Url,
                            r2Url: doc.r2Url
                          })
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 11px',
                          borderRadius: '6px',
                          border: '1px solid #2563EB',
                          backgroundColor: '#FFFFFF',
                          color: '#2563EB',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Eye size={13} />
                        미리보기
 </button>
                      <a
                        href={doc.r2Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 11px',
                          borderRadius: '6px',
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 800,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Download size={13} />
                        원본 PDF 다운로드
 </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. VDI 2198 국제규격 상세 제원 그리드 */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={15} color="#2563EB" />
                2. 상세 기술제원 (하중 · 마스트 · 치수 · 주행성능 · 동력계)
 </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                  { label: '정격 적재하중', value: `${selectedModel.ratedCapacityKg.toLocaleString()} kg` },
                  { label: '하중중심 거리', value: `${selectedModel.loadCenterMm} mm` },
                  { label: '표준 인상높이', value: `${selectedModel.standardLiftHeightMm.toLocaleString()} mm` },
                  { label: '최대 옵션 인상높이', value: `${selectedModel.maxOptionLiftHeightMm.toLocaleString()} mm` },
                  { label: '자유 인상높이', value: `${selectedModel.freeLiftHeightMm.toLocaleString()} mm` },
                  { label: '표준 포크 규격', value: `${selectedModel.forkDimensionsMm} mm` },
                  { label: '전장 (포크 전면)', value: `${selectedModel.overallLengthMm.toLocaleString()} mm` },
                  { label: '전폭 / 헤드가드고', value: `${selectedModel.overallWidthMm.toLocaleString()} / ${selectedModel.overheadGuardHeightMm.toLocaleString()} mm` },
                  { label: '최소 회전반경', value: `${selectedModel.turningRadiusMm.toLocaleString()} mm` },
                  { label: '직각 적재 통로폭', value: `${selectedModel.aisleWidth1000x1200Mm.toLocaleString()} mm` },
                  { label: '주행속도 (적재/공차)', value: `${selectedModel.travelSpeedKmh} km/h` },
                  { label: '인상속도 (적재/공차)', value: `${selectedModel.liftingSpeedMms} mm/s` },
                  { label: '최대 등판능력', value: `${selectedModel.gradeabilityPercent} %` },
                  { label: '장비 자중', value: `${selectedModel.serviceWeightKg.toLocaleString()} kg` },
                  { label: '제동 시스템', value: selectedModel.brakeType },
                  { label: '방수 / 운용등급', value: selectedModel.waterproofRating }
                ].map((cell, i) => (
                  <div key={i} style={{ padding: '9px 11px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '3px', whiteSpace: 'nowrap' }}>{cell.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cell.value}>
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', marginBottom: '3px' }}>배터리 · 엔진 상세 사양</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>{selectedModel.powerSpecDetail}</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', marginBottom: '3px' }}>모터 · 출력 및 제어 시스템</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>{selectedModel.motorOrEngineDetail}</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', marginBottom: '3px' }}>충전기 · 연료계통 및 변속기</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>{selectedModel.chargerOrFuelDetail}</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#059669', marginBottom: '3px' }}>제조사 공식 품질보증 기준</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#065F46' }}>{selectedModel.warrantyTerms}</div>
                </div>
              </div>
            </div>

            {/* 2-A. VDI 2198 국제표준 전 항목 원문 대조 제원표 */}
            {selectedModel.vdiSpecs && selectedModel.vdiSpecs.length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={15} color="#1D4ED8" />
                  VDI 2198 국제표준 전 항목 기술제원표 · 총 {selectedModel.vdiSpecs.length}개 항목 무누락 수록
                </div>
                <div style={{ border: '1px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden', maxHeight: '380px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#1E293B', color: '#FFFFFF', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', width: '70px' }}>코드</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', width: '120px' }}>분류</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>한국어 제원 항목명</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>카탈로그 원문 표기</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', width: '70px' }}>단위</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', width: '180px' }}>제원 수치 · 사양</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedModel.vdiSpecs.map((row, idx) => (
                        <tr key={row.code + idx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 900, color: '#1D4ED8', whiteSpace: 'nowrap' }}>{row.code}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{row.category}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>{row.itemKo}</td>
                          <td style={{ padding: '6px 10px', color: '#64748B', whiteSpace: 'nowrap' }}>{row.itemEn}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.unit}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap' }}>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2-B. 마스트 단수·인상높이별 상세 제원표 */}
            {selectedModel.mastSpecs && selectedModel.mastSpecs.length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={15} color="#047857" />
                  마스트 단수·인상높이별 상세 제원표 · 총 {selectedModel.mastSpecs.length}종 마스트 구성
                </div>
                <div style={{ border: '1px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden', maxHeight: '320px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#065F46', color: '#FFFFFF', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>마스트 형식</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>마스트 모델코드</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>인상높이 h3</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>마스트 전고 h1</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>최대 작업높이 h4</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>자유인상고 h2</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>경사각 전/후</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>허용하중 단륜</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedModel.mastSpecs.map((ms, idx) => (
                        <tr key={ms.mastModel + idx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: ms.liftHeightH3Mm === 3000 && ms.mastType.includes('광시야') ? '#ECFDF5' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>{ms.mastType}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 900, color: '#047857', whiteSpace: 'nowrap' }}>{ms.mastModel}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap' }}>{ms.liftHeightH3Mm.toLocaleString()} mm</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{ms.loweredHeightH1Mm.toLocaleString()} mm</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{ms.extendedHeightWithBackrestH4Mm.toLocaleString()} mm</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1D4ED8', whiteSpace: 'nowrap' }}>{ms.freeLiftWithBackrestH2Mm.toLocaleString()} mm</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{ms.tiltAngleDeg}°</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap' }}>{ms.loadCapacity500MmSingleKg.toLocaleString()} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2-C. 배터리·충전기 옵션 매트릭스 및 표준·선택 사양 */}
            {selectedModel.batteryOptions && selectedModel.batteryOptions.length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={15} color="#B45309" />
                  리튬배터리 셀 브랜드 · 용량별 옵션 및 호환 충전기 매트릭스
                </div>
                <div style={{ border: '1px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ backgroundColor: '#78350F', color: '#FFFFFF' }}>
                      <tr>
                        <th style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>셀 제조사</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>배터리 모델</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>전압 / 정격용량</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>중량</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>구분</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>적용 모델 범위</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>호환 충전기 사양</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedModel.batteryOptions.map((bo, idx) => (
                        <tr key={bo.batteryModel + idx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FFFBEB' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 900, color: '#92400E', whiteSpace: 'nowrap' }}>{bo.cellBrand}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>{bo.batteryModel}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 900, color: '#1D4ED8', whiteSpace: 'nowrap' }}>{bo.voltageCapacity}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{bo.weightKg ? `${bo.weightKg} kg` : '-'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, backgroundColor: bo.status === '표준' ? '#DCFCE7' : '#FEF3C7', color: bo.status === '표준' ? '#166534' : '#92400E' }}>
                              {bo.status}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', color: '#334155', whiteSpace: 'nowrap' }}>{bo.applicableModels}</td>
                          <td style={{ padding: '6px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{bo.chargerOptions || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2-D. 카탈로그 표준 사양 및 선택 옵션 사양 */}
            {selectedModel.standardEquipments && selectedModel.standardEquipments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>카탈로그 표준 장착 사양</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                    {selectedModel.standardEquipments.map((eq, i) => (
                      <div key={i}>• {eq}</div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E40AF', marginBottom: '8px' }}>카탈로그 선택 옵션 사양</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#1E3A8A', fontWeight: 600 }}>
                    {(selectedModel.optionalEquipments || []).map((eq, i) => (
                      <div key={i}>• {eq}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3. 일상점검 수칙 & 정기 예방정비 매뉴얼 요약 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #BBF7D0', backgroundColor: '#F0FDF4' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#166534', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={15} />
                  3. 안전 사양 및 운전자 일일점검 수칙
 </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', color: '#14532D', fontWeight: 600 }}>
                  {selectedModel.safetyFeatures.map((sf, idx) => (
                    <div key={`sf-${idx}`}>• [안전] {sf}</div>
                  ))}
                  {selectedModel.dailyChecklist.map((dc, idx) => (
                    <div key={`dc-${idx}`} style={{ color: '#1E3A8A' }}>• [일일점검] {dc}</div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #FDE68A', backgroundColor: '#FFFBEB' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#92400E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wrench size={15} />
                  4. 가동시간별 예방정비 주기 및 호환부품
 </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', color: '#78350F', fontWeight: 600 }}>
                  {selectedModel.periodicMaintenance.map((pm, idx) => (
                    <div key={`pm-${idx}`}>• {pm}</div>
                  ))}
                  {selectedModel.compatibleParts.length > 0 && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #FCD34D' }}>
                      <div style={{ fontWeight: 800, marginBottom: '4px' }}>[재고 연동 호환 부품·어태치먼트]</div>
                      {selectedModel.compatibleParts.map(cp => (
                        <div key={cp.partCode} style={{ fontSize: '11.5px', color: '#92400E' }}>
                          - [{cp.partCode}] {cp.partName} · {cp.replacementCycle}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 탭 2: 모델 간 상세 스펙 1:N 비교표 */}
      {activeTab === 'COMPARE' && (
        <div style={{ flex: 1, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'auto', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginRight: '4px', whiteSpace: 'nowrap' }}>
                비교 모델 선택 ({compareIds.length}/{MAX_COMPARE_MODELS}종 · 최대 6개):
              </span>
              {compareIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCompareIds([])}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #FCA5A5',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginRight: '4px'
                  }}
                >
                  선택 초기화
                </button>
              )}
              {FL_TECHNICAL_ARCHIVE.map(m => {
                const active = compareIds.includes(m.id);
                const isLimitReached = !active && compareIds.length >= MAX_COMPARE_MODELS;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleCompareId(m.id)}
                    title={isLimitReached ? '비교 모델은 최대 6개까지만 선택 가능합니다.' : '제원 비교 선택/해제'}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: active ? '1px solid #2563EB' : '1px solid #CBD5E1',
                      backgroundColor: active ? '#EFF6FF' : '#FFFFFF',
                      color: active ? '#1D4ED8' : '#475569',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: isLimitReached ? 'not-allowed' : 'pointer',
                      opacity: isLimitReached ? 0.45 : 1,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {active ? '[선택] ' : '+ '}
                    {m.manufacturerName} {m.modelName}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleExportCompareExcel}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Download size={14} />
                제원 비교 엑셀 출력
              </button>
              <button
                type="button"
                onClick={() => generateCompareSpecsPdf(comparedModels)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 13px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <FileText size={14} />
                제원 비교 PDF 출력
              </button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: '180px', whiteSpace: 'nowrap' }}>비교 제원 항목</th>
                {comparedModels.map(m => (
                  <th key={m.id} style={{ padding: '10px 12px', textAlign: 'left', minWidth: '210px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#93C5FD' }}>{m.manufacturerName} · {m.originCountry}</div>
                      <button
                        type="button"
                        onClick={() => toggleCompareId(m.id)}
                        title="비교 대상에서 제외"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94A3B8',
                          cursor: 'pointer',
                          padding: '0 2px',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 900 }}>{m.modelName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: '시리즈명', render: (m: FlModelTechnicalSpec) => m.seriesName },
                { label: '차종 / 동력방식', render: (m: FlModelTechnicalSpec) => `${m.equipmentClass} / ${m.powerType}` },
                { label: '정격 적재하중', render: (m: FlModelTechnicalSpec) => `${m.ratedCapacityKg.toLocaleString()} kg · 하중중심 ${m.loadCenterMm} mm` },
                { label: '표준 / 최대 인상높이', render: (m: FlModelTechnicalSpec) => `${m.standardLiftHeightMm.toLocaleString()} mm / ${m.maxOptionLiftHeightMm.toLocaleString()} mm` },
                { label: '포크 규격', render: (m: FlModelTechnicalSpec) => `${m.forkDimensionsMm} mm` },
                { label: '차체 치수 (전장×전폭×전고)', render: (m: FlModelTechnicalSpec) => `${m.overallLengthMm} × ${m.overallWidthMm} × ${m.overheadGuardHeightMm} mm` },
                { label: '최소 회전반경', render: (m: FlModelTechnicalSpec) => `${m.turningRadiusMm.toLocaleString()} mm` },
                { label: '직각 적재 통로폭', render: (m: FlModelTechnicalSpec) => `${m.aisleWidth1000x1200Mm.toLocaleString()} mm` },
                { label: '주행속도 / 인상속도', render: (m: FlModelTechnicalSpec) => `${m.travelSpeedKmh} km/h | ${m.liftingSpeedMms} mm/s` },
                { label: '최대 등판능력', render: (m: FlModelTechnicalSpec) => `${m.gradeabilityPercent} %` },
                { label: '장비 자중', render: (m: FlModelTechnicalSpec) => `${m.serviceWeightKg.toLocaleString()} kg` },
                { label: '배터리 / 엔진 사양', render: (m: FlModelTechnicalSpec) => m.powerSpecDetail },
                { label: '충전기 / 연료·변속기', render: (m: FlModelTechnicalSpec) => m.chargerOrFuelDetail },
                { label: '제동장치 / 방수등급', render: (m: FlModelTechnicalSpec) => `${m.brakeType} / ${m.waterproofRating}` },
                { label: '공식 보증기간', render: (m: FlModelTechnicalSpec) => m.warrantyTerms }
              ].map((row, idx) => (
                <tr key={row.label} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 800, color: '#1E293B', whiteSpace: 'nowrap', backgroundColor: '#EFF6FF' }}>{row.label}</td>
                  {comparedModels.map(m => (
                    <td key={m.id} style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A' }}>
                      {row.render(m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 탭 3: 클라우드 공식문서 통합 보관함 & 신규 문서 업로드 */}
      {activeTab === 'DOCUMENTS' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflow: 'hidden' }}>
          {/* 신규 공식문서 업로드 바 */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <FolderOpen size={18} color="#1D4ED8" />
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#1E3A8A' }}>
                문서 보관함
 </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={uploadTargetModel}
                onChange={e => setUploadTargetModel(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', border: '1px solid #93C5FD', backgroundColor: '#FFFFFF' }}
              >
                {FL_TECHNICAL_ARCHIVE.map(m => (
                  <option key={m.id} value={m.modelName}>
                    {m.manufacturerName} - {m.modelName}
                  </option>
                ))}
              </select>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 13px',
                  borderRadius: '6px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: uploading ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Upload size={14} />
                {uploading ? '클라우드 업로드 중...' : '신규 공식문서 PDF 업로드'}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleUploadNewDoc} disabled={uploading} style={{ display: 'none' }} />
              </label>

              <button
                type="button"
                onClick={fetchR2Archive}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 11px',
                  borderRadius: '6px',
                  border: '1px solid #93C5FD',
                  backgroundColor: '#FFFFFF',
                  color: '#1D4ED8',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={13} />
                새로고침
 </button>
            </div>
          </div>

          {/* 문서 그리드 */}
          <div style={{ flex: 1, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>열람 / 다운로드</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>문서 분류</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>제조사 · 모델</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>공식 문서명 및 수록 요약</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>문서번호</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>분량 / 용량</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>보관 상태</th>
                </tr>
              </thead>
              <tbody>
                {allDocuments.map(doc => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              title: doc.title,
                              url: doc.localUrl || doc.r2Url,
                              r2Url: doc.r2Url
                            })
                          }
                          style={{
                            padding: '4px 9px',
                            borderRadius: '5px',
                            border: '1px solid #2563EB',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          열람
 </button>
                        <a
                          href={doc.r2Url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '4px 9px',
                            borderRadius: '5px',
                            backgroundColor: '#0F172A',
                            color: '#FFFFFF',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          다운로드
 </a>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#DBEAFE', color: '#1E40AF', fontSize: '11px', fontWeight: 800 }}>
                        {doc.docCategoryLabel}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>
                      {doc.manufacturerName} · {doc.modelName}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '2px' }}>{doc.title}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{doc.summary}</div>
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{doc.docNo}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
                      {doc.pageCount}쪽 · {doc.fileSizeLabel}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 800, fontSize: '11.5px' }}>
                        <CheckCircle2 size={13} />
                        보관 완료
 </span>
                    </td>
                  </tr>
                ))}

                {/* 추가 업로드된 파일 노출 */}
                {r2Files.map(rf => (
                  <tr key={rf.key} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({ title: rf.name, url: rf.url, r2Url: rf.url })}
                          style={{
                            padding: '4px 9px',
                            borderRadius: '5px',
                            border: '1px solid #2563EB',
                            backgroundColor: '#FFFFFF',
                            color: '#1D4ED8',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          열람
 </button>
                        <a
                          href={rf.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '4px 9px',
                            borderRadius: '5px',
                            backgroundColor: '#2563EB',
                            color: '#FFFFFF',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            textDecoration: 'none'
                          }}
                        >
                          원본 다운로드
 </a>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#047857', fontSize: '11px', fontWeight: 800 }}>
                        보관본
 </span>
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>문서 보관함</td>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#0F172A' }}>{rf.name}</td>
                    <td style={{ padding: '9px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>{rf.key}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
                      {(rf.size / 1024).toFixed(0)} KB
 </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#059669', fontWeight: 800, fontSize: '11.5px' }}>보관됨</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 최하단 1줄 요약 바 */}
      <div
        data-mid="forklift-doc-archive-bottom-summary"
        style={{
          padding: '9px 16px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>수록 지게차 모델: <strong style={{ color: '#0F172A' }}>{filteredModels.length}종</strong></span>
          <span style={{ color: '#CBD5E1' }}>|</span>
          <span>제원 비교 선택: <strong style={{ color: '#2563EB' }}>{compareIds.length}/{MAX_COMPARE_MODELS}종</strong></span>
          <span style={{ color: '#CBD5E1' }}>|</span>
          <span>공식 브로셔·매뉴얼·제원표 보관문서: <strong style={{ color: '#059669' }}>{r2Files.length || allDocuments.length}건</strong></span>
        </div>
        <span style={{ color: '#475569', fontWeight: 700 }}>공식 기술제원 및 문서 보관함</span>
      </div>

      {/* 인라인 PDF 미리보기 모달 */}
      {previewDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            style={{
              width: '92vw',
              maxWidth: '1180px',
              height: '88vh',
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
            }}
          >
            <div style={{ padding: '12px 18px', backgroundColor: '#0F172A', color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                <FileText size={16} color="#60A5FA" />
                {previewDoc.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a
                  href={previewDoc.r2Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 11px',
                    borderRadius: '6px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 800,
                    textDecoration: 'none'
                  }}
                >
                  <ExternalLink size={13} />
                  새 창에서 원본 열기 / 다운로드
 </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <iframe src={previewDoc.url} title={previewDoc.title} style={{ flex: 1, width: '100%', border: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
};

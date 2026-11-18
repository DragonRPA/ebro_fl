import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  RotateCcw,
  X,
} from 'lucide-react';
import type { AppShellContextValue } from '../../core/AppShellContext';
import { SearchableSelect } from '../../components/SearchableSelect';
import {
  SegmentedTabs,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import type { FlPartner, TenantProfile } from '../../types/domain';
import type { FlModelTechnicalSpec } from '../../data/flTechnicalTypes';
import type { CatalogPreviewDoc } from './CatalogPartsAndPackagesTabs';

function buildCompareRows(formatSpecMetric: (val: unknown, unit?: string) => string) {
  return [
    { label: '시리즈명', core: true, render: (m: FlModelTechnicalSpec) => m.seriesName },
    { label: '차종 · 동력방식', core: true, render: (m: FlModelTechnicalSpec) => `${m.equipmentClass} · ${m.powerType}` },
    { label: '정격하중 Q · 하중중심 c', core: true, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.ratedCapacityKg, 'kg')} · ${formatSpecMetric(m.loadCenterMm, 'mm')}` },
    { label: '축거 y · 하중거리 x', core: false, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.wheelbaseMm, 'mm')} · ${formatSpecMetric(m.loadDistanceXMm, 'mm')}` },
    { label: '표준 · 최대 인상고 h3', core: true, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.standardLiftHeightMm, 'mm')} · ${formatSpecMetric(m.maxOptionLiftHeightMm, 'mm')}` },
    { label: '자유인상고 h2 · 전고 h1', core: false, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.freeLiftHeightMm, 'mm')} · ${formatSpecMetric(m.mastLoweredH1Mm || m.overheadGuardHeightMm, 'mm')}` },
    { label: '포크 규격 s×e×l', core: true, render: (m: FlModelTechnicalSpec) => formatSpecMetric(m.forkDimensionsMm, 'mm') },
    { label: '본체 전장×전폭×헤드가드고', core: true, render: (m: FlModelTechnicalSpec) => `${m.overallLengthMm.toLocaleString('ko-KR')} × ${m.overallWidthMm.toLocaleString('ko-KR')} × ${m.overheadGuardHeightMm.toLocaleString('ko-KR')} mm` },
    { label: '포크포함 전장 l1', core: false, render: (m: FlModelTechnicalSpec) => formatSpecMetric(m.overallLengthWithForkL1Mm, 'mm') },
    { label: '최소 회전반경 Wa', core: true, render: (m: FlModelTechnicalSpec) => formatSpecMetric(m.turningRadiusMm, 'mm') },
    { label: '직각 적재 통로폭 Ast', core: true, render: (m: FlModelTechnicalSpec) => formatSpecMetric(m.aisleWidth1000x1200Mm, 'mm') },
    { label: '주행속도 · 인상속도', core: true, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.travelSpeedKmh, 'km/h')} · ${formatSpecMetric(m.liftingSpeedMms, 'mm/s')}` },
    { label: '하강속도 · 최대 견인력', core: false, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.loweringSpeedMms, 'mm/s')} · ${formatSpecMetric(m.maxDrawbarPullN, 'N')}` },
    { label: '최대 등판능력', core: true, render: (m: FlModelTechnicalSpec) => formatSpecMetric(m.maxGradeabilityPercent || m.gradeabilityPercent, '%') },
    {
      label: '장비 자중 · 적재·공차 축중',
      core: true,
      render: (m: FlModelTechnicalSpec) => {
        const base = formatSpecMetric(m.serviceWeightKg, 'kg');
        const laden = formatSpecMetric(m.axleLoadingLadenKg, 'kg');
        const unladen = formatSpecMetric(m.axleLoadingUnladenKg, 'kg');
        if (laden === '-' && unladen === '-') return base;
        return `${base} · 적재 ${laden} / 공차 ${unladen}`;
      },
    },
    { label: '배터리 · 엔진 상세 사양', core: true, render: (m: FlModelTechnicalSpec) => m.powerSpecDetail },
    { label: '주행·인양 출력 · 제어', core: false, render: (m: FlModelTechnicalSpec) => `${m.motorOrEngineDetail}${m.controllerMaker ? ` · ${m.controllerMaker}` : ''}` },
    { label: '충전기 · 연료계통', core: true, render: (m: FlModelTechnicalSpec) => m.chargerOrFuelDetail },
    { label: '타이어 규격 전/후', core: false, render: (m: FlModelTechnicalSpec) => m.tireSpecFrontRear },
    { label: '작동압력 · 유량 · 소음도', core: false, render: (m: FlModelTechnicalSpec) => `${formatSpecMetric(m.operatingPressureMpa, 'MPa')} · ${formatSpecMetric(m.oilFlowLmin, 'l/min')} · ${formatSpecMetric(m.soundLevelDb, 'dB')}` },
    { label: '제동장치 · 방수등급', core: true, render: (m: FlModelTechnicalSpec) => `${m.brakeType} · ${m.waterproofRating}` },
    { label: '공식 보증기간', core: true, render: (m: FlModelTechnicalSpec) => m.warrantyTerms },
  ];
}

export const CatalogCompareTab: React.FC<{
  technicalArchive: FlModelTechnicalSpec[];
  maxCompareModels: number;
  formatSpecMetric: (val: unknown, unit?: string) => string;
  compareIds: string[];
  onCompareIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  comparedModels: FlModelTechnicalSpec[];
  onToggleCompareId: (id: string) => void;
  compareMode: 'FULL' | 'SUMMARY';
  onCompareModeChange: (mode: 'FULL' | 'SUMMARY') => void;
  excludedCompareLabels: string[];
  onExcludedCompareLabelsChange: React.Dispatch<React.SetStateAction<string[]>>;
  compareTitle: string;
  onCompareTitleChange: (val: string) => void;
  compareRecipient: string;
  onCompareRecipientChange: (val: string) => void;
  compareNote: string;
  onCompareNoteChange: (val: string) => void;
  partners: FlPartner[];
  tenantProfile: TenantProfile;
  pdfBusy: boolean;
  onPdfBusyChange: (busy: boolean) => void;
  onOpenPreviewDoc: (doc: CatalogPreviewDoc) => void;
  notifyToast: AppShellContextValue['notifyToast'];
}> = ({
  technicalArchive,
  maxCompareModels,
  formatSpecMetric,
  compareIds,
  onCompareIdsChange,
  comparedModels,
  onToggleCompareId,
  compareMode,
  onCompareModeChange,
  excludedCompareLabels,
  onExcludedCompareLabelsChange,
  compareTitle,
  onCompareTitleChange,
  compareRecipient,
  onCompareRecipientChange,
  compareNote,
  onCompareNoteChange,
  partners,
  tenantProfile,
  pdfBusy,
  onPdfBusyChange,
  onOpenPreviewDoc,
  notifyToast,
}) => {
  const moveCompareId = (id: string, dir: -1 | 1) => {
    onCompareIdsChange((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const compareRows = useMemo(() => buildCompareRows(formatSpecMetric), [formatSpecMetric]);
  const summaryCompareRowCount = useMemo(() => compareRows.filter((r) => r.core).length, [compareRows]);
  const activeCompareRows = useMemo(
    () =>
      compareRows.filter(
        (r) => (compareMode === 'FULL' || r.core) && !excludedCompareLabels.includes(r.label)
      ),
    [compareMode, compareRows, excludedCompareLabels]
  );

  const compareCandidateOptions = useMemo(
    () =>
      technicalArchive.filter((m) => !compareIds.includes(m.id)).map((m) => ({
        value: m.id,
        label: `${m.manufacturerName} · ${m.modelName}`,
        subLabel: `${m.ratedCapacityKg.toLocaleString('ko-KR')} kg · ${m.powerType}`,
        searchText: `${m.manufacturerName} ${m.modelName} ${m.seriesName} ${m.powerType} ${m.ratedCapacityKg}`,
      })),
    [compareIds, technicalArchive]
  );

  const handleExportComparePdf = async (previewOnly: boolean) => {
    if (comparedModels.length === 0) {
      notifyToast('비교할 장비 기종을 1종 이상 선택해 주세요.', 'error');
      return;
    }
    if (activeCompareRows.length === 0) {
      notifyToast('출력할 비교 제원 항목이 1개 이상 필요합니다.', 'error');
      return;
    }
    onPdfBusyChange(true);
    try {
      const { generateCompareSpecsPdf, downloadPdfFile } = await import(
        '../../services/catalogSpecDocumentService'
      );
      const { fileName, bytes } = await generateCompareSpecsPdf({
        models: comparedModels,
        rows: activeCompareRows.map((r) => ({
          label: r.label,
          values: comparedModels.map((m) => r.render(m)),
        })),
        tenant: tenantProfile,
        title: compareTitle,
        recipientName: compareRecipient,
        authorNote: compareNote,
      });
      if (previewOnly) {
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        onOpenPreviewDoc({
          title: `${compareTitle.trim() || '지게차 모델별 상세 제원 비교표'} · PDF`,
          url: blobUrl,
          downloadFileName: fileName,
          isBlob: true,
        });
      } else {
        downloadPdfFile(fileName, bytes);
        notifyToast(`제원비교표 PDF 출력 완료 · ${comparedModels.length}종`, 'success');
      }
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '제원비교표 PDF 생성 실패', 'error');
    } finally {
      onPdfBusyChange(false);
    }
  };

  return (
    <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
        <VerticalField label={`비교 기종 추가 · ${comparedModels.length}/${maxCompareModels}종`} width={300}>
          <SearchableSelect
            value=""
            disabled={comparedModels.length >= maxCompareModels}
            dataTestId="cat-compare-select"
            options={compareCandidateOptions}
            onChange={(id) => {
              if (id) onToggleCompareId(id);
            }}
            placeholder={
              comparedModels.length >= maxCompareModels
                ? '최대 5개 기종 선택 완료'
                : '비교할 장비 기종 검색 · 추가'
            }
            searchPlaceholder="제조사 · 모델명 · 초성 · 적재하중 검색"
            minDropdownWidth={360}
          />
        </VerticalField>
        <VerticalField label="제원비교표 제목" minWidth={210} flex={1}>
          <input
            type="text"
            data-testid="cat-compare-title"
            value={compareTitle}
            onChange={(e) => onCompareTitleChange(e.target.value)}
            placeholder="예: 2.5톤~3.0톤 전동지게차 제안 비교표"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="수신처 · 고객사" minWidth={180} flex={1}>
          <input
            type="text"
            data-testid="cat-compare-recipient"
            list="cat-compare-partners"
            value={compareRecipient}
            onChange={(e) => onCompareRecipientChange(e.target.value)}
            placeholder="거래처 또는 현장명 입력"
            style={controlInputStyle}
          />
          <datalist id="cat-compare-partners">
            {partners.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </VerticalField>
        <VerticalField label="검토 의견 · 특기사항" minWidth={220} flex={1.3}>
          <input
            type="text"
            data-testid="cat-compare-note"
            value={compareNote}
            onChange={(e) => onCompareNoteChange(e.target.value)}
            placeholder="추천 기종 사유, 통로폭·배터리 특기사항 입력"
            style={controlInputStyle}
          />
        </VerticalField>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-field-grid-gap)',
          padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
          borderRadius: '8px',
          border: '1px solid var(--table-row-border)',
          backgroundColor: 'var(--bg-header)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-tight-gap)', alignItems: 'center', flex: 1 }}>
          {comparedModels.length === 0 && (
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
              선택된 비교 기종이 없습니다. 상단 비교 기종 추가 또는 장비 제원표 탭의 담기 버튼으로 최대 5종을 선택하십시오.
            </span>
          )}
          {comparedModels.map((m, idx) => (
            <div
              key={m.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-label-gap)',
                padding: 'max(1px, calc(4px - 2pt)) var(--space-inline-gap)',
                borderRadius: '6px',
                border: '1px solid var(--primary)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {idx + 1}
              </span>
              <span>
                {m.manufacturerName} {m.modelName}
              </span>
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => moveCompareId(m.id, -1)}
                title="앞으로 이동"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: '0 2px',
                  cursor: idx === 0 ? 'default' : 'pointer',
                  color: idx === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  opacity: idx === 0 ? 0.35 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                disabled={idx === comparedModels.length - 1}
                onClick={() => moveCompareId(m.id, 1)}
                title="뒤로 이동"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: '0 2px',
                  cursor: idx === comparedModels.length - 1 ? 'default' : 'pointer',
                  color: idx === comparedModels.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  opacity: idx === comparedModels.length - 1 ? 0.35 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => onToggleCompareId(m.id)}
                title="비교 대상에서 제외"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: '0 2px',
                  cursor: 'pointer',
                  color: 'var(--danger)',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {comparedModels.length > 0 && (
            <button
              type="button"
              onClick={() => onCompareIdsChange([])}
              style={actionBtnStyle('secondary', true)}
            >
              선택 초기화
            </button>
          )}
          {excludedCompareLabels.length > 0 && (
            <button
              type="button"
              onClick={() => onExcludedCompareLabelsChange([])}
              style={actionBtnStyle('secondary', true)}
            >
              <RotateCcw size={12} />
              제외 항목 복원 · {excludedCompareLabels.length}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-inline-gap)', flexShrink: 0 }}>
          <SegmentedTabs
            tabs={[
              { id: 'FULL', label: '전체 상세', count: compareRows.length },
              { id: 'SUMMARY', label: '핵심 요약', count: summaryCompareRowCount },
            ]}
            activeId={compareMode}
            onChange={(id) => onCompareModeChange(id as 'FULL' | 'SUMMARY')}
          />
          <button
            type="button"
            data-testid="cat-compare-pdf-preview"
            disabled={comparedModels.length === 0 || activeCompareRows.length === 0 || pdfBusy}
            onClick={() => handleExportComparePdf(true)}
            style={actionBtnStyle('secondary')}
          >
            <Eye size={14} />
            PDF 미리보기
          </button>
          <button
            type="button"
            data-testid="cat-compare-pdf-download"
            disabled={comparedModels.length === 0 || activeCompareRows.length === 0 || pdfBusy}
            onClick={() => handleExportComparePdf(false)}
            style={actionBtnStyle('primary')}
          >
            <FileText size={14} />
            제원비교표 PDF 출력
          </button>
          <button
            type="button"
            disabled={comparedModels.length === 0 || activeCompareRows.length === 0}
            onClick={async () => {
              try {
                const { generateCompareSpecsExcel } = await import(
                  '../../services/catalogSpecDocumentService'
                );
                await generateCompareSpecsExcel({
                  models: comparedModels,
                  rows: activeCompareRows.map((r) => ({
                    label: r.label,
                    values: comparedModels.map((m) => r.render(m)),
                  })),
                  title: compareTitle,
                  recipientName: compareRecipient,
                  authorNote: compareNote,
                });
                notifyToast('모델 제원 비교표 엑셀 생성 완료', 'success');
              } catch (err) {
                notifyToast(err instanceof Error ? err.message : '비교표 엑셀 출력 실패', 'error');
              }
            }}
            style={actionBtnStyle('secondary')}
          >
            <Download size={14} />
            비교표 엑셀 다운로드
          </button>
        </div>
      </div>

      {comparedModels.length === 0 ? (
        <div style={{ padding: 'calc(32px - 2pt)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          비교할 장비 기종을 1종 이상 선택하십시오.
        </div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto', border: '1px solid var(--table-border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: 'var(--text-main)' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--table-border-color)' }}>
                <th style={{ padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)', textAlign: 'left', width: '220px', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: 'var(--bg-header)', borderRight: '1px solid var(--table-row-border)' }}>
                  비교 제원 항목 · {activeCompareRows.length}행
                </th>
                {comparedModels.map((m, idx) => (
                  <th key={m.id} style={{ padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)', textAlign: 'left', minWidth: '210px', whiteSpace: 'nowrap', borderRight: '1px solid var(--table-row-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-tight-gap)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {idx + 1}열 · {m.manufacturerName} · {m.originCountry}
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleCompareId(m.id)}
                        title="비교 대상에서 제외"
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: '0 2px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--primary)' }}>{m.modelName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {m.ratedCapacityKg.toLocaleString('ko-KR')} kg · {m.powerType}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeCompareRows.map((row) => (
                <tr key={row.label} style={{ borderBottom: '1px solid var(--table-row-border)' }}>
                  <td style={{ padding: 'var(--space-compact-pad-y) var(--space-subbox-pad-x)', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: 'var(--bg-header)', borderRight: '1px solid var(--table-row-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-tight-gap)' }}>
                      <span>{row.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onExcludedCompareLabelsChange((prev) =>
                            prev.includes(row.label) ? prev : [...prev, row.label]
                          )
                        }
                        title="비교표에서 항목 제외"
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: '0 2px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                  {comparedModels.map((m) => (
                    <td key={`${row.label}-${m.id}`} style={{ padding: 'var(--space-compact-pad-y) var(--space-subbox-pad-x)', borderRight: '1px solid var(--table-row-border)' }}>
                      {row.render(m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Download, ExternalLink, Eye, FileText } from 'lucide-react';
import type { AppShellContextValue } from '../../core/AppShellContext';
import {
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  actionBtnStyle,
} from '../../components/UiPrimitives';
import type {
  FlMastSpecRow,
  FlModelTechnicalSpec,
  FlVdiSpecItem,
} from '../../data/flTechnicalTypes';
import type { TenantProfile } from '../../types/domain';
import type { CatalogPreviewDoc } from './CatalogPartsAndPackagesTabs';

export interface CatalogSpecDetailPanelProps {
  activeSpec: FlModelTechnicalSpec;
  activeCoreCells: { label: string; value: string }[];
  activeVdiRows: FlVdiSpecItem[];
  activeVdiCategories: string[];
  filteredVdiRows: FlVdiSpecItem[];
  activeMastRows: FlMastSpecRow[];
  detailSection: 'ALL' | 'CORE' | 'VDI' | 'MAST' | 'GUIDE';
  onDetailSectionChange: (section: 'ALL' | 'CORE' | 'VDI' | 'MAST' | 'GUIDE') => void;
  vdiCatFilter: string;
  onVdiCatFilterChange: (cat: string) => void;
  compareIds: string[];
  onToggleCompareId: (id: string) => void;
  pdfBusy: boolean;
  onPdfBusyChange: (busy: boolean) => void;
  tenantProfile: TenantProfile;
  onOpenPreviewDoc: (doc: CatalogPreviewDoc) => void;
  notifyToast: AppShellContextValue['notifyToast'];
}

export const CatalogSpecDetailPanel: React.FC<CatalogSpecDetailPanelProps> = ({
  activeSpec,
  activeCoreCells,
  activeVdiRows,
  activeVdiCategories,
  filteredVdiRows,
  activeMastRows,
  detailSection,
  onDetailSectionChange,
  vdiCatFilter,
  onVdiCatFilterChange,
  compareIds,
  onToggleCompareId,
  pdfBusy,
  onPdfBusyChange,
  tenantProfile,
  onOpenPreviewDoc,
  notifyToast,
}) => (
  <SectionPanel
    title={`${activeSpec.manufacturerName} · ${activeSpec.modelName}`}
    titleSlot={
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}>
        <StatusBadge label={activeSpec.originCountry} tone="neutral" />
        <StatusBadge label={activeSpec.equipmentClass} tone="info" />
        <StatusBadge label={activeSpec.powerType} tone="success" />
      </div>
    }
    rightSlot={
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onToggleCompareId(activeSpec.id)}
          style={actionBtnStyle(compareIds.includes(activeSpec.id) ? 'primary' : 'secondary', true)}
        >
          {compareIds.includes(activeSpec.id) ? '비교 제외' : '비교 추가'}
        </button>
        {activeSpec.documents[0] && (
          <button
            type="button"
            onClick={() =>
              onOpenPreviewDoc({
                title: activeSpec.documents[0].title,
                url: activeSpec.documents[0].localUrl || activeSpec.documents[0].r2Url,
                r2Url: activeSpec.documents[0].r2Url,
              })
            }
            style={actionBtnStyle('secondary', true)}
          >
            <Eye size={13} />
            문서 미리보기
          </button>
        )}
        <button
          type="button"
          data-testid="cat-single-pdf-btn"
          disabled={pdfBusy}
          onClick={async () => {
            onPdfBusyChange(true);
            try {
              const { generateModelSpecPdf, downloadPdfFile } = await import(
                '../../services/catalogSpecDocumentService'
              );
              const { fileName, bytes } = await generateModelSpecPdf({
                spec: activeSpec,
                coreRows: activeCoreCells,
                tenant: tenantProfile,
              });
              downloadPdfFile(fileName, bytes);
              notifyToast(`${activeSpec.modelName} 공식 제원표 PDF 생성 완료`, 'success');
            } catch (err) {
              notifyToast(err instanceof Error ? err.message : '공식 제원표 PDF 출력 실패', 'error');
            } finally {
              onPdfBusyChange(false);
            }
          }}
          style={actionBtnStyle('secondary', true)}
        >
          <FileText size={13} />
          공식 제원표 PDF
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const { generateModelSpecExcel } = await import(
                '../../services/catalogSpecDocumentService'
              );
              await generateModelSpecExcel({
                spec: activeSpec,
                vdiRows: activeVdiRows,
                mastRows: activeMastRows,
                coreRows: activeCoreCells,
              });
              notifyToast(`${activeSpec.modelName} 제원표 엑셀 생성 완료`, 'success');
            } catch (err) {
              notifyToast(err instanceof Error ? err.message : '엑셀 출력 실패', 'error');
            }
          }}
          style={actionBtnStyle('primary', true)}
        >
          <Download size={13} />
          제원표 엑셀
        </button>
      </div>
    }
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)', fontSize: '12.5px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-field-grid-gap)',
          flexWrap: 'wrap',
          paddingBottom: 'var(--space-inline-gap)',
          borderBottom: '1px solid var(--table-row-border)',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
          {activeSpec.seriesName}
        </span>
        <SegmentedTabs
          tabs={[
            { id: 'ALL', label: '전체 보기' },
            { id: 'CORE', label: '핵심 · 동력 제원', count: activeCoreCells.length },
            { id: 'VDI', label: 'VDI 2198 표준표', count: activeVdiRows.length },
            { id: 'MAST', label: '마스트 · 배터리', count: activeMastRows.length },
            { id: 'GUIDE', label: '사양 · 정비 · 문서', count: activeSpec.documents.length },
          ]}
          activeId={detailSection}
          onChange={(id) => onDetailSectionChange(id as typeof detailSection)}
        />
      </div>

      {(detailSection === 'ALL' || detailSection === 'CORE') && (
        <>
          <div
            data-testid="cat-core-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 'var(--space-inline-gap)',
            }}
          >
            {activeCoreCells.map((cell) => (
              <div
                key={cell.label}
                style={{
                  padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--table-row-border)',
                  backgroundColor: 'var(--bg-app)',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '1px',
                  }}
                >
                  {cell.label}
                </div>
                <div
                  title={cell.value}
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 'var(--space-inline-gap)',
            }}
          >
            {[
              { label: '배터리 · 엔진 상세 사양', value: activeSpec.powerSpecDetail },
              { label: '모터 · 출력 및 제어 시스템', value: activeSpec.motorOrEngineDetail },
              { label: '충전기 · 연료계통 및 변속기', value: activeSpec.chargerOrFuelDetail },
              { label: '타이어 규격 전/후', value: activeSpec.tireSpecFrontRear },
              { label: '제동 시스템', value: activeSpec.brakeType },
              { label: '공식 품질보증 기준', value: activeSpec.warrantyTerms },
            ].map((info) => (
              <div
                key={info.label}
                style={{
                  padding: 'var(--space-table-th-pad-y) var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--table-row-border)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1px' }}>
                  {info.label}
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.45 }}>
                  {info.value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(detailSection === 'ALL' || detailSection === 'VDI') && (
        <div data-testid="cat-vdi-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-inline-gap)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>
              VDI 2198 표준 기술제원표 · {filteredVdiRows.length}항목
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-label-gap)', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onVdiCatFilterChange('ALL')}
                style={actionBtnStyle(vdiCatFilter === 'ALL' ? 'primary' : 'secondary', true)}
              >
                전체 · {activeVdiRows.length}
              </button>
              {activeVdiCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onVdiCatFilterChange(cat)}
                  style={actionBtnStyle(vdiCatFilter === cat ? 'primary' : 'secondary', true)}
                >
                  {cat} · {activeVdiRows.filter((x) => x.category === cat).length}
                </button>
              ))}
            </div>
          </div>

          <DataGrid
            columns={[
              { key: 'code', header: '코드', width: 72, render: (r) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{r.code}</span> },
              { key: 'cat', header: '분류', width: 115, render: (r) => r.category },
              { key: 'itemKo', header: '한국어 제원 항목명', render: (r) => <span style={{ fontWeight: 700 }}>{r.itemKo}</span> },
              { key: 'itemEn', header: '원문 항목 표기', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.itemEn}</span> },
              { key: 'unit', header: '단위', width: 72, align: 'center', render: (r) => r.unit },
              { key: 'val', header: '제원 수치 · 사양', width: 185, align: 'right', render: (r) => <span style={{ fontWeight: 700 }}>{r.value}</span> },
            ]}
            rows={filteredVdiRows}
            rowKey={(r, i) => `${r.code}-${i}`}
            maxHeight="calc(100vh - 260px)"
          />
        </div>
      )}

      {(detailSection === 'ALL' || detailSection === 'MAST') && (
        <>
          {activeMastRows.length > 0 && (
            <div data-testid="cat-mast-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-tight-gap)' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>
                마스트 단수 · 인상높이별 상세 제원표 · {activeMastRows.length}종
              </span>
              <DataGrid
                columns={[
                  { key: 'mastType', header: '마스트 형식', render: (m) => <span style={{ fontWeight: 700 }}>{m.mastType}</span> },
                  { key: 'mastModel', header: '모델코드', width: 95, render: (m) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{m.mastModel}</span> },
                  { key: 'h3', header: '인상고 h3 · mm', width: 115, align: 'right', render: (m) => `${m.liftHeightH3Mm.toLocaleString('ko-KR')} mm` },
                  { key: 'h1', header: '최저전고 h1 · mm', width: 120, align: 'right', render: (m) => `${m.loweredHeightH1Mm.toLocaleString('ko-KR')} mm` },
                  { key: 'h4', header: '최대높이 h4 · mm', width: 120, align: 'right', render: (m) => `${m.extendedHeightWithBackrestH4Mm.toLocaleString('ko-KR')} mm` },
                  { key: 'h2', header: '자유인상고 h2 · mm', width: 125, align: 'right', render: (m) => `${m.freeLiftWithBackrestH2Mm.toLocaleString('ko-KR')} mm` },
                  { key: 'tilt', header: '경사각', width: 80, align: 'center', render: (m) => `${m.tiltAngleDeg}°` },
                  { key: 'capSingle', header: '허용하중 500mm · kg', width: 135, align: 'right', render: (m) => `${m.loadCapacity500MmSingleKg.toLocaleString('ko-KR')} kg` },
                  {
                    key: 'capDual',
                    header: '복륜 / 600mm · kg',
                    width: 135,
                    align: 'right',
                    render: (m) =>
                      m.loadCapacity500MmDualKg || m.loadCapacity600MmSingleKg
                        ? `${m.loadCapacity500MmDualKg ? `${m.loadCapacity500MmDualKg.toLocaleString('ko-KR')} kg` : '-'} / ${m.loadCapacity600MmSingleKg ? `${m.loadCapacity600MmSingleKg.toLocaleString('ko-KR')} kg` : '-'}`
                        : '-',
                  },
                ]}
                rows={activeMastRows}
                rowKey={(m, i) => `${m.mastModel}-${m.liftHeightH3Mm}-${i}`}
                maxHeight="320px"
              />
            </div>
          )}

          {activeSpec.batteryOptions && activeSpec.batteryOptions.length > 0 && (
            <div data-testid="cat-battery-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-tight-gap)' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>
                배터리 셀 브랜드 · 용량 옵션 및 호환 충전기 매트릭스 · {activeSpec.batteryOptions.length}종
              </span>
              <DataGrid
                columns={[
                  { key: 'brand', header: '셀 브랜드', width: 95, render: (b) => <span style={{ fontWeight: 700 }}>{b.cellBrand}</span> },
                  { key: 'model', header: '배터리 모델', width: 115, render: (b) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{b.batteryModel}</span> },
                  { key: 'vc', header: '전압 / 정격용량', width: 120, render: (b) => b.voltageCapacity },
                  { key: 'wt', header: '중량 · kg', width: 90, align: 'right', render: (b) => (b.weightKg ? `${b.weightKg} kg` : '-') },
                  {
                    key: 'st',
                    header: '구분',
                    width: 72,
                    align: 'center',
                    render: (b) => (
                      <StatusBadge
                        label={b.status === '표준' ? '표준' : '옵션'}
                        tone={b.status === '표준' ? 'success' : 'warning'}
                      />
                    ),
                  },
                  { key: 'app', header: '적용 모델 범위', render: (b) => b.applicableModels },
                  { key: 'chg', header: '호환 충전기 사양', render: (b) => b.chargerOptions || '-' },
                ]}
                rows={activeSpec.batteryOptions}
                rowKey={(b, i) => `${b.cellBrand}-${b.batteryModel}-${i}`}
                maxHeight="280px"
              />
            </div>
          )}
        </>
      )}

      {(detailSection === 'ALL' || detailSection === 'GUIDE') && (
        <>
          {((activeSpec.standardEquipments && activeSpec.standardEquipments.length > 0) ||
            (activeSpec.optionalEquipments && activeSpec.optionalEquipments.length > 0)) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
              <div style={{ padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-app)' }}>
                <div style={{ fontWeight: 800, marginBottom: 'var(--space-tight-gap)', color: 'var(--text-main)' }}>
                  기본 출고 사양 · {(activeSpec.standardEquipments || []).length}항목
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-label-gap)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {(activeSpec.standardEquipments || []).map((eq, i) => (
                    <div key={i}>• {eq}</div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-app)' }}>
                <div style={{ fontWeight: 800, marginBottom: 'var(--space-tight-gap)', color: 'var(--primary)' }}>
                  선택 장착 옵션 사양 · {(activeSpec.optionalEquipments || []).length}항목
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-label-gap)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {(activeSpec.optionalEquipments || []).map((eq, i) => (
                    <div key={i}>• {eq}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
            <div style={{ padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-header)' }}>
              <div style={{ fontWeight: 800, marginBottom: 'var(--space-tight-gap)', color: 'var(--success)' }}>
                안전 사양 및 운전자 일일점검 수칙
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-label-gap)', fontSize: '12px', color: 'var(--text-main)' }}>
                {activeSpec.safetyFeatures.map((sf, idx) => (
                  <div key={`sf-${idx}`}>• [안전] {sf}</div>
                ))}
                {activeSpec.dailyChecklist.map((dc, idx) => (
                  <div key={`dc-${idx}`} style={{ color: 'var(--primary)' }}>• [일일점검] {dc}</div>
                ))}
              </div>
            </div>

            <div style={{ padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-header)' }}>
              <div style={{ fontWeight: 800, marginBottom: 'var(--space-tight-gap)', color: 'var(--warning)' }}>
                가동시간별 예방정비 주기 및 호환 부품
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-label-gap)', fontSize: '12px', color: 'var(--text-main)' }}>
                {activeSpec.periodicMaintenance.map((pm, idx) => (
                  <div key={`pm-${idx}`}>• {pm}</div>
                ))}
                {activeSpec.compatibleParts.length > 0 && (
                  <div style={{ marginTop: 'var(--space-tight-gap)', paddingTop: 'var(--space-tight-gap)', borderTop: '1px dashed var(--border-color)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '1px', color: 'var(--text-secondary)' }}>연동 호환 부품 목록</div>
                    {activeSpec.compatibleParts.map((cp) => (
                      <div key={cp.partCode} style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        • [{cp.partCode}] {cp.partName} · {cp.category} · {cp.replacementCycle}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeSpec.documents && activeSpec.documents.length > 0 && (
            <DataGrid
              columns={[
                { key: 'cat', header: '문서구분', width: 120, render: (d) => d.docCategoryLabel },
                { key: 'title', header: '문서제목', render: (d) => <span style={{ fontWeight: 700 }}>{d.title}</span> },
                { key: 'docNo', header: '문서번호', width: 145, render: (d) => d.docNo },
                { key: 'pages', header: '분량 · 크기', width: 105, render: (d) => `${d.pageCount}쪽 · ${d.fileSizeLabel}` },
                { key: 'issued', header: '발행일', width: 95, render: (d) => d.issuedDate },
                {
                  key: 'preview',
                  header: '미리보기',
                  width: 86,
                  align: 'center',
                  render: (d) => (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPreviewDoc({
                          title: d.title,
                          url: d.localUrl || d.r2Url,
                          r2Url: d.r2Url,
                        })
                      }
                      style={actionBtnStyle('secondary', true)}
                    >
                      보기
                    </button>
                  ),
                },
                {
                  key: 'link',
                  header: '원본',
                  width: 70,
                  align: 'center',
                  render: (d) => (
                    <a
                      href={d.r2Url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--primary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '1px' }}
                    >
                      열기
                      <ExternalLink size={12} />
                    </a>
                  ),
                },
              ]}
              rows={activeSpec.documents}
              rowKey={(d) => d.id}
              maxHeight="220px"
            />
          )}
        </>
      )}
    </div>
  </SectionPanel>
);

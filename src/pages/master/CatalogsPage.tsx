import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import { matchesKoreanQuery } from '../../utils/hangulSearch';
import {
  getCompleteMastSpecs,
  getCompleteVdiSpecs,
  type FlModelTechnicalSpec,
} from '../../data/flTechnicalTypes';
import type { CompatiblePartCatalogItem, PartCategoryType } from '../../data/compatiblePartsCatalogData';
import { CatalogSpecDetailPanel } from './CatalogSpecDetailPanel';
import type { CatalogPreviewDoc } from './CatalogPartsAndPackagesTabs';

const CatalogCompareTab = React.lazy(() =>
  import('./CatalogSubTabs').then((m) => ({ default: m.CatalogCompareTab }))
);
const CatalogPartsTab = React.lazy(() =>
  import('./CatalogPartsAndPackagesTabs').then((m) => ({ default: m.CatalogPartsTab }))
);
const CatalogPackagesTab = React.lazy(() =>
  import('./CatalogPartsAndPackagesTabs').then((m) => ({ default: m.CatalogPackagesTab }))
);
const CatalogPreviewDocModal = React.lazy(() =>
  import('./CatalogPartsAndPackagesTabs').then((m) => ({ default: m.CatalogPreviewDocModal }))
);

const MAX_COMPARE_MODELS = 5;

function formatSpecMetric(val: unknown, unit = ''): string {
  if (val === undefined || val === null) return '-';
  const raw = String(val).trim();
  if (!raw || raw === '-') return '-';
  const formattedNumbers = raw.replace(/\b(\d{4,})(?:\.\d+)?\b/g, (m) => {
    const [intPart, decPart] = m.split('.');
    const intFormatted = Number(intPart).toLocaleString('ko-KR');
    return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
  });
  const trimmedUnit = unit.trim();
  if (!trimmedUnit) return formattedNumbers;
  if (formattedNumbers.toLowerCase().endsWith(trimmedUnit.toLowerCase())) {
    return formattedNumbers;
  }
  return `${formattedNumbers} ${trimmedUnit}`;
}

function buildCoreSpecCells(spec: FlModelTechnicalSpec): { label: string; value: string }[] {
  const cells: { label: string; value: string }[] = [
    { label: '정격 적재하중 Q', value: formatSpecMetric(spec.ratedCapacityKg, 'kg') },
    { label: '하중중심 거리 c', value: formatSpecMetric(spec.loadCenterMm, 'mm') },
    { label: '표준 인상고 h3', value: formatSpecMetric(spec.standardLiftHeightMm, 'mm') },
    { label: '최대 옵션 인상고', value: formatSpecMetric(spec.maxOptionLiftHeightMm, 'mm') },
    { label: '자유 인상고 h2', value: formatSpecMetric(spec.freeLiftHeightMm, 'mm') },
    { label: '표준 포크 규격 s×e×l', value: formatSpecMetric(spec.forkDimensionsMm, 'mm') },
    { label: '본체 전장 l2', value: formatSpecMetric(spec.overallLengthMm, 'mm') },
    { label: '전폭 b1', value: formatSpecMetric(spec.overallWidthMm, 'mm') },
    { label: '헤드가드 높이 h6', value: formatSpecMetric(spec.overheadGuardHeightMm, 'mm') },
    { label: '최소 회전반경 Wa', value: formatSpecMetric(spec.turningRadiusMm, 'mm') },
    { label: '직각통로폭 1000×1200 Ast', value: formatSpecMetric(spec.aisleWidth1000x1200Mm, 'mm') },
    { label: '주행속도 적재/공차', value: formatSpecMetric(spec.travelSpeedKmh, 'km/h') },
    { label: '인상속도 적재/공차', value: formatSpecMetric(spec.liftingSpeedMms, 'mm/s') },
    { label: '최대 등판능력', value: formatSpecMetric(spec.gradeabilityPercent, '%') },
    { label: '장비 자중', value: formatSpecMetric(spec.serviceWeightKg, 'kg') },
    { label: '방수 등급', value: spec.waterproofRating },
  ];

  const optPush = (label: string, val: unknown, suffix = '') => {
    const formatted = formatSpecMetric(val, suffix);
    if (formatted === '-') return;
    cells.push({ label, value: formatted });
  };

  optPush('하중거리 x', spec.loadDistanceXMm, ' mm');
  optPush('축거 y', spec.wheelbaseMm, ' mm');
  optPush('적재 축중 전/후', spec.axleLoadingLadenKg, ' kg');
  optPush('공차 축중 전/후', spec.axleLoadingUnladenKg, ' kg');
  optPush('차륜수 전/후', spec.wheelCountFrontRear);
  optPush('윤거 전/후', spec.treadFrontRearMm, ' mm');
  optPush('마스트 경사각 전/후', spec.mastTiltDeg, ' °');
  optPush('마스트 최저전고 h1', spec.mastLoweredH1Mm, ' mm');
  optPush('마스트 최대높이 h4', spec.mastExtendedH4Mm, ' mm');
  optPush('좌석 높이 h7', spec.seatHeightH7Mm, ' mm');
  optPush('견인핀 높이 h10', spec.couplingHeightH10Mm, ' mm');
  optPush('포크포함 전장 l1', spec.overallLengthWithForkL1Mm, ' mm');
  optPush('복륜 전폭 b2', spec.overallWidthDualB2Mm, ' mm');
  optPush('포크캐리지 등급', spec.forkCarriageClass);
  optPush('포크캐리지 폭 b3', spec.forkCarriageWidthB3Mm, ' mm');
  optPush('포크 외폭 최소/최대 b5', spec.forkSpreadMinMaxB5Mm, ' mm');
  optPush('최저지상고 마스트하부 m1', spec.groundClearanceMastM1Mm, ' mm');
  optPush('최저지상고 중앙 m2', spec.groundClearanceCenterM2Mm, ' mm');
  optPush('직각통로폭 800×1200 Ast', spec.aisleWidth800x1200Mm, ' mm');
  optPush('하강속도 적재/공차', spec.loweringSpeedMms, ' mm/s');
  optPush('최대 견인력 적재/공차', spec.maxDrawbarPullN, ' N');
  optPush('등판능력 적재/공차', spec.maxGradeabilityPercent, ' %');
  optPush('주브레이크 / 주차브레이크', spec.serviceBrake && spec.parkingBrake ? `${spec.serviceBrake} / ${spec.parkingBrake}` : undefined);
  optPush('주행 / 인양모터 출력', spec.driveMotorKw && spec.liftMotorKw ? `${spec.driveMotorKw} kW / ${spec.liftMotorKw} kW` : undefined);
  optPush('배터리 전압·용량 / 중량', spec.batteryVoltageCapacity ? `${spec.batteryVoltageCapacity}${spec.batteryWeightKg ? ` · ${spec.batteryWeightKg} kg` : ''}` : undefined);
  optPush('구동 제어 / 컨트롤러', spec.driveControlType && spec.controllerMaker ? `${spec.driveControlType} · ${spec.controllerMaker}` : spec.driveControlType || spec.controllerMaker);
  optPush('유압 작동압력 / 토출유량', spec.operatingPressureMpa || spec.oilFlowLmin ? `${formatSpecMetric(spec.operatingPressureMpa, 'MPa')} / ${formatSpecMetric(spec.oilFlowLmin, 'l/min')}` : undefined);
  optPush('운전원귀 소음도 / 유압탱크', spec.soundLevelDb || spec.hydraulicTankLiter ? `${formatSpecMetric(spec.soundLevelDb, 'dB')} / ${formatSpecMetric(spec.hydraulicTankLiter, 'L')}` : undefined);

  return cells.slice(0, 36);
}

export const CatalogsPage: React.FC = () => {
  const { datasets, tenantProfile, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('catalogs');

  const [technicalArchive, setTechnicalArchive] = useState<FlModelTechnicalSpec[]>([]);
  const [compatibleParts, setCompatibleParts] = useState<CompatiblePartCatalogItem[]>([]);
  const [partCategories, setPartCategories] = useState<PartCategoryType[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const [subTab, setSubTab] = useState<'SPECS' | 'COMPARE' | 'PARTS' | 'PACKAGES'>('SPECS');
  const [detailSection, setDetailSection] = useState<'ALL' | 'CORE' | 'VDI' | 'MAST' | 'GUIDE'>('ALL');
  const [specKeyword, setSpecKeyword] = useState('');
  const [mfgFilter, setMfgFilter] = useState('ALL');
  const [powerFilter, setPowerFilter] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [vdiCatFilter, setVdiCatFilter] = useState('ALL');
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState<'FULL' | 'SUMMARY'>('FULL');
  const [excludedCompareLabels, setExcludedCompareLabels] = useState<string[]>([]);
  const [compareTitle, setCompareTitle] = useState('지게차 모델별 상세 제원 비교표');
  const [compareRecipient, setCompareRecipient] = useState('');
  const [compareNote, setCompareNote] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<CatalogPreviewDoc | null>(null);
  const previewDocBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      import('../../data/flTechnicalArchive'),
      import('../../data/compatiblePartsCatalogData'),
    ]).then(([archMod, partsMod]) => {
      if (!alive) return;
      setTechnicalArchive(archMod.FL_TECHNICAL_ARCHIVE);
      setCompatibleParts(partsMod.COMPATIBLE_PARTS_CATALOG);
      setPartCategories(partsMod.PART_CATEGORIES);
      setSelectedSpecId((prev) => prev || archMod.FL_TECHNICAL_ARCHIVE[0]?.id || '');
      setSelectedPartId((prev) => prev || partsMod.COMPATIBLE_PARTS_CATALOG[0]?.id || '');
      setCatalogLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    previewDocBlobUrlRef.current = previewDoc?.isBlob ? previewDoc.url : null;
  }, [previewDoc]);

  useEffect(() => {
    return () => {
      if (previewDocBlobUrlRef.current) {
        URL.revokeObjectURL(previewDocBlobUrlRef.current);
      }
    };
  }, []);

  const openPreviewDoc = (nextDoc: CatalogPreviewDoc) => {
    setPreviewDoc((prev) => {
      if (prev?.isBlob && prev.url) {
        URL.revokeObjectURL(prev.url);
      }
      return nextDoc;
    });
  };

  const closePreviewDoc = () => {
    setPreviewDoc((prev) => {
      if (prev?.isBlob && prev.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  };

  const [partCategory, setPartCategory] = useState('ALL');
  const [partKeyword, setPartKeyword] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');

  const [pkgTitle, setPkgTitle] = useState('');
  const [pkgRole, setPkgRole] = useState('대리점');
  const [pkgSaving, setPkgSaving] = useState(false);

  const manufacturers = useMemo(
    () => Array.from(new Set(technicalArchive.map((s) => s.manufacturerName))),
    [technicalArchive]
  );
  const powerTypes = useMemo(
    () => Array.from(new Set(technicalArchive.map((s) => s.powerType))),
    [technicalArchive]
  );
  const equipmentClasses = useMemo(
    () => Array.from(new Set(technicalArchive.map((s) => s.equipmentClass))),
    [technicalArchive]
  );

  const filteredSpecs = useMemo(() => {
    const q = specKeyword.trim();
    return technicalArchive.filter((s) => {
      if (mfgFilter !== 'ALL' && s.manufacturerName !== mfgFilter) return false;
      if (powerFilter !== 'ALL' && s.powerType !== powerFilter) return false;
      if (classFilter !== 'ALL' && s.equipmentClass !== classFilter) return false;
      if (!q) return true;
      return matchesKoreanQuery(`${s.modelName} ${s.manufacturerName} ${s.seriesName} ${s.powerType}`, q);
    });
  }, [classFilter, mfgFilter, powerFilter, specKeyword, technicalArchive]);

  const activeSpec =
    filteredSpecs.find((s) => s.id === selectedSpecId) || filteredSpecs[0] || null;

  const activeCoreCells = useMemo(
    () => (activeSpec ? buildCoreSpecCells(activeSpec) : []),
    [activeSpec]
  );
  const activeVdiRows = useMemo(
    () => (activeSpec ? getCompleteVdiSpecs(activeSpec) : []),
    [activeSpec]
  );
  const activeVdiCategories = useMemo(
    () => Array.from(new Set(activeVdiRows.map((r) => r.category))),
    [activeVdiRows]
  );
  const filteredVdiRows = useMemo(
    () => (vdiCatFilter === 'ALL' ? activeVdiRows : activeVdiRows.filter((r) => r.category === vdiCatFilter)),
    [activeVdiRows, vdiCatFilter]
  );
  const activeMastRows = useMemo(
    () => (activeSpec ? getCompleteMastSpecs(activeSpec) : []),
    [activeSpec]
  );

  const comparedModels = useMemo(
    () =>
      compareIds
        .map((id) => technicalArchive.find((m) => m.id === id))
        .filter((m): m is FlModelTechnicalSpec => Boolean(m)),
    [compareIds, technicalArchive]
  );

  const toggleCompareId = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE_MODELS) {
        notifyToast(`모델 제원 비교는 최대 ${MAX_COMPARE_MODELS}개 기종까지 선택할 수 있습니다.`, 'error');
        return prev;
      }
      return [...prev, id];
    });
  };

  const filteredParts = useMemo(() => {
    const q = partKeyword.trim();
    return compatibleParts.filter((p) => {
      if (partCategory !== 'ALL' && p.category !== partCategory) return false;
      if (!q) return true;
      return matchesKoreanQuery(
        `${p.partName} ${p.sku} ${p.tvhRefNo || ''} ${p.oemCrossRefCodes.join(' ')} ${p.compatibleModels.join(' ')}`,
        q
      );
    });
  }, [compatibleParts, partCategory, partKeyword]);

  const vdiCompletedModelCount = useMemo(
    () => technicalArchive.filter((m) => Array.isArray(m.vdiSpecs) && m.vdiSpecs.length >= 50).length,
    [technicalArchive]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="VDI 2198 제원 · 호환 부품 카탈로그"
        manualId="cat-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'SPECS', label: '장비 제원표', count: technicalArchive.length },
              { id: 'COMPARE', label: '모델 제원 비교', count: comparedModels.length },
              { id: 'PARTS', label: '호환부품 카탈로그', count: compatibleParts.length },
              { id: 'PACKAGES', label: '배포 패키지', count: datasets.catalogPackages.length },
            ]}
            activeId={subTab}
            onChange={(id) => setSubTab(id as typeof subTab)}
          />
        }
      >
        {subTab === 'SPECS' && (
          <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            {!catalogLoaded && (
              <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                제원 데이터 불러오는 중
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
              <VerticalField label="장비 기종 · 제조사 검색" minWidth={240} flex={1}>
                <input
                  type="text"
                  value={specKeyword}
                  onChange={(e) => setSpecKeyword(e.target.value)}
                  placeholder="모델명, 제조사, 시리즈 검색"
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="제조사" width={175}>
                <select value={mfgFilter} onChange={(e) => setMfgFilter(e.target.value)} style={controlInputStyle}>
                  <option value="ALL">전체 제조사</option>
                  {manufacturers.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <VerticalField label="동력구분" width={165}>
                <select value={powerFilter} onChange={(e) => setPowerFilter(e.target.value)} style={controlInputStyle}>
                  <option value="ALL">전체 동력</option>
                  {powerTypes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <VerticalField label="차종구분" width={205}>
                <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={controlInputStyle}>
                  <option value="ALL">전체 차종</option>
                  {equipmentClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </VerticalField>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(350px, 1fr) minmax(520px, 1.85fr)',
                gap: 'var(--space-page-gap)',
                alignItems: 'start',
              }}
            >
              <DataGrid
                columns={[
                  { key: 'mfg', header: '제조사', width: 96, render: (r) => r.manufacturerName },
                  {
                    key: 'model',
                    header: '모델명 · 시리즈',
                    render: (r) => (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{r.modelName}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.seriesName}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'cap',
                    header: '적재하중',
                    width: 85,
                    align: 'right',
                    render: (r) => `${r.ratedCapacityKg.toLocaleString('ko-KR')} kg`,
                  },
                  {
                    key: 'vdiCnt',
                    header: 'VDI',
                    width: 66,
                    align: 'center',
                    render: (r) => `${getCompleteVdiSpecs(r).length}항목`,
                  },
                  {
                    key: 'cmp',
                    header: '비교',
                    width: 74,
                    align: 'center',
                    render: (r) => {
                      const active = compareIds.includes(r.id);
                      return (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleCompareId(r.id);
                          }}
                          style={actionBtnStyle(active ? 'primary' : 'secondary', true)}
                        >
                          {active ? '선택됨' : '담기'}
                        </button>
                      );
                    },
                  },
                ]}
                rows={filteredSpecs}
                rowKey={(r) => r.id}
                selectedRowId={activeSpec?.id || null}
                onRowClick={(r) => {
                  setSelectedSpecId(r.id);
                  setVdiCatFilter('ALL');
                }}
                maxHeight="calc(100vh - 200px)"
              />

              {activeSpec && (
                <CatalogSpecDetailPanel
                  activeSpec={activeSpec}
                  activeCoreCells={activeCoreCells}
                  activeVdiRows={activeVdiRows}
                  activeVdiCategories={activeVdiCategories}
                  filteredVdiRows={filteredVdiRows}
                  activeMastRows={activeMastRows}
                  detailSection={detailSection}
                  onDetailSectionChange={setDetailSection}
                  vdiCatFilter={vdiCatFilter}
                  onVdiCatFilterChange={setVdiCatFilter}
                  compareIds={compareIds}
                  onToggleCompareId={toggleCompareId}
                  pdfBusy={pdfBusy}
                  onPdfBusyChange={setPdfBusy}
                  tenantProfile={tenantProfile}
                  onOpenPreviewDoc={openPreviewDoc}
                  notifyToast={notifyToast}
                />
              )}
            </div>
          </div>
        )}

        {subTab === 'COMPARE' && (
          <React.Suspense
            fallback={
              <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                모델 비교 탭 불러오는 중
              </div>
            }
          >
            <CatalogCompareTab
              technicalArchive={technicalArchive}
              maxCompareModels={MAX_COMPARE_MODELS}
              formatSpecMetric={formatSpecMetric}
              compareIds={compareIds}
              onCompareIdsChange={setCompareIds}
              comparedModels={comparedModels}
              onToggleCompareId={toggleCompareId}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              excludedCompareLabels={excludedCompareLabels}
              onExcludedCompareLabelsChange={setExcludedCompareLabels}
              compareTitle={compareTitle}
              onCompareTitleChange={setCompareTitle}
              compareRecipient={compareRecipient}
              onCompareRecipientChange={setCompareRecipient}
              compareNote={compareNote}
              onCompareNoteChange={setCompareNote}
              partners={datasets.partners}
              tenantProfile={tenantProfile}
              pdfBusy={pdfBusy}
              onPdfBusyChange={setPdfBusy}
              onOpenPreviewDoc={openPreviewDoc}
              notifyToast={notifyToast}
            />
          </React.Suspense>
        )}

        {subTab === 'PARTS' && (
          <React.Suspense
            fallback={
              <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                호환부품 탭 불러오는 중
              </div>
            }
          >
            <CatalogPartsTab
              partKeyword={partKeyword}
              onPartKeywordChange={setPartKeyword}
              partCategory={partCategory}
              onPartCategoryChange={setPartCategory}
              partCategories={partCategories}
              filteredParts={filteredParts}
              selectedPartId={selectedPartId}
              onSelectPartId={setSelectedPartId}
              formatMoney={formatMoney}
            />
          </React.Suspense>
        )}

        {subTab === 'PACKAGES' && (
          <React.Suspense
            fallback={
              <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                배포 패키지 탭 불러오는 중
              </div>
            }
          >
            <CatalogPackagesTab
              canEdit={canEdit}
              pkgTitle={pkgTitle}
              onPkgTitleChange={setPkgTitle}
              pkgRole={pkgRole}
              onPkgRoleChange={setPkgRole}
              pkgSaving={pkgSaving}
              onPkgSavingChange={setPkgSaving}
              comparedModels={comparedModels}
              activeSpec={activeSpec}
              filteredParts={filteredParts}
              catalogPackages={datasets.catalogPackages}
              refreshAll={refreshAll}
              notifyToast={notifyToast}
            />
          </React.Suspense>
        )}
      </SectionPanel>

      <ConservationBar
        manualId="cat-conservation"
        balanced={catalogLoaded && technicalArchive.length >= 52}
        balanceMessage={catalogLoaded ? '백업 제원 아카이브 복원 완료' : '제원 데이터 불러오는 중'}
        items={[
          { label: '수록 장비 기종', value: `${technicalArchive.length}종`, tone: 'primary' },
          { label: 'VDI 2198 55항목 완비', value: `${vdiCompletedModelCount}종`, tone: 'success' },
          { label: '호환부품 마스터', value: `${compatibleParts.length}종`, tone: 'neutral' },
          { label: '배포 패키지', value: `${datasets.catalogPackages.length}건`, tone: 'neutral' },
          { label: '모델 제원 비교', value: `${comparedModels.length}/${MAX_COMPARE_MODELS}종`, tone: 'primary' },
        ]}
      />

      {previewDoc && (
        <React.Suspense fallback={null}>
          <CatalogPreviewDocModal previewDoc={previewDoc} onClose={closePreviewDoc} />
        </React.Suspense>
      )}
    </div>
  );
};

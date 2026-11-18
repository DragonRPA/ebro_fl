import React from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import type { AppShellContextValue } from '../../core/AppShellContext';
import {
  DataGrid,
  ModalDialog,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import type { FlCatalogPackage } from '../../types/domain';
import type { FlModelTechnicalSpec } from '../../data/flTechnicalTypes';
import type { CompatiblePartCatalogItem, PartCategoryType } from '../../data/compatiblePartsCatalogData';

export interface CatalogPreviewDoc {
  title: string;
  url: string;
  r2Url?: string;
  downloadFileName?: string;
  isBlob?: boolean;
}

export const CatalogPartsTab: React.FC<{
  partKeyword: string;
  onPartKeywordChange: (val: string) => void;
  partCategory: string;
  onPartCategoryChange: (val: string) => void;
  partCategories: PartCategoryType[];
  filteredParts: CompatiblePartCatalogItem[];
  selectedPartId: string;
  onSelectPartId: (id: string) => void;
  formatMoney: AppShellContextValue['formatMoney'];
}> = ({
  partKeyword,
  onPartKeywordChange,
  partCategory,
  onPartCategoryChange,
  partCategories,
  filteredParts,
  selectedPartId,
  onSelectPartId,
  formatMoney,
}) => {
  const activePart: CompatiblePartCatalogItem | null =
    filteredParts.find((p) => p.id === selectedPartId) || filteredParts[0] || null;

  return (
    <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
        <VerticalField label="부품명 · 품번 · OEM 교차코드 검색" minWidth={240} flex={1}>
          <input
            type="text"
            value={partKeyword}
            onChange={(e) => onPartKeywordChange(e.target.value)}
            placeholder="부품명, 품목코드, OEM 교차코드, 적용기종 검색"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="부품 분류" width={190}>
          <select
            value={partCategory}
            onChange={(e) => onPartCategoryChange(e.target.value)}
            style={controlInputStyle}
          >
            <option value="ALL">전체 분류</option>
            {partCategories.map((c) => (
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
          gridTemplateColumns: 'minmax(480px, 1.35fr) minmax(360px, 1fr)',
          gap: 'var(--space-page-gap)',
          alignItems: 'start',
        }}
      >
        <DataGrid
          columns={[
            {
              key: 'sku',
              header: '품목코드',
              width: 130,
              sortable: true,
              sortValue: (r) => r.sku,
              render: (r) => <span style={{ fontWeight: 700 }}>{r.sku}</span>,
            },
            {
              key: 'category',
              header: '분류',
              width: 135,
              sortable: true,
              sortValue: (r) => r.category,
              render: (r) => r.category,
            },
            {
              key: 'partName',
              header: '부품명',
              sortable: true,
              sortValue: (r) => r.partName,
              render: (r) => r.partName,
            },
            {
              key: 'tonnage',
              header: '적용톤수',
              width: 100,
              sortable: true,
              sortValue: (r) => r.tonnageRange || null,
              render: (r) => r.tonnageRange,
            },
            {
              key: 'dealerPriceKrw',
              header: '대리점가',
              width: 105,
              align: 'right',
              sortable: true,
              sortValue: (r) => Number(r.dealerPriceKrw || 0),
              render: (r) => formatMoney(r.dealerPriceKrw, { salesSensitive: true }),
            },
            {
              key: 'retailPriceKrw',
              header: '소비자가',
              width: 105,
              align: 'right',
              sortable: true,
              sortValue: (r) => Number(r.retailPriceKrw || 0),
              render: (r) => formatMoney(r.retailPriceKrw, { salesSensitive: true }),
            },
          ]}
          rows={filteredParts}
          rowKey={(r) => r.id}
          selectedRowId={activePart?.id || null}
          onRowClick={(r) => onSelectPartId(r.id)}
          maxHeight="calc(100vh - 200px)"
        />

        {activePart && (
          <SectionPanel
            title={activePart.partName}
            titleSlot={
              <div style={{ display: 'flex', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}>
                <StatusBadge label={activePart.partGrade} tone="info" />
                <StatusBadge label={activePart.originCountry} tone="neutral" />
              </div>
            }
          >
            <div data-testid="part-detail-specs" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)', fontSize: '12.5px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-inline-gap)' }}>
                {[
                  { label: '자사 품목코드', value: activePart.sku },
                  { label: '참조 품번 · 브랜드', value: `${activePart.tvhRefNo || '-'} · ${activePart.tvhBrand || activePart.manufacturer}` },
                  { label: '적용 톤수 범위', value: activePart.tonnageRange },
                  { label: '보관 창고 · 단위', value: `${activePart.warehouseLocation} · ${activePart.unitName}` },
                  { label: '재고 · 최소발주', value: `${activePart.stockQty} ${activePart.unitName} · 최소 ${activePart.moq}` },
                  { label: '납기 기준', value: activePart.deliveryPolicy },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
                      borderRadius: '6px',
                      border: '1px solid var(--table-row-border)',
                      backgroundColor: 'var(--bg-app)',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{row.label}</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{row.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-header)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1px' }}>표준 요약 규격</div>
                <div style={{ fontWeight: 600 }}>{activePart.specSummary}</div>
              </div>

              {activePart.detailedSpecs && activePart.detailedSpecs.length > 0 && (
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 'var(--space-tight-gap)' }}>실측 치수 · 상세 규격표</div>
                  <DataGrid
                    columns={[
                      { key: 'label', header: '규격 항목', width: 150, render: (s) => <span style={{ fontWeight: 700 }}>{s.label}</span> },
                      { key: 'value', header: '측정 규격 · 수치', render: (s) => s.value },
                    ]}
                    rows={activePart.detailedSpecs}
                    rowKey={(s, idx) => `${s.label}-${idx}`}
                    maxHeight="220px"
                  />
                </div>
              )}

              <div style={{ padding: 'var(--space-table-th-pad-y) calc(11px - 2pt)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-app)' }}>
                <div style={{ fontWeight: 800, marginBottom: 'var(--space-label-gap)', color: 'var(--primary)' }}>OEM 교차품번 목록</div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                  {activePart.oemCrossRefCodes.join(', ') || '-'}
                </div>
              </div>

              <div style={{ padding: 'var(--space-table-th-pad-y) calc(11px - 2pt)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-app)' }}>
                <div style={{ fontWeight: 800, marginBottom: 'var(--space-label-gap)' }}>호환 제조사 · 적용 기종</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '1px' }}>
                  제조사: {activePart.compatibleBrands.join(', ')}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                  적용 모델: {activePart.compatibleModels.join(', ')}
                </div>
              </div>

              <div style={{ padding: 'var(--space-table-th-pad-y) calc(11px - 2pt)', borderRadius: '6px', border: '1px solid var(--table-row-border)', backgroundColor: 'var(--bg-header)', fontSize: '12px' }}>
                <div style={{ fontWeight: 700, marginBottom: '1px' }}>기술 노트 · {activePart.referenceSource}</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{activePart.technicalNote}</div>
              </div>
            </div>
          </SectionPanel>
        )}
      </div>
    </div>
  );
};

export const CatalogPackagesTab: React.FC<{
  canEdit: boolean;
  pkgTitle: string;
  onPkgTitleChange: (val: string) => void;
  pkgRole: string;
  onPkgRoleChange: (val: string) => void;
  pkgSaving: boolean;
  onPkgSavingChange: (saving: boolean) => void;
  comparedModels: FlModelTechnicalSpec[];
  activeSpec: FlModelTechnicalSpec | null;
  filteredParts: CompatiblePartCatalogItem[];
  catalogPackages: FlCatalogPackage[];
  refreshAll: () => Promise<void>;
  notifyToast: AppShellContextValue['notifyToast'];
}> = ({
  canEdit,
  pkgTitle,
  onPkgTitleChange,
  pkgRole,
  onPkgRoleChange,
  pkgSaving,
  onPkgSavingChange,
  comparedModels,
  activeSpec,
  filteredParts,
  catalogPackages,
  refreshAll,
  notifyToast,
}) => {
  const handleSavePackage = async () => {
    if (!pkgTitle.trim()) {
      notifyToast('카탈로그 패키지 제목을 입력해 주세요.', 'error');
      return;
    }
    onPkgSavingChange(true);
    try {
      const pkg: FlCatalogPackage = {
        id: newId('PKG'),
        tenantId: DEFAULT_TENANT_ID,
        catalogCode: `CAT-${Date.now().toString(36).toUpperCase()}`,
        title: pkgTitle.trim(),
        targetPartnerRole: pkgRole,
        targetModels: comparedModels.length > 0 ? comparedModels.map((m) => m.modelName) : activeSpec ? [activeSpec.modelName] : [],
        selectedItemSkus: filteredParts.slice(0, 12).map((p) => p.sku),
        showUnitPrice: true,
        showStock: true,
        isDefault: false,
      };
      await execDbMutation('카탈로그 패키지 생성', () =>
        flSupabase.from('catalog_packages').insert(camelToSnakeRow({ ...pkg }))
      );
      onPkgTitleChange('');
      await refreshAll();
      notifyToast('카탈로그 패키지 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '패키지 저장 실패', 'error');
    } finally {
      onPkgSavingChange(false);
    }
  };

  return (
    <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
          <VerticalField label="패키지 제목" minWidth={240} flex={1}>
            <input
              type="text"
              value={pkgTitle}
              onChange={(e) => onPkgTitleChange(e.target.value)}
              placeholder="대리점 배포 카탈로그 제목"
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="대상 역할" width={140}>
            <select
              value={pkgRole}
              onChange={(e) => onPkgRoleChange(e.target.value)}
              style={controlInputStyle}
            >
              <option value="대리점">대리점</option>
              <option value="매출처">매출처</option>
            </select>
          </VerticalField>
          <button
            type="button"
            disabled={pkgSaving}
            onClick={handleSavePackage}
            style={actionBtnStyle('primary')}
          >
            패키지 생성
          </button>
        </div>
      )}

      <DataGrid
        columns={[
          { key: 'code', header: '카탈로그코드', width: 150, render: (r) => r.catalogCode },
          { key: 'title', header: '제목', render: (r) => r.title },
          { key: 'models', header: '대상 기종', width: 220, render: (r) => r.targetModels.join(', ') || '-' },
          { key: 'role', header: '대상역할', width: 100, render: (r) => r.targetPartnerRole },
          {
            key: 'cnt',
            header: '포함품목수',
            width: 100,
            align: 'right',
            render: (r) => `${r.selectedItemSkus.length}종`,
          },
        ]}
        rows={catalogPackages}
        rowKey={(r) => r.id}
        maxHeight="calc(100vh - 260px)"
      />
    </div>
  );
};

export const CatalogPreviewDocModal: React.FC<{
  previewDoc: CatalogPreviewDoc | null;
  onClose: () => void;
}> = ({ previewDoc, onClose }) => (
  <ModalDialog
    open={Boolean(previewDoc)}
    title={previewDoc ? previewDoc.title : ''}
    onClose={onClose}
    width={960}
  >
    {previewDoc && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-field-grid-gap)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
          {previewDoc.isBlob && previewDoc.downloadFileName ? (
            <a
              href={previewDoc.url}
              download={previewDoc.downloadFileName}
              style={actionBtnStyle('primary', true)}
            >
              <Download size={13} />
              PDF 파일 저장
            </a>
          ) : (
            previewDoc.r2Url && (
              <a
                href={previewDoc.r2Url}
                target="_blank"
                rel="noreferrer"
                style={actionBtnStyle('primary', true)}
              >
                <ExternalLink size={13} />
                새 창에서 열기
              </a>
            )
          )}
        </div>
        <iframe
          src={previewDoc.url}
          title={previewDoc.title}
          style={{
            width: '100%',
            height: '68vh',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-app)',
          }}
        />
      </div>
    )}
  </ModalDialog>
);

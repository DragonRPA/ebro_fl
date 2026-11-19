import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import {
  SectionPanel,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  getDocTypesForTenant,
  type DocumentTemplateType,
  type FlDocumentTemplate,
} from '../../types/domain';

export const SystemSettingsPage: React.FC = () => {
  const {
    currentUser,
    tenantProfile,
    isRentalEnabled,
    isPopbillTaxInvoiceEnabled,
    datasets,
    refreshAll,
    notifyToast,
    canEditPage,
  } = useAppShell();
  const canEdit = canEditPage('system_settings');
  const visibleDocTypes = useMemo(() => getDocTypesForTenant(isRentalEnabled), [isRentalEnabled]);
  const [busy, setBusy] = useState(false);

  const [tplNotes, setTplNotes] = useState<Record<string, { headerNote: string; footerNote: string }>>({});

  const handleUploadTemplateFile = async (docType: DocumentTemplateType, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setBusy(true);
      try {
        const existing = datasets.documentTemplates.find((t) => t.docType === docType);
        const nowIso = new Date().toISOString();
        if (existing) {
          await execDbMutation('문서 양식 업로드 갱신', () =>
            flSupabase
              .from('document_templates')
              .update(
                camelToSnakeRow({
                  templateName: file.name,
                  templateBase64: base64,
                  updatedBy: currentUser?.name || '관리자',
                  updatedAt: nowIso,
                })
              )
              .eq('id', existing.id)
          );
        } else {
          const rec: FlDocumentTemplate = {
            id: newId('TPL'),
            tenantId: DEFAULT_TENANT_ID,
            docType,
            templateName: file.name,
            templateBase64: base64,
            isDefault: true,
            updatedBy: currentUser?.name || '관리자',
            updatedAt: nowIso,
          };
          await execDbMutation('문서 양식 신규 등록', () =>
            flSupabase.from('document_templates').insert(camelToSnakeRow({ ...rec }))
          );
        }
        await refreshAll();
        notifyToast(`${docType} 양식 파일 저장 완료`, 'success');
      } catch (err) {
        notifyToast(err instanceof Error ? err.message : '양식 업로드 실패', 'error');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTemplateNotes = async (docType: DocumentTemplateType) => {
    const existing = datasets.documentTemplates.find((t) => t.docType === docType);
    const notes = tplNotes[docType] || {
      headerNote: existing?.headerNote || '',
      footerNote: existing?.footerNote || '',
    };
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      if (existing) {
        await execDbMutation('문서 문구 저장', () =>
          flSupabase
            .from('document_templates')
            .update(
              camelToSnakeRow({
                headerNote: notes.headerNote,
                footerNote: notes.footerNote,
                updatedBy: currentUser?.name || '관리자',
                updatedAt: nowIso,
              })
            )
            .eq('id', existing.id)
        );
      } else {
        await execDbMutation('문서 문구 등록', () =>
          flSupabase.from('document_templates').insert(
            camelToSnakeRow({
              id: newId('TPL'),
              tenantId: DEFAULT_TENANT_ID,
              docType,
              templateName: `${docType} 기본양식`,
              headerNote: notes.headerNote,
              footerNote: notes.footerNote,
              isDefault: true,
              updatedBy: currentUser?.name || '관리자',
              updatedAt: nowIso,
            })
          )
        );
      }
      await refreshAll();
      notifyToast(`${docType} 특약 문구 저장 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '양식 문구 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="시스템 설정 · 문서 양식 · 도장"
        manualId="sys-tabs"
      >
        <div data-manual-id="sys-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <div
              style={{
                padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                border: '1px solid var(--table-border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-app)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-conservation-gap)',
                flexWrap: 'wrap',
              }}
            >
              <span>법인명: {tenantProfile.corporateName}</span>
              <span>사업자번호: {tenantProfile.businessNumber}</span>
              <span>도장이미지 연동: {tenantProfile.stampImageUrl || tenantProfile.stampBase64 ? '연동됨' : '미등록'}</span>
              <span>영업범위: {isRentalEnabled ? '유통·렌탈 통합' : '유통 전용'}</span>
              <span>전자세금계산서 연동: {isPopbillTaxInvoiceEnabled ? '팝빌 활성' : '비활성'}</span>
            </div>

            {visibleDocTypes.map((dt) => {
              const tpl = datasets.documentTemplates.find((t) => t.docType === dt);
              const draft = tplNotes[dt] || {
                headerNote: tpl?.headerNote || '',
                footerNote: tpl?.footerNote || '',
              };
              return (
                <div
                  key={dt}
                  style={{
                    padding: 'var(--space-subbox-pad-x)',
                    border: '1px solid var(--table-border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-app)',
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr 1fr auto',
                    gap: 'var(--space-field-grid-gap)',
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{dt.replace('_', ' · ')}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {tpl?.templateBase64 ? `사용자 양식 · ${tpl.templateName}` : '내장 표준양식'}
                    </div>
                  </div>
                  <VerticalField label="특약 · 머리글 문구">
                    <input
                      type="text"
                      value={draft.headerNote}
                      onChange={(e) =>
                        setTplNotes((p) => ({
                          ...p,
                          [dt]: { ...draft, headerNote: e.target.value },
                        }))
                      }
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="하단 안내 문구">
                    <input
                      type="text"
                      value={draft.footerNote}
                      onChange={(e) =>
                        setTplNotes((p) => ({
                          ...p,
                          [dt]: { ...draft, footerNote: e.target.value },
                        }))
                      }
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <div style={{ display: 'flex', gap: 'var(--space-tight-gap)', alignItems: 'center' }}>
                    {canEdit && (
                      <>
                        <label style={{ ...actionBtnStyle('secondary', true), cursor: 'pointer' }}>
                          양식 업로드
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadTemplateFile(dt, f);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSaveTemplateNotes(dt)}
                          style={actionBtnStyle('primary', true)}
                        >
                          문구 저장
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionPanel>
    </div>
  );
};

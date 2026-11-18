import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Mail } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import {
  downloadExcelFile,
  openExcelInAgent,
  sendDocumentEmailViaAgent,
} from '../services/documentService';
import {
  ModalDialog,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  controlTextareaStyle,
} from './UiPrimitives';

export const DocumentActionBar: React.FC<{
  docLabel: string;
  defaultEmail?: string;
  defaultSubject: string;
  defaultBody: string;
  onGenerate: () => Promise<{ fileName: string; base64: string; bytes: Uint8Array }>;
  disabled?: boolean;
  manualId?: string;
}> = ({
  docLabel,
  defaultEmail = '',
  defaultSubject,
  defaultBody,
  onGenerate,
  disabled = false,
  manualId,
}) => {
  const { tenantProfile, currentUser, notifyToast, agentOnline } = useAppShell();
  const [busy, setBusy] = useState(false);
  const [mailStepMsg, setMailStepMsg] = useState<string | null>(null);
  const [mailErrorMsg, setMailErrorMsg] = useState<string | null>(null);
  const [mailModalOpen, setMailModalOpen] = useState(false);
  const [editedPath, setEditedPath] = useState<string | null>(null);
  const [editedFileName, setEditedFileName] = useState<string | null>(null);

  const [toEmail, setToEmail] = useState(defaultEmail);
  const [ccEmail, setCcEmail] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  useEffect(() => {
    setToEmail(defaultEmail);
    setSubject(defaultSubject);
    setBody(defaultBody);
  }, [defaultEmail, defaultSubject, defaultBody]);

  const handleDownload = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await onGenerate();
      downloadExcelFile(res.fileName, res.bytes);
      notifyToast(`${docLabel} 엑셀 생성 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '문서 생성 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenInAgent = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await onGenerate();
      const localPath = await openExcelInAgent(res.fileName, res.base64);
      setEditedPath(localPath);
      setEditedFileName(res.fileName);
      notifyToast('로컬 엑셀 편집 실행 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '로컬 엑셀 편집 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const mailHistoryKey = `ebro_fl_mail_log::${docLabel}::${defaultSubject}`;
  const [lastMailLog, setLastMailLog] = useState<{ sentAt: string; senderName: string; toEmail: string } | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(mailHistoryKey) : null;
      return raw ? (JSON.parse(raw) as { sentAt: string; senderName: string; toEmail: string }) : null;
    } catch {
      return null;
    }
  });

  const handleSendMail = async () => {
    if (!toEmail.trim()) {
      notifyToast('받는사람 이메일 주소를 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    setMailErrorMsg(null);
    setMailStepMsg('1/3 단계: 첨부 문서 파일 생성 중');
    const slowGenTimer = window.setTimeout(() => {
      setMailStepMsg('1/3 단계: 첨부 문서 파일 생성 중 · 지연사유: 양식 및 도장 이미지 처리 대기');
    }, 3500);
    try {
      let fileName = editedFileName || `${docLabel}.xlsx`;
      let base64Content: string | undefined;
      if (!editedPath) {
        const genPromise = onGenerate();
        const timeoutPromise = new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('첨부 문서 생성 시간 초과 (15초)')), 15000)
        );
        const res = await Promise.race([genPromise, timeoutPromise]);
        fileName = res.fileName;
        base64Content = res.base64;
      }
      window.clearTimeout(slowGenTimer);

      const MAX_RETRY = 3;
      const retryDelays = [1500, 3000];
      let lastErr: unknown = null;
      let sent = false;

      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        setMailStepMsg(`2/3 단계: 에이전트 메일 서버 연결 및 발송 중 (${attempt}/${MAX_RETRY}회 시도)`);
        const slowSendTimer = window.setTimeout(() => {
          setMailStepMsg(
            `2/3 단계: 메일 발송 지연 (${attempt}/${MAX_RETRY}회) · 지연사유: 로컬 에이전트 또는 메일 서버 응답 대기`
          );
        }, 4000);
        try {
          await sendDocumentEmailViaAgent({
            tenant: tenantProfile,
            to: toEmail.trim(),
            cc: ccEmail.trim() || undefined,
            subject: subject.trim(),
            body,
            fileName,
            localEditedPath: editedPath,
            base64Content,
          });
          window.clearTimeout(slowSendTimer);
          sent = true;
          break;
        } catch (err) {
          window.clearTimeout(slowSendTimer);
          lastErr = err;
          const reason = err instanceof Error ? err.message : '에이전트 응답 지연 또는 연결 오류';
          if (attempt < MAX_RETRY) {
            const waitMs = retryDelays[attempt - 1] ?? 3000;
            setMailStepMsg(
              `재시도 대기 중 · 지연사유: ${reason} · ${(waitMs / 1000).toFixed(1)}초 후 재시도 (${attempt + 1}/${MAX_RETRY}회)`
            );
            await new Promise((r) => window.setTimeout(r, waitMs));
          }
        }
      }

      if (!sent) {
        throw lastErr instanceof Error ? lastErr : new Error('이메일 발송에 최종 실패했습니다.');
      }

      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const logEntry = {
        sentAt: nowStr,
        senderName: currentUser?.name || '담당자',
        toEmail: toEmail.trim(),
      };
      setLastMailLog(logEntry);
      try {
        window.localStorage.setItem(mailHistoryKey, JSON.stringify(logEntry));
      } catch {
        // 무시
      }
      setMailStepMsg('3/3 단계: 발송 완료');
      notifyToast(`${docLabel} 공식 이메일 발송 완료`, 'success');
      setMailModalOpen(false);
    } catch (err) {
      window.clearTimeout(slowGenTimer);
      const errMsg = err instanceof Error ? err.message : '이메일 발송에 최종 실패했습니다.';
      setMailStepMsg(null);
      setMailErrorMsg(`발송 최종 실패: ${errMsg}`);
      notifyToast(`발송 최종 실패: ${errMsg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        data-manual-id={manualId}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}
      >
        <button
          type="button"
          disabled={busy || disabled}
          onClick={handleDownload}
          style={actionBtnStyle('secondary', true)}
        >
          <Download size={13} />
          엑셀 다운로드
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={handleOpenInAgent}
          title={agentOnline ? '로컬 엑셀 편집 열기' : '전용 에이전트 실행 필요'}
          style={actionBtnStyle('secondary', true)}
        >
          <FileSpreadsheet size={13} />
          에이전트 편집
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setMailModalOpen(true)}
          style={actionBtnStyle('primary', true)}
        >
          <Mail size={13} />
          이메일 발송
        </button>
      </div>

      <ModalDialog
        open={mailModalOpen}
        title={`${docLabel} 공식 이메일 발송`}
        onClose={() => setMailModalOpen(false)}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-field-grid-gap)', flexWrap: 'wrap' }}>
            <VerticalField label="받는사람 이메일" required flex={1} minWidth={200}>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="수신자 이메일 주소 입력"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="참조 이메일" flex={1} minWidth={180}>
              <input
                type="email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="선택 입력"
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
          <VerticalField label="메일 제목" required>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="메일 본문" required>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={controlTextareaStyle}
            />
          </VerticalField>
          <div
            style={{
              padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            {editedPath
              ? `편집 파일 첨부 대상: ${editedFileName} · ${editedPath}`
              : `발송 시 ${docLabel} 최신 양식 파일 생성 후 첨부`}
          </div>
          {mailStepMsg && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--primary)',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {mailStepMsg}
            </div>
          )}
          {mailErrorMsg && (
            <div
              role="alert"
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--danger)',
                backgroundColor: 'var(--danger-light)',
                color: 'var(--danger)',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {mailErrorMsg}
            </div>
          )}
          {lastMailLog && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-secondary)',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              최근 발송: {lastMailLog.sentAt} · 발송자 {lastMailLog.senderName} · 수신 {lastMailLog.toEmail}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
            {editedPath && (
              <button
                type="button"
                onClick={() => {
                  setEditedPath(null);
                  setEditedFileName(null);
                }}
                style={actionBtnStyle('secondary')}
              >
                편집본 연결 해제
              </button>
            )}
            <button
              type="button"
              onClick={() => setMailModalOpen(false)}
              style={actionBtnStyle('secondary')}
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSendMail}
              style={actionBtnStyle('primary')}
            >
              {busy ? '발송중' : '발송 실행'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
};

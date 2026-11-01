import React, { useState } from 'react';
import { CreditCard, AlertTriangle, Building2 } from 'lucide-react';
import { Receivables } from './Receivables';
import { DelinquencyPage } from './DelinquencyPage';
import { BankMatching } from './BankMatching';

export const ReceivableDelinquencyIntegratedPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'RECEIVABLES' | 'DELINQUENCY' | 'BANK_MATCHING'>('RECEIVABLES');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CreditCard size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            수납/연체관리 · 청구에 대한 수납관리 및 납기일 기준 연체관리
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('RECEIVABLES')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'RECEIVABLES' ? 'var(--primary)' : 'transparent',
              color: subTab === 'RECEIVABLES' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <CreditCard size={14} />
            <span>청구 수납관리 · 미수금 대장</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('DELINQUENCY')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'DELINQUENCY' ? '#dc2626' : 'transparent',
              color: subTab === 'DELINQUENCY' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <AlertTriangle size={14} />
            <span>납기일 기준 연체관리</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('BANK_MATCHING')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'BANK_MATCHING' ? '#059669' : 'transparent',
              color: subTab === 'BANK_MATCHING' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Building2 size={14} />
            <span>통장 입금 1:1 대사</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'RECEIVABLES' && <Receivables />}
        {subTab === 'DELINQUENCY' && <DelinquencyPage />}
        {subTab === 'BANK_MATCHING' && <BankMatching />}
      </div>
    </div>
  );
};
export default ReceivableDelinquencyIntegratedPage;

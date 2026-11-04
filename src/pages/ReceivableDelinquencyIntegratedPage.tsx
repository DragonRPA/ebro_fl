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
          <CreditCard size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            수납·연체관리
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('RECEIVABLES')}
            className={`segmented-tab-item ${subTab === 'RECEIVABLES' ? 'active' : ''}`}
          >
            <CreditCard size={14} />
            <span>수납·미수금 대장</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('DELINQUENCY')}
            className={`segmented-tab-item ${subTab === 'DELINQUENCY' ? 'active' : ''}`}
          >
            <AlertTriangle size={14} />
            <span>연체 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('BANK_MATCHING')}
            className={`segmented-tab-item ${subTab === 'BANK_MATCHING' ? 'active' : ''}`}
          >
            <Building2 size={14} />
            <span>통장 입금 대사</span>
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

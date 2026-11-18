import {
  flSupabase,
  getActiveFlTenantId,
  newId,
} from '../core/supabase';
import { hashPassword } from '../utils/cryptoVault';
import {
  getDepartmentFuncTagsForTenant,
  isTenantRentalEnabled,
  type TenantProfile,
} from '../types/domain';
const DEFAULT_BOOTSTRAP_POLICIES: ReadonlyArray<{
  action_code: string;
  action_name: string;
  description: string;
  required_tier: number;
}> = [
  {
    action_code: 'PURCHASE_CONFIRM',
    action_name: '매입 입고 확정',
    description: '수입/내수 매입원가 확정 및 재고 원장 생성',
    required_tier: 3,
  },
  {
    action_code: 'LEASE_CREATE',
    action_name: '금융리스 계약 등록',
    description: '금융사 리스 원리금 상환 스케줄 및 렌탈자산 등록',
    required_tier: 5,
  },
  {
    action_code: 'ACCOUNT_TRANSFER',
    action_name: '계정대체 실행',
    description: '유통재고와 렌탈자산 간 소유계정 전환',
    required_tier: 4,
  },
  {
    action_code: 'TRADE_CONTRACT_CONFIRM',
    action_name: '유통 계약 확정',
    description: '판매 단가 및 수량 확정',
    required_tier: 3,
  },
  {
    action_code: 'RENTAL_CONTRACT_CONFIRM',
    action_name: '렌탈 계약 확정',
    description: '렌탈 기간, 월단가 및 청구조건 확정',
    required_tier: 3,
  },
  {
    action_code: 'FULFILLMENT_COMPLETE',
    action_name: '출고·회수 실행완료',
    description: '희망완료일 기준 출고·회수 확정 처리',
    required_tier: 2,
  },
  {
    action_code: 'EXCHANGE_EXECUTE',
    action_name: '렌탈 교환 실행',
    description: '기존 자산 회수 및 교체 자산 투입 및 조건 승계',
    required_tier: 3,
  },
  {
    action_code: 'TRADE_REFUND',
    action_name: '유통 반품 환불',
    description: '기판매 유통 품목 반품 입고 및 매출/부가세 차감',
    required_tier: 4,
  },
  {
    action_code: 'BILLING_CREATE',
    action_name: '월말 청구 발행',
    description: '계약 기준 청구 생성 및 세금계산서 연동',
    required_tier: 3,
  },
  {
    action_code: 'AP_SETTLEMENT_PAY',
    action_name: '매입·물류 대금 지급',
    description: '매입채무·운송비·정비외주비 지급 확정',
    required_tier: 4,
  },
  {
    action_code: 'ASSET_DISPOSAL',
    action_name: '자산 폐기 처분',
    description: '보유 자산 장부가 제각 및 폐기 확정',
    required_tier: 6,
  },
  {
    action_code: 'POLICY_CONFIG_SAVE',
    action_name: '권한·결재 기준 변경',
    description: '7단계 직급 결재선 및 메뉴 접근권한 변경',
    required_tier: 7,
  },
  {
    action_code: 'HR_APPOINTMENT',
    action_name: '인사 발령 · 직급 변경',
    description: '임직원 부서이동·직책·티어·재직상태 인사발령 확정',
    required_tier: 5,
  },
];

const tenantBootstrapInFlight = new Map<string, Promise<void>>();
const bootstrappedTenantIds = new Set<string>();

export function clearBootstrappedTenantCache(tenantId?: string): void {
  if (tenantId) {
    bootstrappedTenantIds.delete(tenantId);
  } else {
    bootstrappedTenantIds.clear();
  }
}

/**
 * 신규 등록된 FL 테넌트가 첫 진입 시 빈 DB로 막히지 않도록
 * 기본 최상위 부서, 초기 관리자 계정, 13종 결재 기준, 5종 문서 양식을 멱등 시드한다.
 */
export async function ensureFlTenantBootstrapped(tenant: TenantProfile): Promise<void> {
  const tenantId = getActiveFlTenantId();
  if (bootstrappedTenantIds.has(tenantId)) {
    return;
  }
  const inflight = tenantBootstrapInFlight.get(tenantId);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    const [deptProbe, userProbe, polProbe, tplProbe] = await Promise.all([
      flSupabase.from('departments').select('id').limit(1),
      flSupabase.from('users').select('id').limit(1),
      flSupabase.from('approval_policies').select('id').limit(1),
      flSupabase.from('document_templates').select('id').limit(1),
    ]);

    if (deptProbe.error || userProbe.error || polProbe.error || tplProbe.error) {
      return;
    }

    let rootDeptId: string | null = null;
    if (Array.isArray(deptProbe.data) && deptProbe.data.length === 0) {
      rootDeptId = newId('DEPT');
      await flSupabase.from('departments').insert({
        id: rootDeptId,
        tenant_id: tenantId,
        name: '경영총괄본부',
        parent_department_id: null,
        functional_tags: getDepartmentFuncTagsForTenant(isTenantRentalEnabled(tenant)),
        sort_order: 10,
        memo: '초기 자동 생성 최상위 조직',
        is_active: true,
      });
    } else {
      rootDeptId = (deptProbe.data?.[0] as { id?: string } | undefined)?.id || null;
    }

    if (Array.isArray(userProbe.data) && userProbe.data.length === 0) {
      await flSupabase.from('users').upsert(
        {
          id: newId('USR'),
          tenant_id: tenantId,
          login_id: 'admin',
          password_hash: hashPassword('admin1234'),
          name: tenant.representativeName || '시스템관리자',
          employee_no: 'EMP-001',
          department_id: rootDeptId,
          position: '대표이사',
          duty: '총괄관리',
          tier_level: 7,
          must_change_password: true,
          status: 'ACTIVE',
          is_active: true,
        },
        { onConflict: 'tenant_id,login_id', ignoreDuplicates: true }
      );
    }

    if (Array.isArray(polProbe.data) && polProbe.data.length === 0) {
      const policyRows = DEFAULT_BOOTSTRAP_POLICIES.map((p) => ({
        id: newId('POL'),
        tenant_id: tenantId,
        action_code: p.action_code,
        action_name: p.action_name,
        description: p.description,
        required_tier: p.required_tier,
        requires_approval: true,
        is_active: true,
      }));
      await flSupabase
        .from('approval_policies')
        .upsert(policyRows, { onConflict: 'tenant_id,action_code', ignoreDuplicates: true });
    }

    if (Array.isArray(tplProbe.data) && tplProbe.data.length === 0) {
      const corpName = (tenant.corporateName || tenant.displayName || '당사').trim();
      const templateRows = [
        {
          id: newId('TPL'),
          tenant_id: tenantId,
          doc_type: '계약서_렌탈',
          template_name: '표준 건설기계 임대차 계약서',
          header_note: '임대인과 임차인은 지게차 임대차 계약을 체결한다',
          footer_note: `${corpName} 렌탈사업부`,
          is_default: true,
        },
        {
          id: newId('TPL'),
          tenant_id: tenantId,
          doc_type: '계약서_유통',
          template_name: '표준 물품공급 계약서',
          header_note: '매도인과 매수인은 하기 특약에 합의한다',
          footer_note: `${corpName} 유통사업부`,
          is_default: true,
        },
        {
          id: newId('TPL'),
          tenant_id: tenantId,
          doc_type: '견적서_렌탈',
          template_name: '표준 렌탈 견적서 양식',
          header_note: '월간 임대료 · 무상 정기점검 포함',
          footer_note: `${corpName} 렌탈영업본부`,
          is_default: true,
        },
        {
          id: newId('TPL'),
          tenant_id: tenantId,
          doc_type: '견적서_유통',
          template_name: '표준 유통 견적서 양식',
          header_note: '부가세 별도 · 발주 확정 후 납기 협의',
          footer_note: `${corpName} 영업본부`,
          is_default: true,
        },
        {
          id: newId('TPL'),
          tenant_id: tenantId,
          doc_type: '거래명세서',
          template_name: '표준 거래명세서 양식',
          header_note: '청구 내역 및 공급가액·세액 명세',
          footer_note: '계산서 문의: 회계팀',
          is_default: true,
        },
      ];
      await flSupabase
        .from('document_templates')
        .upsert(templateRows, { onConflict: 'tenant_id,doc_type', ignoreDuplicates: true });
    }
    bootstrappedTenantIds.add(tenantId);
  })().finally(() => {
    tenantBootstrapInFlight.delete(tenantId);
  });

  tenantBootstrapInFlight.set(tenantId, task);
  return task;
}

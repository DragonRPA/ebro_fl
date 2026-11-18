import type { FlPageId } from '../types/domain';

export interface ManualStepDef {
  stepNo: number;
  targetLabel: string;
  manualAnchorId: string;
  actionDetail: string;
}

export interface ManualProcessDef {
  processName: string;
  purpose: string;
  steps: ManualStepDef[];
}

export interface ManualAnchorDef {
  anchorId: string;
  title: string;
  summary: string;
}

export interface ScreenManualEntry {
  pageId: FlPageId;
  pageTitle: string;
  groupLabel: string;
  basicDescription: string;
  processes: ManualProcessDef[];
  anchors: ManualAnchorDef[];
}

export const NON_RENTAL_MANUAL_OVERRIDES: Partial<Record<FlPageId, Partial<ScreenManualEntry>>> = {
  dashboard: {
    basicDescription:
      '로그인 사용자의 직급 티어와 담당 업무에 해당하는 결재 대기, 출고 의뢰, 미수 청구 과제를 목록 형태로 표시한다.',
  },
  partners: {
    basicDescription:
      '매출처, 대리점, 매입처, 운송사 역할을 단일 거래처 원장으로 통합 관리하고 사업자등록증·통장사본 판독 및 결제수단·지급기일 조건을 설정한다.',
  },
  trade_item_masters: {
    basicDescription:
      '유통 완제품·어태치먼트·부품·소모품의 표준원가, 대리점가, 판매정가를 관리한다.',
    anchors: [
      { anchorId: 'itm-filter', title: '유통 품목 · 단가 필터', summary: '품목군과 키워드·초성으로 품목을 필터링한다.' },
      { anchorId: 'itm-grid', title: '유통 품목 단가 목록', summary: '품목코드, 품목군, 추적방식, 표준원가, 대리점가, 판매정가를 확인한다.' },
      { anchorId: 'itm-form', title: '유통 품목 등록·수정 버튼', summary: '신규 유통 품목을 추가하거나 선택 품목의 판매단가를 수정한다.' },
      { anchorId: 'itm-sum', title: '유통 품목 원장 요약', summary: '조회된 유통 품목 수와 품목군별 구성 현황을 1줄로 검증한다.' },
    ],
    processes: [
      {
        processName: '유통 품목 마스터 등록 및 판매단가 설정',
        purpose: '유통 매입·견적·계약에서 참조하는 판매 품목코드와 대리점가·판매정가를 관리한다.',
        steps: [
          { stepNo: 1, targetLabel: '유통 품목 검색 바', manualAnchorId: 'itm-filter', actionDetail: '품목군 탭에서 대상 품목군을 선택한다.' },
          { stepNo: 2, targetLabel: '유통 품목 추가 버튼', manualAnchorId: 'itm-form', actionDetail: '품목코드, 품명, 표준원가, 대리점가, 판매정가를 입력한다.' },
          { stepNo: 3, targetLabel: '품목 저장 버튼', manualAnchorId: 'itm-form', actionDetail: '저장 버튼으로 유통 품목 마스터를 확정한다.' },
        ],
      },
    ],
  },
  purchases: {
    processes: [
      {
        processName: '수입 매입 입고 및 부대비용 배분',
        purpose: '환율적용일 기준 외화 물품가액과 수입 부대비용을 품목에 정확히 배분하고 1원 단수까지 일치시킨다.',
        steps: [
          { stepNo: 1, targetLabel: '통화 · 환율적용일 입력칸', manualAnchorId: 'pur-form', actionDetail: '수입 구분, 매입처, 통화와 환율적용일을 지정하면 해당 일자 환율이 기본 입력되며 직접 수정할 수 있다.' },
          { stepNo: 2, targetLabel: '부대비용·품목 행', manualAnchorId: 'pur-form', actionDetail: '관세, 해상운임, 통관비, 내륙운임과 품목별 수량·외화단가·시리얼을 입력한다.' },
          { stepNo: 3, targetLabel: '입고 확정 버튼', manualAnchorId: 'pur-commit', actionDetail: '하단 원가 합계 검증 후 확정 또는 결재 상신을 실행한다.' },
        ],
      },
    ],
  },
  quotations: {
    basicDescription:
      '유통 견적을 작성하고 도장이 반영된 엑셀 견적서 편집·공식 이메일 발송과 계약서 전환을 실행한다.',
    anchors: [
      { anchorId: 'qt-create', title: '견적 작성 패널', summary: '거래처, 품목, 수량, 단가를 입력하여 견적을 생성한다.' },
      { anchorId: 'qt-docs', title: '견적서 발송·편집 바', summary: '엑셀 다운로드, 에이전트 문서 편집, 공식 이메일 발송을 수행한다.' },
      { anchorId: 'qt-convert', title: '계약 전환 버튼', summary: '선택한 견적을 유통 계약으로 즉시 전환한다.' },
    ],
    processes: [
      {
        processName: '견적서 작성 및 이메일 발송',
        purpose: '거래처 조건에 맞는 견적서를 생성하고 에이전트 편집 후 공식 메일로 발송한다.',
        steps: [
          { stepNo: 1, targetLabel: '견적 입력 폼', manualAnchorId: 'qt-create', actionDetail: '거래처, 품목과 단가를 입력해 견적을 저장한다.' },
          { stepNo: 2, targetLabel: '엑셀 편집 · 이메일 발송 버튼', manualAnchorId: 'qt-docs', actionDetail: '선택 견적 행에서 엑셀 편집으로 검토하거나 공식 이메일 발송을 실행한다.' },
          { stepNo: 3, targetLabel: '계약 전환 버튼', manualAnchorId: 'qt-convert', actionDetail: '수주 확정 시 계약 전환 버튼으로 유통 계약을 생성한다.' },
        ],
      },
    ],
  },
  trade_inventory: {
    basicDescription:
      '유통재고의 시리얼·로트별 입출고 현황과 선입선출 순번, 경과일수, 보증기간을 조회한다.',
    anchors: [
      { anchorId: 'tinv-filter', title: '품목군·상태 검색', summary: '유통재고 품목군과 보유중·판매완료 상태를 조회한다.' },
      { anchorId: 'tinv-grid', title: '유통 재고 원장', summary: '입고일자순 선입선출 정렬과 시리얼·로트별 단가를 확인한다.' },
    ],
    processes: [
      {
        processName: '유통재고 선입선출 및 경과일수·보증기간 점검',
        purpose: '보유중 재고의 입고 경과일수와 차대번호별 보증만료일을 점검하여 우선 출고 대상을 선별한다.',
        steps: [
          { stepNo: 1, targetLabel: '재고 검색 바', manualAnchorId: 'tinv-filter', actionDetail: '품목군, 상태, 경과일수 탭에서 점검 대상 재고를 선별한다.' },
          { stepNo: 2, targetLabel: '유통 재고 원장', manualAnchorId: 'tinv-grid', actionDetail: '입고일 순번과 경과일, 보증상태를 확인하고 보증기간을 관리한다.' },
        ],
      },
    ],
  },
  ap_settlements: {
    basicDescription:
      '매입채무와 운송비 지급을 확정하고 외화 결제 시 장부환율과 결제환율 차이에 따른 외환차익·외환차손을 자동 계산한다.',
  },
  bank_matching: {
    anchors: [
      { anchorId: 'btx-add', title: '통장 거래 등록', summary: '일자, 입출금 구분, 거래처적요, 금액을 등록한다.' },
      { anchorId: 'btx-match', title: '청구·채무 대사 연결', summary: '미대사 입출금 행과 대상 청구 또는 채무를 1대1로 매칭한다.' },
    ],
  },
  cash_calendar: {
    basicDescription:
      '매출거래처 납기일자와 매입거래처 지급일자를 기준으로 월간 입금예정·지출예정 자금 일정을 달력으로 조망한다.',
  },
  financial_statements: {
    basicDescription:
      '조회 연월 범위에 따라 재무상태표, 손익계산서, 현금흐름표 및 중소기업회계기준 해설을 제공한다.',
    anchors: [
      { anchorId: 'fs-period', title: '조회 기간 설정', summary: '시작 연월과 종료 연월을 지정하여 전체 장부를 재집계한다.' },
      { anchorId: 'fs-tabs', title: '보고서 전환 탭', summary: '재무상태표, 손익계산서, 현금흐름표, 회계기준을 전환한다.' },
      { anchorId: 'fs-verify', title: '대차 차액 0원 검증식', summary: '자산총계와 부채 및 자본총계의 일치를 최하단 검증 바에서 확인한다.' },
    ],
    processes: [
      {
        processName: '기간별 재무상태표 · 손익계산서 검증',
        purpose: '유통 매출, 매출원가, 물류비, 외환차손익까지 반영된 대차 차액 0원 결산을 확인한다.',
        steps: [
          { stepNo: 1, targetLabel: '시작·종료 연월 입력', manualAnchorId: 'fs-period', actionDetail: '조회할 시작 연월과 종료 연월을 입력한다.' },
          { stepNo: 2, targetLabel: '보고서 탭 전환', manualAnchorId: 'fs-tabs', actionDetail: '재무상태표, 손익계산서, 현금흐름표 탭을 순차 검토한다.' },
          { stepNo: 3, targetLabel: '대차 검증 바', manualAnchorId: 'fs-verify', actionDetail: '하단 검증 바의 대차 차액 0원 및 현금 차이 0원 상태를 확인한다.' },
        ],
      },
    ],
  },
  operation_manual: {
    basicDescription:
      '전사 메뉴 화면의 기본기능 설명, 업무 프로세스 명칭, 화면 조작 순서를 키워드 검색하고 현재 화면 매뉴얼 오버레이를 호출한다.',
  },
  permission_settings: {
    basicDescription:
      '7단계 직급 티어 부여, 판매단가 비공개, 결재기준 티어, 티어별 화면권한 및 임직원 개인별 화면권한을 관리한다.',
  },
  system_settings: {
    basicDescription:
      '3종 문서양식·직인 도장 설정을 관리한다. 공식 이메일 연동은 중앙 테넌트 관리센터에서 통제한다.',
  },
};

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

export const FL_MANUAL_REGISTRY: Record<FlPageId, ScreenManualEntry> = {
  dashboard: {
    pageId: 'dashboard',
    pageTitle: '업무 대시보드',
    groupLabel: '포털 · 결재',
    basicDescription: '로그인 사용자의 직급 티어와 담당 업무에 해당하는 결재 대기, 출고 의뢰, 미수 청구, 계약 만기 과제를 목록 형태로 표시한다.',
    anchors: [
      { anchorId: 'dash-filter', title: '과제 범위 필터', summary: '담당 구분별 당면 과제를 선별 조회한다.' },
      { anchorId: 'dash-feed', title: '직무 과제 목록', summary: '처리 대기 항목을 확인하고 해당 업무 화면으로 이동한다.' },
    ],
    processes: [
      {
        processName: '당면 과제 확인 및 화면 이동',
        purpose: '당일 처리 대상 결재, 출고, 수납, 만기 건을 누락 없이 처리한다.',
        steps: [
          { stepNo: 1, targetLabel: '과제 구분 탭', manualAnchorId: 'dash-filter', actionDetail: '전체, 결재대기, 출고대기, 미수청구 중 처리할 구분을 선택한다.' },
          { stepNo: 2, targetLabel: '이동 버튼', manualAnchorId: 'dash-feed', actionDetail: '행 좌측 이동 버튼을 눌러 해당 처리 화면으로 바로 전환한다.' },
        ],
      },
    ],
  },
  approval_inbox: {
    pageId: 'approval_inbox',
    pageTitle: '결재함',
    groupLabel: '포털 · 결재',
    basicDescription: '하위 티어 담당자가 상신한 업무 요청을 7단계 직급 기준에 따라 검토하고 승인 또는 반려한다.',
    anchors: [
      { anchorId: 'apr-tabs', title: '결재 상태 필터', summary: '대기, 승인, 반려 상태별 결재 목록을 전환한다.' },
      { anchorId: 'apr-grid', title: '결재 요청 목록', summary: '상신 내용과 필요 직급 티어를 확인하고 승인 또는 반려를 실행한다.' },
    ],
    processes: [
      {
        processName: '결재 요청 승인',
        purpose: '요청 티어 이상 결재권자가 검토 후 업무 데이터를 최종 확정한다.',
        steps: [
          { stepNo: 1, targetLabel: '대기 탭', manualAnchorId: 'apr-tabs', actionDetail: '상태 탭에서 대기 목록을 선택한다.' },
          { stepNo: 2, targetLabel: '결재 대상 행', manualAnchorId: 'apr-grid', actionDetail: '요청번호, 상신자 티어, 필요 티어, 상세 데이터를 확인한다.' },
          { stepNo: 3, targetLabel: '승인 버튼', manualAnchorId: 'apr-grid', actionDetail: '필요 티어 이상 계정으로 승인 버튼을 눌러 대상 원장과 이력을 반영한다.' },
        ],
      },
      {
        processName: '결재 요청 반려',
        purpose: '사유를 명시하여 상신 요청을 반려하고 원장 변경을 차단한다.',
        steps: [
          { stepNo: 1, targetLabel: '결재 대상 행', manualAnchorId: 'apr-grid', actionDetail: '반려 대상 행의 반려 버튼을 누른다.' },
          { stepNo: 2, targetLabel: '반려 사유 입력창', manualAnchorId: 'apr-grid', actionDetail: '반려 사유를 입력한 뒤 반려 확정을 실행한다.' },
        ],
      },
    ],
  },
  partners: {
    pageId: 'partners',
    pageTitle: '거래처 관리',
    groupLabel: '기준정보 · 카탈로그',
    basicDescription: '매출처, 대리점, 금융사, 매입처, 전대공급처, 운송사, 외주정비처 역할을 단일 거래처 원장으로 통합 관리하고 사업장 및 담당자를 등록한다.',
    anchors: [
      { anchorId: 'prt-search', title: '거래처 검색·역할 필터', summary: '상호, 사업자등록번호, 거래처 역할로 목록을 조회한다.' },
      { anchorId: 'prt-grid', title: '거래처 목록·상세 패널', summary: '좌측 목록에서 거래처를 선택하고 우측에서 사업장 및 담당자를 편집한다.' },
      { anchorId: 'prt-save', title: '거래처 저장 버튼', summary: '거래처 기본정보, 마감일 조건, 역할을 저장한다.' },
    ],
    processes: [
      {
        processName: '신규 거래처 및 역할 등록',
        purpose: '하나의 사업자등록번호에 복수 거래 역할을 부여하고 정산 기준일을 설정한다.',
        steps: [
          { stepNo: 1, targetLabel: '신규 등록 버튼', manualAnchorId: 'prt-search', actionDetail: '우측 상단 신규 등록 버튼을 눌러 입력 양식을 연다.' },
          { stepNo: 2, targetLabel: '역할 체크박스 및 기본정보', manualAnchorId: 'prt-grid', actionDetail: '상호, 사업자등록번호, 청구마감일, 지급기일과 거래처 역할을 선택한다.' },
          { stepNo: 3, targetLabel: '저장 버튼', manualAnchorId: 'prt-save', actionDetail: '저장 버튼을 눌러 거래처 원장을 데이터베이스에 기록한다.' },
        ],
      },
      {
        processName: '거래처 사업장·담당자 추가',
        purpose: '현장 주소, 납품 담당자, 계산서 이메일을 거래처 하위에 연결한다.',
        steps: [
          { stepNo: 1, targetLabel: '거래처 목록 행', manualAnchorId: 'prt-grid', actionDetail: '좌측 목록에서 거래처를 선택한다.' },
          { stepNo: 2, targetLabel: '사업장 추가 입력창', manualAnchorId: 'prt-grid', actionDetail: '하단 사업장 영역에 현장명, 주소, 담당자 연락처를 입력하고 추가한다.' },
        ],
      },
    ],
  },
  trade_item_masters: {
    pageId: 'trade_item_masters',
    pageTitle: '유통 품목 관리',
    groupLabel: '기준정보 · 카탈로그',
    basicDescription: '유통 판매 전용 및 공용 완제품·어태치먼트·부품·소모품의 표준원가, 대리점가, 판매정가와 안전재고를 관리한다.',
    anchors: [
      { anchorId: 'itm-filter', title: '유통 품목 · 단가 필터', summary: '유통 전용/공용 구분 및 품목군, 키워드·초성으로 품목을 필터링한다.' },
      { anchorId: 'itm-grid', title: '유통 품목 단가 목록', summary: '품목코드, 품목군, 추적방식, 표준원가, 대리점가, 판매정가, 안전재고를 확인한다.' },
      { anchorId: 'itm-form', title: '유통 품목 등록·수정 버튼', summary: '신규 유통 품목을 추가하거나 선택 품목의 판매단가를 수정한다.' },
      { anchorId: 'itm-sum', title: '유통 품목 원장 요약', summary: '조회된 유통 품목 수와 품목군별 구성 현황을 1줄로 검증한다.' },
    ],
    processes: [
      {
        processName: '유통 품목 마스터 등록 및 판매단가 설정',
        purpose: '유통 매입·견적·계약에서 참조하는 판매 품목코드와 대리점가·판매정가를 관리한다.',
        steps: [
          { stepNo: 1, targetLabel: '유통 품목 검색 바', manualAnchorId: 'itm-filter', actionDetail: '운용구분과 품목군 탭에서 대상 품목군을 선택한다.' },
          { stepNo: 2, targetLabel: '유통 품목 추가 버튼', manualAnchorId: 'itm-form', actionDetail: '품목코드, 품명, 표준원가, 대리점가, 판매정가, 안전재고를 입력한다.' },
          { stepNo: 3, targetLabel: '품목 저장 버튼', manualAnchorId: 'itm-form', actionDetail: '저장 버튼으로 유통 품목 마스터를 확정한다.' },
        ],
      },
    ],
  },
  rental_item_masters: {
    pageId: 'rental_item_masters',
    pageTitle: '렌탈 품목 관리',
    groupLabel: '기준정보 · 카탈로그',
    basicDescription: '렌탈 임대 전용 및 공용 지게차·어태치먼트의 취득기준원가, 월 렌탈료, 일 렌탈료 및 상각기준을 관리한다.',
    anchors: [
      { anchorId: 'itm-filter', title: '렌탈 품목 · 임대료 필터', summary: '렌탈 전용/공용 구분 및 품목군, 키워드·초성으로 임대 품목을 필터링한다.' },
      { anchorId: 'itm-grid', title: '렌탈 품목 기준 목록', summary: '품목코드, 품목군, 추적방식, 취득기준원가, 월 렌탈료, 일 렌탈료, 상각기간을 확인한다.' },
      { anchorId: 'itm-form', title: '렌탈 품목 등록·수정 버튼', summary: '신규 렌탈 품목을 추가하거나 임대료 및 상각기준을 수정한다.' },
      { anchorId: 'itm-sum', title: '렌탈 품목 원장 요약', summary: '조회된 렌탈 품목 수와 품목군별 구성 현황을 1줄로 검증한다.' },
    ],
    processes: [
      {
        processName: '렌탈 품목 등록 및 임대료·상각기준 설정',
        purpose: '렌탈 자산 취득·계약·일할 청구에서 사용하는 표준 월·일 렌탈료와 상각기간을 관리한다.',
        steps: [
          { stepNo: 1, targetLabel: '렌탈 품목 검색 바', manualAnchorId: 'itm-filter', actionDetail: '운용구분과 품목군 탭에서 대상 기종을 선택한다.' },
          { stepNo: 2, targetLabel: '렌탈 품목 추가 버튼', manualAnchorId: 'itm-form', actionDetail: '품목코드, 품명, 취득기준원가, 월 렌탈료, 일 렌탈료, 상각기간을 입력한다.' },
          { stepNo: 3, targetLabel: '품목 저장 버튼', manualAnchorId: 'itm-form', actionDetail: '저장 버튼으로 렌탈 품목 마스터를 확정한다.' },
        ],
      },
    ],
  },
  exchange_rates: {
    pageId: 'exchange_rates',
    pageTitle: '환율 관리',
    groupLabel: '기준정보 · 카탈로그',
    basicDescription: '통화별 일자 기준환율과 전신환매도율을 조회·등록하고 관리 환율 3개월 추이 차트를 검토하여 수입 매입원가 및 외화채무 결제 손익 산정의 기준으로 사용한다.',
    anchors: [
      { anchorId: 'fx-fetch', title: '환율 조회 · 3개월 적재 · 등록', summary: '단건 고시환율 조회, 3개월 고시환율 일괄 적재 또는 수동 환율 저장을 수행한다.' },
      { anchorId: 'fx-chart', title: '관리 환율 3개월 추이 차트', summary: '통화별 1개월·2개월·3개월 매매기준율 및 전신환매도율 추이와 최고·최저·평균 변동폭을 확인한다.' },
      { anchorId: 'fx-grid', title: '고시환율 원장', summary: '일자별 통화 기준환율과 전신환매도율 이력을 확인하고 행 선택 시 편집칸에 반영한다.' },
      { anchorId: 'fx-conservation', title: '환율 원장 집계 바', summary: '관리 통화 수, 전체 원장 건수, 선택 통화 구간 건수 및 최신 매매기준율을 대조한다.' },
    ],
    processes: [
      {
        processName: '일자별 기준환율 등록 및 3개월 시계열 적재',
        purpose: '수입 통관 및 외화 지급 시 적용할 공식 환율과 최근 3개월 관리 환율 원장을 적재한다.',
        steps: [
          { stepNo: 1, targetLabel: '기준일·통화 입력칸', manualAnchorId: 'fx-fetch', actionDetail: '적용일자, 통화코드를 선택한 뒤 환율 조회 또는 3개월 고시환율 적재 버튼을 누른다.' },
          { stepNo: 2, targetLabel: '환율 저장 버튼', manualAnchorId: 'fx-fetch', actionDetail: '단건 수정·등록이 필요한 경우 기준율과 매도율을 입력하고 환율 저장 버튼을 누른다.' },
        ],
      },
      {
        processName: '관리 환율 3개월 추이 차트 검토',
        purpose: '통화별 최근 3개월 환율 변동폭, 최저·최고점, 평균선 및 매매기준율·전신환매도율 격차를 점검한다.',
        steps: [
          { stepNo: 1, targetLabel: '통화 · 기간 전환 탭', manualAnchorId: 'fx-chart', actionDetail: '차트 우측 통화 탭과 1개월·2개월·3개월 기간 탭으로 비교 대상을 전환한다.' },
          { stepNo: 2, targetLabel: '차트 포인트 및 원장 행', manualAnchorId: 'fx-chart', actionDetail: '차트 포인트를 가리켜 일자별 대비를 확인하고 클릭 시 상단 입력칸으로 불러온다.' },
        ],
      },
    ],
  },
  catalogs: {
    pageId: 'catalogs',
    pageTitle: '제원 카탈로그',
    groupLabel: '기준정보 · 카탈로그',
    basicDescription: '지게차 모델별 국제표준 기술제원·마스트·배터리 사양과 대리점 배포용 호환 부품 카탈로그 패키지를 조회한다.',
    anchors: [
      { anchorId: 'cat-tabs', title: '제원·부품 전환 탭', summary: '장비 기술제원표와 호환부품 카탈로그를 전환한다.' },
      { anchorId: 'cat-detail', title: '기술제원·카탈로그 본문', summary: '마스트 높이별 하중표, 배터리 옵션, 호환품번을 확인한다.' },
    ],
    processes: [
      {
        processName: '장비 제원 및 호환 부품 확인',
        purpose: '영업 견적 및 현장 투입 전 작업통로폭, 마스트 전고, 호환부품을 대조한다.',
        steps: [
          { stepNo: 1, targetLabel: '카탈로그 구분 탭', manualAnchorId: 'cat-tabs', actionDetail: '장비 제원표 또는 호환부품 카탈로그 탭을 선택한다.' },
          { stepNo: 2, targetLabel: '기종·품번 목록', manualAnchorId: 'cat-detail', actionDetail: '기종이나 부품을 선택하여 세부 제원 및 표준 단가를 확인한다.' },
        ],
      },
    ],
  },
  purchases: {
    pageId: 'purchases',
    pageTitle: '매입 통관 관리',
    groupLabel: '조달 · 물류',
    basicDescription: '수입 및 내수 매입을 등록하고 환율적용일 기준 환율과 관세·해상운임·통관비·내륙운임을 품목별 금액 비율로 배분하여 총입고원가와 재고·자산 원장을 생성한다.',
    anchors: [
      { anchorId: 'pur-form', title: '매입·통관 입력 패널', summary: '매입구분, 거래처, 통화, 환율적용일, 적용환율, 부대비용과 품목 행을 입력한다.' },
      { anchorId: 'pur-grid', title: '매입 입고 내역', summary: '확정된 매입 전표와 환율적용일·배분 단가 내역을 조회한다.' },
      { anchorId: 'pur-commit', title: '매입 입고 확정 버튼', summary: '원화 환산액과 부대비용 합계 일치 검증 후 재고 원장과 채무를 생성한다.' },
    ],
    processes: [
      {
        processName: '수입 매입 입고 및 부대비용 배분',
        purpose: '환율적용일 기준 외화 물품가액과 수입 부대비용을 품목에 정확히 배분하고 1원 단수까지 일치시킨다.',
        steps: [
          { stepNo: 1, targetLabel: '통화 · 환율적용일 입력칸', manualAnchorId: 'pur-form', actionDetail: '수입 구분, 매입처, 입고계정, 통화와 환율적용일을 지정하면 해당 일자 환율이 기본 입력되며 직접 수정할 수 있다.' },
          { stepNo: 2, targetLabel: '부대비용·품목 행', manualAnchorId: 'pur-form', actionDetail: '관세, 해상운임, 통관비, 내륙운임과 품목별 수량·외화단가·시리얼을 입력한다.' },
          { stepNo: 3, targetLabel: '입고 확정 버튼', manualAnchorId: 'pur-commit', actionDetail: '하단 원가 합계 검증 후 확정 또는 결재 상신을 실행한다.' },
        ],
      },
    ],
  },
  logistics_costs: {
    pageId: 'logistics_costs',
    pageTitle: '물류비 관리',
    groupLabel: '조달 · 물류',
    basicDescription: '출고나 계약 상태 변경과 무관하게 순수 운송비 기록, 부담 주체 분류, 운송사 매입채무 정산만을 전담한다.',
    anchors: [
      { anchorId: 'log-form', title: '물류 운송비 등록', summary: '운송 목적, 운송사, 출발지, 도착지, 운송비, 부담주체를 입력한다.' },
      { anchorId: 'log-grid', title: '물류비 내역 그리드', summary: '기간별 운송비 발생 내역과 정산 상태를 조회한다.' },
    ],
    processes: [
      {
        processName: '운송비 기록 및 채무 연동',
        purpose: '현장 배차 운송비를 판관비 및 운송사 미지급금으로 누락 없이 기록한다.',
        steps: [
          { stepNo: 1, targetLabel: '물류비 등록 양식', manualAnchorId: 'log-form', actionDetail: '운송목적, 운송사, 차량번호, 상·하차지, 공급가액, 부담주체를 입력한다.' },
          { stepNo: 2, targetLabel: '물류비 저장 버튼', manualAnchorId: 'log-form', actionDetail: '저장 버튼을 눌러 물류비 대장과 매입채무를 동시 생성한다.' },
        ],
      },
    ],
  },
  quotations: {
    pageId: 'quotations',
    pageTitle: '견적 관리',
    groupLabel: '유통 관리',
    basicDescription: '유통 및 렌탈 견적을 작성하고 도장이 반영된 엑셀 견적서 편집·공식 이메일 발송과 계약서 전환을 실행한다.',
    anchors: [
      { anchorId: 'qt-create', title: '견적 작성 패널', summary: '견적 구분, 거래처, 품목, 수량, 단가를 입력하여 견적을 생성한다.' },
      { anchorId: 'qt-docs', title: '견적서 발송·편집 바', summary: '엑셀 다운로드, 에이전트 문서 편집, 공식 이메일 발송을 수행한다.' },
      { anchorId: 'qt-convert', title: '계약 전환 버튼', summary: '선택한 견적을 유통 계약 또는 렌탈 계약으로 즉시 전환한다.' },
    ],
    processes: [
      {
        processName: '견적서 작성 및 이메일 발송',
        purpose: '거래처 조건에 맞는 견적서를 생성하고 에이전트 편집 후 공식 메일로 발송한다.',
        steps: [
          { stepNo: 1, targetLabel: '견적 입력 폼', manualAnchorId: 'qt-create', actionDetail: '유통 또는 렌탈 구분, 거래처, 품목과 단가를 입력해 견적을 저장한다.' },
          { stepNo: 2, targetLabel: '엑셀 편집 · 이메일 발송 버튼', manualAnchorId: 'qt-docs', actionDetail: '선택 견적 행에서 엑셀 편집으로 검토하거나 공식 이메일 발송을 실행한다.' },
          { stepNo: 3, targetLabel: '계약 전환 버튼', manualAnchorId: 'qt-convert', actionDetail: '수주 확정 시 계약 전환 버튼으로 유통 또는 렌탈 계약을 생성한다.' },
        ],
      },
    ],
  },
  trade_contracts: {
    pageId: 'trade_contracts',
    pageTitle: '유통 계약 관리',
    groupLabel: '유통 관리',
    basicDescription: '지게차 및 부품 유통 계약을 등록·확정하고 표준 물품공급 계약서 발송과 유통 출고 요청을 발행한다.',
    anchors: [
      { anchorId: 'tc-form', title: '유통 계약 생성', summary: '거래처, 품목, 판매단가, 결제조건을 입력해 유통 계약을 등록한다.' },
      { anchorId: 'tc-docs', title: '유통 계약서 발송', summary: '물품공급 계약서 엑셀 편집 및 공식 이메일 발송을 실행한다.' },
      { anchorId: 'tc-req', title: '출고의뢰 발행 버튼', summary: '확정 계약에서 유통 출고 의뢰 건을 생성한다.' },
    ],
    processes: [
      {
        processName: '유통 계약 확정 및 출고 의뢰',
        purpose: '계약 확정 후 재고 출고 처리를 위해 출고 의뢰 대기열로 전달한다.',
        steps: [
          { stepNo: 1, targetLabel: '계약 등록 영역', manualAnchorId: 'tc-form', actionDetail: '매출처, 품목, 수량, 단가를 입력하고 계약 확정 또는 상신을 실행한다.' },
          { stepNo: 2, targetLabel: '계약서 발송 바', manualAnchorId: 'tc-docs', actionDetail: '계약서 엑셀 다운로드, 에이전트 편집, 이메일 발송으로 서류를 송부한다.' },
          { stepNo: 3, targetLabel: '출고의뢰 발행 버튼', manualAnchorId: 'tc-req', actionDetail: '출고의뢰 발행 버튼을 눌러 유통 출고 관리 화면으로 전달한다.' },
        ],
      },
    ],
  },
  trade_inventory: {
    pageId: 'trade_inventory',
    pageTitle: '유통 재고 조회',
    groupLabel: '유통 관리',
    basicDescription: '유통재고의 시리얼·로트별 입출고 현황과 선입선출 순번을 조회하고, 보유중 완제품·어태치먼트를 렌탈자산으로 계정대체한다.',
    anchors: [
      { anchorId: 'tinv-filter', title: '품목군·상태 검색', summary: '유통재고 품목군과 보유중·판매완료 상태를 조회한다.' },
      { anchorId: 'tinv-grid', title: '유통 재고 원장', summary: '입고일자순 선입선출 정렬과 시리얼·로트별 단가를 확인한다.' },
      { anchorId: 'tinv-xfer', title: '계정대체 실행 버튼', summary: '보유중 자산을 장부가 그대로 렌탈자산 계정으로 전환한다.' },
    ],
    processes: [
      {
        processName: '유통재고 렌탈자산 계정대체',
        purpose: '판매 대기 자산을 평가변경 없이 기존 장부가 그대로 렌탈자산으로 편입한다.',
        steps: [
          { stepNo: 1, targetLabel: '재고 검색 바', manualAnchorId: 'tinv-filter', actionDetail: '상태를 보유중으로 필터링하여 전환 대상 장비를 찾는다.' },
          { stepNo: 2, targetLabel: '전환일자 및 전환 버튼', manualAnchorId: 'tinv-xfer', actionDetail: '전환기준일을 지정하고 렌탈자산 전환 버튼을 눌러 원장 및 수불을 기록한다.' },
        ],
      },
    ],
  },
  trade_fulfillment: {
    pageId: 'trade_fulfillment',
    pageTitle: '유통 출고 관리',
    groupLabel: '유통 관리',
    basicDescription: '유통 출고의뢰에 대해 선입선출 또는 수동 선택 시리얼·로트로 희망완료일 기준 출고 실행완료를 처리하고, 공급사 정비중개·반품환불·반품교환을 관리한다.',
    anchors: [
      { anchorId: 'tful-exec', title: '출고 실행완료 패널', summary: '선입선출 제안 및 수동 시리얼·로트 선택 후 희망완료일로 출고 완료를 확정한다.' },
      { anchorId: 'tful-aftercare', title: '유통 사후처리 패널', summary: '공급사 정비중개, 반품환불, 반품교환 3종 사후처리를 등록한다.' },
    ],
    processes: [
      {
        processName: '유통 출고 실행완료',
        purpose: '희망완료일을 손익·수불 귀속일로, 입력일시를 감사 시각으로 분리 저장하여 출고를 완료한다.',
        steps: [
          { stepNo: 1, targetLabel: '출고 의뢰 행', manualAnchorId: 'tful-exec', actionDetail: '대기중인 출고 의뢰 행을 선택하고 배정할 시리얼 또는 로트를 선택한다.' },
          { stepNo: 2, targetLabel: '희망완료일 입력창', manualAnchorId: 'tful-exec', actionDetail: '실제 출고 귀속일인 희망완료일을 확인·입력한다.' },
          { stepNo: 3, targetLabel: '실행완료 버튼', manualAnchorId: 'tful-exec', actionDetail: '실행완료 버튼을 눌러 재고 차감과 매출원가 인식을 확정한다.' },
        ],
      },
      {
        processName: '공급사 정비중개 · 반품환불 · 반품교환',
        purpose: '유통 판매 건의 대리점 연결 중개 또는 반품 환불·교환을 원장에 반영한다.',
        steps: [
          { stepNo: 1, targetLabel: '사후처리 유형 선택', manualAnchorId: 'tful-aftercare', actionDetail: '공급사 정비중개, 반품환불, 반품교환 중 해당 유형을 선택한다.' },
          { stepNo: 2, targetLabel: '처리 저장 버튼', manualAnchorId: 'tful-aftercare', actionDetail: '공급사 또는 환불금액·교환시리얼을 입력하고 완료 처리한다.' },
        ],
      },
    ],
  },
  trade_performance: {
    pageId: 'trade_performance',
    pageTitle: '유통 실적 조회',
    groupLabel: '유통 관리',
    basicDescription: '유통 사업부의 희망완료일 기준 매출액, 출고원가, 반품환불 차감액 및 품목군별 매출총이익을 기간별로 집계한다.',
    anchors: [
      { anchorId: 'tperf-period', title: '기간·구분 조회 조건', summary: '조회 시작일과 종료일을 지정하여 유통 실적을 산출한다.' },
      { anchorId: 'tperf-grid', title: '유통 손익 내역 그리드', summary: '계약별 매출액, 원가, 반품차감, 매출이익, 이익률을 확인한다.' },
    ],
    processes: [
      {
        processName: '기간별 유통 손익 분석',
        purpose: '유통 매출 및 매출원가의 실 발생 귀속 기준 이익률을 검증한다.',
        steps: [
          { stepNo: 1, targetLabel: '조회 기간 입력칸', manualAnchorId: 'tperf-period', actionDetail: '시작일과 종료일을 선택해 조회한다.' },
          { stepNo: 2, targetLabel: '손익 검증 그리드', manualAnchorId: 'tperf-grid', actionDetail: '하단 대차대조 합계식에서 매출과 원가 차액의 무결성을 확인한다.' },
        ],
      },
    ],
  },
  rental_contracts: {
    pageId: 'rental_contracts',
    pageTitle: '렌탈 계약 관리',
    groupLabel: '렌탈 · 정비',
    basicDescription: '렌탈 계약을 등록하고 표준 임대차 계약서 발송과 함께 렌탈출고, 렌탈회수, 교환 요청을 관리한다.',
    anchors: [
      { anchorId: 'rctr-form', title: '렌탈 계약 등록', summary: '임차 거래처, 기간, 월 임대료, 품목을 입력해 렌탈 계약을 생성한다.' },
      { anchorId: 'rctr-docs', title: '임대차 계약서 발송', summary: '렌탈 계약서 엑셀 편집 및 공식 이메일 발송을 수행한다.' },
      { anchorId: 'rctr-actions', title: '출고·회수·교환 요청', summary: '선택 계약에서 렌탈출고 또는 렌탈회수 의뢰를 발행한다.' },
    ],
    processes: [
      {
        processName: '렌탈 계약 체결 및 출고 의뢰',
        purpose: '계약 단가·마감일 기준을 확정하고 렌탈 입출고 의뢰를 발행한다.',
        steps: [
          { stepNo: 1, targetLabel: '계약 입력 영역', manualAnchorId: 'rctr-form', actionDetail: '거래처, 계약기간, 월단가, 마감일, 투입장비 품목을 입력한다.' },
          { stepNo: 2, targetLabel: '계약 확정 버튼', manualAnchorId: 'rctr-form', actionDetail: '확정 또는 상신으로 계약을 활성화한다.' },
          { stepNo: 3, targetLabel: '렌탈출고 의뢰 버튼', manualAnchorId: 'rctr-actions', actionDetail: '출고의뢰 발행 후 렌탈 입출고 관리에서 실행완료 처리한다.' },
        ],
      },
    ],
  },
  rental_assets: {
    pageId: 'rental_assets',
    pageTitle: '렌탈 자산 관리',
    groupLabel: '렌탈 · 정비',
    basicDescription: '렌탈자산과 전대자산의 상태, 감가상각 누계액, 금융리스 금리 및 원리금 상환 스케줄, 유통재고 전환을 통합 관리한다.',
    anchors: [
      { anchorId: 'rast-tabs', title: '자산·리스 구분 탭', summary: '렌탈·전대 자산 원장과 금융리스 상환 스케줄을 전환한다.' },
      { anchorId: 'rast-lease', title: '금융리스 등록', summary: '금융사, 원금, 연이율, 기간, 상환방식을 입력해 리스 자산과 상환표를 생성한다.' },
      { anchorId: 'rast-xfer', title: '유통재고 계정대체', summary: '보유중 자사 렌탈자산을 장부가 그대로 유통재고로 전환한다.' },
    ],
    processes: [
      {
        processName: '금융리스 계약 및 상환 스케줄 생성',
        purpose: '적용금리와 원리금균등·원금균등 방식에 따른 월별 이자비용과 원금상환표를 오차 없이 산출한다.',
        steps: [
          { stepNo: 1, targetLabel: '금융리스 탭', manualAnchorId: 'rast-tabs', actionDetail: '금융리스 계약 및 상환표 탭을 선택한다.' },
          { stepNo: 2, targetLabel: '리스 조건 입력 폼', manualAnchorId: 'rast-lease', actionDetail: '금융사, 장비 모델, 시리얼, 원금, 연이율, 개월수, 상환방식을 입력한다.' },
          { stepNo: 3, targetLabel: '리스 등록 버튼', manualAnchorId: 'rast-lease', actionDetail: '등록 실행으로 렌탈자산과 36회차 상환 스케줄을 생성한다.' },
        ],
      },
    ],
  },
  rental_fulfillment: {
    pageId: 'rental_fulfillment',
    pageTitle: '렌탈 입출고 관리',
    groupLabel: '렌탈 · 정비',
    basicDescription: '렌탈출고, 렌탈회수 실행완료와 단일 교환 프로세스 처리를 수행하여 전일 마감·당일 승계와 계약조건 100% 자동 상속을 보장한다.',
    anchors: [
      { anchorId: 'rful-exec', title: '출고·회수 실행완료', summary: '장비를 선택하고 희망완료일 기준으로 대여중 전환 또는 회수를 확정한다.' },
      { anchorId: 'rful-exchange', title: '렌탈 교환 실행 패널', summary: '전자산 회수와 후장비 투입, 계약단가·청구조건 100% 승계를 단일 교환으로 처리한다.' },
    ],
    processes: [
      {
        processName: '렌탈 장비 단일 교환 실행',
        purpose: '교환일 전일까지 전자산 일할 마감하고 교환일 당일부터 후장비로 계약 조건을 자동 상속한다.',
        steps: [
          { stepNo: 1, targetLabel: '교환 대상 계약·장비 선택', manualAnchorId: 'rful-exchange', actionDetail: '대여중인 계약 행과 회수할 기존 장비, 투입할 보유중 장비를 선택한다.' },
          { stepNo: 2, targetLabel: '교환 희망완료일 입력', manualAnchorId: 'rful-exchange', actionDetail: '일할 마감과 승계 기준일인 교환일을 지정한다.' },
          { stepNo: 3, targetLabel: '교환 실행완료 버튼', manualAnchorId: 'rful-exchange', actionDetail: '실행완료 버튼으로 전자산 회수, 후장비 투입, 1:1 추적 이력을 동시 기록한다.' },
        ],
      },
    ],
  },
  rental_maintenance: {
    pageId: 'rental_maintenance',
    pageTitle: '렌탈 정비 관리',
    groupLabel: '렌탈 · 정비',
    basicDescription: '렌탈자산과 전대자산에 한정하여 주기장정비, 현장정비, 순회정비를 등록하고 가동시간과 투입 부품 로트 원가, 외주 정비비를 관리한다.',
    anchors: [
      { anchorId: 'rmnt-form', title: '정비 이력 입력', summary: '정비구분, 대상장비, 가동시간, 투입부품, 노무비·외주비를 입력한다.' },
      { anchorId: 'rmnt-grid', title: '정비 실적 목록', summary: '완료된 정비 내역과 자산별 누적 가동시간을 조회한다.' },
    ],
    processes: [
      {
        processName: '정비 완료 및 가동시간·부품원가 반영',
        purpose: '렌탈 장비의 정비 비용을 원가에 반영하고 보유 부품 재고를 차감한다.',
        steps: [
          { stepNo: 1, targetLabel: '정비 구분 및 대상 장비', manualAnchorId: 'rmnt-form', actionDetail: '주기장정비, 현장정비, 순회정비 중 선택하고 보유 또는 대여중 장비를 고른다.' },
          { stepNo: 2, targetLabel: '가동시간·비용 입력', manualAnchorId: 'rmnt-form', actionDetail: '누적 가동시간, 투입 부품 수량, 자사 노무비 또는 외주정비비를 입력한다.' },
          { stepNo: 3, targetLabel: '정비 저장 버튼', manualAnchorId: 'rmnt-form', actionDetail: '저장 버튼으로 정비 원장, 부품 출고, 가동시간 갱신을 확정한다.' },
        ],
      },
    ],
  },
  rental_performance: {
    pageId: 'rental_performance',
    pageTitle: '렌탈 실적 조회',
    groupLabel: '렌탈 · 정비',
    basicDescription: '자산별 일할 임대매출, 감가상각비, 정비비, 전대 임차원가, 금융리스 이자비용을 종합하여 렌탈 사업부 순수익을 분석한다.',
    anchors: [
      { anchorId: 'rperf-period', title: '실적 조회 연월', summary: '조회 연월 범위를 설정하여 자산별 렌탈 손익을 계산한다.' },
      { anchorId: 'rperf-grid', title: '자산별 렌탈 수익성 표', summary: '장비별 청구매출, 감가상각, 정비원가, 리스이자, 기여이익을 확인한다.' },
    ],
    processes: [
      {
        processName: '월별 렌탈 자산 기여손익 검증',
        purpose: '자산별 매출 기여액과 유지비용의 합계를 확인한다.',
        steps: [
          { stepNo: 1, targetLabel: '조회 연월 선택기', manualAnchorId: 'rperf-period', actionDetail: '시작 연월과 종료 연월을 선택한다.' },
          { stepNo: 2, targetLabel: '하단 합계 검증 바', manualAnchorId: 'rperf-grid', actionDetail: '매출액에서 상각·정비·전대·이자를 차감한 순기여액을 확인한다.' },
        ],
      },
    ],
  },
  ar_billing_collection: {
    pageId: 'ar_billing_collection',
    pageTitle: '청구 수납 관리',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription: '계약 근거로 청구를 생성·조회하고 세금계산서 발행 여부, 수납액, 미수납잔액을 통합 관리하며 거래명세서 엑셀 편집 및 이메일 발송을 수행한다.',
    anchors: [
      { anchorId: 'ar-gen', title: '계약 근거 청구 생성', summary: '청구 연월과 계약을 선택하여 일할 또는 공급가 청구를 생성한다.' },
      { anchorId: 'ar-grid', title: '청구·계산서·미수 원장', summary: '세금계산서 발행 토글, 수납액, 미수납잔액을 행 단위로 즉시 관리한다.' },
      { anchorId: 'ar-docs', title: '수납 등록 · 거래명세서 발송', summary: '수납액을 입금 기록하거나 거래명세서를 엑셀 편집·발송한다.' },
    ],
    processes: [
      {
        processName: '계약 근거 청구 생성 및 세금계산서·수납 관리',
        purpose: '청구금액 = 수납액 + 미수납잔액 보존 법칙과 계산서 발행 상태를 단일 화면에서 완결한다.',
        steps: [
          { stepNo: 1, targetLabel: '청구 생성 바', manualAnchorId: 'ar-gen', actionDetail: '청구 연월과 대상 계약을 선택하고 청구 생성 버튼을 실행한다.' },
          { stepNo: 2, targetLabel: '세금계산서 발행 체크 및 번호', manualAnchorId: 'ar-grid', actionDetail: '행 좌측 계산서 발행 여부 토글과 승인번호를 갱신한다.' },
          { stepNo: 3, targetLabel: '수납 등록 · 명세서 발송', manualAnchorId: 'ar-docs', actionDetail: '수납금액과 입금일을 입력해 수납 완료하고 거래명세서를 발송한다.' },
        ],
      },
    ],
  },
  ap_settlements: {
    pageId: 'ap_settlements',
    pageTitle: '매입 비용 정산',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription: '매입채무, 운송비, 외주정비비 지급을 확정하고 외화 결제 시 장부환율과 결제환율 차이에 따른 외환차익·외환차손을 자동 계산한다.',
    anchors: [
      { anchorId: 'ap-tabs', title: '정산 대상 필터', summary: '전체, 미지급, 외화채무, 물류비·외주비별로 채무를 필터링한다.' },
      { anchorId: 'ap-pay', title: '결제 환율·지급 처리', summary: '결제일과 결제환율을 입력하여 지급과 외환차손익을 확정한다.' },
    ],
    processes: [
      {
        processName: '외화 매입채무 결제 및 외환차손익 확정',
        purpose: '외화 장부금액과 실결제 원화 금액의 차이를 손익계산서 영업외손익으로 정확히 반영한다.',
        steps: [
          { stepNo: 1, targetLabel: '미지급 채무 행', manualAnchorId: 'ap-tabs', actionDetail: '결제할 외화 또는 원화 채무 행을 선택한다.' },
          { stepNo: 2, targetLabel: '결제환율 입력창', manualAnchorId: 'ap-pay', actionDetail: '송금일자와 실제 결제 적용환율을 입력한다.' },
          { stepNo: 3, targetLabel: '지급 확정 버튼', manualAnchorId: 'ap-pay', actionDetail: '지급 확정 버튼으로 채무 잔액 차감과 외환차익·차손을 확정한다.' },
        ],
      },
    ],
  },
  bank_matching: {
    pageId: 'bank_matching',
    pageTitle: '통장 입출금 대사',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription: '테넌트 설정에 따라 활성화되는 기능으로 통장 입출금 내역과 매출 청구 수납 및 매입 채무를 1대1 연결 대사한다.',
    anchors: [
      { anchorId: 'btx-add', title: '통장 거래 등록', summary: '일자, 입출금 구분, 거래처적요, 금액을 등록한다.' },
      { anchorId: 'btx-match', title: '청구·채무 대사 연결', summary: '미대사 입출금 행과 대상 청구 또는 리스 회차를 1대1로 매칭한다.' },
    ],
    processes: [
      {
        processName: '입금 내역과 미수 청구 1대1 대사',
        purpose: '통장 실입금액을 수납 처리와 직접 연결하여 미수납잔액을 차감한다.',
        steps: [
          { stepNo: 1, targetLabel: '미대사 입금 행', manualAnchorId: 'btx-match', actionDetail: '미대사 상태의 통장 입금 내역을 선택한다.' },
          { stepNo: 2, targetLabel: '대상 청구 선택 및 연결', manualAnchorId: 'btx-match', actionDetail: '대조할 미수 청구를 선택하고 대사 연결 버튼을 누른다.' },
        ],
      },
    ],
  },
  financial_statements: {
    pageId: 'financial_statements',
    pageTitle: '재무제표 조회',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription: '조회 연월 범위에 따라 재무상태표, 손익계산서, 현금흐름표, 렌탈자산 상각명세, 금융리스 원금·이자 명세 및 중소기업회계기준 해설을 제공한다.',
    anchors: [
      { anchorId: 'fs-period', title: '조회 기간 설정', summary: '시작 연월과 종료 연월을 지정하여 전체 장부를 재집계한다.' },
      { anchorId: 'fs-tabs', title: '보고서 전환 탭', summary: '재무상태표, 손익계산서, 현금흐름표, 자산·리스명세, 회계기준을 전환한다.' },
      { anchorId: 'fs-verify', title: '대차 차액 0원 검증식', summary: '자산총계와 부채 및 자본총계의 일치를 최하단 검증 바에서 확인한다.' },
    ],
    processes: [
      {
        processName: '기간별 재무상태표 · 손익계산서 검증',
        purpose: '유통원가, 렌탈상각, 금융리스 이자비용, 외환차손익까지 반영된 대차 차액 0원 결산을 확인한다.',
        steps: [
          { stepNo: 1, targetLabel: '시작·종료 연월 입력', manualAnchorId: 'fs-period', actionDetail: '조회할 시작 연월과 종료 연월을 입력한다.' },
          { stepNo: 2, targetLabel: '보고서 탭 전환', manualAnchorId: 'fs-tabs', actionDetail: '재무상태표, 손익계산서, 현금흐름표, 리스이자명세를 순차 검토한다.' },
          { stepNo: 3, targetLabel: '대차 검증 바', manualAnchorId: 'fs-verify', actionDetail: '하단 검증 바의 대차 차액 0원 및 현금 차이 0원 상태를 확인한다.' },
        ],
      },
    ],
  },
  organization_hr: {
    pageId: 'organization_hr',
    pageTitle: '조직 인사 관리',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription:
      '부서 조직 계층과 업무 기능 태그, 임직원 개인 신상·연차·보안서약·급여·수동 통상임금·4대보험·계좌 정보, 관리자 비밀번호 초기화 및 인사 발령 이력을 통합 관리한다.',
    anchors: [
      { anchorId: 'hr-tabs', title: '조직·인사 업무 탭', summary: '임직원 인사원장, 부서 조직도, 전체 발령 이력 탭을 전환한다.' },
      { anchorId: 'hr-filter', title: '부서·상태 필터 및 등록 버튼', summary: '소속 부서와 재직 상태로 임직원을 조회하고 엑셀 내보내기 및 신규 등록을 실행한다.' },
      { anchorId: 'hr-dept-tree', title: '조직 계층 트리', summary: '상하위 부서 계층별 재직 인원을 확인하고 선택한 부서 소속 임직원을 필터링한다.' },
      { anchorId: 'hr-grid', title: '인사원장 그리드', summary: '사번, 성명, 부서, 직책, 티어, 연차 잔여일수, 서약 여부, 재직 상태를 조회하고 상세 버튼으로 인사카드를 연다.' },
      { anchorId: 'hr-conservation', title: '정원 대차 검증 바', summary: '전체 임직원 수와 재직·휴직·퇴사 인원의 합계 일치를 즉시 대조한다.' },
    ],
    processes: [
      {
        processName: '신규 입사 등록 및 인사 발령',
        purpose: '신규 임직원 계정과 사번을 발급하고 개인 신상·연차·보안서약·발령 변경 이력을 기록한다.',
        steps: [
          { stepNo: 1, targetLabel: '신규 입사 등록 버튼', manualAnchorId: 'hr-filter', actionDetail: '로그인 아이디, 초기 비밀번호, 사번, 소속 부서, 직급 티어, 부여 연차와 급여·4대보험 초기값을 입력해 계정을 생성한다.' },
          { stepNo: 2, targetLabel: '인사원장 상세 버튼', manualAnchorId: 'hr-grid', actionDetail: '인사정보·발령 탭에서 프로필 사진, 주민등록번호, 연차, 보안서약 스캔본, 부서·직책·티어·상태를 수정 저장한다.' },
          { stepNo: 3, targetLabel: '급여 · 계좌 탭', manualAnchorId: 'hr-grid', actionDetail: '6단계 이상 급여 권한자가 월 기본급, 수동 입력 통상임금, 식대, 차량보조금, 용역계약금액, 급여계좌, 4대보험 가입여부를 저장한다.' },
          { stepNo: 4, targetLabel: '비밀번호 초기화 탭', manualAnchorId: 'hr-grid', actionDetail: '4단계 이상 관리자가 임시 비밀번호를 재발급하고 비밀번호 초기화 이력을 남긴다.' },
        ],
      },
      {
        processName: '부서 조직 계층 및 업무 기능 관리',
        purpose: '상하위 부서 구조, 부서장, 담당 업무 기능 태그를 표준화한다.',
        steps: [
          { stepNo: 1, targetLabel: '조직 인사 탭', manualAnchorId: 'hr-tabs', actionDetail: '부서 조직도 탭으로 전환하거나 부서 추가 버튼을 연다.' },
          { stepNo: 2, targetLabel: '부서 저장', manualAnchorId: 'hr-dept-tree', actionDetail: '상위 부서, 부서장, 정렬 순서 및 담당 업무 기능 태그를 저장한다.' },
        ],
      },
    ],
  },
  operation_manual: {
    pageId: 'operation_manual',
    pageTitle: '업무 매뉴얼',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription: '전체 26개 메뉴 화면의 기본기능 설명, 업무 프로세스 명칭, 화면 조작 순서를 키워드 검색하고 현재 화면 매뉴얼 오버레이를 호출한다.',
    anchors: [
      { anchorId: 'man-search', title: '통합 매뉴얼 검색창', summary: '메뉴명, 업무 프로세스, 버튼명, 조작 단어로 전체 매뉴얼을 검색한다.' },
      { anchorId: 'man-list', title: '화면·프로세스 조작 순서 본문', summary: '선택한 화면의 기본기능과 단계별 조작 순서를 확인한다.' },
    ],
    processes: [
      {
        processName: '매뉴얼 검색 및 화면별 조작순서 조회',
        purpose: '모든 임직원이 동일한 표준 용어와 화면 조작 순서를 즉시 확인한다.',
        steps: [
          { stepNo: 1, targetLabel: '매뉴얼 검색창', manualAnchorId: 'man-search', actionDetail: '찾고자 하는 업무 명칭이나 기능 단어를 입력한다.' },
          { stepNo: 2, targetLabel: '화면 이동 또는 오버레이 보기', manualAnchorId: 'man-list', actionDetail: '조작 순서 단계를 확인하고 해당 업무 화면으로 이동한다.' },
        ],
      },
    ],
  },
  system_settings: {
    pageId: 'system_settings',
    pageTitle: '시스템 설정',
    groupLabel: '정산 · 회계 · 설정',
    basicDescription: '7단계 직급 티어 부여, 정비직 단가 비공개, 12종 결재기준 티어, 티어별 화면권한, 5종 문서양식 및 공식 이메일 연동을 관리한다.',
    anchors: [
      { anchorId: 'sys-tabs', title: '설정 영역 전환 탭', summary: '사용자 티어, 결재 기준, 티어 권한, 문서 양식, 이메일 설정을 전환한다.' },
      { anchorId: 'sys-body', title: '설정 편집 영역', summary: '각 행의 티어, 필요 결재단계, 권한 토글, 양식 파일을 수정 저장한다.' },
    ],
    processes: [
      {
        processName: '사용자 7단계 티어 및 결재 기준 설정',
        purpose: '사용자별 직급 티어와 핵심 업무 행위의 최소 결재 티어를 조직 기준에 맞게 구성한다.',
        steps: [
          { stepNo: 1, targetLabel: '설정 구분 탭', manualAnchorId: 'sys-tabs', actionDetail: '사용자 티어 또는 결재 기준 탭을 선택한다.' },
          { stepNo: 2, targetLabel: '티어 선택 및 저장 버튼', manualAnchorId: 'sys-body', actionDetail: '1단계~7단계 직급 티어와 단가 비공개 여부를 변경하고 저장한다.' },
        ],
      },
    ],
  },
};

export const ALL_MANUAL_ENTRIES: ScreenManualEntry[] = Object.values(FL_MANUAL_REGISTRY);

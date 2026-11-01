// 지게차 호환부품 전문 판매기업 분석 · 자체 카탈로그 겸 주문서 전환 전략 · 24종 호환부품 마스터 데이터베이스

export interface BenchmarkPartsCompany {
  id: string;
  companyName: string;
  domainUrl: string;
  countryOrigin: string;
  specialization: string;
  targetBrands: string[];
  htmlCssDomArchitecture: {
    listContainerDom: string;
    itemCardDom: string;
    detailSpecDom: string;
    cssLayoutCharacteristics: string;
    crawledSampleHtmlSnippet: string;
  };
  pricingModel: string;
  strengths: string[];
  structuralLimitations: string[];
  ourConversionTakeaway: string;
}

export interface CatalogToOrderStrategyPhase {
  stepNumber: number;
  phaseTitle: string;
  coreObjective: string;
  keyExecutionItems: string[];
  expectedBusinessImpact: string;
}

export interface PartDimensionSpec {
  label: string;
  value: string;
}

export type PartCategoryType =
  | '타이어·휠·캐스터'
  | '포크·덧발·어태치먼트'
  | '마스트·롤러·체인'
  | '전장·컨트롤러·센서'
  | '배터리·충전·커넥터'
  | '유압·제동·조향'
  | '필터·시트·안전용품';

export type PartDiagramSvgType =
  | 'SOLID_TIRE'
  | 'PU_DRIVE_WHEEL'
  | 'FORGED_FORK'
  | 'FORK_SLEEVE'
  | 'SIDE_SHIFTER'
  | 'MAST_BEARING'
  | 'LIFT_CHAIN'
  | 'AC_CONTROLLER'
  | 'CONTACTOR_RELAY'
  | 'ALTERNATOR'
  | 'POWER_CONNECTOR'
  | 'LFP_BATTERY_PACK'
  | 'SEAL_KIT'
  | 'WET_DISC_BRAKE'
  | 'KINGPIN_KIT'
  | 'FILTER_PACKAGE'
  | 'SUSPENSION_SEAT';

export interface CompatiblePartCatalogItem {
  id: string;
  sku: string;
  oemCrossRefCodes: string[];
  partName: string;
  category: PartCategoryType;
  manufacturer: string;
  originCountry: '중국 직수입' | '국내 매입' | '글로벌 OEM';
  partGrade: '신품 호환' | '순정 OEM' | 'A급 재생 호환';
  specSummary: string;
  detailedSpecs: PartDimensionSpec[];
  compatibleModels: string[];
  compatibleBrands: string[];
  tonnageRange: string;
  foreignCurrency: 'CNY' | 'USD' | 'KRW';
  foreignUnitCost: number;
  landedCostKrw: number;
  dealerPriceKrw: number;
  retailPriceKrw: number;
  unitName: string;
  moq: number;
  stockQty: number;
  warehouseLocation: string;
  deliveryPolicy: string;
  diagramType: PartDiagramSvgType;
  referenceSource: string;
  technicalNote: string;
}

export const BENCHMARK_PARTS_COMPANIES: BenchmarkPartsCompany[] = [
  {
    id: 'bench-forkl',
    companyName: '포크엘',
    domainUrl: 'https://www.forkl.com',
    countryOrigin: '대한민국',
    specialization: '국내 지게차·중장비 신품 호환부품, 중고·재생 부품, MRO 안전용품 종합 마켓플레이스',
    targetBrands: ['두산밥캣', '현대사이트솔루션', '클라크', '도요타', '니찌유', '코마츠'],
    htmlCssDomArchitecture: {
      listContainerDom: 'table > tbody > tr > td > a > img.imgBox.margin10 + div.goodsinfo > ul > li.name + li',
      itemCardDom: 'ul > li.pimg > a > img.imgBox[width=140][height=98] + li.ptitle + li.pplace + li.pprice',
      detailSpecDom: 'table > tr > td : 상품명, 판매가, 제조사, 제품상태, 적용모델, 특이사항·규격, 재고수량',
      cssLayoutCharacteristics: '@charset euc-kr 기반 레거시 980px 고정폭 테이블 레이아웃, #gmBar 블루 헤더와 .pprice 오렌지 단가 강조 스타일 적용',
      crawledSampleHtmlSnippet: `<tr>
  <td>
    <a href="/part/part.php?mallmode=view&mallidx=9345"><img src="../ezs_data/product/s_1_1792564988.jpg" width="148" height="108" class="imgBox margin10"></a>
    <div class="goodsinfo">
      <ul>
        <li class="name">750-16 일반 앞 타이어</li>
        <li>부품번호: -</li><li>제조사: 기타</li><li>계통: 타이어</li><li>형식: 기타</li><li>적용모델: D35SE-7</li>
      </ul>
    </div>
  </td>
  <td class="price tcenter">200,000원</td>
  <td class="tcenter">지게차장인</td>
  <td style="text-align: center;">착불</td>
</tr>`
    },
    pricingModel: '단일 노출 판매가 기준 · 배송비 착불 또는 16시 이전 당일발송 병기',
    strengths: [
      '국내 현장에서 가장 많이 찾는 포크, 덧발, 통타이어, 마스트 베어링, 재생 배터리 실물 재고 보유',
      '신품·중고품·재생품·MRO 4대 상태 분류를 통한 실수요자 가격 접근성 확보'
    ],
    structuralLimitations: [
      '목록 화면에서 복수 품목 수량 체크 및 일괄 견적·주문서 발행 불가',
      '적용모델 필드가 비정형 자유 텍스트여서 특정 지게차 모델 기준 전체 호환부품 일괄 조회 불가',
      '대리점 도매 공급가와 최종 소비자 판매가의 이원화 단가 체계 미지원'
    ],
    ourConversionTakeaway: '포크엘의 핵심 필드인 계통·적용모델·규격·제품상태·당일발송 체계를 수용하되, 리스트 내 인라인 수량 입력기와 기종별 호환 매트릭스를 결합하여 즉시 주문서로 전환'
  },
  {
    id: 'bench-partsk',
    companyName: '파츠케이',
    domainUrl: 'https://www.partsk.com',
    countryOrigin: '대한민국',
    specialization: '국산·수입 지게차 OEM 순정품번 기반 애프터마켓 호환부품 크로스레퍼런스 플랫폼',
    targetBrands: ['두산밥캣', '현대사이트솔루션', '클라크', '도요타', '얀마', '커민스'],
    htmlCssDomArchitecture: {
      listContainerDom: 'div.part-search-wrap > table.part-grid > tbody > tr[data-oem-pn]',
      itemCardDom: 'td.col-pn + td.col-cross-pn + td.col-name + td.col-model + td.col-price + td.col-cart',
      detailSpecDom: 'dl.spec-dl > dt + dd',
      cssLayoutCharacteristics: '고밀도 품번 대조 테이블 구조 및 OEM 품번 하이라이트 배지 스타일',
      crawledSampleHtmlSnippet: `<tr class="part-row">
  <td class="col-pn">A213508</td>
  <td class="col-cross-pn"><span class="badge-compat">호환 MG30912</span></td>
  <td class="col-name">마스트 가이드 롤러 베어링 45×128×36</td>
  <td class="col-model">D30S-7 / GTS25</td>
  <td class="col-price">34,000원</td>
</tr>`
    },
    pricingModel: 'OEM 순정가 대비 35~60% 절감된 애프터마켓 호환 단가 제시',
    strengths: [
      '정비공장 및 부품 대리점이 보유한 순정 파츠북 품번만으로 호환품 즉시 매칭 가능'
    ],
    structuralLimitations: [
      '품번을 모르는 일반 지게차 차주나 영업사원은 도면·치수 없이 검색이 어려움'
    ],
    ourConversionTakeaway: '모든 부품 레코드에 자사 표준 호환품번과 복수의 OEM 순정품번을 1:N 매핑하여 품번 검색과 기종 검색을 동시 지원'
  },
  {
    id: 'bench-tvh',
    companyName: '티브이에이치 토탈소스',
    domainUrl: 'https://www.tvh.com',
    countryOrigin: '벨기에 · 글로벌',
    specialization: '전 세계 최대 산업차량·지게차 호환부품 B2B 공급망 및 통합 발주 포털',
    targetBrands: ['안후이 헬리', '비와이디', '항차그룹', '이피이큅먼트', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    htmlCssDomArchitecture: {
      listContainerDom: 'section.my-parts-finder · Make > Model > Assembly + div.order-sheet-grid',
      itemCardDom: 'div.part-dossier > svg.tech-drawing + table.dim-spec + input.qty-stepper',
      detailSpecDom: '측면 기술 도면 내 치수 기호 및 하단 실측값 테이블 1:1 매칭',
      cssLayoutCharacteristics: '좌상단 기종 선택기 중앙 규격 도면 그리드 우하단 일괄 발주 바의 전형적인 Z-패턴 B2B 대장',
      crawledSampleHtmlSnippet: `<div class="tvh-part-card">
  <div class="fitment-bar">적합기종: HELI CPD25 / HANGCHA XC25 / HYUNDAI 25B-9U</div>
  <div class="spec-params">내경: 40mm | 외경: 115.8mm | 폭: 32mm</div>
  <div class="order-box"><input type="number" value="4" min="1" /> <button>주문서 담기</button></div>
</div>`
    },
    pricingModel: '대리점 등급별 도매 단가 및 수량 구간별 할인 단가 자동 적용',
    strengths: [
      '기종 선택 시 해당 지게차의 전체 소모품·수리부품 리스트가 주문서 형태로 즉시 전개됨',
      '기술 도면과 치수 파라미터가 표준화되어 오발주 및 반품률을 원천 차단'
    ],
    structuralLimitations: [
      '해외 포털 특성상 국내 거래명세서·발주서 양식 및 원화 부가세·수입원가 연동이 분리됨'
    ],
    ourConversionTakeaway: '기종 선택 즉시 호환 부품 전체가 펼쳐지는 기종별 맞춤 카탈로그 필터와 기술 치수 벡터 도면을 당사 시스템에 내장'
  },
  {
    id: 'bench-chinalift',
    companyName: '차이나 리프트 서플라이 · 한지 파츠',
    domainUrl: 'https://www.hz-forkliftparts.com',
    countryOrigin: '중국',
    specialization: '안후이 헬리·항차·이피·비와이디 중국산 지게차 및 커티스·신차이 호환부품 직수출 도매',
    targetBrands: ['안후이 헬리', '비와이디', '항차그룹', '이피이큅먼트'],
    htmlCssDomArchitecture: {
      listContainerDom: 'div.l-wrap > div.product-category-tabs + ul.hz-prod-list > li.hz-item',
      itemCardDom: 'div.img-wrap + h3.part-title + p.oem-code + span.fob-price',
      detailSpecDom: 'Engine / Transmission / Hydraulic / Electrical / Mast & Fork 5대 어셈블리 그룹 분류',
      cssLayoutCharacteristics: '계통별 모듈형 카드 배치 및 외화 단가 · 최소주문수량 표기 구조',
      crawledSampleHtmlSnippet: `<li class="hz-item">
  <h3>Curtis AC Controller 1238E-6521 80V 550A</h3>
  <p class="oem-code">For HELI G2 / HANGCHA XC 2.5T-3.0T Lithium Forklift</p>
  <span class="moq-badge">MOQ: 1 PC | Fast Air/Sea Shipping</span>
</li>`
    },
    pricingModel: '중국 현지 공장도 위안화·달러 외화 단가 기반 직수입 공급',
    strengths: [
      '국내에 급증한 중국산 리튬전동 지게차 및 전동 파레트트럭의 전장·구동부품을 가장 저렴하게 직수입 가능'
    ],
    structuralLimitations: [
      '영문/중문 혼용 카탈로그로 인해 국내 대리점·정비소 배포용 한글 주문서로 즉시 활용 불가'
    ],
    ourConversionTakeaway: '중국 직수입 부품의 외화 원가와 부대비용을 반영한 수입원가를 산출하고, 국내 대리점 배포용 순수 한국어 카탈로그 겸 주문서로 자동 변환'
  }
];

export const CATALOG_TO_ORDER_STRATEGY: CatalogToOrderStrategyPhase[] = [
  {
    stepNumber: 1,
    phaseTitle: '1단계: 3중 교차식별 코드 및 기종별 호환 매트릭스 표준화',
    coreObjective: '품번을 몰라도 지게차 모델명 또는 계통 분류만으로 1초 내 정확한 호환부품을 특정하는 단일 진실의 원천 체계 구축',
    keyExecutionItems: [
      '자사 표준 호환품번, 제조사 순정품번, 국내 유통 통용규격을 1:N 교차 매핑',
      '당사 아카이브 8대 주력 지게차 · 헬리 CPD25, 비와이디 ECB30C, 항차 XC25, 이피 EPL205Z, 두산 D30S-7, 현대 25B-9U, 클라크 GTS25, 도요타 8FB25와 부품 간 다대다 적합성 연결',
      '7대 핵심 계통(타이어·휠, 포크·덧발, 마스트·체인, 전장·컨트롤러, 배터리·커넥터, 유압·제동, 필터·안전용품) 단일 표준 분류 적용'
    ],
    expectedBusinessImpact: '부품 문의 시 전화 응대 및 품번 대조 시간 80% 단축, 기종별 패키지 추가 판매 유도'
  },
  {
    stepNumber: 2,
    phaseTitle: '2단계: 실측 규격 파라미터 및 기술 치수 도면 내장화',
    coreObjective: '현장 정비사와 대리점이 줄자 실측치(내경·외경·폭·피치·단면)를 즉시 대조하여 오발주·반품률 0% 달성',
    keyExecutionItems: [
      '부품군별 필수 실측 규격(타이어 림폭·외경, 포크 단면·클래스, 베어링 내경×외경×폭, 체인 피치, 컨트롤러 전압·전류)을 구조화된 키-값으로 수집',
      '치수 보증 벡터 기술 도면을 카탈로그 화면과 인쇄용 주문서에 동시 렌더링',
      '신품 호환 · 순정 OEM · A급 재생 호환 등급 배지 및 보관 창고 렉 위치 명시'
    ],
    expectedBusinessImpact: '규격 착오로 인한 왕복 화물비 손실 및 환입(반품) 발생 원천 차단'
  },
  {
    stepNumber: 3,
    phaseTitle: '3단계: 수입원가 연동 3단 가격 정책(원가 · 대리점 공급가 · 소비자 판매가) 이원화',
    coreObjective: '동일 카탈로그를 대리점 도매 발주서와 최종고객 소매 견적서로 즉시 전환하여 유통 마진 극대화',
    keyExecutionItems: [
      '중국 직수입 및 국내 매입 원가에 관세·운임을 반영한 총입고원가 기준선 설정',
      '거래처 유형에 따라 [대리점 공급가 모드]와 [권장 소비자 판매가 모드]를 1클릭 전환하여 카탈로그 단가 실시간 변경',
      '품목별 매출이익액 및 이익률을 내부 담당자 화면에서 실시간 시뮬레이션(인쇄용 고객 주문서에서는 원가·마진 자동 은닉)'
    ],
    expectedBusinessImpact: '대리점 영업과 직판 영업의 이중 카탈로그 제작 비용 제거 및 목표 매출총이익률(25~38%) 수호'
  },
  {
    stepNumber: 4,
    phaseTitle: '4단계: 카탈로그 = 주문서 일체화 및 ERP 수주·출고 직결',
    coreObjective: '카탈로그 열람 화면 자체가 곧 주문서가 되어 인쇄·엑셀 배포·ERP 수주 등록이 단일 화면에서 완결',
    keyExecutionItems: [
      '카탈로그 그리드 각 행에 인라인 주문수량 스테퍼 및 체크박스 탑재',
      '우하단 대차대조 합계 바에서 [공급가액 + 부가세 = 총 주문액] 실시간 검증 후 [유통 수주·출고 즉시 확정] 연동',
      '대리점 팩스·이메일 배포용 [A4 호환부품 카탈로그 겸 주문서 인쇄] 및 수식 내장 [엑셀 카탈로그 주문서 다운로드] 제공'
    ],
    expectedBusinessImpact: '카탈로그 확인 별도 주문서 작성 ERP 재입력의 3중 수작업을 단일 흐름으로 단축'
  }
];

export const COMPATIBLE_PARTS_CATALOG: CompatiblePartCatalogItem[] = [
  // 1. 타이어·휠·캐스터 (4종)
  {
    id: 'cp-01',
    sku: 'FL-TIRE-70012-BLK',
    oemCrossRefCodes: ['HL-700-12-SOL', 'CL-2788121', 'HD-31Q6-10120', 'TY-42611-23320-71'],
    partName: '지게차 흑색 통타이어 7.00-12 (전륜 구동용 솔리드)',
    category: '타이어·휠·캐스터',
    manufacturer: '넥센·더블코인 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '규격 7.00-12 / 림폭 5.00S / 외경 665mm × 폭 172mm / 3중 고탄성 솔리드',
    detailedSpecs: [
      { label: '타이어 규격', value: '7.00-12 (솔리드 통타이어)' },
      { label: '적용 림 규격', value: '5.00S × 12 인치' },
      { label: '외경 × 단면폭', value: '665 mm × 172 mm' },
      { label: '최대 허용하중', value: '2,920 kg · 시속 25km 기준' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', 'GTS25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '클라크'],
    tonnageRange: '2.0톤 ~ 2.5톤 전륜 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 620,
    landedCostKrw: 124000,
    dealerPriceKrw: 165000,
    retailPriceKrw: 210000,
    unitName: '본',
    moq: 2,
    stockQty: 36,
    warehouseLocation: '평택 1창고 A-01',
    deliveryPolicy: '16시 이전 당일화물 발송',
    diagramType: 'SOLID_TIRE',
    referenceSource: '포크엘 실거래가(200,000원) 및 직수입 단가 기준',
    technicalNote: '내마모성 천연고무 3층 구조로 야외 아스팔트 및 물류센터 겸용 장착'
  },
  {
    id: 'cp-02',
    sku: 'FL-TIRE-6009-BLK',
    oemCrossRefCodes: ['HL-600-9-SOL', 'CL-2788109', 'HC-600-9-STD'],
    partName: '지게차 흑색 통타이어 6.00-9 (후륜 조향용 솔리드)',
    category: '타이어·휠·캐스터',
    manufacturer: '넥센·더블코인 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '규격 6.00-9 / 림폭 4.00E / 외경 525mm × 폭 140mm / 후륜 조향축 전용',
    detailedSpecs: [
      { label: '타이어 규격', value: '6.00-9 (솔리드 통타이어)' },
      { label: '적용 림 규격', value: '4.00E × 9 인치' },
      { label: '외경 × 단면폭', value: '525 mm × 140 mm' },
      { label: '최대 허용하중', value: '1,880 kg (조향축 기준)' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', 'GTS25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '클라크'],
    tonnageRange: '2.0톤 ~ 2.5톤 후륜 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 430,
    landedCostKrw: 86000,
    dealerPriceKrw: 115000,
    retailPriceKrw: 148000,
    unitName: '본',
    moq: 2,
    stockQty: 42,
    warehouseLocation: '평택 1창고 A-02',
    deliveryPolicy: '16시 이전 당일화물 발송',
    diagramType: 'SOLID_TIRE',
    referenceSource: '2.5톤 표준 후륜 통타이어 호환 규격',
    technicalNote: '제자리 급선회 시 숄더부 뜯김 방지 고강도 트레드 패턴 적용'
  },
  {
    id: 'cp-03',
    sku: 'FL-TIRE-28915-NM',
    oemCrossRefCodes: ['BYD-28915-NM', 'DS-D30-28915W', 'NX-28915-WHT'],
    partName: '친환경 백색 논마킹 통타이어 28×9-15 (3.0톤 전륜용)',
    category: '타이어·휠·캐스터',
    manufacturer: '넥센솔리드 호환',
    originCountry: '국내 매입',
    partGrade: '신품 호환',
    specSummary: '규격 28×9-15 (8.15-15) / 림폭 7.00T / 외경 695mm × 폭 216mm / 바닥 자국 방지',
    detailedSpecs: [
      { label: '타이어 규격', value: '28×9-15 (8.15-15 호환)' },
      { label: '적용 림 규격', value: '7.00T × 15 인치' },
      { label: '외경 × 단면폭', value: '695 mm × 216 mm' },
      { label: '소재 특성', value: '실리카 배합 백색 논마킹 (에폭시 바닥 검정 자국 제로)' }
    ],
    compatibleModels: ['ECB30C', 'D30S-7'],
    compatibleBrands: ['비와이디', '두산밥캣'],
    tonnageRange: '3.0톤 ~ 3.5톤 전륜 공용',
    foreignCurrency: 'KRW',
    foreignUnitCost: 188000,
    landedCostKrw: 188000,
    dealerPriceKrw: 245000,
    retailPriceKrw: 310000,
    unitName: '본',
    moq: 2,
    stockQty: 18,
    warehouseLocation: '평택 1창고 A-05',
    deliveryPolicy: '16시 이전 당일화물 발송',
    diagramType: 'SOLID_TIRE',
    referenceSource: '식품·제약·반도체 에폭시 물류창고 필수 소모품',
    technicalNote: '비와이디 ECB30C 및 두산 D30S-7 전륜 표준 휠에 프레스 압입 장착'
  },
  {
    id: 'cp-04',
    sku: 'FL-WHEEL-PU23075',
    oemCrossRefCodes: ['EP-1113-130005-00', 'HC-PU230-75', 'HL-CBD20-DW230'],
    partName: '전동 파레트트럭 폴리우레탄 구동륜 230×75mm',
    category: '타이어·휠·캐스터',
    manufacturer: '이피·한지 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '외경 230mm × 폭 75mm × 허브내경 65mm / 볼트홀 5구 / 고하중 우레탄 코팅',
    detailedSpecs: [
      { label: '외경 × 트레드폭', value: '230 mm × 75 mm' },
      { label: '허브 내경 × 볼트PCD', value: '65 mm × PCD 98 mm (5홀)' },
      { label: '우레탄 경도', value: '92 Shore A (내마모·저소음)' },
      { label: '심재 재질', value: '구상흑연주철 정밀 가공 휠 코어' }
    ],
    compatibleModels: ['EPL205Z'],
    compatibleBrands: ['이피이큅먼트', '안후이 헬리', '항차그룹'],
    tonnageRange: '1.5톤 ~ 2.0톤 전동 파레트트럭 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 290,
    landedCostKrw: 58000,
    dealerPriceKrw: 88000,
    retailPriceKrw: 125000,
    unitName: '개',
    moq: 1,
    stockQty: 28,
    warehouseLocation: '평택 2창고 B-11',
    deliveryPolicy: '당일 택배 발송',
    diagramType: 'PU_DRIVE_WHEEL',
    referenceSource: '이피 EPL 시리즈 및 중국산 핸드파레트 최다 교체 소모품',
    technicalNote: '기존 구동 모터 감속기 플랜지에 볼트 5개로 15분 내 즉시 교체 가능'
  },

  // 2. 포크·덧발·어태치먼트 (4종)
  {
    id: 'cp-05',
    sku: 'FL-FORK-25T-1070',
    oemCrossRefCodes: ['ISO2328-2A-1070', 'HD-FK25-1070', 'HL-25G2-FK1070', 'TY-42201-23320-71'],
    partName: 'ISO Class II 단조 표준 포크 40×122×1,070mm (1조=2본)',
    category: '포크·덧발·어태치먼트',
    manufacturer: '캐스케이드·한지 단조 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '두께 40mm × 폭 122mm × 길이 1,070mm / 캐리지 걸이폭 407mm · 2A 규격',
    detailedSpecs: [
      { label: '단면 두께 × 폭', value: '40 mm × 122 mm' },
      { label: '블레이드 길이', value: '1,070 mm' },
      { label: '마운팅 클래스', value: 'ISO 2328 Class II Type A · 걸이 간격 407 mm' },
      { label: '소재 및 안전율', value: '35CrMo 합금 단조강 · 안전율 3:1 열처리 검증' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 2.5톤 전 브랜드 호환',
    foreignCurrency: 'CNY',
    foreignUnitCost: 1380,
    landedCostKrw: 276000,
    dealerPriceKrw: 380000,
    retailPriceKrw: 480000,
    unitName: '조(2본)',
    moq: 1,
    stockQty: 14,
    warehouseLocation: '평택 1창고 C-01',
    deliveryPolicy: '당일 화물 발송',
    diagramType: 'FORGED_FORK',
    referenceSource: '국제 표준 ISO 2328 Class II 규격으로 국산·수입 2.5톤 100% 호환',
    technicalNote: '상부 위치 고정 스토퍼 핀 2개 기본 장착 출고'
  },
  {
    id: 'cp-06',
    sku: 'FL-FORK-30T-1200',
    oemCrossRefCodes: ['ISO2328-3A-1200', 'DS-FK30-1200', 'BYD-ECB30-FK1200'],
    partName: 'ISO Class III 중하중 단조 포크 45×125×1,200mm (1조=2본)',
    category: '포크·덧발·어태치먼트',
    manufacturer: '캐스케이드·한지 단조 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '두께 45mm × 폭 125mm × 길이 1,200mm / 캐리지 걸이폭 508mm · 3A 규격',
    detailedSpecs: [
      { label: '단면 두께 × 폭', value: '45 mm × 125 mm' },
      { label: '블레이드 길이', value: '1,200 mm' },
      { label: '마운팅 클래스', value: 'ISO 2328 Class III Type A · 걸이 간격 508 mm' },
      { label: '정격 허용하중', value: '3,500 kg · 하중중심 500 mm 기준' }
    ],
    compatibleModels: ['ECB30C', 'D30S-7'],
    compatibleBrands: ['비와이디', '두산밥캣'],
    tonnageRange: '3.0톤 ~ 3.5톤 표준 캐리지 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 1650,
    landedCostKrw: 330000,
    dealerPriceKrw: 450000,
    retailPriceKrw: 560000,
    unitName: '조(2본)',
    moq: 1,
    stockQty: 10,
    warehouseLocation: '평택 1창고 C-02',
    deliveryPolicy: '당일 화물 발송',
    diagramType: 'FORGED_FORK',
    referenceSource: '3.0톤 전동·디젤 지게차 표준 교체용 단조 포크',
    technicalNote: '포크 힐(꺾임부) 두께 강화 설계로 피로 균열 저항성 30% 향상'
  },
  {
    id: 'cp-07',
    sku: 'FL-SLEEVE-2530-1800',
    oemCrossRefCodes: ['FK-EXT-1800-HD', 'FORKL-SLV1800', 'SM490A-EXT-1800'],
    partName: '고강도 밀폐형 포크 덧발 1,800mm (2.5~3.0톤 공용, 1조=2본)',
    category: '포크·덧발·어태치먼트',
    manufacturer: '국내 제작 호환',
    originCountry: '국내 매입',
    partGrade: '신품 호환',
    specSummary: '전장 1,800mm × 내측폭 135mm × 내측높이 52mm / 하부 8T 보강 / 잠금핀 일체형',
    detailedSpecs: [
      { label: '덧발 총길이', value: '1,800 mm · 기존 1,070~1,200mm 포크 삽입용' },
      { label: '내측 삽입 규격', value: '내폭 135 mm × 내고 52 mm · 122~125mm 포크 공용' },
      { label: '강판 두께', value: '상판 6T + 하부 보강판 8T 구조용 고장력강 SM490A' },
      { label: '이탈 방지 장치', value: '후방 안전 고정핀 및 분실방지 체인 부착' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.5톤 ~ 3.0톤 전 기종 공용',
    foreignCurrency: 'KRW',
    foreignUnitCost: 175000,
    landedCostKrw: 175000,
    dealerPriceKrw: 240000,
    retailPriceKrw: 310000,
    unitName: '조(2본)',
    moq: 1,
    stockQty: 22,
    warehouseLocation: '평택 1창고 C-05',
    deliveryPolicy: '16시 이전 당일화물 발송',
    diagramType: 'FORK_SLEEVE',
    referenceSource: '지게차 출고 시 동시 구매율 1위 필수 옵션 품목',
    technicalNote: '장척 파레트 하역용 필수 장비이며 앞코 테이퍼 경사 가공 처리됨'
  },
  {
    id: 'cp-08',
    sku: 'FL-ATTACH-SS25C',
    oemCrossRefCodes: ['CAS-55F-SSS-A025', 'HL-SS25-980', 'HC-SS25-C2'],
    partName: '캐스케이드 호환 사이드시프터 어셈블리 Class II (2.5톤용)',
    category: '포크·덧발·어태치먼트',
    manufacturer: '캐스케이드·한지 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '프레임폭 980mm × 좌우 시프트 200mm · ±100mm / 복동 실린더·슬라이드 패드 일체형',
    detailedSpecs: [
      { label: '프레임 전폭', value: '980 mm · ISO Class II 캐리지 장착' },
      { label: '좌우 이동 거리', value: '총 200 mm · 좌 100 mm / 우 100 mm' },
      { label: '적용 유압 압력', value: '정격 160 bar / 최대 200 bar' },
      { label: '포함 구성품', value: '어셈블리 본체 + 복동 유압실린더 + 황동 윤활 슬라이드 패드' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 2.5톤 Class II 캐리지 공용',
    foreignCurrency: 'USD',
    foreignUnitCost: 340,
    landedCostKrw: 510000,
    dealerPriceKrw: 680000,
    retailPriceKrw: 850000,
    unitName: '세트',
    moq: 1,
    stockQty: 8,
    warehouseLocation: '평택 1창고 C-08',
    deliveryPolicy: '당일 화물 발송',
    diagramType: 'SIDE_SHIFTER',
    referenceSource: '신차 출고 및 중고 지게차 옵션 장착 시 최고 인기 어태치먼트',
    technicalNote: '기존 포크 캐리지에 볼트 무가공 후크온 방식으로 30분 내 장착 가능'
  },

  // 3. 마스트·롤러·체인 (4종)
  {
    id: 'cp-09',
    sku: 'FL-BRG-MG30811',
    oemCrossRefCodes: ['MG30811', '780308K', 'TY-63381-23420-71', 'HD-S0182742'],
    partName: '마스트 메인 가이드 롤러 베어링 40×115.8×32mm',
    category: '마스트·롤러·체인',
    manufacturer: '완다·CWL 마스트베어링',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '내경 40mm × 외경 115.8mm × 폭 32mm / 2.5톤 마스트 상하 가이드 전용',
    detailedSpecs: [
      { label: '내경 치수', value: '40.0 mm' },
      { label: '외경 치수', value: '115.8 mm (크라운 곡면 외륜)' },
      { label: '폭 치수', value: '32.0 mm' },
      { label: '재질 및 씰링', value: 'GCr15 베어링강 침탄 열처리 + 양면 방진 철제 실드' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', '25B-9U', '8FB25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '현대사이트솔루션', '도요타'],
    tonnageRange: '2.0톤 ~ 2.5톤 마스트 채널 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 85,
    landedCostKrw: 17000,
    dealerPriceKrw: 28000,
    retailPriceKrw: 42000,
    unitName: '개',
    moq: 4,
    stockQty: 80,
    warehouseLocation: '평택 2창고 D-01',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'MAST_BEARING',
    referenceSource: '글로벌 마스트 베어링 표준 규격 780308K / MG30811',
    technicalNote: '마스트 1대당 통상 8~12개 소요되며 유격 조절 심 와셔와 함께 장착'
  },
  {
    id: 'cp-10',
    sku: 'FL-BRG-MG30912',
    oemCrossRefCodes: ['MG30912', 'DS-A213508', 'BYD-MR45128', 'CL-2804512'],
    partName: '3.0톤 고하중 마스트 가이드 롤러 베어링 45×128×36mm',
    category: '마스트·롤러·체인',
    manufacturer: '완다·CWL 마스트베어링',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '내경 45mm × 외경 128.0mm × 폭 36mm / 3.0톤 및 3단 마스트 고하중용',
    detailedSpecs: [
      { label: '내경 치수', value: '45.0 mm' },
      { label: '외경 치수', value: '128.0 mm' },
      { label: '폭 치수', value: '36.0 mm' },
      { label: '동정격하중', value: '96.5 kN (고하중 충격 대응 후육 외륜)' }
    ],
    compatibleModels: ['ECB30C', 'D30S-7', 'GTS25'],
    compatibleBrands: ['비와이디', '두산밥캣', '클라크'],
    tonnageRange: '2.5톤 중부하 ~ 3.5톤 마스트 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 105,
    landedCostKrw: 21000,
    dealerPriceKrw: 34000,
    retailPriceKrw: 50000,
    unitName: '개',
    moq: 4,
    stockQty: 64,
    warehouseLocation: '평택 2창고 D-02',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'MAST_BEARING',
    referenceSource: '두산 D30S-7 및 비와이디 3톤 마스트 오버홀 필수 베어링',
    technicalNote: '고점도 리튬 구리스가 내부 충진된 무급유 밀폐형 사양'
  },
  {
    id: 'cp-11',
    sku: 'FL-CHAIN-LH1223',
    oemCrossRefCodes: ['ISO4347-LH1223', 'DH-LH1223-215L', 'TY-13501-23320-71'],
    partName: '마스트 리프트 판형 체인 LH1223 · 피치 19.05mm, 3M 마스트 1대분',
    category: '마스트·롤러·체인',
    manufacturer: '동화·항주체인 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '규격 LH1223 · BL623 / 피치 19.05mm / 배열 2×3 / 인장강도 98.1kN',
    detailedSpecs: [
      { label: '체인 규격 코드', value: 'LH1223 · ANSI BL623 호환' },
      { label: '피치 × 플레이트 배열', value: '19.05 mm (3/4 인치) × 2×3 열' },
      { label: '핀 직경 × 플레이트 두께', value: '7.94 mm × 3.25 mm' },
      { label: '최소 인장강도', value: '98.1 kN · 3,000mm 표준 마스트 좌우 2줄 1세트' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 2.5톤 표준 마스트 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 440,
    landedCostKrw: 88000,
    dealerPriceKrw: 135000,
    retailPriceKrw: 185000,
    unitName: '세트(좌우)',
    moq: 1,
    stockQty: 20,
    warehouseLocation: '평택 2창고 D-05',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'LIFT_CHAIN',
    referenceSource: '산업안전보건 정기검사 체인 신율(3% 초과) 불합격 시 교체품',
    technicalNote: '양단 연결용 마스터 링크 핀 및 코터핀 기본 포함'
  },
  {
    id: 'cp-12',
    sku: 'FL-CHAIN-LH1623',
    oemCrossRefCodes: ['ISO4347-LH1623', 'DS-CH1623-3M', 'BYD-LH1623-SET'],
    partName: '3.0톤 고하중 리프트 판형 체인 LH1623 · 피치 25.4mm, 3M 1대분',
    category: '마스트·롤러·체인',
    manufacturer: '동화·항주체인 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '규격 LH1623 · BL823 / 피치 25.40mm / 배열 2×3 / 인장강도 151.0kN',
    detailedSpecs: [
      { label: '체인 규격 코드', value: 'LH1623 · ANSI BL823 호환' },
      { label: '피치 × 플레이트 배열', value: '25.40 mm (1 인치) × 2×3 열' },
      { label: '핀 직경 × 플레이트 두께', value: '9.53 mm × 4.00 mm' },
      { label: '최소 인장강도', value: '151.0 kN (고하중 쇼트피닝 피로강화 처리)' }
    ],
    compatibleModels: ['ECB30C', 'D30S-7'],
    compatibleBrands: ['비와이디', '두산밥캣'],
    tonnageRange: '3.0톤 ~ 3.5톤 마스트 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 580,
    landedCostKrw: 116000,
    dealerPriceKrw: 178000,
    retailPriceKrw: 240000,
    unitName: '세트(좌우)',
    moq: 1,
    stockQty: 15,
    warehouseLocation: '평택 2창고 D-06',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'LIFT_CHAIN',
    referenceSource: '3톤급 중량물 지게차 메인 마스트 인상 체인',
    technicalNote: '출고 전 프리스트레칭(초기 늘어남 제거) 공정 완료 제품'
  },

  // 4. 전장·컨트롤러·센서 (4종)
  {
    id: 'cp-13',
    sku: 'FL-CTRL-CURTIS-80V',
    oemCrossRefCodes: ['CURTIS-1238E-6521', 'HL-G2-CTRL80V', 'HC-XC-1238E'],
    partName: '커티스 호환 AC 주행·인양 컨트롤러 1238E-6521 · 80V 550A',
    category: '전장·컨트롤러·센서',
    manufacturer: '커티스 OEM·호환',
    originCountry: '중국 직수입',
    partGrade: '순정 OEM',
    specSummary: '정격 80V / 전류 550A / CANopen 프로토콜 / IP65 방수 알루미늄 방열판',
    detailedSpecs: [
      { label: '정격 전압 범주', value: '80V DC · 작동 범위 52V ~ 96V' },
      { label: '2분 정격 전류', value: '550 A RMS · 연속 275 A' },
      { label: '통신 인터페이스', value: 'CANopen · 리튬배터리 BMS 및 계기판 직결' },
      { label: '방수·방진 등급', value: 'IP65 완전 밀폐형 · 외부 크기 212×280×96mm' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹'],
    tonnageRange: '80V 리튬전동 2.5톤 ~ 3.5톤 공용',
    foreignCurrency: 'USD',
    foreignUnitCost: 390,
    landedCostKrw: 575000,
    dealerPriceKrw: 790000,
    retailPriceKrw: 980000,
    unitName: '대',
    moq: 1,
    stockQty: 6,
    warehouseLocation: '평택 2창고 E-01 (항온보관실)',
    deliveryPolicy: '기종별 파라미터 세팅 후 당일발송',
    diagramType: 'AC_CONTROLLER',
    referenceSource: '헬리 G2 및 항차 XC 리튬 지게차 표준 탑재 메인 컨트롤러',
    technicalNote: '발주 시 대상 장비 모델명을 지정하면 주행·인양 펌웨어 파라미터 무료 세팅 출고'
  },
  {
    id: 'cp-14',
    sku: 'FL-CTRL-CURTIS-24V',
    oemCrossRefCodes: ['CURTIS-1212C-2501', 'EP-1113-510002-00', 'HL-CBD20-1212P'],
    partName: '전동 파레트트럭 영구자석 구동 컨트롤러 1212C-2501 · 24V 90A',
    category: '전장·컨트롤러·센서',
    manufacturer: '커티스 OEM·호환',
    originCountry: '중국 직수입',
    partGrade: '순정 OEM',
    specSummary: '정격 24V / 피크전류 90A / 전자브레이크 제어 내장 / 틸러헤드 직결',
    detailedSpecs: [
      { label: '정격 전압 × 전류', value: '24V DC × 피크 90A (20초 정격)' },
      { label: '제어 모터 방식', value: '영구자석 DC 모터 정밀 속도·토크 제어' },
      { label: '외형 치수', value: '131 mm × 72 mm × 39 mm (초소형 방열 하우징)' },
      { label: '보호 기능', value: '배터리 저전압 컷오프 · 경사로 밀림 방지 · 긴급 배꼽스위치 연동' }
    ],
    compatibleModels: ['EPL205Z'],
    compatibleBrands: ['이피이큅먼트', '안후이 헬리', '항차그룹'],
    tonnageRange: '1.5톤 ~ 2.0톤 전동 파레트트럭 공용',
    foreignCurrency: 'USD',
    foreignUnitCost: 105,
    landedCostKrw: 155000,
    dealerPriceKrw: 220000,
    retailPriceKrw: 295000,
    unitName: '개',
    moq: 1,
    stockQty: 12,
    warehouseLocation: '평택 2창고 E-02',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'AC_CONTROLLER',
    referenceSource: '이피 EPL1531 / EPL205Z 시리즈 주행 불량 시 1순위 교체 부품',
    technicalNote: '몰렉스 18핀 및 6핀 표준 하네스 커넥터와 1:1 플러그앤플레이 호환'
  },
  {
    id: 'cp-15',
    sku: 'FL-ELEC-SW200-80V',
    oemCrossRefCodes: ['ALB-SW200-80L', 'ALB-SW200-48L', 'HD-21G7-40210', 'TY-58210-23320-71'],
    partName: '알브라이트 호환 메인 전자접촉기(컨택터) SW200 400A',
    category: '전장·컨트롤러·센서',
    manufacturer: '알브라이트 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '연속전류 400A / 코일 48V·80V 겸용 / 은합금 더블 브레이크 주접점',
    detailedSpecs: [
      { label: '열전류 용량', value: '연속 400A · 단시간 최대 1,500A 개폐' },
      { label: '코일 작동전압', value: '48V DC 및 80V DC 선택 출고' },
      { label: '접점 재질', value: 'AgCdO 은-산화카드뮴 내아크 합금 팁' },
      { label: '단자 볼트 규격', value: 'M10 황동 스터드 단자 · 높이 138mm' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', '25B-9U', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '현대사이트솔루션', '도요타'],
    tonnageRange: '전동 지게차 1.5톤 ~ 3.5톤 메인 전원 차단용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 215,
    landedCostKrw: 43000,
    dealerPriceKrw: 68000,
    retailPriceKrw: 95000,
    unitName: '개',
    moq: 1,
    stockQty: 35,
    warehouseLocation: '평택 2창고 E-05',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'CONTACTOR_RELAY',
    referenceSource: '전동 지게차 시동 불능 및 접점 융착 시 필수 교체 소모품',
    technicalNote: '마그네틱 블로우아웃 자석 내장으로 고전압 아크 발생을 신속 소호'
  },
  {
    id: 'cp-16',
    sku: 'FL-ELEC-ALT-24V',
    oemCrossRefCodes: ['DS-A404155', 'CL-920145', 'FORKL-8622-ALT', 'YM-129900-77200'],
    partName: '디젤 지게차 고출력 알터네이터(제네레이터) 24V / 90A',
    category: '전장·컨트롤러·센서',
    manufacturer: '두산·얀마·커민스 호환',
    originCountry: '국내 매입',
    partGrade: '신품 호환',
    specSummary: '정격 24V 90A / IC 레귤레이터 내장 / V벨트 싱글 풀리 외경 76mm',
    detailedSpecs: [
      { label: '출력 전압 × 전류', value: '24V DC × 90A · 12V 사양 별도 선택 가능' },
      { label: '풀리 규격', value: '외경 76 mm × V벨트 1열 · 폭 13 mm' },
      { label: '마운팅 브래킷', value: '상·하 힌지 간격 80 mm · 볼트홀 M10' },
      { label: '레귤레이터', value: '내장형 과충전 방지 IC 전압조정기 탑재' }
    ],
    compatibleModels: ['D30S-7', 'GTS25'],
    compatibleBrands: ['두산밥캣', '클라크'],
    tonnageRange: '2.5톤 ~ 4.5톤 디젤 지게차 공용',
    foreignCurrency: 'KRW',
    foreignUnitCost: 132000,
    landedCostKrw: 132000,
    dealerPriceKrw: 185000,
    retailPriceKrw: 250000,
    unitName: '대',
    moq: 1,
    stockQty: 14,
    warehouseLocation: '평택 2창고 E-08',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'ALTERNATOR',
    referenceSource: '포크엘 실거래 데이터 및 디젤 지게차 겨울철 충전 불량 다빈도 부품',
    technicalNote: '야간 LED 작업등 및 캐빈 히터 추가 장착 차량의 발전 용량 보강에 최적'
  },

  // 5. 배터리·충전·커넥터 (3종)
  {
    id: 'cp-17',
    sku: 'FL-BAT-REMA320',
    oemCrossRefCodes: ['REMA-95520-01', 'SB350-80V-BLK', 'HL-CON-320A'],
    partName: '고전류 배터리 충전 전원 커넥터 REMA·앤더슨 호환 320A (암·수 1쌍)',
    category: '배터리·충전·커넥터',
    manufacturer: '레마·앤더슨 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '정격 320A~350A / 내전압 150V DC / 70mm² 은도금 동단자 + 탈착 손잡이 포함',
    detailedSpecs: [
      { label: '정격 전류 × 전압', value: '연속 320A · 최대 350A × DC 150V' },
      { label: '적용 케이블 굵기', value: '50 mm² ~ 70 mm² (순동 은도금 압착 단자 4개 포함)' },
      { label: '하우징 재질', value: 'UL94 V-0 난연 폴리카보네이트 내산성 소재' },
      { label: '부속 구성', value: '암·수 플러그 하우징 1쌍 + 보조 파일럿 핀 + 안전 탈착 핸들' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', '25B-9U', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '현대사이트솔루션', '도요타'],
    tonnageRange: '전동 지게차 전 기종 충전기·배터리 연결용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 115,
    landedCostKrw: 23000,
    dealerPriceKrw: 38000,
    retailPriceKrw: 55000,
    unitName: '쌍(암·수)',
    moq: 2,
    stockQty: 50,
    warehouseLocation: '평택 2창고 F-01',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'POWER_CONNECTOR',
    referenceSource: '급속 충전 시 커넥터 발열·파손 교체용 필수 상비 부품',
    technicalNote: '보조 통신 핀 2극이 포함되어 리튬배터리 충전기 인터록 신호 연동 지원'
  },
  {
    id: 'cp-18',
    sku: 'FL-BAT-EPL-24V160',
    oemCrossRefCodes: ['EP-LFP-24160', 'HC-LFP24-150', 'CATL-24V160-PLUG'],
    partName: '전동 파레트트럭 탈착식 리튬인산철 배터리팩 24V / 160Ah',
    category: '배터리·충전·커넥터',
    manufacturer: '이피·CATL 셀 모듈',
    originCountry: '중국 직수입',
    partGrade: '순정 OEM',
    specSummary: '정격 25.6V 160Ah · 4.09kWh / 스마트 BMS 내장 / 플러그인 케이스 일체형',
    detailedSpecs: [
      { label: '공칭 전압 × 용량', value: '25.6V × 160Ah · 총 에너지 4.09 kWh' },
      { label: '배터리 셀 구성', value: 'CATL A급 리튬인산철 각형 셀 8S1P' },
      { label: '케이스 외형 치수', value: '380 mm × 195 mm × 520 mm · 중량 38 kg' },
      { label: '충전 및 수명', value: '24V 60A 충전 시 2.5시간 완충 · 4,000회 충방전 보증' }
    ],
    compatibleModels: ['EPL205Z'],
    compatibleBrands: ['이피이큅먼트', '항차그룹'],
    tonnageRange: '2.0톤 보행·탑승식 전동 파레트트럭 전용',
    foreignCurrency: 'USD',
    foreignUnitCost: 590,
    landedCostKrw: 870000,
    dealerPriceKrw: 1180000,
    retailPriceKrw: 1480000,
    unitName: '팩',
    moq: 1,
    stockQty: 5,
    warehouseLocation: '평택 2창고 F-04 (배터리 전용실)',
    deliveryPolicy: '당일 화물 발송',
    diagramType: 'LFP_BATTERY_PACK',
    referenceSource: '2교대 물류센터 예비 교체용 세컨드 배터리팩 수요 집중 품목',
    technicalNote: '상부 잔량 표시 LCD 미터 및 과방전·과온도 자동 차단 BMS 내장'
  },
  {
    id: 'cp-19',
    sku: 'FL-BAT-TRAC-48V725',
    oemCrossRefCodes: ['VCE660-48V', 'HD-25B9U-BAT48', 'FORKL-9047', 'TY-8FB25-48V565'],
    partName: '48V 725Ah 전동지게차 산업용 트랙션 배터리 어셈블리 · A급 리빌트',
    category: '배터리·충전·커넥터',
    manufacturer: '아트라스·세방 리빌트 호환',
    originCountry: '국내 매입',
    partGrade: 'A급 재생 호환',
    specSummary: '48V · 2V×24셀 725Ah / 자동보수액 캡 장착 / 방전테스트 성적서 첨부',
    detailedSpecs: [
      { label: '정격 전압 × 용량', value: '48V (24셀 직렬) × 725Ah (5시간율 기준)' },
      { label: '철제 함체 치수', value: '1,028 mm × 695 mm × 627 mm · 현대 25B-9U / 도요타 8FB25 규격' },
      { label: '셀 컨디션', value: '극판 황산염 제거 복원 및 불량 셀 신품 교체 완료 (용량 효율 88% 이상)' },
      { label: '포함 부속품', value: '24셀 자동증류수 보충 플로트 캡 + 320A 전원 플러그' }
    ],
    compatibleModels: ['25B-9U', '8FB25'],
    compatibleBrands: ['현대사이트솔루션', '도요타'],
    tonnageRange: '48V 2.5톤 4륜 전동지게차 공용',
    foreignCurrency: 'KRW',
    foreignUnitCost: 1520000,
    landedCostKrw: 1520000,
    dealerPriceKrw: 1950000,
    retailPriceKrw: 2400000,
    unitName: '세트',
    moq: 1,
    stockQty: 4,
    warehouseLocation: '평택 1창고 F-08',
    deliveryPolicy: '폐배터리 대품 회수 조건 화물 발송',
    diagramType: 'LFP_BATTERY_PACK',
    referenceSource: '포크엘 실거래 매물 · 현대 25B-9U용 VCE660 2,000,000원 벤치마킹 반영',
    technicalNote: '신품 납산배터리 대비 50% 이상 비용 절감되며 1년 무상 셀 보증 제공'
  },

  // 6. 유압·제동·조향 (3종)
  {
    id: 'cp-20',
    sku: 'FL-HYD-SEALKIT-2530',
    oemCrossRefCodes: ['NOK-SK-FL2530', 'TY-04652-20040-71', 'HL-G2-LIFT-SK', 'DS-K9001425'],
    partName: '마스트 리프트·틸트 유압실린더 우레탄 씰 오버홀 키트 (1대분)',
    category: '유압·제동·조향',
    manufacturer: 'NOK·프로이덴버그 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '로드경 50/55mm × 실린더 내경 63/70mm / 고내열 폴리우레탄 로드씰·더스트씰 풀세트',
    detailedSpecs: [
      { label: '구성 범위', value: '메인 리프트 실린더 2본 + 좌우 틸트 실린더 2본 통합 씰 키트' },
      { label: '적용 로드 직경', value: '리프트 50~55 mm / 틸트 35~40 mm' },
      { label: '소재 및 내온성', value: '독일·일본 규격 TPU 폴리우레탄 + NBR 오링 (-35℃ ~ +110℃)' },
      { label: '세부 구성품', value: '로드 유패킹 + 더스트 와이퍼 + 피스톤 웨어링 + 백업링 총 28종' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.5톤 ~ 3.0톤 마스트·틸트 실린더 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 135,
    landedCostKrw: 27000,
    dealerPriceKrw: 45000,
    retailPriceKrw: 68000,
    unitName: '키트',
    moq: 1,
    stockQty: 45,
    warehouseLocation: '평택 2창고 G-01',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'SEAL_KIT',
    referenceSource: '마스트 자연 하강 및 실린더 미세 누유 정비 시 최다 소모 키트',
    technicalNote: '기종 코드별로 규격 분류 포장이 완료되어 현장 정비소에서 즉시 조립 가능'
  },
  {
    id: 'cp-21',
    sku: 'FL-BRK-OCDB-KIT',
    oemCrossRefCodes: ['DS-OCDB-30S7', 'CL-2814012', 'HD-XKAY-00512'],
    partName: '습식 디스크 브레이크 마찰 디스크·스틸 플레이트 세트 (전륜 1축분)',
    category: '유압·제동·조향',
    manufacturer: '미바·한지 브레이크 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '외경 224mm × 내치 34T / 소결청동 마찰 디스크 6매 + 경화 스틸 플레이트 6매',
    detailedSpecs: [
      { label: '마찰판 외경 × 두께', value: '224.0 mm × 4.2 mm (오일 그루브 나선형 채널 가공)' },
      { label: '스플라인 기어 치수', value: '내치 34 치 (마찰판) / 외치 6 러그 (스틸 상대판)' },
      { label: '마찰재 재질', value: '고밀도 소결 청동 합금 (습식 액슬 오일 내 내열·내마모성 특화)' },
      { label: '세트 구성', value: '마찰 디스크 6매 + 스틸 플레이트 6매 (좌·우 바퀴 총 12매 풀세트)' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.5톤 ~ 3.5톤 습식 디스크 브레이크 장착 액슬 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 480,
    landedCostKrw: 96000,
    dealerPriceKrw: 145000,
    retailPriceKrw: 198000,
    unitName: '세트(12매)',
    moq: 1,
    stockQty: 18,
    warehouseLocation: '평택 2창고 G-04',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'WET_DISC_BRAKE',
    referenceSource: '두산 OCDB 및 최신 리튬·디젤 지게차 밀폐형 습식 브레이크 오버홀 부품',
    technicalNote: '교체 시 습식 브레이크 전용 첨가제가 포함된 액슬 오일 동시 교환 권장'
  },
  {
    id: 'cp-22',
    sku: 'FL-STR-KINGPIN-25',
    oemCrossRefCodes: ['HL-KP-25G2', 'TY-04432-20030-71', 'HD-S0411520', 'CL-918542'],
    partName: '후륜 조향 액슬 킹핀·니들베어링 리페어 키트 (좌·우 1대분)',
    category: '유압·제동·조향',
    manufacturer: '한지·CWL 액슬 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '킹핀 직경 28mm × 길이 182mm / 니들베어링 4개 + 트러스트베어링 2개 + 구리스니플',
    detailedSpecs: [
      { label: '킹핀 치수', value: '외경 28.0 mm × 길이 182.0 mm (고주파 표면경화 처리)' },
      { label: '포함 베어링', value: '니들롤러 베어링 4개 + 하중 지지용 트러스트 볼베어링 2개' },
      { label: '부속 하드웨어', value: '잠금 테이퍼 핀 2개 + 유격 조절 심 + 더스트 캡 + 구리스 니플' },
      { label: '적용 부위', value: '후륜 조향 너클 좌·우 양쪽 동시 오버홀용' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '항차그룹', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 2.5톤 후륜 조향축 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 195,
    landedCostKrw: 39000,
    dealerPriceKrw: 62000,
    retailPriceKrw: 88000,
    unitName: '키트(좌우)',
    moq: 1,
    stockQty: 30,
    warehouseLocation: '평택 2창고 G-07',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'KINGPIN_KIT',
    referenceSource: '후륜 타이어 편마모 및 조향 핸들 유격 발생 시 1순위 수리 키트',
    technicalNote: '정밀 연마된 SCM440 합금강 킹핀으로 험지 주행 충격에 강함'
  },

  // 7. 필터·시트·안전용품 (2종)
  {
    id: 'cp-23',
    sku: 'FL-FIL-SET-D30',
    oemCrossRefCodes: ['DS-FILKIT-D24A', 'CL-FILKIT-GTS', 'DONALDSON-FL30-4P'],
    partName: '디젤 지게차 500시간 정기점검 4종 필터 통합 패키지',
    category: '필터·시트·안전용품',
    manufacturer: '도날드슨·만필터 호환',
    originCountry: '국내 매입',
    partGrade: '신품 호환',
    specSummary: '엔진오일필터 + 수분분리 연료필터 + 이중 에어클리너 + 유압 리턴필터 4종 일괄 세트',
    detailedSpecs: [
      { label: '엔진오일 필터', value: '나사규격 M20×1.5 · 외경 93mm × 높이 135mm (역류방지 밸브 내장)' },
      { label: '수분분리 연료필터', value: '고압 커먼레일 인젝터 보호용 5마이크론 초정밀 여과지 + 하부 드레인콕' },
      { label: '이중 에어클리너', value: '외부 메인 엘리먼트 + 내부 안전 카트리지 2중 방진 구조' },
      { label: '유압 리턴필터', value: '유압탱크 복귀 라인 10마이크론 금속 메쉬 보강 필터' }
    ],
    compatibleModels: ['D30S-7', 'GTS25'],
    compatibleBrands: ['두산밥캣', '클라크'],
    tonnageRange: '2.5톤 ~ 3.5톤 커먼레일 디젤 지게차 공용',
    foreignCurrency: 'KRW',
    foreignUnitCost: 36000,
    landedCostKrw: 36000,
    dealerPriceKrw: 54000,
    retailPriceKrw: 78000,
    unitName: '세트(4종)',
    moq: 1,
    stockQty: 55,
    warehouseLocation: '평택 2창고 H-01',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'FILTER_PACKAGE',
    referenceSource: '출장 정비기사 및 대리점 정기 소모품 박스 단위 발주 1위 품목',
    technicalNote: '개별 단품 구매 대비 22% 할인된 통합 박스 패키지로 공급'
  },
  {
    id: 'cp-24',
    sku: 'FL-SAFE-SEAT-OPS',
    oemCrossRefCodes: ['GRAMMER-MSG20-OPS', 'HL-SEAT-OPS01', 'TY-53710-23320-71'],
    partName: '전차종 호환 서스펜션 방수 시트 · OPS 착석센서 + 되감기 안전벨트',
    category: '필터·시트·안전용품',
    manufacturer: '그래머 스타일 호환',
    originCountry: '중국 직수입',
    partGrade: '신품 호환',
    specSummary: '가변 슬라이드 레일 · 230~330mm / 체중조절 서스펜션 / OPS 착석감지 스위치 내장',
    detailedSpecs: [
      { label: '하부 장착 레일 폭', value: '좌우 230 mm ~ 330 mm 멀티 슬롯 가변 브래킷 (전 브랜드 무가공 장착)' },
      { label: '서스펜션 스트로크', value: '상하 60 mm 충격 흡수 + 운전자 체중 조절 다이얼 · 50 ~ 130 kg' },
      { label: '안전 인터록 센서', value: 'OPS 운전자 착석 감지 마이크로 스위치(2핀 커넥터) 기본 내장' },
      { label: '벨트 및 외피', value: '비상 잠금식 자동 되감기 2점식 안전벨트 + 고내구성 방수 PVC 레자' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '1.5톤 ~ 5.0톤 좌승식 지게차 전 기종 공용',
    foreignCurrency: 'CNY',
    foreignUnitCost: 410,
    landedCostKrw: 82000,
    dealerPriceKrw: 128000,
    retailPriceKrw: 175000,
    unitName: '대',
    moq: 1,
    stockQty: 26,
    warehouseLocation: '평택 1창고 H-05',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'SUSPENSION_SEAT',
    referenceSource: '산업안전보건 기준 시트 파손·안전벨트 불량·OPS 센서 고장 시 일괄 교체품',
    technicalNote: '후면 매뉴얼 보관 포켓 및 각도 조절 등받이 기본 포함'
  }
];

export const PART_CATEGORIES: PartCategoryType[] = [
  '타이어·휠·캐스터',
  '포크·덧발·어태치먼트',
  '마스트·롤러·체인',
  '전장·컨트롤러·센서',
  '배터리·충전·커넥터',
  '유압·제동·조향',
  '필터·시트·안전용품'
];

export const TARGET_FORKLIFT_MODELS: { modelName: string; brand: string; label: string }[] = [
  { modelName: 'CPD25-GB2Li', brand: '안후이 헬리', label: '안후이 헬리 · CPD25-GB2Li (리튬 2.5톤)' },
  { modelName: 'ECB30C', brand: '비와이디', label: '비와이디 · ECB30C (리튬 3.0톤)' },
  { modelName: 'CPD25-XEY2-SI', brand: '항차그룹', label: '항차그룹 · CPD25-XEY2-SI (리튬 2.5톤)' },
  { modelName: 'EPL205Z', brand: '이피이큅먼트', label: '이피이큅먼트 · EPL205Z (파레트트럭 2.0톤)' },
  { modelName: 'D30S-7', brand: '두산밥캣', label: '두산밥캣 · D30S-7 (디젤 3.0톤)' },
  { modelName: '25B-9U', brand: '현대사이트솔루션', label: '현대사이트솔루션 · 25B-9U (전동 2.5톤)' },
  { modelName: 'GTS25', brand: '클라크', label: '클라크 · GTS25 (디젤 2.5톤)' },
  { modelName: '8FB25', brand: '도요타', label: '도요타 · 8FB25 (전동 2.5톤)' }
];

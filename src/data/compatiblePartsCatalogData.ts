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
  tvhRefNo?: string;
  tvhBrand?: string;
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
  foreignCurrency: 'CNY' | 'USD' | 'EUR' | 'KRW';
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
  imageUrl?: string;
  sourceUrl?: string;
  collectedAt?: string;
  isActive?: boolean;
  referenceSource: string;
  technicalNote: string;
  createdAt?: string;
  updatedAt?: string;
  tenant_id?: string;
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
  },
  {
    id: 'bench-intella',
    companyName: '인텔라 파츠 · 인텔라 리프트파츠',
    domainUrl: 'https://www.intellaparts.com',
    countryOrigin: '미국 · 캐나다',
    specialization: '600만 건 이상의 북미·글로벌 지게차 순정품번 교차검색 및 커티스·알브라이트·안전용품 온라인 직판 플랫폼',
    targetBrands: ['도요타', '클라크', '하이스터', '예일', '크라운', '레이몬드', '코마츠', '두산밥캣', '현대사이트솔루션'],
    htmlCssDomArchitecture: {
      listContainerDom: 'div.category-products > ol.products-list > li.item',
      itemCardDom: 'div.product-shop > h2.product-name + div.sku-box + div.price-box + button.btn-cart',
      detailSpecDom: 'table.data-table#product-attribute-specs-table > tbody > tr > th.label + td.data',
      cssLayoutCharacteristics: '비로그인 상태에서도 단가와 재고 여부를 투명하게 공개하는 오픈 프라이싱 B2B/B2C 하이브리드 카탈로그',
      crawledSampleHtmlSnippet: `<li class="item">
  <h2 class="product-name">Albright SW200-279 Main Contactor 48V/80V</h2>
  <div class="sku-box">OEM Cross Ref: Curtis / Hyster / Yale / Heli</div>
  <div class="price-box">$168.50 | In Stock - Ships Today</div>
</li>`
    },
    pricingModel: '비로그인 공개 정찰 단가 + 대량 구매 시 볼륨 할인 자동 적용',
    strengths: [
      '티브이에이치와 달리 폐쇄형 딜러 포털이 아닌 공개 단가 카탈로그로 신규 정비소·고객 유입 극대화',
      '브랜드별·계통별 직관적인 부품 분류와 명확한 실측 사진·치수 스펙 테이블 제공'
    ],
    structuralLimitations: [
      '북미 달러 기준 단품 장바구니 방식이어서 복수 품목 일괄 주문서 인쇄 및 거래처별 차등 단가표 발행이 불편함'
    ],
    ourConversionTakeaway: '인텔라 파츠의 투명한 단가·스펙 공개 구조와 당사 맞춤 카탈로그 빌더의 거래처 등급별 단가율 자동 조정 기능을 결합'
  },
  {
    id: 'bench-helmar',
    companyName: '헬마 파츠 · 헬마 인더스트리얼',
    domainUrl: 'https://www.helmarparts.com',
    countryOrigin: '미국',
    specialization: '1982년 설립 북미 지게차 애프터마켓 마스트 롤러·체인·포크·브레이크·유압 씰키트 도매 카탈로그 기업',
    targetBrands: ['클라크', '도요타', '두산밥캣', '현대사이트솔루션', '하이스터', '미쓰비시', '닛산'],
    htmlCssDomArchitecture: {
      listContainerDom: 'div.collection-matrix > div.product-grid-item',
      itemCardDom: 'a.product-card > img.part-photo + span.part-no + span.dimension-summary + span.dealer-price',
      detailSpecDom: 'div.rte-specs > ul.dimension-list > li',
      cssLayoutCharacteristics: '마스트 베어링 외경·내경·폭 및 리프트 체인 피치 규격을 상품명 전면에 배치한 엔지니어 친화적 카탈로그',
      crawledSampleHtmlSnippet: `<div class="product-grid-item">
  <span class="part-no">HM-MG30811</span>
  <span class="dimension-summary">Mast Roller Bearing 40 x 115.8 x 32 mm</span>
  <span class="fitment">Fits Clark / Doosan / Heli 2.5T-3.0T</span>
</div>`
    },
    pricingModel: '순정품 대비 40~65% 저렴한 도매 표준 단가 및 박스 단위 발주 체계',
    strengths: [
      '마스트 베어링, 체인, 킹핀 키트, 습식 디스크 등 기계적 마모 부품의 실측 치수 표준화가 가장 뛰어남'
    ],
    structuralLimitations: [
      '전동지게차 최신 리튬배터리·캔통신 컨트롤러 등 차세대 전장 부품 라인업이 상대적으로 제한적'
    ],
    ourConversionTakeaway: '헬마 파츠의 치수 전면 표기 방식과 티브이에이치의 전장·어태치먼트 라인업을 통합하여 기계·유압·전장 전 계통을 단일 카탈로그에 수록'
  },
  {
    id: 'bench-folangsi',
    companyName: '포랑시 글로벌 · 안후이 완츠 파츠',
    domainUrl: 'https://www.folangsi.com',
    countryOrigin: '중국 · 글로벌',
    specialization: '중국 최대 지게차 정비·부품 공급 상장사 및 글로벌 멀티 브랜드 호환부품 B2B 수출 플랫폼',
    targetBrands: ['안후이 헬리', '항차그룹', '비와이디', '이피이큅먼트', '도요타', '린다', '융하인리히'],
    htmlCssDomArchitecture: {
      listContainerDom: 'div.fls-catalog-container > div.brand-filter-bar + div.part-table-wrap',
      itemCardDom: 'tr.fls-row > td.part-img + td.part-code + td.truck-model + td.spec + td.inquiry-btn',
      detailSpecDom: 'div.fls-spec-panel > table.param-table',
      cssLayoutCharacteristics: '중국산 리튬지게차 및 유럽·일본계 지게차 호환부품을 차대·모델 시리즈별로 묶은 B2B 카탈로그',
      crawledSampleHtmlSnippet: `<tr class="fls-row">
  <td class="part-code">FLS-HC-XC25-SEAL</td>
  <td class="truck-model">Hangcha CPD25-XEY2 / Heli G2 Li-ion</td>
  <td class="spec">Full Hydraulic Cylinder Seal Overhaul Kit</td>
</tr>`
    },
    pricingModel: '컨테이너·팔레트 단위 대리점 공급가 및 정기 소모품 패키지 단가 운영',
    strengths: [
      '중국 현지 지게차 대량 임대·정비 실데이터에 기반하여 고장 빈도가 높은 필수 호환부품 키트 구성이 정교함'
    ],
    structuralLimitations: [
      '개별 품목 단가가 온라인에 즉시 산출되지 않고 별도 견적 문의 절차를 거쳐야 함'
    ],
    ourConversionTakeaway: '기종별 고빈도 교체 소모품을 패키지 프리셋으로 원클릭 담기 지원하고, 원화 단가와 이익률을 실시간 대차대조하여 즉시 수주 확정'
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
    tvhRefNo: 'TVH-TS-70012',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Tyres%20%282%29.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-60009',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Tyres%20%282%29.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-28915NM',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Tyres%20%282%29.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-PU23075',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/wheel_54.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CAM-FK2A1070',
    tvhBrand: 'CAM attachments',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/CAM_USP_480x480_Reliability_0.png',
    sourceUrl: 'https://www.tvh.com/our-brands/cam-attachments',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CAM-FK3A1200',
    tvhBrand: 'CAM attachments',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/CAM_USP_480x480_SmartChoice_0.png',
    sourceUrl: 'https://www.tvh.com/our-brands/cam-attachments',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CAM-FE1800',
    tvhBrand: 'CAM attachments',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/CAM_USP_480x480_versatile_0.png',
    sourceUrl: 'https://www.tvh.com/our-brands/cam-attachments',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CAM-SS25C2',
    tvhBrand: 'CAM attachments',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/CAM_USP_480x480_versatile_0.png',
    sourceUrl: 'https://www.tvh.com/our-brands/cam-attachments',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-MG30811',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Transmission%20parts.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-MG30912',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Transmission%20parts.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-DH-BL623',
    tvhBrand: 'Donghua',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-06/CatalogueOverview_BANN_600x300px_17.jpg',
    sourceUrl: 'https://www.tvh.com/brands/donghua-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-DH-BL823',
    tvhBrand: 'Donghua',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-06/CatalogueOverview_BANN_600x300px_17.jpg',
    sourceUrl: 'https://www.tvh.com/brands/donghua-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CUR-1238E6521',
    tvhBrand: 'Curtis',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Electrical%20parts_0.jpg',
    sourceUrl: 'https://www.tvh.com/brands/curtis-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CUR-1212C2501',
    tvhBrand: 'Curtis',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Electrical%20parts_0.jpg',
    sourceUrl: 'https://www.tvh.com/brands/curtis-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-ALB-SW200',
    tvhBrand: 'Albright',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-08/CatalogueOverview_BANN_600x300px_4.jpg',
    sourceUrl: 'https://www.tvh.com/brands/albright-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-34136944-ALT',
    tvhBrand: 'Mahle',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-05/Mahle%20-%20alternator%20%2834136944%29_0.jpg',
    sourceUrl: 'https://www.tvh.com/brands/mahle-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-EP-REMA320',
    tvhBrand: 'Energic Plus',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/styles/max_480x480/public/2025-09/EnergicPlus_Products_340x340_batterycharger_0.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/energic-plus',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-EP-LFP24160',
    tvhBrand: 'Energic Plus',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/styles/max_480x480/public/2025-09/EnergicPlus_Products_340x340_batterycharger_0.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/energic-plus',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'FL-BAT-EPL-24V160',
    oemCrossRefCodes: ['EP-LFP-24160', 'HC-LFP24-150', 'CATL-24V160-PLUG'],
    partName: '전동 파레트트럭 탈착식 리튬인산철 배터리팩 24V / 160Ah',
    category: '배터리·충전·커넥터',
    manufacturer: '이피·CATL 셀 모듈',
    originCountry: '중국 직수입',
    partGrade: '순정 OEM',
    specSummary: '정격 25.6V 160Ah · 4.09kWh / BMS 내장 / 플러그인 케이스 일체형',
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
    tvhRefNo: 'TVH-TRJ-48V725',
    tvhBrand: 'Trojan',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2022-03/Trojan_AGM-2203-480x270px.jpg',
    sourceUrl: 'https://www.tvh.com/brands/trojan-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-HYDSK2530',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Hydraulics.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-TS-OCDB224',
    tvhBrand: 'TotalSource',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Transmission%20parts.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-CAR-KP28182',
    tvhBrand: 'Carraro',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-06/CatalogueOverview_BANN_600x300px_8.jpg',
    sourceUrl: 'https://www.tvh.com/brands/carraro-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-DON-FL304P',
    tvhBrand: 'Donaldson',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-06/CatalogueOverview_BANN_600x300px_16.jpg',
    sourceUrl: 'https://www.tvh.com/brands/donaldson-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
    tvhRefNo: 'TVH-GRM-MSG20OPS',
    tvhBrand: 'Grammer',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Cabin%20parts_0.jpg',
    sourceUrl: 'https://www.tvh.com/brands/grammer-parts',
    collectedAt: '2026-11-05',
    isActive: true,
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
  },

  // 8. 티브이에이치 글로벌 사이트 공식 수집 스포트라이트 품목 (10종 추가 · 총 34종)
  {
    id: 'cp-25',
    tvhRefNo: 'TVH-3321603',
    tvhBrand: 'COBO',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-08/COBO%20-%20Front%20light%20%283321603%29.jpg',
    sourceUrl: 'https://www.tvh.com/brands/cobo-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-COBO-3321603',
    oemCrossRefCodes: ['TVH-3321603', 'COBO-05.458.000', 'LINDE-0009740804', 'HC-XC-FL3321'],
    partName: '코보 지게차 전방 고광량 콤비네이션 전조등 어셈블리 · 방향지시등 일체형',
    category: '전장·컨트롤러·센서',
    manufacturer: '코보 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '전압 12V~48V 겸용 / 전조등 + 차폭등 + 방향지시등 3기능 일체형 / 방수 IP67',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 3321603 · 이탈리아 코보 정품' },
      { label: '작동 전압 범위', value: '12V / 24V / 48V 프리볼트 대응' },
      { label: '하우징 외형 치수', value: '가로 158 mm × 세로 96 mm × 깊이 82 mm' },
      { label: '방수 등급 및 브래킷', value: 'IP67 방진방수 렌즈 + 하부 M10 회전 각도조절 볼트' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '1.5톤 ~ 5.0톤 전동·디젤 지게차 오버헤드가드 전방 장착용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 34,
    landedCostKrw: 52000,
    dealerPriceKrw: 74000,
    retailPriceKrw: 98000,
    unitName: '개',
    moq: 2,
    stockQty: 32,
    warehouseLocation: '평택 2창고 E-09',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'CONTACTOR_RELAY',
    referenceSource: '티브이에이치 코보 브랜드 공식 스포트라이트 품목 3321603 수집',
    technicalNote: '유럽 안전인증 E-Mark 획득 제품으로 전방 헤드가드 좌·우 공용 브래킷 구조'
  },
  {
    id: 'cp-26',
    tvhRefNo: 'TVH-14644189',
    tvhBrand: 'COBO',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-08/COBO%20-%20Ignition%20Switch%20%2814644189%29.jpg',
    sourceUrl: 'https://www.tvh.com/brands/cobo-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-COBO-14644189',
    oemCrossRefCodes: ['TVH-14644189', 'COBO-14.155.000', 'HL-JK406C', 'DS-D30-KEYSW'],
    partName: '코보 방진·방수 이그니션 시동 키스위치 어셈블리 · 예열·시동 4단 접점',
    category: '전장·컨트롤러·센서',
    manufacturer: '코보 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '정격 12V/24V/48V 30A / 오프-온-예열-시동 4단 복귀형 / 마스터키 2개 포함',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 14644189 · 코보 시동 스위치' },
      { label: '패널 장착 홀 규격', value: '외경 22.5 mm 나사 고정식 · 두께 6mm 패널 대응' },
      { label: '단자 배열', value: '후면 6단자 황동 스크류 터미널 · 방수 더스트부츠 포함' },
      { label: '부속 키 구성', value: '방수 고무그립 정품 시동키 2개 기본 동봉' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '전 기종 지게차 계기판 시동키박스 교체용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 19,
    landedCostKrw: 29000,
    dealerPriceKrw: 42000,
    retailPriceKrw: 58000,
    unitName: '세트',
    moq: 1,
    stockQty: 48,
    warehouseLocation: '평택 2창고 E-10',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'CONTACTOR_RELAY',
    referenceSource: '티브이에이치 코보 브랜드 공식 스포트라이트 품목 14644189 수집',
    technicalNote: '키 삽입구에 스프링 셔터 캡이 적용되어 외부 분진 및 빗물 유입 차단'
  },
  {
    id: 'cp-27',
    tvhRefNo: 'TVH-17438386',
    tvhBrand: 'COBO',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-08/COBO%20-%20Seat%20%2817438386%29.jpg',
    sourceUrl: 'https://www.tvh.com/brands/cobo-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-COBO-17438386',
    oemCrossRefCodes: ['TVH-17438386', 'COBO-SC90-M91', 'GRAMMER-MSG65-521'],
    partName: '코보 로우프로파일 서스펜션 운전석 시트 · 팔걸이·벨트·착석센서 일체형',
    category: '필터·시트·안전용품',
    manufacturer: '코보 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 17438386 / 접이식 양측 암레스트 / 요추 지지대 / 착석센서·벨트 완비',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 17438386 · 이탈리아 코보 정품 시트' },
      { label: '서스펜션 및 조절', value: '기계식 가위형 서스펜션 80 mm + 전후 슬라이드 150 mm' },
      { label: '운전자 편의 사양', value: '각도 조절 양측 팔걸이 + 등받이 리클라이닝 + 요추 서포트' },
      { label: '안전 사양', value: '운전자 착석 감지 스위치 + 오렌지 고시인성 비상 잠금 벨트' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 5.0톤 전동·디젤 지게차 공용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 145,
    landedCostKrw: 225000,
    dealerPriceKrw: 310000,
    retailPriceKrw: 395000,
    unitName: '대',
    moq: 1,
    stockQty: 12,
    warehouseLocation: '평택 1창고 H-06',
    deliveryPolicy: '16시 이전 당일화물 발송',
    diagramType: 'SUSPENSION_SEAT',
    referenceSource: '티브이에이치 코보 브랜드 공식 스포트라이트 품목 17438386 수집',
    technicalNote: '장시간 물류 상하차 작업 시 운전자 허리 피로도를 줄이는 인체공학 쿠션 폼 적용'
  },
  {
    id: 'cp-28',
    tvhRefNo: 'TVH-37691295',
    tvhBrand: 'Mahle',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-05/Mahle%20-%20starter%20%2837691295%29_0.jpg',
    sourceUrl: 'https://www.tvh.com/brands/mahle-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-MAHLE-37691295',
    oemCrossRefCodes: ['TVH-37691295', 'MAHLE-MS430', 'ISKRA-11.131.768', 'DS-A403890'],
    partName: '말레 디젤 지게차 고토크 감속형 시동모터 어셈블리 12V/24V 3.2kW',
    category: '전장·컨트롤러·센서',
    manufacturer: '말레 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 37691295 / 출력 3.2kW / 피니언 기어 11치 / 유성기어 감속 고토크형',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 37691295 · 독일 말레 정품 스타터' },
      { label: '정격 출력 × 기어수', value: '3.2 kW 고기동 토크 × 피니언 기어 11T' },
      { label: '플랜지 장착 규격', value: '마운팅 홀 3구 · 센터 인로우 직경 89.0 mm' },
      { label: '내환경 특화', value: '혹한기 영하 25도 일발 시동 및 방진·방습 솔레노이드 내장' }
    ],
    compatibleModels: ['D30S-7', 'GTS25'],
    compatibleBrands: ['두산밥캣', '클라크', '안후이 헬리', '항차그룹'],
    tonnageRange: '2.5톤 ~ 4.5톤 디젤 엔진 지게차 공용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 138,
    landedCostKrw: 215000,
    dealerPriceKrw: 295000,
    retailPriceKrw: 380000,
    unitName: '대',
    moq: 1,
    stockQty: 11,
    warehouseLocation: '평택 2창고 E-11',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'ALTERNATOR',
    referenceSource: '티브이에이치 말레 브랜드 공식 스포트라이트 품목 37691295 수집',
    technicalNote: '유성기어 감속 구조로 기존 직결식 스타터 대비 소모 전류는 낮추고 기동 토크는 35% 향상'
  },
  {
    id: 'cp-29',
    tvhRefNo: 'TVH-45568791',
    tvhBrand: 'Mahle',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-05/Mahle%20-%20drive%20motor%20%2845568791%29_0.jpg',
    sourceUrl: 'https://www.tvh.com/brands/mahle-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-MAHLE-45568791',
    oemCrossRefCodes: ['TVH-45568791', 'MAHLE-AMK5804', 'HL-G2-MOTOR-AC', 'HC-XC-DM80V'],
    partName: '말레 전동지게차 브러시리스 교류 구동·유압 펌프 모터 어셈블리',
    category: '전장·컨트롤러·센서',
    manufacturer: '말레 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 45568791 / 정격 48V~80V 11.5kW / 엔코더·온도센서 일체형 무보수 교류모터',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 45568791 · 말레 산업용 교류 구동모터' },
      { label: '정격 출력 × 전압', value: '11.5 kW × 48V / 80V 3상 교류 인덕션 방식' },
      { label: '내장 피드백 센서', value: '고해상도 64펄스 속도 엔코더 + 권선 과열방지 온도센서' },
      { label: '유지보수 특성', value: '카본 브러시 없는 무점검 밀폐형 구조 · 절연등급 F종' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', '25B-9U', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '현대사이트솔루션', '도요타'],
    tonnageRange: '2.0톤 ~ 3.5톤 리튬·납산 전동지게차 구동 및 유압펌프용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 480,
    landedCostKrw: 740000,
    dealerPriceKrw: 980000,
    retailPriceKrw: 1250000,
    unitName: '대',
    moq: 1,
    stockQty: 5,
    warehouseLocation: '평택 2창고 E-12',
    deliveryPolicy: '당일 화물 발송',
    diagramType: 'AC_CONTROLLER',
    referenceSource: '티브이에이치 말레 브랜드 공식 스포트라이트 품목 45568791 수집',
    technicalNote: '커티스 1238E 및 자피 교류 컨트롤러와 완벽 호환되며 고토크 등판 성능 발휘'
  },
  {
    id: 'cp-30',
    tvhRefNo: 'TVH-61509178',
    tvhBrand: 'Nordic Lights',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-05/Nordic%20Lights%20-%20PRO%20work%20light%20%2861509178%29.jpg',
    sourceUrl: 'https://www.tvh.com/brands/nordic-lights-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-NORDIC-61509178',
    oemCrossRefCodes: ['TVH-61509178', 'NORDIC-SCORpius-PRO445', 'TVH-6019216'],
    partName: '노르딕라이츠 프로 중장비 고광량 엘이디 작업등 4,400루멘 · 내진동 알루미늄',
    category: '필터·시트·안전용품',
    manufacturer: '노르딕라이츠 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 61509178 / 광속 4,400lm / 12V~80V 멀티전압 / IP68·IP69K 고압세척 방수',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 61509178 · 핀란드 노르딕라이츠 정품' },
      { label: '실효 광출력 × 색온도', value: '4,400 루멘 와이드 플러드 빔 × 5,000K 자연주광색' },
      { label: '입력 전압 및 소비전력', value: 'DC 9V ~ 80V 프리볼트 × 50W · 도이치 2핀 방수커넥터' },
      { label: '내충격 및 방수등급', value: '15.3G 중장비 내진동 설계 + IP68 / IP69K 완전방수' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'EPL205Z', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '이피이큅먼트', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '전 기종 지게차 야간 물류창고 및 컨테이너 상하차 작업용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 52,
    landedCostKrw: 80000,
    dealerPriceKrw: 112000,
    retailPriceKrw: 148000,
    unitName: '개',
    moq: 2,
    stockQty: 40,
    warehouseLocation: '평택 2창고 H-07',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'CONTACTOR_RELAY',
    referenceSource: '티브이에이치 노르딕라이츠 공식 스포트라이트 품목 61509178 수집',
    technicalNote: '눈부심 방지 콰드로 렌즈 기술이 적용되어 야간 작업 시 작업자 시야 피로 최소화'
  },
  {
    id: 'cp-31',
    tvhRefNo: 'TVH-10506497',
    tvhBrand: 'Stabilus',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2024-10/TVH10506497_480x270px.jpg',
    sourceUrl: 'https://www.tvh.com/brands/stabilus-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-STABILUS-10506497',
    oemCrossRefCodes: ['TVH-10506497', 'STABILUS-084521', 'HL-HOOD-GS450N', 'DS-D30-GS480'],
    partName: '스타빌루스 엔진후드·배터리커버 리프트 오토 가스스프링 댐퍼 450N',
    category: '유압·제동·조향',
    manufacturer: '스타빌루스 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 10506497 / 확장길이 485mm × 스트로크 200mm / 반발력 450N / 볼조인트 양단',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF 10506497 · 독일 스타빌루스 리프트오매트' },
      { label: '전장 × 행정거리', value: '확장 시 485 mm × 스트로크 200 mm · 실린더 외경 18mm' },
      { label: '정격 지지 반발력', value: '450 N · 중량물 배터리 후드 및 캐빈 도어 개폐 보조' },
      { label: '양단 마운팅 타입', value: 'M8 볼 소켓 조인트 · 안전 스냅 클립 일체형' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '1.5톤 ~ 4.5톤 지게차 배터리 본네트·엔진 후드·캐빈 도어 공용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 22,
    landedCostKrw: 34000,
    dealerPriceKrw: 49000,
    retailPriceKrw: 68000,
    unitName: '본',
    moq: 2,
    stockQty: 60,
    warehouseLocation: '평택 2창고 G-08',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'SEAL_KIT',
    referenceSource: '티브이에이치 스타빌루스 공식 스포트라이트 품목 10506497 수집',
    technicalNote: '정비 점검 시 무거운 배터리 커버가 갑자기 닫히는 안전사고를 예방하는 필수 댐퍼'
  },
  {
    id: 'cp-32',
    tvhRefNo: 'TVH-RAVAS-3200',
    tvhBrand: 'RAVAS',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-01/Weighing%20forks_copy_0.PNG',
    sourceUrl: 'https://www.tvh.com/brands/ravas-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-RAVAS-IFORKS32',
    oemCrossRefCodes: ['TVH-RAVAS-3200', 'RAVAS-IFORKS-32-2A', 'CAM-WF25-1150'],
    partName: '라바스 무선 블루투스 전자저울 계량포크 시스템 · 운전석 디지털 인디케이터 포함',
    category: '포크·덧발·어태치먼트',
    manufacturer: '라바스 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '최대 계량 2,500kg~3,200kg / 오차율 0.1% / 완전 무선 배선리스 장착 / ISO 2A·3A',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF RAVAS-3200 · 네덜란드 라바스 정품 계량포크' },
      { label: '최대 계량 용량 × 눈금', value: '2,500 kg / 3,200 kg × 최소 눈금 1 kg (정밀도 ±0.1%)' },
      { label: '포크 치수 및 클래스', value: '58 × 140 × 1,150 mm · ISO 2328 Class II 및 Class III 선택' },
      { label: '데이터 통신 방식', value: '블루투스 4.0 완전 무선 통신 + 운전석 LED 중량 표시기 포함' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 3.5톤 지게차 상하차 동시 중량 계량용',
    foreignCurrency: 'EUR',
    foreignUnitCost: 1250,
    landedCostKrw: 1920000,
    dealerPriceKrw: 2480000,
    retailPriceKrw: 2980000,
    unitName: '세트',
    moq: 1,
    stockQty: 3,
    warehouseLocation: '평택 1창고 C-10',
    deliveryPolicy: '당일 화물 발송 및 현장 영점 교정 지원',
    diagramType: 'FORGED_FORK',
    referenceSource: '티브이에이치 라바스 브랜드 공식 스포트라이트 계량포크 수집',
    technicalNote: '별도 마스트 케이블 배선 없이 기존 포크를 빼고 5분 만에 걸어 즉시 계량 작업 가능'
  },
  {
    id: 'cp-33',
    tvhRefNo: 'TVH-EP-REGEN80',
    tvhBrand: 'Energic Plus',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/styles/max_480x480/public/2026-01/EnergicPlus_Products_340x340_regenerator%20%283%29.jpg',
    sourceUrl: 'https://www.tvh.com/our-brands/energic-plus',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-EP-REGEN-2480',
    oemCrossRefCodes: ['TVH-EP-REGEN80', 'ENERGIC-REJUVENATOR-80V', 'EP-DESULF-2480'],
    partName: '에너직플러스 고주파 펄스 납산 배터리 황산염 제거 재생기 · 24V~80V 겸용',
    category: '배터리·충전·커넥터',
    manufacturer: '에너직플러스 · 티브이에이치 자체브랜드',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 에너직플러스 / 24V·36V·48V·72V·80V 전동지게차 배터리 용량 복원기',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF EP-REGEN80 · 에너직플러스 공식 배터리 재생기' },
      { label: '지원 배터리 전압', value: '24V / 36V / 48V / 72V / 80V 납산 트랙션 배터리 전 규격' },
      { label: '복원 메커니즘', value: '고주파 전기 펄스로 극판에 고착된 황산납 결정을 미세 분해·환원' },
      { label: '디스플레이 및 분석', value: '내장 그래픽 LCD · 셀별 전압 밸런싱 및 복원 리포트 출력' }
    ],
    compatibleModels: ['25B-9U', '8FB25', 'CPD25-GB2Li', 'CPD25-XEY2-SI'],
    compatibleBrands: ['현대사이트솔루션', '도요타', '클라크', '두산밥캣', '안후이 헬리'],
    tonnageRange: '전동지게차 임대 주기장 및 대형 배터리 정비사업장 필수 설비',
    foreignCurrency: 'EUR',
    foreignUnitCost: 890,
    landedCostKrw: 1360000,
    dealerPriceKrw: 1780000,
    retailPriceKrw: 2180000,
    unitName: '대',
    moq: 1,
    stockQty: 4,
    warehouseLocation: '평택 2창고 F-09',
    deliveryPolicy: '당일 화물 발송 및 사용 매뉴얼 제공',
    diagramType: 'LFP_BATTERY_PACK',
    referenceSource: '티브이에이치 에너직플러스 공식 스포트라이트 품목 수집',
    technicalNote: '노후 전동지게차 배터리의 가동 시간을 30~40% 회복시켜 신품 교체 비용 절감'
  },
  {
    id: 'cp-34',
    tvhRefNo: 'TVH-CSP-PLP20',
    tvhBrand: 'Casappa',
    imageUrl: 'https://www.tvh.com/sites/tvh/files/2023-06/CatalogueOverview_BANN_600x300px_9.jpg',
    sourceUrl: 'https://www.tvh.com/brands/casappa-parts',
    collectedAt: '2026-11-05',
    isActive: true,
    sku: 'TVH-CASAPPA-PLP20',
    oemCrossRefCodes: ['TVH-CSP-PLP20', 'CASAPPA-PLP20.16D0', 'HL-G2-HYDPUMP', 'DS-K1004210'],
    partName: '카사파 지게차 메인 유압 기어펌프 어셈블리 · 22cc/rev 고압 저소음형',
    category: '유압·제동·조향',
    manufacturer: '카사파 · 티브이에이치 공식공급',
    originCountry: '글로벌 OEM',
    partGrade: '순정 OEM',
    specSummary: '티브이에이치 CSP-PLP20 / 배제용적 22.0cc / 최대압력 250bar / 스플라인 13치 샤프트',
    detailedSpecs: [
      { label: '티브이에이치 참조번호', value: 'TVH REF CSP-PLP20 · 이탈리아 카사파 정품 기어펌프' },
      { label: '배제용적 × 정격압력', value: '22.0 cc/rev × 정격 210 bar / 피크 250 bar' },
      { label: '구동축 및 플랜지', value: 'SAE-A 2볼트 마운팅 플랜지 + 13치 인볼류트 스플라인 축' },
      { label: '몸체 재질', value: '고강도 압출 알루미늄 합금 바디 + 주철 프론트·리어 커버' }
    ],
    compatibleModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    compatibleBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    tonnageRange: '2.0톤 ~ 3.5톤 전동·디젤 지게차 메인 마스트 인양 및 조향 유압원',
    foreignCurrency: 'EUR',
    foreignUnitCost: 195,
    landedCostKrw: 300000,
    dealerPriceKrw: 420000,
    retailPriceKrw: 540000,
    unitName: '대',
    moq: 1,
    stockQty: 9,
    warehouseLocation: '평택 2창고 G-09',
    deliveryPolicy: '16시 이전 당일택배 발송',
    diagramType: 'SEAL_KIT',
    referenceSource: '티브이에이치 카사파 브랜드 공식 스포트라이트 유압펌프 수집',
    technicalNote: '마스트 인상 속도 저하 및 유압 펌프 소음 과다 발생 시 1:1 직결 교체'
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
  { modelName: 'CPD25-GB2Li', brand: '안후이 헬리', label: '안후이 헬리 · CPD25-GB2Li · 리튬 2.5톤' },
  { modelName: 'ECB30C', brand: '비와이디', label: '비와이디 · ECB30C · 리튬 3.0톤' },
  { modelName: 'CPD25-XEY2-SI', brand: '항차그룹', label: '항차그룹 · CPD25-XEY2-SI · 리튬 2.5톤' },
  { modelName: 'EPL205Z', brand: '이피이큅먼트', label: '이피이큅먼트 · EPL205Z · 파레트트럭 2.0톤' },
  { modelName: 'D30S-7', brand: '두산밥캣', label: '두산밥캣 · D30S-7 · 디젤 3.0톤' },
  { modelName: '25B-9U', brand: '현대사이트솔루션', label: '현대사이트솔루션 · 25B-9U · 전동 2.5톤' },
  { modelName: 'GTS25', brand: '클라크', label: '클라크 · GTS25 · 디젤 2.5톤' },
  { modelName: '8FB25', brand: '도요타', label: '도요타 · 8FB25 · 전동 2.5톤' }
];

// ============================================================================
// 맞춤형 카탈로그 빌더 스키마 및 기본 프리셋 시드 (fl_custom_catalogs 연동)
// ============================================================================

export interface CustomCatalogItemOverride {
  itemId: string;
  customPriceKrw?: number;
  defaultOrderQty?: number;
  badgeText?: string; // 예: '주력', '특가', '필수소모품', '신규수집'
  customNote?: string;
  sortOrder?: number;
}

export interface CustomCatalogConfig {
  id: string;
  catalogCode: string;
  title: string;
  subtitle: string;
  description: string;
  targetCustomerType: 'DEALER' | 'END_USER' | 'CUSTOM';
  priceAdjustRate: number; // 기본 단가 대비 할인·할증율 % (예: -5, 0, +10)
  layoutMode: 'GRID_ORDER' | 'PHOTO_BROCHURE' | 'TECH_DRAWING';
  targetForkliftBrands: string[];
  targetModels: string[];
  targetCategories: PartCategoryType[];
  selectedItemIds: string[];
  itemOverrides: Record<string, CustomCatalogItemOverride>;
  showRealPhoto: boolean;
  showTechDiagram: boolean;
  showOemCrossRef: boolean;
  showDetailedSpecs: boolean;
  showStockAndLeadTime: boolean;
  showUnitPrice: boolean;
  headerNotice: string;
  footerContact: string;
  isDefault?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  tenant_id?: string;
}

export const SEED_CUSTOM_CATALOGS: CustomCatalogConfig[] = [
  {
    id: 'CAT-CFG-001',
    catalogCode: 'CAT-CN-DEALER-2026',
    title: '항차·헬리·비와이디 중국 수입 지게차 전용 호환부품 카탈로그',
    subtitle: '전국 협력 대리점 및 정비사업소 배포용 도매 발주 카탈로그',
    description: '국내 보급이 급증한 항차·헬리·비와이디·이피 리튬전동 지게차 및 파레트트럭의 필수 교체 부품 22종을 수록한 대리점 전용 카탈로그입니다.',
    targetCustomerType: 'DEALER',
    priceAdjustRate: 0,
    layoutMode: 'GRID_ORDER',
    targetForkliftBrands: ['안후이 헬리', '비와이디', '항차그룹', '이피이큅먼트'],
    targetModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'EPL205Z'],
    targetCategories: [
      '타이어·휠·캐스터',
      '포크·덧발·어태치먼트',
      '마스트·롤러·체인',
      '전장·컨트롤러·센서',
      '배터리·충전·커넥터',
      '유압·제동·조향',
      '필터·시트·안전용품'
    ],
    selectedItemIds: [
      'cp-01', 'cp-02', 'cp-03', 'cp-04',
      'cp-05', 'cp-07', 'cp-08',
      'cp-09', 'cp-10', 'cp-11', 'cp-12',
      'cp-13', 'cp-14', 'cp-15',
      'cp-17', 'cp-18',
      'cp-20', 'cp-22', 'cp-24',
      'cp-25', 'cp-29', 'cp-30'
    ],
    itemOverrides: {
      'cp-01': { itemId: 'cp-01', badgeText: '주력', defaultOrderQty: 2 },
      'cp-04': { itemId: 'cp-04', badgeText: '필수소모품', defaultOrderQty: 2 },
      'cp-07': { itemId: 'cp-07', badgeText: '주력', defaultOrderQty: 1 },
      'cp-13': { itemId: 'cp-13', badgeText: '순정호환', defaultOrderQty: 1 },
      'cp-25': { itemId: 'cp-25', badgeText: '신규수집', defaultOrderQty: 2 },
      'cp-29': { itemId: 'cp-29', badgeText: '신규수집', defaultOrderQty: 1 }
    },
    showRealPhoto: true,
    showTechDiagram: true,
    showOemCrossRef: true,
    showDetailedSpecs: true,
    showStockAndLeadTime: true,
    showUnitPrice: true,
    headerNotice: '본 카탈로그는 대리점 공급단가 기준이며, 평택 부품물류센터 재고 보유 품목은 16시 이전 발주 시 당일 출고됩니다.',
    footerContact: '부품 도매 발주 및 기술 문의: 평택 부품물류센터 031-681-8899 / 팩스 031-681-8890',
    isDefault: true,
    createdBy: '관리자',
    createdAt: '2026-11-05T09:00:00.000Z',
    updatedAt: '2026-11-05T09:00:00.000Z',
    tenant_id: 'tenant-ebro-fl'
  },
  {
    id: 'CAT-CFG-002',
    catalogCode: 'CAT-EV-POWER-2026',
    title: '티브이에이치 전동지게차 배터리·충전기·전장부품 특화 브로셔',
    subtitle: '에너직플러스 · 커티스 · 말레 · 코보 · 노르딕라이츠 정품 전장 카탈로그',
    description: '티브이에이치에서 수집한 유럽·글로벌 순정 전장품 및 배터리 재생·충전 솔루션을 실물 사진 중심으로 구성한 브로셔형 카탈로그입니다.',
    targetCustomerType: 'END_USER',
    priceAdjustRate: 0,
    layoutMode: 'PHOTO_BROCHURE',
    targetForkliftBrands: ['안후이 헬리', '비와이디', '항차그룹', '이피이큅먼트', '현대사이트솔루션', '도요타'],
    targetModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'EPL205Z', '25B-9U', '8FB25'],
    targetCategories: ['전장·컨트롤러·센서', '배터리·충전·커넥터', '필터·시트·안전용품'],
    selectedItemIds: [
      'cp-13', 'cp-14', 'cp-15', 'cp-16',
      'cp-17', 'cp-18', 'cp-19',
      'cp-25', 'cp-26', 'cp-28', 'cp-29', 'cp-30', 'cp-33'
    ],
    itemOverrides: {
      'cp-13': { itemId: 'cp-13', badgeText: '주력', defaultOrderQty: 1 },
      'cp-18': { itemId: 'cp-18', badgeText: '주력', defaultOrderQty: 1 },
      'cp-25': { itemId: 'cp-25', badgeText: '신규수집', defaultOrderQty: 2 },
      'cp-29': { itemId: 'cp-29', badgeText: '신규수집', defaultOrderQty: 1 },
      'cp-30': { itemId: 'cp-30', badgeText: '특가', defaultOrderQty: 2 },
      'cp-33': { itemId: 'cp-33', badgeText: '신규수집', defaultOrderQty: 1 }
    },
    showRealPhoto: true,
    showTechDiagram: true,
    showOemCrossRef: true,
    showDetailedSpecs: true,
    showStockAndLeadTime: true,
    showUnitPrice: true,
    headerNotice: '커티스 컨트롤러 발주 시 장착 대상 지게차 모델명을 기재해 주시면 기종별 주행·인양 파라미터를 세팅하여 출고합니다.',
    footerContact: '전장·배터리 기술지원팀: 031-681-8899',
    isDefault: false,
    createdBy: '관리자',
    createdAt: '2026-11-05T09:10:00.000Z',
    updatedAt: '2026-11-05T09:10:00.000Z',
    tenant_id: 'tenant-ebro-fl'
  },
  {
    id: 'CAT-CFG-003',
    catalogCode: 'CAT-CAM-ATTACH-2026',
    title: '캠 어태치먼트 · 단조포크 · 라바스 계량포크 기술도면 카탈로그',
    subtitle: '중량물 하역 어태치먼트 및 마스트 체인·베어링 실측 치수 대장',
    description: '캠 어태치먼트 사이드시프터, 단조포크, 고강도 덧발, 라바스 무선 계량포크 및 동화 리프트체인의 실측 규격과 도면을 수록한 기술 카탈로그입니다.',
    targetCustomerType: 'CUSTOM',
    priceAdjustRate: -5,
    layoutMode: 'TECH_DRAWING',
    targetForkliftBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    targetModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    targetCategories: ['포크·덧발·어태치먼트', '마스트·롤러·체인'],
    selectedItemIds: [
      'cp-05', 'cp-06', 'cp-07', 'cp-08',
      'cp-09', 'cp-10', 'cp-11', 'cp-12',
      'cp-32'
    ],
    itemOverrides: {
      'cp-05': { itemId: 'cp-05', badgeText: '주력', customPriceKrw: 360000, defaultOrderQty: 1 },
      'cp-07': { itemId: 'cp-07', badgeText: '특가', customPriceKrw: 225000, defaultOrderQty: 1 },
      'cp-08': { itemId: 'cp-08', badgeText: '주력', customPriceKrw: 645000, defaultOrderQty: 1 },
      'cp-32': { itemId: 'cp-32', badgeText: '신규수집', customPriceKrw: 2350000, defaultOrderQty: 1 }
    },
    showRealPhoto: true,
    showTechDiagram: true,
    showOemCrossRef: true,
    showDetailedSpecs: true,
    showStockAndLeadTime: true,
    showUnitPrice: true,
    headerNotice: '포크 및 사이드시프터 발주 전 캐리지 걸이 높이·Class II 407mm / Class III 508mm 규격을 반드시 확인하시기 바랍니다.',
    footerContact: '특장·어태치먼트 기술영업팀: 031-681-8899',
    isDefault: false,
    createdBy: '관리자',
    createdAt: '2026-11-05T09:20:00.000Z',
    updatedAt: '2026-11-05T09:20:00.000Z',
    tenant_id: 'tenant-ebro-fl'
  },
  {
    id: 'CAT-CFG-004',
    catalogCode: 'CAT-MRO-PERIODIC-2026',
    title: '주기장 정기예방정비 필수 타이어·유압·필터·시트 소모품 패키지',
    subtitle: '렌탈 주기장 및 자체 정비팀 월간 일괄 발주용 표준 주문서',
    description: '통타이어, 유압실린더 씰키트, 습식 브레이크 디스크, 조향 킹핀 키트, 카사파 유압펌프, 4종 필터 세트, 코보·그래머 시트를 묶은 예방정비 카탈로그입니다.',
    targetCustomerType: 'DEALER',
    priceAdjustRate: 0,
    layoutMode: 'GRID_ORDER',
    targetForkliftBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
    targetModels: ['CPD25-GB2Li', 'ECB30C', 'CPD25-XEY2-SI', 'D30S-7', '25B-9U', 'GTS25', '8FB25'],
    targetCategories: ['타이어·휠·캐스터', '유압·제동·조향', '필터·시트·안전용품'],
    selectedItemIds: [
      'cp-01', 'cp-02', 'cp-03', 'cp-04',
      'cp-20', 'cp-21', 'cp-22', 'cp-31', 'cp-34',
      'cp-23', 'cp-24', 'cp-27'
    ],
    itemOverrides: {
      'cp-20': { itemId: 'cp-20', badgeText: '필수소모품', defaultOrderQty: 2 },
      'cp-23': { itemId: 'cp-23', badgeText: '필수소모품', defaultOrderQty: 5 },
      'cp-27': { itemId: 'cp-27', badgeText: '신규수집', defaultOrderQty: 1 },
      'cp-31': { itemId: 'cp-31', badgeText: '신규수집', defaultOrderQty: 2 },
      'cp-34': { itemId: 'cp-34', badgeText: '신규수집', defaultOrderQty: 1 }
    },
    showRealPhoto: true,
    showTechDiagram: true,
    showOemCrossRef: true,
    showDetailedSpecs: true,
    showStockAndLeadTime: true,
    showUnitPrice: true,
    headerNotice: '500시간 정기점검 필터 패키지 및 유압 씰키트는 박스 단위 발주 시 추가 수량 할인이 적용됩니다.',
    footerContact: '주기장 정비부품 공급센터: 031-681-8899',
    isDefault: false,
    createdBy: '관리자',
    createdAt: '2026-11-05T09:30:00.000Z',
    updatedAt: '2026-11-05T09:30:00.000Z',
    tenant_id: 'tenant-ebro-fl'
  }
];

export interface TvhOnlineBrandBundle {
  brandKey: string;
  brandNameKo: string;
  tvhBrandLabel: string;
  sourceUrl: string;
  bannerImageUrl: string;
  categorySummary: string;
  itemIds: string[];
}

export const TVH_ONLINE_BRAND_BUNDLES: TvhOnlineBrandBundle[] = [
  {
    brandKey: 'TOTALSOURCE',
    brandNameKo: '티브이에이치 토탈소스',
    tvhBrandLabel: 'TotalSource',
    sourceUrl: 'https://www.tvh.com/our-brands/totalsource',
    bannerImageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Tyres%20%282%29.jpg',
    categorySummary: '솔리드 통타이어, 폴리우레탄 구동륜, 마스트 롤러 베어링, 유압 씰키트, 습식 브레이크 디스크',
    itemIds: ['cp-01', 'cp-02', 'cp-03', 'cp-04', 'cp-09', 'cp-10', 'cp-20', 'cp-21']
  },
  {
    brandKey: 'CAM_ATTACHMENTS',
    brandNameKo: '캠 어태치먼트 · 라바스',
    tvhBrandLabel: 'CAM attachments / RAVAS',
    sourceUrl: 'https://www.tvh.com/our-brands/cam-attachments',
    bannerImageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/CAM_USP_480x480_versatile_0.png',
    categorySummary: '단조 포크, 고강도 포크 덧발, 사이드시프터 어셈블리, 라바스 무선 블루투스 계량포크',
    itemIds: ['cp-05', 'cp-06', 'cp-07', 'cp-08', 'cp-32']
  },
  {
    brandKey: 'COBO_GRAMMER',
    brandNameKo: '코보 · 그래머 캐빈·전장',
    tvhBrandLabel: 'COBO / Grammer',
    sourceUrl: 'https://www.tvh.com/brands/cobo-parts',
    bannerImageUrl: 'https://www.tvh.com/sites/tvh/files/2024-08/COBO%20-%20Seat%20%2817438386%29.jpg',
    categorySummary: '풀서스펜션 운전석 시트, 콤비네이션 전조등 3321603, 방진 이그니션 시동 스위치 14644189',
    itemIds: ['cp-24', 'cp-25', 'cp-26', 'cp-27']
  },
  {
    brandKey: 'MAHLE_CURTIS_ALBRIGHT',
    brandNameKo: '말레 · 커티스 · 알브라이트 구동전장',
    tvhBrandLabel: 'Mahle / Curtis / Albright',
    sourceUrl: 'https://www.tvh.com/brands/mahle-parts',
    bannerImageUrl: 'https://www.tvh.com/sites/tvh/files/2024-05/Mahle%20-%20drive%20motor%20%2845568791%29_0.jpg',
    categorySummary: '교류 구동모터 45568791, 시동모터 37691295, 알터네이터 34136944, 커티스 컨트롤러, 알브라이트 컨택터',
    itemIds: ['cp-13', 'cp-14', 'cp-15', 'cp-16', 'cp-28', 'cp-29']
  },
  {
    brandKey: 'ENERGIC_PLUS_TROJAN',
    brandNameKo: '에너직플러스 · 트로잔 배터리·충전',
    tvhBrandLabel: 'Energic Plus / Trojan',
    sourceUrl: 'https://www.tvh.com/our-brands/energic-plus',
    bannerImageUrl: 'https://www.tvh.com/sites/tvh/files/styles/max_480x480/public/2026-01/EnergicPlus_Products_340x340_regenerator%20%283%29.jpg',
    categorySummary: '고주파 배터리 재생기, 리튬인산철 배터리팩, 산업용 트랙션 배터리, 대전류 충전 커넥터',
    itemIds: ['cp-17', 'cp-18', 'cp-19', 'cp-33']
  },
  {
    brandKey: 'CASAPPA_CARRARO_DONGHUA',
    brandNameKo: '카사파 · 카라로 · 동화 · 도날드슨 · 노르딕',
    tvhBrandLabel: 'Casappa / Carraro / Donghua / Donaldson / Nordic Lights / Stabilus',
    sourceUrl: 'https://www.tvh.com/brands/casappa-parts',
    bannerImageUrl: 'https://www.tvh.com/sites/tvh/files/2024-05/Nordic%20Lights%20-%20PRO%20work%20light%20%2861509178%29.jpg',
    categorySummary: '카사파 유압 기어펌프, 카라로 조향 킹핀 키트, 동화 리프트 체인, 도날드슨 필터 세트, 노르딕 작업등, 스타빌루스 가스스프링',
    itemIds: ['cp-11', 'cp-12', 'cp-22', 'cp-23', 'cp-30', 'cp-31', 'cp-34']
  }
];

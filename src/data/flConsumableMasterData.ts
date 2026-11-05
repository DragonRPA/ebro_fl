// src/data/flConsumableMasterData.ts
// 소모품 마스터 및 소모품 재고 · 로트 · 입출고 시드 데이터
// 소모품 정의: 사용 시 소멸되는 물품 — 윤활유, 구리스, 장갑, 방청제, 세척제, 부동액, 증류수, 보로, 전장소모재 등

export interface GenuineConsumableSeed {
  id: string;
  skuCode: string;
  name: string;
  partName: string;
  modelName: string;
  category: string;
  brand: string;
  manufacturer: string;
  isHandled: boolean;
  inventoryAssetClass: 'CONSUMABLE';
  usagePurpose: 'DUAL_USE' | 'RENTAL_REPAIR' | 'TRADE_SALE';
  inventoryType: string;
  currency: string;
  compatibleModels: string;
  spec: string;
  unit: string;
  baseYm: string;
  inboundDate: string;
  inboundYm: string;
  agingMonths: number;
  initialQty: number;
  initialAmount: number;
  stockQty: number;
  currentStock: number;
  saleStockQty: number;
  repairStockQty: number;
  minStockQty: number;
  safetyStock: number;
  unitPrice: number;
  exactUnitCost: number;
  stockBalanceAmount: number;
  saleUnitPrice: number;
  salePrice: number;
  supplier: string;
  vendorId: string;
  location: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const RAW_CONSUMABLE_MASTER_ITEMS: Array<{
  id: string;
  skuCode: string;
  modelName: string;
  category: '윤활유·오일류' | '구리스·방청·케미컬' | '장갑·안전보호구' | '세척·보로·전장소모재';
  brand: string;
  isHandled: boolean;
  spec: string;
  unit: string;
  compatibleModels: string;
  inboundDate: string;
  initialQty: number;
  stockQty: number;
  saleStockQty: number;
  repairStockQty: number;
  minStockQty: number;
  unitPrice: number;
  saleUnitPrice: number;
  supplier: string;
  location: string;
  note: string;
}> = [
  // =========================================================================
  // 1. 윤활유·오일류 (취급 품목)
  // =========================================================================
  {
    id: 'CSM-FL-001',
    skuCode: 'CSM-OIL-VG46-20L',
    modelName: '유압작동유 ISO VG 46 내마모성 20L',
    category: '윤활유·오일류',
    brand: 'SK루브리컨츠',
    isHandled: true,
    spec: '20L 말통 · ISO VG 46 사계절 표준 유압유',
    unit: '통',
    compatibleModels: '전동·디젤 지게차 전 차종 마스트·실린더 유압계통 공통',
    inboundDate: '2026-01-15',
    initialQty: 40,
    stockQty: 28,
    saleStockQty: 10,
    repairStockQty: 18,
    minStockQty: 10,
    unitPrice: 48000,
    saleUnitPrice: 65000,
    supplier: '평택항만윤활유상사',
    location: '주기장 위험물보관소 A-01',
    note: '사용 시 소멸 소모품 · 마스트 유압탱크 보충 및 정기교환용'
  },
  {
    id: 'CSM-FL-002',
    skuCode: 'CSM-OIL-VG32-20L',
    modelName: '저온용 유압작동유 ISO VG 32 콜드체인용 20L',
    category: '윤활유·오일류',
    brand: 'GS칼텍스',
    isHandled: true,
    spec: '20L 말통 · ISO VG 32 냉동창고 저온 유동성 특화',
    unit: '통',
    compatibleModels: '냉동·냉장 물류센터 투입 전동지게차·리치트럭 전용',
    inboundDate: '2026-02-10',
    initialQty: 25,
    stockQty: 16,
    saleStockQty: 6,
    repairStockQty: 10,
    minStockQty: 6,
    unitPrice: 54000,
    saleUnitPrice: 74000,
    supplier: '평택항만윤활유상사',
    location: '주기장 위험물보관소 A-02',
    note: '사용 시 소멸 소모품 · 저온물류센터 유압 동결 방지용'
  },
  {
    id: 'CSM-FL-003',
    skuCode: 'CSM-OIL-15W40-20L',
    modelName: '디젤엔진오일 15W-40 CI-4 중장비용 20L',
    category: '윤활유·오일류',
    brand: '현대오일뱅크',
    isHandled: true,
    spec: '20L 말통 · SAE 15W-40 API CI-4 고출력 디젤전용',
    unit: '통',
    compatibleModels: '두산·클라크·항차·헬리 디젤지게차 2.0~7.0톤 엔진 공통',
    inboundDate: '2026-01-20',
    initialQty: 35,
    stockQty: 22,
    saleStockQty: 8,
    repairStockQty: 14,
    minStockQty: 8,
    unitPrice: 58000,
    saleUnitPrice: 79000,
    supplier: '평택항만윤활유상사',
    location: '주기장 위험물보관소 A-03',
    note: '사용 시 소멸 소모품 · 디젤지게차 250시간 주기 정기점검 교환용'
  },
  {
    id: 'CSM-FL-004',
    skuCode: 'CSM-OIL-ATF3-20L',
    modelName: '미션·토크컨버터 오일 ATF DEXRON-III 20L',
    category: '윤활유·오일류',
    brand: 'SK루브리컨츠',
    isHandled: true,
    spec: '20L 말통 · 자동변속기 및 토크컨버터 전용 오일',
    unit: '통',
    compatibleModels: '디젤·LPG 지게차 파워시프트 미션 전 차종',
    inboundDate: '2025-11-18',
    initialQty: 20,
    stockQty: 14,
    saleStockQty: 4,
    repairStockQty: 10,
    minStockQty: 5,
    unitPrice: 62000,
    saleUnitPrice: 85000,
    supplier: '평택항만윤활유상사',
    location: '주기장 위험물보관소 A-04',
    note: '사용 시 소멸 소모품 · 토크컨버터 변속 충격 방지 및 오일 보충용'
  },
  {
    id: 'CSM-FL-005',
    skuCode: 'CSM-OIL-80W90-20L',
    modelName: '구동축 기어·차동장치 오일 80W-90 GL-5 20L',
    category: '윤활유·오일류',
    brand: 'GS칼텍스',
    isHandled: true,
    spec: '20L 말통 · SAE 80W-90 API GL-5 극압 기어유',
    unit: '통',
    compatibleModels: '전동·디젤 지게차 드라이브 액슬 및 감속기 기어박스 공통',
    inboundDate: '2025-12-05',
    initialQty: 18,
    stockQty: 12,
    saleStockQty: 4,
    repairStockQty: 8,
    minStockQty: 4,
    unitPrice: 59000,
    saleUnitPrice: 81000,
    supplier: '평택항만윤활유상사',
    location: '주기장 위험물보관소 A-05',
    note: '사용 시 소멸 소모품 · 구동축 감속기 및 디퍼렌셜 오일 교환용'
  },
  {
    id: 'CSM-FL-006',
    skuCode: 'CSM-OIL-DOT4-1L',
    modelName: '합성 브레이크액 DOT-4 고비점 1L',
    category: '윤활유·오일류',
    brand: '보쉬',
    isHandled: true,
    spec: '1L 캔 · FMVSS 116 DOT-4 습식 제동계통 전용',
    unit: '통',
    compatibleModels: '유압식 제동 마스터실린더 적용 지게차 공통',
    inboundDate: '2026-03-04',
    initialQty: 30,
    stockQty: 24,
    saleStockQty: 8,
    repairStockQty: 16,
    minStockQty: 10,
    unitPrice: 9500,
    saleUnitPrice: 14000,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-01',
    note: '사용 시 소멸 소모품 · 브레이크 마스터실린더 에어빼기 및 보충용'
  },

  // =========================================================================
  // 2. 구리스·방청·케미컬 (취급 품목)
  // =========================================================================
  {
    id: 'CSM-FL-007',
    skuCode: 'CSM-GRS-EP2-BOX',
    modelName: '고하중 리튬 극압 구리스 EP-2 카트리지 박스',
    category: '구리스·방청·케미컬',
    brand: '상아윤활유',
    isHandled: true,
    spec: '400g 자바라 카트리지 × 20본입 1박스',
    unit: '박스',
    compatibleModels: '지게차 마스트 롤러·조향 너클핀·틸트핀 그리스 니플 전 차종',
    inboundDate: '2026-02-18',
    initialQty: 30,
    stockQty: 19,
    saleStockQty: 7,
    repairStockQty: 12,
    minStockQty: 6,
    unitPrice: 52000,
    saleUnitPrice: 72000,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-02',
    note: '사용 시 소멸 소모품 · 순회정비 및 출고 전 PDI 샤시 윤활 필수 구리스'
  },
  {
    id: 'CSM-FL-008',
    skuCode: 'CSM-GRS-PTFE-BOX',
    modelName: '마스트 슬라이드 고점착 테프론 구리스 박스',
    category: '구리스·방청·케미컬',
    brand: '크리톡스',
    isHandled: true,
    spec: '400g 카트리지 × 20본입 1박스 · 마스트 레일 마찰소음 방지',
    unit: '박스',
    compatibleModels: '3단 풀프리 마스트·리치트럭 마스트 레일 및 사이드시프트 슬라이더',
    inboundDate: '2026-01-12',
    initialQty: 16,
    stockQty: 11,
    saleStockQty: 3,
    repairStockQty: 8,
    minStockQty: 4,
    unitPrice: 78000,
    saleUnitPrice: 105000,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-03',
    note: '사용 시 소멸 소모품 · 3단 마스트 승하강 마찰음 제거 및 슈 마모 방지'
  },
  {
    id: 'CSM-FL-009',
    skuCode: 'CSM-CHM-CHAIN-420',
    modelName: '판형 리프트체인 침투 윤활 스프레이 420ml',
    category: '구리스·방청·케미컬',
    brand: '뷔르트',
    isHandled: true,
    spec: '420ml 에어로졸 · 고점착 침투성 체인 루브',
    unit: '캔',
    compatibleModels: '전 차종 마스트 리프트체인 BL634·BL834·BL844 핀 윤활',
    inboundDate: '2026-03-10',
    initialQty: 60,
    stockQty: 42,
    saleStockQty: 12,
    repairStockQty: 30,
    minStockQty: 15,
    unitPrice: 8500,
    saleUnitPrice: 13000,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-04',
    note: '사용 시 소멸 소모품 · 리프트체인 핀 고착 및 신축 편차 예방용'
  },
  {
    id: 'CSM-FL-010',
    skuCode: 'CSM-CHM-WD40-360',
    modelName: '다목적 방청윤활제 WD-40 360ml',
    category: '구리스·방청·케미컬',
    brand: 'WD-40',
    isHandled: true,
    spec: '360ml 스프레이 · 녹 제거·습기 차단·볼트 이완용',
    unit: '캔',
    compatibleModels: '전 장비 볼트·링크·힌지 방청 및 정비 작업 공통',
    inboundDate: '2026-03-20',
    initialQty: 80,
    stockQty: 55,
    saleStockQty: 15,
    repairStockQty: 40,
    minStockQty: 20,
    unitPrice: 5200,
    saleUnitPrice: 8000,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-05',
    note: '사용 시 소멸 소모품 · 현장 AS 기사 차량 상시 비치 방청제'
  },
  {
    id: 'CSM-FL-011',
    skuCode: 'CSM-CHM-LLC-20L',
    modelName: '사계절 부동액 냉각수 LLC 50:50 프리믹스 20L',
    category: '구리스·방청·케미컬',
    brand: '프레스톤',
    isHandled: true,
    spec: '20L 말통 · 영하 37도 동파방지 라디에이터 부식방지제 배합',
    unit: '통',
    compatibleModels: '두산·클라크·항차·헬리 디젤지게차 수냉식 라디에이터 공통',
    inboundDate: '2025-10-25',
    initialQty: 24,
    stockQty: 15,
    saleStockQty: 5,
    repairStockQty: 10,
    minStockQty: 6,
    unitPrice: 34000,
    saleUnitPrice: 48000,
    supplier: '평택항만윤활유상사',
    location: '주기장 위험물보관소 A-06',
    note: '사용 시 소멸 소모품 · 동절기 디젤지게차 냉각수 보충 및 교환용'
  },
  {
    id: 'CSM-FL-012',
    skuCode: 'CSM-CHM-DWATER-20L',
    modelName: '연축전지 배터리 보충용 고순도 정제 증류수 20L',
    category: '구리스·방청·케미컬',
    brand: '대정화금',
    isHandled: true,
    spec: '20L 노즐 내장 말통 · 이온정제 무광물 배터리 전용 증류수',
    unit: '통',
    compatibleModels: '도요타·클라크·두산 납산 딥사이클 전동지게차 배터리 셀 공통',
    inboundDate: '2026-04-02',
    initialQty: 50,
    stockQty: 38,
    saleStockQty: 14,
    repairStockQty: 24,
    minStockQty: 12,
    unitPrice: 11000,
    saleUnitPrice: 16500,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-06',
    note: '사용 시 소멸 소모품 · 납산 전동지게차 순회정비 증류수 보충용'
  },
  {
    id: 'CSM-FL-013',
    skuCode: 'CSM-CHM-LOC243-50',
    modelName: '중강도 나사고정제 록타이트 243 50ml',
    category: '구리스·방청·케미컬',
    brand: '헨켈록타이트',
    isHandled: true,
    spec: '50ml 용기 · 진동 풀림 방지 혐기성 나사고정제',
    unit: '개',
    compatibleModels: '마스트 베어링 볼트·구동축 허브볼트·카운터웨이트 볼트 고정용',
    inboundDate: '2026-01-28',
    initialQty: 20,
    stockQty: 13,
    saleStockQty: 3,
    repairStockQty: 10,
    minStockQty: 5,
    unitPrice: 24000,
    saleUnitPrice: 34000,
    supplier: '안산산업안전케미컬',
    location: '주기장 공구실 케미컬함 C-01',
    note: '사용 시 소멸 소모품 · 주요 안전볼트 진동 풀림 방지 도포용'
  },
  {
    id: 'CSM-FL-014',
    skuCode: 'CSM-CHM-RTV-100G',
    modelName: '내열 액상 실리콘 가스켓 실란트 100g',
    category: '구리스·방청·케미컬',
    brand: '쓰리본드',
    isHandled: true,
    spec: '100g 튜브 · 내유·내열 오일팬 및 기어케이스 기밀 실란트',
    unit: '개',
    compatibleModels: '미션 커버·디퍼렌셜 하우징·유압탱크 플랜지 기밀 작업 공통',
    inboundDate: '2026-02-05',
    initialQty: 25,
    stockQty: 17,
    saleStockQty: 4,
    repairStockQty: 13,
    minStockQty: 5,
    unitPrice: 13500,
    saleUnitPrice: 19500,
    supplier: '안산산업안전케미컬',
    location: '주기장 공구실 케미컬함 C-02',
    note: '사용 시 소멸 소모품 · 유압 및 기어 하우징 분해조립 시 누유 방지용'
  },

  // =========================================================================
  // 3. 장갑·안전보호구 (취급 품목)
  // =========================================================================
  {
    id: 'CSM-FL-015',
    skuCode: 'CSM-GLV-PU10-PACK',
    modelName: '폴리우레탄 손바닥 정밀 코팅장갑 10켤레 묶음',
    category: '장갑·안전보호구',
    brand: '크린가드',
    isHandled: true,
    spec: '10켤레 1묶음 · 13게이지 나일론 손바닥 PU 논슬립 코팅',
    unit: '묶음',
    compatibleModels: '전장 컨트롤러·배선 작업 및 정밀 검수 작업자 착용 소모품',
    inboundDate: '2026-03-15',
    initialQty: 60,
    stockQty: 44,
    saleStockQty: 10,
    repairStockQty: 34,
    minStockQty: 15,
    unitPrice: 9800,
    saleUnitPrice: 14500,
    supplier: '경인산업안전물류',
    location: '주기장 안전보호구함 D-01',
    note: '사용 시 소멸 소모품 · 정비사 전장·커넥터 정밀 작업용 코팅장갑'
  },
  {
    id: 'CSM-FL-016',
    skuCode: 'CSM-GLV-NIT100-BOX',
    modelName: '중량 니트릴 내유 정비장갑 블랙 100매 박스',
    category: '장갑·안전보호구',
    brand: '킴벌리클라크',
    isHandled: true,
    spec: '100매입 1박스 · 두께 6mil 유압유·구리스 내유성 일회용 장갑',
    unit: '박스',
    compatibleModels: '유압실린더 씰 교환·오일 필터 교환·구리스 주입 작업 공통',
    inboundDate: '2026-03-22',
    initialQty: 45,
    stockQty: 31,
    saleStockQty: 8,
    repairStockQty: 23,
    minStockQty: 10,
    unitPrice: 16500,
    saleUnitPrice: 24000,
    supplier: '경인산업안전물류',
    location: '주기장 안전보호구함 D-02',
    note: '사용 시 소멸 소모품 · 유압유·구리스 오염 방지용 내유 니트릴장갑'
  },
  {
    id: 'CSM-FL-017',
    skuCode: 'CSM-GLV-LATEX10-PACK',
    modelName: '특면 라텍스 이중 코팅 반코팅 목장갑 10켤레 묶음',
    category: '장갑·안전보호구',
    brand: '성진안전',
    isHandled: true,
    spec: '10켤레 1묶음 · 고밀도 면사 + 천연라텍스 손바닥 이중 코팅',
    unit: '묶음',
    compatibleModels: '포크 탈부착·타이어 교환·상하차 결박 중량물 작업 공통',
    inboundDate: '2026-04-01',
    initialQty: 80,
    stockQty: 62,
    saleStockQty: 12,
    repairStockQty: 50,
    minStockQty: 20,
    unitPrice: 7500,
    saleUnitPrice: 11000,
    supplier: '경인산업안전물류',
    location: '주기장 안전보호구함 D-03',
    note: '사용 시 소멸 소모품 · 주기장 상하차 및 중량 정비 현장 작업용 장갑'
  },
  {
    id: 'CSM-FL-018',
    skuCode: 'CSM-GLV-WINTER10-PACK',
    modelName: '동절기 방한 기모 내유 코팅 정비장갑 10켤레 묶음',
    category: '장갑·안전보호구',
    brand: '크린가드',
    isHandled: true,
    spec: '10켤레 1묶음 · 내피 기모 보온 + 외피 니트릴 방수·방유 코팅',
    unit: '묶음',
    compatibleModels: '동절기 야외 현장 AS 및 냉동창고 지게차 정비 작업용',
    inboundDate: '2025-11-10',
    initialQty: 35,
    stockQty: 20,
    saleStockQty: 5,
    repairStockQty: 15,
    minStockQty: 8,
    unitPrice: 19000,
    saleUnitPrice: 27000,
    supplier: '경인산업안전물류',
    location: '주기장 안전보호구함 D-04',
    note: '사용 시 소멸 소모품 · 냉동창고 및 겨울철 외부 출동 정비사 지급용'
  },

  // =========================================================================
  // 4. 세척·보로·전장소모재 (취급 품목)
  // =========================================================================
  {
    id: 'CSM-FL-019',
    skuCode: 'CSM-CLN-PARTS-520',
    modelName: '속건성 브레이크·파츠클리너 탈지 세척제 520ml',
    category: '세척·보로·전장소모재',
    brand: '뷔르트',
    isHandled: true,
    spec: '520ml 점보 스프레이 · 유압유·구리스·분진 속건 탈지 세척',
    unit: '캔',
    compatibleModels: '브레이크 드럼·유압밸브 블록·컨트롤러 방열판 세척 작업 공통',
    inboundDate: '2026-03-18',
    initialQty: 120,
    stockQty: 84,
    saleStockQty: 24,
    repairStockQty: 60,
    minStockQty: 30,
    unitPrice: 3800,
    saleUnitPrice: 6000,
    supplier: '안산산업안전케미컬',
    location: '주기장 소모품랙 B-07',
    note: '사용 시 소멸 소모품 · 누유 부위 세척 및 브레이크 라이닝 분진 제거용'
  },
  {
    id: 'CSM-FL-020',
    skuCode: 'CSM-CLN-WIPER-ROLL',
    modelName: '고강도 부직포 산업용 기름걸레 점보롤 와이퍼',
    category: '세척·보로·전장소모재',
    brand: '유한킴벌리',
    isHandled: true,
    spec: '850매 대형 점보롤 · 유압유·구리스 고흡수 무분진 와이퍼',
    unit: '롤',
    compatibleModels: '주기장 입고 세척·출고 PDI 닦기·정비유 제거 작업 공통',
    inboundDate: '2026-02-25',
    initialQty: 30,
    stockQty: 19,
    saleStockQty: 4,
    repairStockQty: 15,
    minStockQty: 6,
    unitPrice: 28000,
    saleUnitPrice: 39000,
    supplier: '경인산업안전물류',
    location: '주기장 소모품랙 C-03',
    note: '사용 시 소멸 소모품 · 실린더 로드 및 차체 유분 제거용 산업용 보로'
  },
  {
    id: 'CSM-FL-021',
    skuCode: 'CSM-CLN-OILPAD-100',
    modelName: '유압유 누유 방제용 초강력 유흡착패드 100매 박스',
    category: '세척·보로·전장소모재',
    brand: '쓰리엠',
    isHandled: true,
    spec: '400×500mm × 100매입 1박스 · 유분 전용 친유성 흡착포',
    unit: '박스',
    compatibleModels: '유압호스 파열 현장 방제 및 주기장 정비베이 바닥 오일 흡착용',
    inboundDate: '2026-01-30',
    initialQty: 20,
    stockQty: 14,
    saleStockQty: 4,
    repairStockQty: 10,
    minStockQty: 4,
    unitPrice: 42000,
    saleUnitPrice: 58000,
    supplier: '경인산업안전물류',
    location: '주기장 소모품랙 C-04',
    note: '사용 시 소멸 소모품 · 현장 유압호스 터짐 긴급 출동 시 바닥 방제 필수품'
  },
  {
    id: 'CSM-FL-022',
    skuCode: 'CSM-ELC-TAPE-10R',
    modelName: '난연 내한성 전장 배선 절연테이프 10롤 묶음',
    category: '세척·보로·전장소모재',
    brand: '쓰리엠',
    isHandled: true,
    spec: '19mm × 20m × 10롤 1묶음 · 영하 18도 내한 난연 PVC',
    unit: '묶음',
    compatibleModels: '경광등·후방카메라·레드라인·블루라이트 옵션 배선 마감 공통',
    inboundDate: '2026-03-08',
    initialQty: 40,
    stockQty: 29,
    saleStockQty: 5,
    repairStockQty: 24,
    minStockQty: 10,
    unitPrice: 12000,
    saleUnitPrice: 18000,
    supplier: '경인산업안전물류',
    location: '주기장 전장소모품함 E-01',
    note: '사용 시 소멸 소모품 · 안전옵션 전장 하네스 테이핑 및 절연 마감용'
  },
  {
    id: 'CSM-FL-023',
    skuCode: 'CSM-ELC-TIE300-100',
    modelName: '내열 내후성 나일론 케이블타이 300mm 100개입',
    category: '세척·보로·전장소모재',
    brand: '판듀이트',
    isHandled: true,
    spec: '폭 7.6mm × 길이 300mm × 100개입 1봉 · 마스트 호스·배선 고정용',
    unit: '봉',
    compatibleModels: '3단 마스트 카메라 배선·유압호스 가이드 결속 작업 공통',
    inboundDate: '2026-03-12',
    initialQty: 50,
    stockQty: 36,
    saleStockQty: 6,
    repairStockQty: 30,
    minStockQty: 12,
    unitPrice: 9000,
    saleUnitPrice: 13500,
    supplier: '경인산업안전물류',
    location: '주기장 전장소모품함 E-02',
    note: '사용 시 소멸 소모품 · 마스트 승하강 전장 케이블 및 유압호스 결속용'
  },
  {
    id: 'CSM-FL-024',
    skuCode: 'CSM-CHM-BATTPROT-400',
    modelName: '배터리 단자 백화·부식방지 코팅 스프레이 400ml',
    category: '구리스·방청·케미컬',
    brand: '뷔르트',
    isHandled: true,
    spec: '400ml 에어로졸 · 배터리 터미널 황산염 백화 차단 피막제',
    unit: '캔',
    compatibleModels: '전동·디젤 지게차 배터리 단자 및 고전류 버스바 접속부 공통',
    inboundDate: '2026-02-20',
    initialQty: 30,
    stockQty: 21,
    saleStockQty: 5,
    repairStockQty: 16,
    minStockQty: 6,
    unitPrice: 11500,
    saleUnitPrice: 17000,
    supplier: '안산산업안전케미컬',
    location: '주기장 전장소모품함 E-03',
    note: '사용 시 소멸 소모품 · 배터리 단자 부식 및 접촉불량 방지 피막 도포용'
  },

  // =========================================================================
  // 5. 소모품 마스터 미취급 등록 품목 (isHandled: false — 마스터 조회 및 취급 전환 가능)
  // =========================================================================
  {
    id: 'CSM-FL-025',
    skuCode: 'CSM-OIL-BIO46-20L',
    modelName: '친환경 생분해성 합성 유압작동유 HEES 46 20L',
    category: '윤활유·오일류',
    brand: '파네올린',
    isHandled: false,
    spec: '20L 말통 · 식품·제약 클린룸용 생분해성 에스테르 유압유',
    unit: '통',
    compatibleModels: '제약·식품공장 클린룸 특수 전동지게차 전용',
    inboundDate: '2026-01-10',
    initialQty: 0,
    stockQty: 0,
    saleStockQty: 0,
    repairStockQty: 0,
    minStockQty: 2,
    unitPrice: 145000,
    saleUnitPrice: 195000,
    supplier: '평택항만윤활유상사',
    location: '미취급 마스터 품목',
    note: '소모품 마스터 미취급 품목 · 특수 클린룸 고객 요청 시 취급 전환'
  },
  {
    id: 'CSM-FL-026',
    skuCode: 'CSM-GRS-MOLY-15KG',
    modelName: '초고하중 이황화몰리브덴 샤시 구리스 15kg 페일',
    category: '구리스·방청·케미컬',
    brand: '모빌',
    isHandled: false,
    spec: '15kg 철제 페일통 · MoS2 3% 함유 대형 항만장비 핀 윤활제',
    unit: '통',
    compatibleModels: '10톤 이상 대형 지게차 및 리치스태커 붐 핀 전용',
    inboundDate: '2026-01-10',
    initialQty: 0,
    stockQty: 0,
    saleStockQty: 0,
    repairStockQty: 0,
    minStockQty: 2,
    unitPrice: 118000,
    saleUnitPrice: 158000,
    supplier: '평택항만윤활유상사',
    location: '미취급 마스터 품목',
    note: '소모품 마스터 미취급 품목 · 카트리지 방식 표준화로 페일통은 기본 미취급'
  },
  {
    id: 'CSM-FL-027',
    skuCode: 'CSM-GLV-KEVLAR-PAIR',
    modelName: '케블라 아라미드 방검·내열 안전장갑 레벨5',
    category: '장갑·안전보호구',
    brand: '안셀',
    isHandled: false,
    spec: '1켤레 · EN388 베임방지 레벨5 및 접촉열 250도 방호',
    unit: '켤레',
    compatibleModels: '특수 용접·절단 및 고온 배기매니폴드 수리 작업용',
    inboundDate: '2026-01-10',
    initialQty: 0,
    stockQty: 0,
    saleStockQty: 0,
    repairStockQty: 0,
    minStockQty: 5,
    unitPrice: 18500,
    saleUnitPrice: 26000,
    supplier: '경인산업안전물류',
    location: '미취급 마스터 품목',
    note: '소모품 마스터 미취급 품목 · 필요 시 취급 전환 후 발주'
  },
  {
    id: 'CSM-FL-028',
    skuCode: 'CSM-CHM-CONTACT-300',
    modelName: '무잔류 정밀 전자기판 접점부활제 스프레이 300ml',
    category: '세척·보로·전장소모재',
    brand: 'CRC',
    isHandled: false,
    spec: '300ml 에어로졸 · 컨트롤러 PCB 및 조이스틱 포텐셔미터 세척용',
    unit: '캔',
    compatibleModels: '커티스·인파워 컨트롤러 커넥터 핀 및 디스플레이 기판 세척',
    inboundDate: '2026-01-10',
    initialQty: 0,
    stockQty: 0,
    saleStockQty: 0,
    repairStockQty: 0,
    minStockQty: 6,
    unitPrice: 14000,
    saleUnitPrice: 21000,
    supplier: '안산산업안전케미컬',
    location: '미취급 마스터 품목',
    note: '소모품 마스터 미취급 품목 · 전장 정밀 세척 소요 발생 시 취급 전환'
  },
  {
    id: 'CSM-FL-029',
    skuCode: 'CSM-CHM-EPOXY-200G',
    modelName: '금속 균열 긴급 보수용 스틸 에폭시 퍼티 200g',
    category: '구리스·방청·케미컬',
    brand: '데브콘',
    isHandled: false,
    spec: '200g 세트 · 주물 하우징 미세 크랙 긴급 패치용 금속퍼티',
    unit: '세트',
    compatibleModels: '주물 케이스 임시 응급 보수용',
    inboundDate: '2026-01-10',
    initialQty: 0,
    stockQty: 0,
    saleStockQty: 0,
    repairStockQty: 0,
    minStockQty: 2,
    unitPrice: 38000,
    saleUnitPrice: 52000,
    supplier: '안산산업안전케미컬',
    location: '미취급 마스터 품목',
    note: '소모품 마스터 미취급 품목 · 정식 신품 교체를 원칙으로 하여 미취급 분류'
  },
  {
    id: 'CSM-FL-030',
    skuCode: 'CSM-CLN-HANDSOAP-4KG',
    modelName: '정비사 기름때 제거용 스크럽 핸드클리너 4kg 펌프형',
    category: '세척·보로·전장소모재',
    brand: '록타이트',
    isHandled: false,
    spec: '4kg 펌프 용기 · 천연 오렌지 오일 및 미세 스크럽 입자 함유',
    unit: '통',
    compatibleModels: '주기장 정비동 세면장 비치용',
    inboundDate: '2026-01-10',
    initialQty: 0,
    stockQty: 0,
    saleStockQty: 0,
    repairStockQty: 0,
    minStockQty: 3,
    unitPrice: 29000,
    saleUnitPrice: 41000,
    supplier: '경인산업안전물류',
    location: '미취급 마스터 품목',
    note: '소모품 마스터 미취급 품목 · 취급 전환 시 구매입고 활성화'
  }
];

function computeBaseAgingMonths(inboundYm: string, baseYm = '2026-04'): number {
  const [iy, im] = inboundYm.split('-').map(n => parseInt(n, 10));
  const [by, bm] = baseYm.split('-').map(n => parseInt(n, 10));
  return Math.max(0, (by - iy) * 12 + (bm - im));
}

export const SEED_GENUINE_CONSUMABLES: GenuineConsumableSeed[] = RAW_CONSUMABLE_MASTER_ITEMS.map((item) => {
  const inboundYm = item.inboundDate.slice(0, 7);
  const agingMonths = computeBaseAgingMonths(inboundYm, '2026-04');
  const initialAmount = item.initialQty * item.unitPrice;
  const stockBalanceAmount = item.stockQty * item.unitPrice;
  return {
    id: item.id,
    skuCode: item.skuCode,
    name: item.modelName,
    partName: item.modelName,
    modelName: item.modelName,
    category: item.category,
    brand: item.brand,
    manufacturer: item.brand,
    isHandled: item.isHandled,
    inventoryAssetClass: 'CONSUMABLE',
    usagePurpose: 'DUAL_USE',
    inventoryType: '소모품',
    currency: 'KRW',
    compatibleModels: item.compatibleModels,
    spec: item.spec,
    unit: item.unit,
    baseYm: '2026-04',
    inboundDate: item.inboundDate,
    inboundYm,
    agingMonths,
    initialQty: item.initialQty,
    initialAmount,
    stockQty: item.stockQty,
    currentStock: item.stockQty,
    saleStockQty: item.saleStockQty,
    repairStockQty: item.repairStockQty,
    minStockQty: item.minStockQty,
    safetyStock: item.minStockQty,
    unitPrice: item.unitPrice,
    exactUnitCost: item.unitPrice,
    stockBalanceAmount,
    saleUnitPrice: item.saleUnitPrice,
    salePrice: item.saleUnitPrice,
    supplier: item.supplier,
    vendorId: 'VND-FL-004',
    location: item.location,
    note: item.note,
    createdAt: `${item.inboundDate}T09:00:00.000Z`,
    updatedAt: '2026-04-15T09:00:00.000Z'
  };
});

export const SEED_GENUINE_CONSUMABLE_LOTS = SEED_GENUINE_CONSUMABLES
  .filter(c => c.isHandled && c.stockQty > 0)
  .map((c, idx) => ({
    id: `LOT-CSM-${String(idx + 1).padStart(3, '0')}`,
    consumableId: c.id,
    lotNo: `LOT-${c.inboundYm.replace('-', '')}-${String(idx + 1).padStart(3, '0')}`,
    skuCode: c.skuCode,
    modelName: c.modelName,
    brand: c.brand,
    category: c.category,
    inventoryType: '소모품',
    currency: 'KRW',
    vendorId: c.vendorId,
    inboundDate: c.inboundDate,
    receivedDate: c.inboundDate,
    inboundYm: c.inboundYm,
    baseYm: c.baseYm,
    agingMonths: c.agingMonths,
    unitPrice: c.unitPrice,
    exactUnitCost: c.exactUnitCost,
    initialQty: c.initialQty,
    currentQty: c.stockQty,
    remainingQty: c.stockQty,
    initialAmount: c.initialAmount,
    stockBalanceAmount: c.stockBalanceAmount,
    location: c.location,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));

export const SEED_GENUINE_CONSUMABLE_LOGS = SEED_GENUINE_CONSUMABLES
  .filter(c => c.isHandled && c.initialQty > 0)
  .flatMap((c, idx) => {
    const logs: any[] = [
      {
        id: `CLOG-IN-${String(idx + 1).padStart(3, '0')}`,
        consumableId: c.id,
        lotId: `LOT-CSM-${String(idx + 1).padStart(3, '0')}`,
        skuCode: c.skuCode,
        modelName: c.modelName,
        brand: c.brand,
        category: c.category,
        type: 'INBOUND' as const,
        quantity: c.initialQty,
        unitPrice: c.unitPrice,
        totalAmount: c.initialAmount,
        supplier: c.supplier,
        vendorId: c.vendorId,
        fromLocation: c.supplier,
        toLocation: c.location,
        actionDate: c.inboundDate,
        inboundYm: c.inboundYm,
        description: `소모품 정기 구매 입고 (${c.spec})`,
        createdAt: c.createdAt
      }
    ];
    const usedQty = c.initialQty - c.stockQty;
    if (usedQty > 0) {
      logs.push({
        id: `CLOG-OUT-${String(idx + 1).padStart(3, '0')}`,
        consumableId: c.id,
        lotId: `LOT-CSM-${String(idx + 1).padStart(3, '0')}`,
        skuCode: c.skuCode,
        modelName: c.modelName,
        brand: c.brand,
        category: c.category,
        type: 'OUTBOUND' as const,
        quantity: usedQty,
        unitPrice: c.unitPrice,
        totalAmount: usedQty * c.unitPrice,
        supplier: c.supplier,
        vendorId: c.vendorId,
        fromLocation: c.location,
        toLocation: '주기장 정비동 및 현장 순회정비 소모',
        actionDate: '2026-04-10',
        inboundYm: '2026-04',
        description: `지게차 정기점검 및 현장 정비 소모 (${usedQty}${c.unit} 사용 소멸)`,
        createdAt: '2026-04-10T14:00:00.000Z'
      });
    }
    return logs;
  });

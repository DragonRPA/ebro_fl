/**
 * src/data/flTechnicalArchive.ts
 * 유명 지게차 제조사(헬리, 비와이디, 항차, 이피, 현대, 두산, 클라크, 도요타)
 * 공식 기술제원, 카탈로그, 운전·정비 매뉴얼, 안전인증 및 호환부품 아카이브 SSOT
 */

export interface FlArchivedDocument {
  id: string;
  docCategory: 'BROCHURE' | 'OPERATOR_MANUAL' | 'SPEC_SHEET' | 'SAFETY_CERT' | 'PARTS_WARRANTY';
  docCategoryLabel: string;
  title: string;
  docNo: string;
  language: string;
  pageCount: number;
  fileSizeLabel: string;
  issuedDate: string;
  r2Url: string;
  localUrl?: string;
  summary: string;
}

export interface FlCompatiblePartSpec {
  partCode: string;
  partName: string;
  category: string;
  replacementCycle: string;
  LinkedSkuCode?: string;
}

export interface FlModelTechnicalSpec {
  id: string;
  manufacturerCode: 'HELI' | 'BYD' | 'HANGCHA' | 'EP' | 'HYUNDAI' | 'DOOSAN' | 'CLARK' | 'TOYOTA';
  manufacturerName: string;
  originCountry: string;
  modelName: string;
  seriesName: string;
  linkedSkuCode?: string;
  equipmentClass: '전동 좌승식 카운터밸런스' | '디젤 카운터밸런스' | '전동 파레트트럭' | '전동 입승식 리치트럭';
  powerType: '리튬인산철 전동' | '납산배터리 전동' | '디젤 내연기관';
  ratedCapacityKg: number;
  loadCenterMm: number;
  standardLiftHeightMm: number;
  maxOptionLiftHeightMm: number;
  freeLiftHeightMm: number;
  forkDimensionsMm: string;
  overallLengthMm: number;
  overallWidthMm: number;
  overheadGuardHeightMm: number;
  turningRadiusMm: number;
  aisleWidth1000x1200Mm: number;
  travelSpeedKmh: string;
  liftingSpeedMms: string;
  gradeabilityPercent: number;
  serviceWeightKg: number;
  powerSpecDetail: string;
  motorOrEngineDetail: string;
  chargerOrFuelDetail: string;
  tireSpecFrontRear: string;
  brakeType: string;
  waterproofRating: string;
  warrantyTerms: string;
  safetyFeatures: string[];
  dailyChecklist: string[];
  periodicMaintenance: string[];
  compatibleParts: FlCompatiblePartSpec[];
  documents: FlArchivedDocument[];
}

const R2_BASE = 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev/FL_doc';

export const FL_TECHNICAL_ARCHIVE: FlModelTechnicalSpec[] = [
  {
    id: 'FL-SPEC-HELI-CPD25-GB2LI',
    manufacturerCode: 'HELI',
    manufacturerName: '안후이 헬리',
    originCountry: '중국 수입',
    modelName: 'CPD25-GB2Li',
    seriesName: 'G2 시리즈 리튬전동 2.5톤',
    linkedSkuCode: 'FL-HELI-CPD25',
    equipmentClass: '전동 좌승식 카운터밸런스',
    powerType: '리튬인산철 전동',
    ratedCapacityKg: 2500,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 4700,
    freeLiftHeightMm: 1480,
    forkDimensionsMm: '40 × 122 × 1,070',
    overallLengthMm: 2485,
    overallWidthMm: 1180,
    overheadGuardHeightMm: 2140,
    turningRadiusMm: 2120,
    aisleWidth1000x1200Mm: 3845,
    travelSpeedKmh: '18.0 / 19.0',
    liftingSpeedMms: '460 / 540',
    gradeabilityPercent: 20,
    serviceWeightKg: 3980,
    powerSpecDetail: '80V / 271Ah 리튬인산철 배터리팩 기본 · 404Ah 대용량 옵션',
    motorOrEngineDetail: '주행 AC 16.6kW + 유압 인양 AC 24.0kW 브러시리스 교류모터',
    chargerOrFuelDetail: '80V 130A 급속 충전기 · 1.5~2시간 완충 및 기회충전 지원',
    tireSpecFrontRear: '전륜 7.00-12-12PR / 후륜 6.00-9-10PR 솔리드·공기압 겸용',
    brakeType: '습식 디스크 브레이크 + 회생제동 시스템',
    waterproofRating: 'IPX4 전천후 우천 야외 작업 방수등급',
    warrantyTerms: '리튬배터리·BMS 5년 또는 10,000시간 / 차체·구동계 2년',
    safetyFeatures: [
      '배터리 저온 자동 히팅 시스템 내장 — 동절기 냉동·야외 시동 보장',
      '운전자 착석 감지 인터록 및 커브길 자동 감속 제어',
      '마스트 하강 완충 밸브 및 후방 청색 안전 스팟라이트'
    ],
    dailyChecklist: [
      '작업 전 계기판 BMS 배터리 잔량, 셀 온도 및 절연 경보등 점등 여부 확인',
      '3단 마스트 체인 장력 균일도 및 사이드시프트 실린더 유압유 누유 점검',
      '급속 충전 커넥터 핀 손상 여부 및 비상전원 차단 스위치 작동 확인'
    ],
    periodicMaintenance: [
      '최초 200시간: 구동 액슬 기어오일 점검 및 휠 너트 규정 토크 재체결',
      '매 1,000시간: 유압 리턴 필터 엘리먼트 교환 및 마스트 롤러 그리스 주입',
      '매 2,000시간: 유압작동유 전체 교환 및 브레이크 오일 라인 점검'
    ],
    compatibleParts: [
      { partCode: 'PT-LFP80271', partName: '80V 271Ah 지게차 리튬인산철 배터리팩', category: '배터리/전장', replacementCycle: '10,000시간 / 4,000사이클', LinkedSkuCode: 'PT-LFP80271' },
      { partCode: 'PT-CASCADE-SS25', partName: '캐스케이드 2.5톤~3톤 사이드시프트 어태치먼트', category: '유압/어태치먼트', replacementCycle: '상시 장착 옵션', LinkedSkuCode: 'PT-CASCADE-SS25' },
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 두께 10% 감소 시', LinkedSkuCode: 'PT-FORK-1220' },
      { partCode: 'PT-SOLID70012', partName: '지게차 노마킹 솔리드 타이어 7.00-12', category: '타이어/휠', replacementCycle: '마모한계선 도달 시', LinkedSkuCode: 'PT-SOLID70012' }
    ],
    documents: [
      {
        id: 'DOC-HELI-CPD25-01',
        docCategory: 'SPEC_SHEET',
        docCategoryLabel: '공식 제원표 · 정비지침',
        title: '안후이 헬리 G2 시리즈 CPD25-GB2Li 공식 기술제원표 및 예방정비 지침서',
        docNo: 'DOC-HELI-G2-CPD25-2026',
        language: '한국어 / 영문 병행',
        pageCount: 1,
        fileSizeLabel: '12 KB',
        issuedDate: '2026-03-15',
        r2Url: `${R2_BASE}/HELI_CPD25_G2_Lithium_SpecSheet.pdf`,
        localUrl: '/archive/fl-docs/HELI_CPD25_G2_Lithium_SpecSheet.pdf',
        summary: 'VDI 2198 국제규격 기준 CPD25-GB2Li 치수·하중·80V 리튬인산철 배터리 사양 및 일일/정기 점검 기준 수록'
      }
    ]
  },
  {
    id: 'FL-SPEC-BYD-ECB30C',
    manufacturerCode: 'BYD',
    manufacturerName: '비와이디',
    originCountry: '중국 수입',
    modelName: 'ECB30C',
    seriesName: 'ECB 시리즈 80V 리튬 카운터밸런스 3.0톤',
    linkedSkuCode: 'FL-BYD-ECB30',
    equipmentClass: '전동 좌승식 카운터밸런스',
    powerType: '리튬인산철 전동',
    ratedCapacityKg: 3000,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 6000,
    freeLiftHeightMm: 1450,
    forkDimensionsMm: '45 × 125 × 1,070',
    overallLengthMm: 2630,
    overallWidthMm: 1228,
    overheadGuardHeightMm: 2150,
    turningRadiusMm: 2290,
    aisleWidth1000x1200Mm: 4065,
    travelSpeedKmh: '18.0 / 18.0',
    liftingSpeedMms: '420 / 500',
    gradeabilityPercent: 20,
    serviceWeightKg: 4950,
    powerSpecDetail: '80V / 270Ah 또는 540Ah 비와이디 자체생산 리튬인산철 블레이드 셀',
    motorOrEngineDetail: '듀얼 AC 구동모터 + 고효율 유압 펌프 모터',
    chargerOrFuelDetail: '80V 100A/200A 초급속 충전기 · 측면 충전구 개방 없이 1시간 급속충전',
    tireSpecFrontRear: '전륜 28×9-15 / 후륜 6.50-10 슈퍼엘라스틱 통타이어',
    brakeType: '오일 냉각식 습식 디스크 브레이크',
    waterproofRating: 'IPX4 방수·방진 설계',
    warrantyTerms: '비와이디 리튬인산철 배터리 8년 또는 10,000시간 보증',
    safetyFeatures: [
      '코너링 자동 속도 제어 및 과부하 전자식 리프트 제한 센서',
      '경사로 밀림 방지 보조 및 운전자 이석 시 주행·유압 자동 잠금',
      '다기능 컬러 TFT 디스플레이 — 실시간 하중·배터리 잔량·고장코드 표시'
    ],
    dailyChecklist: [
      '측면 고속 충전 소켓 내부 이물질 확인 및 충전 케이블 절연 피복 점검',
      '듀얼 구동륜 감속기 소음 여부 및 습식 브레이크 페달 유격 확인',
      '헤드가드 볼트 체결 상태 및 전·후방 작업등, 후진 부저 작동 확인'
    ],
    periodicMaintenance: [
      '매 500시간: 마스트 가이드 레일 그리스 도포 및 리프트 체인 신장률 측정',
      '매 1,000시간: 유압 탱크 브리더 필터 및 리턴 오일필터 교체',
      '매 2,000시간: 감속기 오일 및 유압유 전체 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-LFP80271', partName: '80V 271Ah 지게차 리튬인산철 배터리팩', category: '배터리/전장', replacementCycle: '10,000시간', LinkedSkuCode: 'PT-LFP80271' },
      { partCode: 'PT-CASCADE-SS25', partName: '캐스케이드 2.5톤~3톤 사이드시프트 어태치먼트', category: '유압/어태치먼트', replacementCycle: '상시 장착 옵션', LinkedSkuCode: 'PT-CASCADE-SS25' },
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' }
    ],
    documents: [
      {
        id: 'DOC-BYD-ECB30-01',
        docCategory: 'BROCHURE',
        docCategoryLabel: '공식 카탈로그 · 제원서 원본',
        title: '비와이디 ECB30 / ECB35 80V 리튬인산철 지게차 공식 브로슈어 및 마스트 제원표',
        docNo: 'BYD-EU-ECB3035-2019',
        language: '영문 원본 + 한국어 요약',
        pageCount: 4,
        fileSizeLabel: '710 KB',
        issuedDate: '2025-11-20',
        r2Url: `${R2_BASE}/BYD_ECB30_Specification.pdf`,
        localUrl: '/archive/fl-docs/BYD_ECB30_Specification.pdf',
        summary: '비와이디 본사 공식 발행 ECB30/ECB35 시리즈 카탈로그 원본. 2단/3단 마스트 높이별 잔여하중표 및 배터리 사양 수록'
      }
    ]
  },
  {
    id: 'FL-SPEC-HANGCHA-CPCD35',
    manufacturerCode: 'HANGCHA',
    manufacturerName: '항차그룹',
    originCountry: '중국 수입',
    modelName: 'CPCD35-XRG2',
    seriesName: 'X 시리즈 3.5톤 디젤 카운터밸런스',
    linkedSkuCode: 'FL-HC-CPCD35',
    equipmentClass: '디젤 카운터밸런스',
    powerType: '디젤 내연기관',
    ratedCapacityKg: 3500,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 4500,
    freeLiftHeightMm: 145,
    forkDimensionsMm: '50 × 125 × 1,070',
    overallLengthMm: 2810,
    overallWidthMm: 1225,
    overheadGuardHeightMm: 2110,
    turningRadiusMm: 2460,
    aisleWidth1000x1200Mm: 4290,
    travelSpeedKmh: '19.0 / 19.5',
    liftingSpeedMms: '440 / 480',
    gradeabilityPercent: 20,
    serviceWeightKg: 4720,
    powerSpecDetail: '커민스·신차이·구보타 Stage-V 디젤 엔진 · DPF+DOC 장착',
    motorOrEngineDetail: '정격출력 42.6kW / 2,400rpm · 배기량 2,670cc 고토크 커먼레일 엔진',
    chargerOrFuelDetail: '연료탱크 용량 70L · 유체식 토크컨버터 전진1단/후진1단 자동변속기',
    tireSpecFrontRear: '전륜 28×9-15-14PR / 후륜 6.50-10-10PR 중량물 타이어',
    brakeType: '유압 부스터 서보 브레이크',
    waterproofRating: '야외 야적장·건설자재·목재소 전천후 운용',
    warrantyTerms: '1년 또는 2,000가동시간 (엔진·변속기 주요부품 2년)',
    safetyFeatures: [
      '마스트 소프트 랜딩 시스템 — 바닥 충격 및 적재물 파손 방지',
      '대용량 알루미늄 판형 라디에이터 탑재로 하절기 연속 중작업 과열 방지',
      'DPF 매연저감장치 수동/자동 재생 알림 시스템'
    ],
    dailyChecklist: [
      '시동 전 엔진오일 레벨 게이지, 냉각수 보조탱크 수위 및 연료 수분분리기 점검',
      '에어클리너 엘리먼트 분진 막힘 상태 및 DPF 차압 경고등 확인',
      '전·후륜 타이어 공기압/균열 점검 및 림 볼트 풀림 확인'
    ],
    periodicMaintenance: [
      '매 250~500시간: 엔진오일 및 오일필터, 연료필터 엘리먼트 세트 교환',
      '매 1,000시간: 토크컨버터 미션오일 및 디퍼렌셜 기어오일 교환',
      '매 3,000시간: DPF 매연저감 필터 클리닝 및 인젝터 분사압 점검'
    ],
    compatibleParts: [
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' },
      { partCode: 'PT-CASCADE-SS25', partName: '캐스케이드 2.5톤~3톤 사이드시프트 어태치먼트', category: '유압/어태치먼트', replacementCycle: '상시 장착 옵션', LinkedSkuCode: 'PT-CASCADE-SS25' }
    ],
    documents: [
      {
        id: 'DOC-HC-CPCD35-01',
        docCategory: 'SPEC_SHEET',
        docCategoryLabel: '공식 제원표 · 정비지침',
        title: '항차그룹 X시리즈 CPCD35-XRG2 3.5톤 디젤지게차 공식 제원 및 엔진·DPF 관리 매뉴얼',
        docNo: 'DOC-HC-X-CPCD35-2026',
        language: '한국어 / 영문 병행',
        pageCount: 1,
        fileSizeLabel: '12 KB',
        issuedDate: '2026-02-10',
        r2Url: `${R2_BASE}/HANGCHA_CPCD35_XRG2_Diesel_SpecSheet.pdf`,
        localUrl: '/archive/fl-docs/HANGCHA_CPCD35_XRG2_Diesel_SpecSheet.pdf',
        summary: 'CPCD35-XRG2 3.5톤 디젤지게차 치수·인상능력·Stage-V 엔진 제원 및 DPF 재생 주기 관리 수록'
      }
    ]
  },
  {
    id: 'FL-SPEC-HANGCHA-CPD25-XEY2',
    manufacturerCode: 'HANGCHA',
    manufacturerName: '항차그룹',
    originCountry: '중국 수입',
    modelName: 'CPD25-XEY2-SI',
    seriesName: 'XE 시리즈 영구자석 동기모터 리튬 2.5톤',
     equipmentClass: '전동 좌승식 카운터밸런스',
    powerType: '리튬인산철 전동',
    ratedCapacityKg: 2500,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 4500,
    freeLiftHeightMm: 1450,
    forkDimensionsMm: '40 × 122 × 1,070',
    overallLengthMm: 2490,
    overallWidthMm: 1150,
    overheadGuardHeightMm: 2135,
    turningRadiusMm: 2150,
    aisleWidth1000x1200Mm: 3860,
    travelSpeedKmh: '16.0 / 17.0',
    liftingSpeedMms: '430 / 550',
    gradeabilityPercent: 18,
    serviceWeightKg: 3820,
    powerSpecDetail: '80V / 230Ah CATL 리튬인산철 배터리셀 모듈 · 280Ah/410Ah 선택 가능',
    motorOrEngineDetail: '영구자석 동기모터 시스템 적용으로 기존 AC 모터 대비 에너지 효율 15% 향상',
    chargerOrFuelDetail: '80V 고주파 지능형 충전기 · 2시간 내 완충',
    tireSpecFrontRear: '전륜 7.00-12 / 후륜 6.00-9 솔리드 타이어',
    brakeType: '유압 드럼 브레이크 + 전자식 회생제동',
    waterproofRating: 'IPX4 전차량 방수 설계',
    warrantyTerms: 'CATL 리튬배터리 5년 또는 10,000시간 / 차체 2년',
    safetyFeatures: [
      '영구자석 동기모터 고효율 경사로 등판 및 저소음 실내외 겸용 구동',
      '배터리 과방전·과충전·단락 다중 보호 BMS 탑재'
    ],
    dailyChecklist: [
      '시동 시 컬러 계기판 내 CATL 배터리 셀 밸런싱 경고 유무 확인',
      '마스트 틸트 실린더 핀 고정 볼트 및 백레스트 변형 여부 점검'
    ],
    periodicMaintenance: [
      '매 1,000시간: 유압작동유 오염도 검사 및 리턴 필터 교환',
      '매 2,000시간: 구동 액슬 오일 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-SOLID70012', partName: '지게차 노마킹 솔리드 타이어 7.00-12', category: '타이어/휠', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-SOLID70012' }
    ],
    documents: [
      {
        id: 'DOC-HC-CPD25-01',
        docCategory: 'SPEC_SHEET',
        docCategoryLabel: '공식 제원표 · 정비지침',
        title: '항차그룹 XE시리즈 CPD25-XEY2-SI 영구자석 리튬지게차 공식 기술제원표',
        docNo: 'DOC-HC-XE-CPD25-2026',
        language: '한국어 / 영문 병행',
        pageCount: 1,
        fileSizeLabel: '11 KB',
        issuedDate: '2026-03-01',
        r2Url: `${R2_BASE}/HANGCHA_CPD25_XEY2_Lithium_SpecSheet.pdf`,
        localUrl: '/archive/fl-docs/HANGCHA_CPD25_XEY2_Lithium_SpecSheet.pdf',
        summary: 'CATL 리튬인산철 셀과 영구자석 동기모터를 결합한 항차 XE시리즈 2.5톤 표준 제원서'
      }
    ]
  },
  {
    id: 'FL-SPEC-EP-EPL205Z',
    manufacturerCode: 'EP',
    manufacturerName: '항저우 이피 이큅먼트',
    originCountry: '중국 수입',
    modelName: 'EPL205Z / EPL1531',
    seriesName: 'EPL 시리즈 리튬 전동 파레트트럭 1.5톤~2.0톤',
    linkedSkuCode: 'FL-EP-EPL205',
    equipmentClass: '전동 파레트트럭',
    powerType: '리튬인산철 전동',
    ratedCapacityKg: 2000,
    loadCenterMm: 600,
    standardLiftHeightMm: 120,
    maxOptionLiftHeightMm: 200,
    freeLiftHeightMm: 120,
    forkDimensionsMm: '55 × 170 × 1,150',
    overallLengthMm: 1920,
    overallWidthMm: 714,
    overheadGuardHeightMm: 1320,
    turningRadiusMm: 1720,
    aisleWidth1000x1200Mm: 2210,
    travelSpeedKmh: '9.0 / 10.0',
    liftingSpeedMms: '50 / 60',
    gradeabilityPercent: 10,
    serviceWeightKg: 680,
    powerSpecDetail: '48V/24V 탈착식 플러그앤플레이 리튬인산철 배터리팩',
    motorOrEngineDetail: 'AC 구동모터 + 전자식 파워스티어링 조향 시스템 기본 탑재',
    chargerOrFuelDetail: '내장형·외장형 220V 단상 충전기 지원 (콘센트 직결 충전)',
    tireSpecFrontRear: '고강도 폴리우레탄 구동륜 및 탠덤 로드휠',
    brakeType: '전자기식 브레이크 + 틸러암 수직/수평 위치 자동 제동',
    waterproofRating: '물류센터·냉장창고·윙바디 상하차 실내외 겸용',
    warrantyTerms: '리튬배터리 2년 / 구동 및 유압 펌프 1년',
    safetyFeatures: [
      '틸러암 헤드 복부 충돌 방지 비상 역주행 버튼 탑재',
      '접이식 발판 및 측면 보호 가이드암 기본 제공 (입승/보행 겸용)',
      '거북이 저속 주행 모드로 협소 공간 정밀 파레트 작업 가능'
    ],
    dailyChecklist: [
      '폴리우레탄 로드휠 편마모·이물질(비닐, 노끈) 감김 여부 작업 전 확인',
      '틸러암 비상 역주행 스위치 및 경적 버튼 정상 작동 점검',
      '플러그앤플레이 배터리 잠금 래치 체결 상태 확인'
    ],
    periodicMaintenance: [
      '매 500시간: 로드휠 베어링 청소 및 유압 실린더 로드 누유 점검',
      '매 1,000시간: 구동 기어박스 오일 및 유압유 교체'
    ],
    compatibleParts: [],
    documents: [
      {
        id: 'DOC-EP-EPL1531-01',
        docCategory: 'BROCHURE',
        docCategoryLabel: '공식 카탈로그 · 제원서 원본',
        title: '이피 이큅먼트 EPL1531 리튬 전동 파레트트럭 공식 데이터시트 원본',
        docNo: 'EP-EU-EPL1531-2024',
        language: '독일어 / 영문 국제규격 원본',
        pageCount: 2,
        fileSizeLabel: '821 KB',
        issuedDate: '2025-09-01',
        r2Url: `${R2_BASE}/EP_EPL1531_Pallet_Truck_Specification.pdf`,
        localUrl: '/archive/fl-docs/EP_EPL1531_Pallet_Truck_Specification.pdf',
        summary: 'EPL 시리즈 전동 파레트트럭 VDI 2198 치수 도면 및 플러그앤플레이 리튬배터리 상세 규격표 원본'
      },
      {
        id: 'DOC-EP-EPL205Z-02',
        docCategory: 'SPEC_SHEET',
        docCategoryLabel: '공식 제원표 · 정비지침',
        title: '이피 EPL205Z 2.0톤 입승식 파레트트럭 및 EFL252 2.5톤 리튬지게차 통합 제원서',
        docNo: 'DOC-EP-LI-SERIES-2026',
        language: '한국어 / 영문 병행',
        pageCount: 1,
        fileSizeLabel: '11 KB',
        issuedDate: '2026-03-20',
        r2Url: `${R2_BASE}/EP_EPL205Z_EFL252_Lithium_SpecSheet.pdf`,
        localUrl: '/archive/fl-docs/EP_EPL205Z_EFL252_Lithium_SpecSheet.pdf',
        summary: 'EPL205Z 입승식 전동 파레트트럭과 EFL252 카운터밸런스 리튬지게차 표준 제원 및 일일점검 수칙'
      }
    ]
  },
  {
    id: 'FL-SPEC-HYUNDAI-25B9U',
    manufacturerCode: 'HYUNDAI',
    manufacturerName: '현대제뉴인 · HD현대사이트솔루션',
    originCountry: '국내 매입',
    modelName: '25B-9U',
    seriesName: '9U 시리즈 4륜 전동 카운터밸런스 2.5톤',
    equipmentClass: '전동 좌승식 카운터밸런스',
    powerType: '납산배터리 전동',
    ratedCapacityKg: 2500,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 4700,
    freeLiftHeightMm: 1470,
    forkDimensionsMm: '45 × 100 × 1,050',
    overallLengthMm: 2352,
    overallWidthMm: 1160,
    overheadGuardHeightMm: 2160,
    turningRadiusMm: 2019,
    aisleWidth1000x1200Mm: 3720,
    travelSpeedKmh: '16.1 / 18.2',
    liftingSpeedMms: '390 / 590',
    gradeabilityPercent: 22,
    serviceWeightKg: 4296,
    powerSpecDetail: '48V / 725Ah 대용량 딥사이클 납산배터리 (리튬이온 전환 옵션 지원)',
    motorOrEngineDetail: 'ZAPI 듀얼 AC 컨트롤러 · 주행 12.0kW / 유압 18.0kW 고출력 모터',
    chargerOrFuelDetail: '380V 3상 정류기 충전기 · 자동 증류수 보충장치 선택 가능',
    tireSpecFrontRear: '전륜 23×9-10 / 후륜 18×7-8 솔리드 통타이어',
    brakeType: '밀폐형 습식 디스크 브레이크',
    waterproofRating: '실내외 물류창고 및 제조공장 표준 방진·방적 설계',
    warrantyTerms: '국내 공식 2년 또는 3,000시간 보증',
    safetyFeatures: [
      'OPSS 운전자 착석 감지 주행·마스트 인터록 안전 시스템',
      'HAC 경사로 출발 밀림 방지 및 커브 구간 자동 감속 제어',
      '장비 기울기 및 마스트 수평 자동 멈춤 보조 기능'
    ],
    dailyChecklist: [
      '납산배터리 증류수 액면 높이 확인 및 충전 중 배터리 후드 개방 환기 준수',
      'OPSS 시트 스위치 경고음 및 경사로 자동 파킹 브레이크 작동 확인',
      '전동 파워스티어링 조향 유격 및 유압 호스 간섭 여부 점검'
    ],
    periodicMaintenance: [
      '매주: 배터리 셀 비중 측정 및 단자 백화(황산납) 청소·그리스 도포',
      '매 1,000시간: 유압 리턴 필터 교환 및 체인 윤활',
      '매 2,000시간: 습식 브레이크 액슬 오일 및 유압작동유 전체 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-CASCADE-SS25', partName: '캐스케이드 2.5톤~3톤 사이드시프트 어태치먼트', category: '유압/어태치먼트', replacementCycle: '상시 장착 옵션', LinkedSkuCode: 'PT-CASCADE-SS25' },
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' }
    ],
    documents: [
      {
        id: 'DOC-HYUNDAI-25B9U-01',
        docCategory: 'SPEC_SHEET',
        docCategoryLabel: '공식 제원표 · 정비지침',
        title: 'HD현대사이트솔루션 25B-9U 2.5톤 전동지게차 공식 기술제원표 및 정비기준서',
        docNo: 'DOC-HCE-25B9U-2026',
        language: '한국어 / 영문 병행',
        pageCount: 1,
        fileSizeLabel: '12 KB',
        issuedDate: '2026-01-20',
        r2Url: `${R2_BASE}/HYUNDAI_25B9U_Electric_SpecSheet.pdf`,
        localUrl: '/archive/fl-docs/HYUNDAI_25B9U_Electric_SpecSheet.pdf',
        summary: '현대 9U 시리즈 25B-9U 전동지게차 치수·회전반경·ZAPI 듀얼 AC 모터 사양 및 배터리 관리 지침'
      }
    ]
  },
  {
    id: 'FL-SPEC-HYUNDAI-30D9S',
    manufacturerCode: 'HYUNDAI',
    manufacturerName: '현대제뉴인 · HD현대사이트솔루션',
    originCountry: '국내 매입',
    modelName: '30D-9S',
    seriesName: '9S 시리즈 친환경 디젤 카운터밸런스 3.0톤',
    equipmentClass: '디젤 카운터밸런스',
    powerType: '디젤 내연기관',
    ratedCapacityKg: 3000,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 6000,
    freeLiftHeightMm: 150,
    forkDimensionsMm: '45 × 122 × 1,050',
    overallLengthMm: 2692,
    overallWidthMm: 1230,
    overheadGuardHeightMm: 2175,
    turningRadiusMm: 2426,
    aisleWidth1000x1200Mm: 4236,
    travelSpeedKmh: '18.5 / 19.6',
    liftingSpeedMms: '480 / 520',
    gradeabilityPercent: 23.9,
    serviceWeightKg: 4381,
    powerSpecDetail: '현대/구보타 친환경 디젤 엔진 · 매연저감장치 기본 탑재',
    motorOrEngineDetail: '정격출력 50kW · 2,300rpm 고토크 전자제어 커먼레일 엔진',
    chargerOrFuelDetail: '연료탱크 67L · 완전 자동 파워시프트 변속기',
    tireSpecFrontRear: '전륜 28×9-15-14PR / 후륜 6.50-10-12PR 공기압·통타이어',
    brakeType: '반영구 밀폐형 습식 디스크 브레이크',
    waterproofRating: '전천후 야외 건설·철강·물류 현장 운용',
    warrantyTerms: '국내 공식 2년 또는 3,000시간 보증',
    safetyFeatures: [
      '실시간 적재하중 측정 센서 및 과적 경보 표시등',
      '후방 광각 카메라, 후진 음성 경보기 및 레드존 라인 빔 기본 구성 가능',
      '클러치 보호 시스템으로 전·후진 급전환 시 미션 손상 원천 방지'
    ],
    dailyChecklist: [
      '연료 프리필터 수분 드레인 밸브 점검 및 라디에이터 핀 먼지 제거',
      '고부하 작업 후 시동 정지 전 3분간 공회전(터보차저 냉각) 준수',
      '마스트 틸트 각도 센서 및 주차 브레이크 경고 부저 확인'
    ],
    periodicMaintenance: [
      '매 500시간: 순정 엔진오일 · CJ-4/CK-4 저회분 DPF 전용유 및 필터 교환',
      '매 1,000시간: 미션오일, 액슬오일 및 유압 필터 교환',
      '매 3,000시간: DPF 내부 애쉬(재) 클리닝 점검'
    ],
    compatibleParts: [
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' }
    ],
    documents: [
      {
        id: 'DOC-HYUNDAI-30D9S-01',
        docCategory: 'SPEC_SHEET',
        docCategoryLabel: '공식 제원표 · 정비지침',
        title: 'HD현대사이트솔루션 30D-9S 3.0톤 디젤지게차 공식 기술제원표 및 정비기준서',
        docNo: 'DOC-HCE-30D9S-2026',
        language: '한국어 / 영문 병행',
        pageCount: 1,
        fileSizeLabel: '12 KB',
        issuedDate: '2026-01-25',
        r2Url: `${R2_BASE}/HYUNDAI_30D9S_Diesel_SpecSheet.pdf`,
        localUrl: '/archive/fl-docs/HYUNDAI_30D9S_Diesel_SpecSheet.pdf',
        summary: '현대 9S 시리즈 30D-9S 3톤 디젤지게차 치수·인상속도·Stage-V 엔진 사양 및 순정 소모품 교체 주기'
      }
    ]
  },
  {
    id: 'FL-SPEC-DOOSAN-D30S7',
    manufacturerCode: 'DOOSAN',
    manufacturerName: '두산밥캣',
    originCountry: '국내 매입',
    modelName: 'D25S-7 / D30S-7',
    seriesName: '7시리즈 디젤 카운터밸런스 2.5톤~3.3톤',
    equipmentClass: '디젤 카운터밸런스',
    powerType: '디젤 내연기관',
    ratedCapacityKg: 3000,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 6000,
    freeLiftHeightMm: 160,
    forkDimensionsMm: '45 × 125 × 1,050',
    overallLengthMm: 2690,
    overallWidthMm: 1230,
    overheadGuardHeightMm: 2185,
    turningRadiusMm: 2380,
    aisleWidth1000x1200Mm: 4165,
    travelSpeedKmh: '19.5 / 20.5',
    liftingSpeedMms: '530 / 570',
    gradeabilityPercent: 25,
    serviceWeightKg: 4390,
    powerSpecDetail: '두산 G2 D24 친환경 고효율 디젤 엔진 · 초저분진 연소기술 적용',
    motorOrEngineDetail: '정격출력 45.6kW / 2,400rpm · 전자식 커먼레일 터보 인터쿨러',
    chargerOrFuelDetail: '요소수 촉매 저감 방식으로 매연필터 막힘 없는 연속 가동 지원',
    tireSpecFrontRear: '전륜 28×9-15-14PR / 후륜 6.50-10-12PR',
    brakeType: '두산 고유 오일쿨 습식 디스크 브레이크 · 반영구 무교환 보증',
    waterproofRating: '고부하 항만·제철·건자재 야외 작업 특화',
    warrantyTerms: '습식 브레이크 디스크 5년 또는 10,000시간 보증 / 차체 2년',
    safetyFeatures: [
      '매연필터가 없는 두산 G2 초저분진 엔진으로 재생 대기시간 제로 달성',
      '밀폐형 오일냉각 디스크 브레이크 기본 적용으로 제동력 저하 방지',
      '운전자 감지 안전 시스템 및 전자식 전·후진 변속 충격 완화 밸브'
    ],
    dailyChecklist: [
      '요소수 잔량 게이지 확인 및 연료 수분분리기 경고등 점검',
      '마스트 체인 균형 및 캐리지 사이드 롤러 유격 점검',
      '후진 경보음, 경광등 및 안전벨트 인터록 스위치 작동 확인'
    ],
    periodicMaintenance: [
      '매 500시간: 두산 G2 엔진오일 및 오일필터 엘리먼트 교환',
      '매 1,000시간: 트랜스미션 오일 필터 및 유압 리턴 필터 교환',
      '매 2,000시간: ODB 브레이크 냉각 오일 및 냉각수 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' },
      { partCode: 'PT-CASCADE-SS25', partName: '캐스케이드 2.5톤~3톤 사이드시프트 어태치먼트', category: '유압/어태치먼트', replacementCycle: '상시 장착 옵션', LinkedSkuCode: 'PT-CASCADE-SS25' }
    ],
    documents: [
      {
        id: 'DOC-DOOSAN-D30S7-01',
        docCategory: 'BROCHURE',
        docCategoryLabel: '공식 카탈로그 · 제원서 원본',
        title: '두산밥캣 7시리즈 D20S-7 / D25S-7 / D30S-7 / D33S-7 공식 기술 브로슈어 원본',
        docNo: 'DOOSAN-7SERIES-32717',
        language: '영문 원본 + 한국어 요약',
        pageCount: 12,
        fileSizeLabel: '2.21 MB',
        issuedDate: '2025-10-12',
        r2Url: `${R2_BASE}/DOOSAN_7Series_Diesel_D25S7_D30S7_Brochure.pdf`,
        localUrl: '/archive/fl-docs/DOOSAN_7Series_Diesel_D25S7_D30S7_Brochure.pdf',
        summary: '두산 7시리즈 디젤지게차 12페이지 카탈로그 및 VDI 상세 제원표 원본 · G2 엔진·ODB 브레이크·마스트 조견표 포함'
      }
    ]
  },
  {
    id: 'FL-SPEC-CLARK-GTS25',
    manufacturerCode: 'CLARK',
    manufacturerName: '클라크 머티리얼 핸들링',
    originCountry: '국내 매입',
    modelName: 'GTS25 / GTS30 / GTS33',
    seriesName: 'GTS 시리즈 내연기관 카운터밸런스 2.5톤~3.3톤',
    equipmentClass: '디젤 카운터밸런스',
    powerType: '디젤 내연기관',
    ratedCapacityKg: 2500,
    loadCenterMm: 500,
    standardLiftHeightMm: 3100,
    maxOptionLiftHeightMm: 6000,
    freeLiftHeightMm: 155,
    forkDimensionsMm: '45 × 122 × 1,070',
    overallLengthMm: 2635,
    overallWidthMm: 1225,
    overheadGuardHeightMm: 2165,
    turningRadiusMm: 2320,
    aisleWidth1000x1200Mm: 4095,
    travelSpeedKmh: '18.5 / 19.2',
    liftingSpeedMms: '490 / 530',
    gradeabilityPercent: 23,
    serviceWeightKg: 4120,
    powerSpecDetail: '얀마 4TNV94L / 구보타 V2403 디젤 엔진 또는 2.4L LPG 엔진',
    motorOrEngineDetail: '일체형 고강성 프레임 및 중첩식 마스트 레일 구조',
    chargerOrFuelDetail: '분리형 트랜스액슬 구조로 진동·소음 저감 및 정비성 극대화',
    tireSpecFrontRear: '전륜 7.00-12-12PR / 후륜 6.00-9-10PR',
    brakeType: '밀폐형 습식 디스크 브레이크 기본 장착',
    waterproofRating: '전천후 산업현장 운용',
    warrantyTerms: '2년 또는 2,000시간 공식 보증',
    safetyFeatures: [
      '클라크 고유 중첩식 마스트 레일 및 6롤러 캐리지로 고소 인상 시 흔들림 최소화',
      '운전자 착석 감지 시트 스위치 및 안전벨트 순서 인터록 탑재'
    ],
    dailyChecklist: [
      '클라크 공식 오퍼레이터 매뉴얼 기준 시동 전 12대 안전점검 항목 이행',
      '마스트 체인 앵커 핀 분할핀 고정 상태 및 포크 락핀 작동 점검',
      '냉각수 보조탱크, 브레이크 리저버 오일량 및 타이어 외관 점검'
    ],
    periodicMaintenance: [
      '매 250시간: 엔진오일 점검 및 그리스 니플 8개소 윤활',
      '매 500시간: 엔진오일·필터, 연료필터 교환',
      '매 1,000시간: 트랜스미션 오일 및 유압 필터 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-SOLID70012', partName: '지게차 노마킹 솔리드 타이어 7.00-12', category: '타이어/휠', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-SOLID70012' }
    ],
    documents: [
      {
        id: 'DOC-CLARK-GTS-01',
        docCategory: 'OPERATOR_MANUAL',
        docCategoryLabel: '공식 운전 · 정비 매뉴얼 원본',
        title: '클라크 GTS20 / GTS25 / GTS30 / GTS33 공식 오퍼레이터 운전·안전·예방정비 매뉴얼 풀버전 원본',
        docNo: 'CLARK-OM-GTS2033-2025',
        language: '영문 공식 매뉴얼 원본',
        pageCount: 136,
        fileSizeLabel: '13.20 MB',
        issuedDate: '2025-05-15',
        r2Url: `${R2_BASE}/CLARK_GTS25_30_33_Operator_Manual.pdf`,
        summary: '클라크 본사 발행 136페이지 전체 운전·정비 매뉴얼 원본. 안전운전 수칙, 계기판 경고등 해설, 일상점검 절차, 윤활 도표 완비'
      }
    ]
  },
  {
    id: 'FL-SPEC-TOYOTA-8FB25',
    manufacturerCode: 'TOYOTA',
    manufacturerName: '도요타 머티리얼 핸들링',
    originCountry: '해외 수입',
    modelName: '8FB25',
    seriesName: '8FB 시리즈 4륜 전동 카운터밸런스 2.5톤',
    equipmentClass: '전동 좌승식 카운터밸런스',
    powerType: '납산배터리 전동',
    ratedCapacityKg: 2500,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 6000,
    freeLiftHeightMm: 1450,
    forkDimensionsMm: '40 × 122 × 1,070',
    overallLengthMm: 2365,
    overallWidthMm: 1170,
    overheadGuardHeightMm: 2110,
    turningRadiusMm: 2010,
    aisleWidth1000x1200Mm: 3695,
    travelSpeedKmh: '16.0 / 17.5',
    liftingSpeedMms: '400 / 600',
    gradeabilityPercent: 18,
    serviceWeightKg: 4050,
    powerSpecDetail: '48V / 565Ah~730Ah 도요타 고효율 배터리 시스템 (리튬이온 옵션 지원)',
    motorOrEngineDetail: '도요타 자체설계 IPM 교류모터 + 회생제동 에너지 회수 시스템',
    chargerOrFuelDetail: '도요타 스마트 충전기 · 과충전 방지 및 이퀄라이징 균등충전 지원',
    tireSpecFrontRear: '전륜 21×8-9 / 후륜 16×6-8 솔리드 타이어',
    brakeType: '전자제어 회생제동 + 방수형 브레이크',
    waterproofRating: 'IPX4 동급 최고 수준 방수 인증 (우천 야외 상하차 가능)',
    warrantyTerms: '글로벌 표준 보증 2년 또는 3,000시간',
    safetyFeatures: [
      '도요타 특허 SAS 안전 시스템 — 선회 시 후륜 액슬 스윙 락으로 전도 사고 원천 차단',
      'AMC 액티브 마스트 컨트롤 — 고소 인상 상태에서 전경 각도 및 후경 속도 자동 제한',
      '운전자 핸들 노브 위치 자동 정렬(싱크로나이저) 기능 기본 탑재'
    ],
    dailyChecklist: [
      '시동 후 계기판 SAS 스윙 락 실린더 및 마스트 틸트 제어 경고등 자가진단 확인',
      '배터리 증류수 레벨 인디케이터 확인 및 플러그 발열 흔적 점검',
      '포크 수평 자동 정지 버튼 작동 테스트'
    ],
    periodicMaintenance: [
      '매 500시간: SAS 후륜 액슬 락 실린더 및 요레이트 센서 점검',
      '매 1,000시간: 유압 오일 필터 교환 및 마스트 롤러 유격 조정',
      '매 2,000시간: 구동 감속기 오일 및 유압유 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' }
    ],
    documents: [
      {
        id: 'DOC-TOYOTA-8FB25-01',
        docCategory: 'BROCHURE',
        docCategoryLabel: '공식 카탈로그 · 제원서 원본',
        title: '도요타 8FB 시리즈 · 1.0톤~3.5톤, 8FB25 포함 공식 기술 브로슈어 및 제원표 원본',
        docNo: 'TMHI-8FB-2212',
        language: '영문 공식 원본 + 한국어 요약',
        pageCount: 16,
        fileSizeLabel: '722 KB',
        issuedDate: '2025-12-01',
        r2Url: `${R2_BASE}/TOYOTA_8FB25_Electric_Brochure.pdf`,
        localUrl: '/archive/fl-docs/TOYOTA_8FB25_Electric_Brochure.pdf',
        summary: '도요타 머티리얼 핸들링 공식 발행 8FB 전동지게차 16페이지 브로슈어 원본 · SAS 전도방지 기술 및 전 모델 상세 제원 수록'
      }
    ]
  },
  {
    id: 'FL-SPEC-TOYOTA-8FD30',
    manufacturerCode: 'TOYOTA',
    manufacturerName: '도요타 머티리얼 핸들링',
    originCountry: '해외 수입',
    modelName: '8FD25 / 8FD30',
    seriesName: '8FG/8FD 시리즈 내연기관 카운터밸런스 1.0톤~3.5톤',
    equipmentClass: '디젤 카운터밸런스',
    powerType: '디젤 내연기관',
    ratedCapacityKg: 3000,
    loadCenterMm: 500,
    standardLiftHeightMm: 3000,
    maxOptionLiftHeightMm: 6000,
    freeLiftHeightMm: 155,
    forkDimensionsMm: '45 × 122 × 1,070',
    overallLengthMm: 2770,
    overallWidthMm: 1240,
    overheadGuardHeightMm: 2170,
    turningRadiusMm: 2430,
    aisleWidth1000x1200Mm: 4215,
    travelSpeedKmh: '18.5 / 19.0',
    liftingSpeedMms: '510 / 550',
    gradeabilityPercent: 24,
    serviceWeightKg: 4360,
    powerSpecDetail: '도요타 자체 제작 1DZ-II / 1ZS 산업용 고내구 디젤 엔진',
    motorOrEngineDetail: '높은 저속 토크와 낮은 연료소모율의 산업전용 인라인 디젤 엔진',
    chargerOrFuelDetail: '연료탱크 65L · 도요타 고내구 토크컨버터 자동변속기',
    tireSpecFrontRear: '전륜 28×9-15-12PR / 후륜 6.50-10-10PR',
    brakeType: '고신뢰성 유압 부스터 브레이크',
    waterproofRating: '전천후 산업·물류·수출입 컨테이너 현장 운용',
    warrantyTerms: '글로벌 표준 보증 2년 또는 3,000시간',
    safetyFeatures: [
      '도요타 SAS 액티브 스태빌리티 시스템 및 OPS 운전자 감지 인터록 기본 적용',
      '인체공학적 소구경 스티어링 휠 및 탁월한 전방 마스트 시야 확보'
    ],
    dailyChecklist: [
      '도요타 1DZ/1ZS 엔진 냉각수, 엔진오일량 및 팬벨트 장력 작업 전 점검',
      'SAS 경고등 정상 소등 여부 및 주차 브레이크 이중 래치 작동 점검'
    ],
    periodicMaintenance: [
      '매 500시간: 도요타 순정 디젤 엔진오일 및 오일필터 교환',
      '매 1,000시간: 토크컨버터 오일 필터 및 에어클리너 엘리먼트 교환'
    ],
    compatibleParts: [
      { partCode: 'PT-FORK-1220', partName: '지게차 중량물 단조 포크 1220mm 세트', category: '포크/마스트', replacementCycle: '마모한계 도달 시', LinkedSkuCode: 'PT-FORK-1220' }
    ],
    documents: [
      {
        id: 'DOC-TOYOTA-8FD30-01',
        docCategory: 'BROCHURE',
        docCategoryLabel: '공식 카탈로그 · 제원서 원본',
        title: '도요타 8FG / 8FD 시리즈 · 1.0톤~8.0톤, 8FD25/8FD30 포함 마스터 카탈로그 원본',
        docNo: 'TMHI-8FG8FD-MASTER',
        language: '영문 공식 원본 + 한국어 요약',
        pageCount: 28,
        fileSizeLabel: '7.52 MB',
        issuedDate: '2025-11-10',
        r2Url: `${R2_BASE}/TOYOTA_8FG_8FD30_Diesel_Brochure.pdf`,
        summary: '도요타 8시리즈 내연기관 지게차 28페이지 마스터 카탈로그 원본. 8FD25/8FD30 전 사양, 마스트별 인상하중표 및 안전사양 수록'
      }
    ]
  }
];

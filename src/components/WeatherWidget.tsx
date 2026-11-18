import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  RefreshCw,
  Snowflake,
  Sun,
} from 'lucide-react';
import { ModalDialog, VerticalField, actionBtnStyle, controlInputStyle } from './UiPrimitives';

interface WeatherRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const WEATHER_STORAGE_KEY = 'ebro_fl_weather_region_id';
const WEATHER_CACHE_STORAGE_KEY = 'ebro_fl_weather_cache_v1';
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;

const WEATHER_REGIONS: WeatherRegion[] = [
  { id: 'seoul', name: '서울', lat: 37.5665, lon: 126.978 },
  { id: 'pyeongtaek', name: '평택', lat: 36.9921, lon: 127.0858 },
  { id: 'suwon', name: '수원·경기', lat: 37.2636, lon: 127.0286 },
  { id: 'incheon', name: '인천', lat: 37.4563, lon: 126.7052 },
  { id: 'paju', name: '파주', lat: 37.7595, lon: 126.7803 },
  { id: 'yongin', name: '용인', lat: 37.2411, lon: 127.1776 },
  { id: 'cheongju', name: '청주', lat: 36.6424, lon: 127.489 },
  { id: 'gimhae', name: '김해·경남', lat: 35.2285, lon: 128.8894 },
  { id: 'busan', name: '부산', lat: 35.1796, lon: 129.0756 },
  { id: 'daegu', name: '대구', lat: 35.8714, lon: 128.6014 },
  { id: 'gwangju', name: '광주', lat: 35.1595, lon: 126.8526 },
];

function resolveWeatherMeta(code: number): {
  text: string;
  color: string;
  icon: React.ReactNode;
} {
  if (code === 0) {
    return { text: '맑음', color: '#b45309', icon: <Sun size={14} color="#d97706" /> };
  }
  if (code >= 1 && code <= 3) {
    const label = code === 1 ? '대체로 맑음' : code === 2 ? '구름 조금' : '흐림';
    return { text: label, color: 'var(--text-secondary)', icon: <CloudSun size={14} color="#64748b" /> };
  }
  if (code === 45 || code === 48) {
    return { text: '안개', color: 'var(--text-muted)', icon: <CloudFog size={14} color="#64748b" /> };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { text: '비', color: 'var(--primary)', icon: <CloudRain size={14} color="#1d4ed8" /> };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { text: '눈', color: 'var(--info)', icon: <Snowflake size={14} color="#0284c7" /> };
  }
  if (code >= 95) {
    return { text: '뇌우', color: 'var(--danger)', icon: <CloudLightning size={14} color="#dc2626" /> };
  }
  return { text: '구름', color: 'var(--text-secondary)', icon: <Cloud size={14} color="#64748b" /> };
}

interface CurrentWeatherData {
  temp: number;
  apparentTemp: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
}

interface HourlyForecast {
  time: string;
  temp: number;
  weatherCode: number;
  pop: number;
}

interface DailyForecast {
  date: string;
  dayName: string;
  maxTemp: number;
  minTemp: number;
  weatherCode: number;
  popMax: number;
}

interface CachedWeatherEntry {
  fetchedAt: number;
  current: CurrentWeatherData | null;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

const weatherMemoryCache = new Map<string, CachedWeatherEntry>();

function readWeatherCache(regionId: string): CachedWeatherEntry | null {
  const now = Date.now();
  const mem = weatherMemoryCache.get(regionId);
  if (mem && now - mem.fetchedAt < WEATHER_CACHE_TTL_MS) {
    return mem;
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, CachedWeatherEntry>;
    const entry = parsed[regionId];
    if (entry && now - entry.fetchedAt < WEATHER_CACHE_TTL_MS) {
      weatherMemoryCache.set(regionId, entry);
      return entry;
    }
  } catch {
    // 무시
  }
  return null;
}

function writeWeatherCache(regionId: string, entry: CachedWeatherEntry): void {
  weatherMemoryCache.set(regionId, entry);
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, CachedWeatherEntry>) : {};
    parsed[regionId] = entry;
    window.sessionStorage.setItem(WEATHER_CACHE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // 무시
  }
}

export const WeatherWidget: React.FC = () => {
  const [selectedRegion, setSelectedRegion] = useState<WeatherRegion>(() => {
    try {
      const savedId = window.localStorage.getItem(WEATHER_STORAGE_KEY);
      if (savedId) {
        const found = WEATHER_REGIONS.find((r) => r.id === savedId);
        if (found) return found;
      }
    } catch {
      // 무시
    }
    return WEATHER_REGIONS[0];
  });

  const [current, setCurrent] = useState<CurrentWeatherData | null>(null);
  const [hourly, setHourly] = useState<HourlyForecast[]>([]);
  const [daily, setDaily] = useState<DailyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchWeatherData = useCallback(
    async (region: WeatherRegion, forceRefresh = false, signal?: AbortSignal) => {
      if (!forceRefresh) {
        const cached = readWeatherCache(region.id);
        if (cached) {
          setCurrent(cached.current);
          setHourly(cached.hourly);
          setDaily(cached.daily);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;
        const res = await fetch(url, { signal });
        if (!res.ok) {
          throw new Error('기상 정보 조회 실패');
        }
        const data = (await res.json()) as {
          current?: {
            temperature_2m: number;
            apparent_temperature: number;
            relative_humidity_2m: number;
            wind_speed_10m: number;
            precipitation: number;
            weather_code: number;
          };
          hourly?: {
            time: string[];
            temperature_2m: number[];
            weather_code: number[];
            precipitation_probability?: number[];
          };
          daily?: {
            time: string[];
            temperature_2m_max: number[];
            temperature_2m_min: number[];
            weather_code: number[];
            precipitation_probability_max?: number[];
          };
        };

        let nextCurrent: CurrentWeatherData | null = null;
        if (data.current) {
          nextCurrent = {
            temp: Math.round(data.current.temperature_2m * 10) / 10,
            apparentTemp: Math.round(data.current.apparent_temperature * 10) / 10,
            humidity: data.current.relative_humidity_2m,
            windSpeed: data.current.wind_speed_10m,
            precipitation: data.current.precipitation,
            weatherCode: data.current.weather_code,
          };
        }

        const nextHourly: HourlyForecast[] = [];
        if (data.hourly?.time) {
          const nowHour = new Date().getHours();
          for (let i = nowHour; i < Math.min(nowHour + 24, data.hourly.time.length); i += 3) {
            const dateObj = new Date(data.hourly.time[i]);
            nextHourly.push({
              time: `${dateObj.getHours()}시`,
              temp: Math.round(data.hourly.temperature_2m[i]),
              weatherCode: data.hourly.weather_code[i],
              pop: data.hourly.precipitation_probability ? data.hourly.precipitation_probability[i] : 0,
            });
          }
        }

        const nextDaily: DailyForecast[] = [];
        if (data.daily?.time) {
          const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
          for (let i = 0; i < Math.min(7, data.daily.time.length); i++) {
            const dStr = data.daily.time[i];
            const dateObj = new Date(dStr);
            const dayLabel =
              i === 0
                ? '오늘'
                : i === 1
                  ? '내일'
                  : `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 · ${dayNames[dateObj.getDay()]}`;
            nextDaily.push({
              date: dStr,
              dayName: dayLabel,
              maxTemp: Math.round(data.daily.temperature_2m_max[i]),
              minTemp: Math.round(data.daily.temperature_2m_min[i]),
              weatherCode: data.daily.weather_code[i],
              popMax: data.daily.precipitation_probability_max
                ? data.daily.precipitation_probability_max[i]
                : 0,
            });
          }
        }

        if (signal?.aborted) return;
        setCurrent(nextCurrent);
        setHourly(nextHourly);
        setDaily(nextDaily);
        writeWeatherCache(region.id, {
          fetchedAt: Date.now(),
          current: nextCurrent,
          hourly: nextHourly,
          daily: nextDaily,
        });
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        setError('날씨 조회 실패');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchWeatherData(selectedRegion, false, controller.signal);
    return () => controller.abort();
  }, [fetchWeatherData, selectedRegion]);

  const weatherMeta = current ? resolveWeatherMeta(current.weatherCode) : null;

  return (
    <>
      <button
        type="button"
        data-testid="header-weather-widget"
        onClick={() => setModalOpen(true)}
        title="현장 기상 예보 보기"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: '28px',
          padding: '0 10px',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-main)',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: 'none',
        }}
      >
        {loading ? (
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            {selectedRegion.name} 날씨 조회중
          </span>
        ) : error || !current || !weatherMeta ? (
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            {selectedRegion.name} 날씨
          </span>
        ) : (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {weatherMeta.icon}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 700 }}>
              {selectedRegion.name}
            </span>
            <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {`${current.temp}\u2103`}
            </span>
            <span style={{ color: weatherMeta.color, fontSize: '11.5px', fontWeight: 700 }}>
              {weatherMeta.text}
            </span>
          </>
        )}
      </button>

      <ModalDialog
        open={modalOpen}
        title="현장 기상 현황 · 예보"
        onClose={() => setModalOpen(false)}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <VerticalField label="현장 지역 선택" flex={1}>
              <select
                value={selectedRegion.id}
                onChange={(e) => {
                  const found = WEATHER_REGIONS.find((r) => r.id === e.target.value);
                  if (found) {
                    setSelectedRegion(found);
                    try {
                      window.localStorage.setItem(WEATHER_STORAGE_KEY, found.id);
                    } catch {
                      // 무시
                    }
                  }
                }}
                style={controlInputStyle}
              >
                {WEATHER_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </VerticalField>
            <button
              type="button"
              onClick={() => {
                void fetchWeatherData(selectedRegion, true);
              }}
              style={actionBtnStyle('secondary')}
            >
              <RefreshCw size={13} />
              새로고침
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              날씨 정보 불러오는 중
            </div>
          ) : error ? (
            <div
              style={{
                padding: '16px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              날씨 정보를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하십시오.
            </div>
          ) : current && weatherMeta ? (
            <>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {selectedRegion.name} 현재 기온
                  </div>
                  <div
                    style={{
                      fontSize: '26px',
                      fontWeight: 800,
                      color: 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '4px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span>{`${current.temp}\u2103`}</span>
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: weatherMeta.color }}>
                      {weatherMeta.text}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    {`체감 ${current.apparentTemp}\u2103 · 습도 ${current.humidity}% · 풍속 ${current.windSpeed} m/s`}
                  </div>
                </div>
                <div style={{ transform: 'scale(1.8)', paddingRight: '10px' }}>{weatherMeta.icon}</div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Clock size={14} />
                  <span>시간대별 예보 · 24시간</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {hourly.map((h, idx) => {
                    const hMeta = resolveWeatherMeta(h.weatherCode);
                    return (
                      <div
                        key={idx}
                        style={{
                          minWidth: '64px',
                          padding: '8px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--table-row-border)',
                          backgroundColor: 'var(--bg-app)',
                          textAlign: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{h.time}</div>
                        <div style={{ margin: '5px 0', display: 'flex', justifyContent: 'center' }}>
                          {hMeta.icon}
                        </div>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {`${h.temp}\u2103`}
                        </div>
                        {h.pop > 0 && (
                          <div style={{ fontSize: '10.5px', color: 'var(--primary)', fontWeight: 700 }}>
                            {h.pop}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Calendar size={14} />
                  <span>주간 예보 · 7일</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {daily.map((d) => {
                    const dMeta = resolveWeatherMeta(d.weatherCode);
                    return (
                      <div
                        key={d.date}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--table-row-border)',
                          backgroundColor: 'var(--bg-app)',
                          fontSize: '12.5px',
                        }}
                      >
                        <span style={{ minWidth: '100px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {d.dayName}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                          {dMeta.icon}
                          <span style={{ color: dMeta.color, fontWeight: 600 }}>{dMeta.text}</span>
                          {d.popMax > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>
                              {d.popMax}%
                            </span>
                          )}
                        </span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--primary)' }}>{`${d.minTemp}\u2103`}</span>
                          {' / '}
                          <span style={{ color: 'var(--danger)' }}>{`${d.maxTemp}\u2103`}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </ModalDialog>
    </>
  );
};

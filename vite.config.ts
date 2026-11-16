import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function r2DevPlugin(): Plugin {
  return {
    name: 'r2-dev-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/r2')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, files: [] }));
          });
          return;
        }
        next();
      });
    }
  };
}

import os from 'os';
import fs from 'fs';
import path from 'path';

const LOCAL_NTS_DEFAULT_KEY =
  '7f24250bd002412aaa152a6e3ec63e556604f75be0fa9181983c33a618cb2e03';

function attachNtsStatusMiddleware(
  middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void },
  ssrLoader?: () => Promise<{ default: (mockReq: unknown, mockRes: unknown) => Promise<void> }>
) {
  middlewares.use((req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/nts-status')) {
      next();
      return;
    }
    let bodyStr = '';
    req.on('data', (chunk: Buffer) => {
      bodyStr += chunk;
    });
    req.on('end', async () => {
      try {
        const parsed = bodyStr ? JSON.parse(bodyStr) : {};
        if (ssrLoader) {
          const mod = await ssrLoader();
          let statusCode = 200;
          const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
          const mockRes = {
            setHeader: (k: string, v: string) => {
              headers[k] = v;
            },
            status: (code: number) => {
              statusCode = code;
              return mockRes;
            },
            json: (data: unknown) => {
              Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
              res.statusCode = statusCode;
              res.end(JSON.stringify(data));
            },
            end: (chunk?: string) => {
              Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
              res.statusCode = statusCode;
              res.end(chunk);
            },
          };
          await mod.default({ method: req.method || 'POST', body: parsed }, mockRes);
          return;
        }

        const rawList = Array.isArray(parsed?.b_no) ? parsed.b_no : [];
        const cleanNumbers = rawList
          .slice(0, 100)
          .map((no: unknown) => String(no || '').replace(/[^0-9]/g, ''));
        const activeKey = String(
          parsed?.serviceKey || process.env.NTS_API_KEY || process.env.PUBLIC_DATA_PORTAL_KEY || LOCAL_NTS_DEFAULT_KEY
        ).trim();
        const targetUrl = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(activeKey)}`;
        const ntsRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ b_no: cleanNumbers }),
        });
        if (!ntsRes.ok) {
          throw new Error(`NTS upstream HTTP ${ntsRes.status}`);
        }
        const json = (await ntsRes.json()) as { data?: unknown[] };
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            source: 'NTS_LIVE_API',
            totalCount: Array.isArray(json.data) ? json.data.length : 0,
            data: Array.isArray(json.data) ? json.data : [],
          })
        );
      } catch (e: any) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
      }
    });
  });
}

function ntsStatusPlugin(): Plugin {
  return {
    name: 'nts-status-plugin',
    configurePreviewServer(server) {
      attachNtsStatusMiddleware(server.middlewares);
    },
    configureServer(server) {
      attachNtsStatusMiddleware(server.middlewares, () =>
        server.ssrLoadModule('./api/nts-status.ts') as Promise<{
          default: (mockReq: unknown, mockRes: unknown) => Promise<void>;
        }>
      );
    },
  };
}

function developerDevicePlugin(): Plugin {
  return {
    name: 'developer-device-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url === '/downloads/eBroDevPCRegister.exe' || req.url.startsWith('/downloads/eBroDevPCRegister.exe'))) {
          const exePath = path.resolve(__dirname, 'public/downloads/eBroDevPCRegister.exe');
          if (fs.existsSync(exePath)) {
            res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
            res.setHeader('Content-Disposition', 'attachment; filename="eBroDevPCRegister.exe"');
            res.statusCode = 200;
            fs.createReadStream(exePath).pipe(res);
            return;
          }
        }

        if (req.url && req.url.startsWith('/api/exchange-rate')) {
          (async () => {
            try {
              const urlObj = new URL(req.url!, 'http://localhost');
              const query: Record<string, string> = {};
              urlObj.searchParams.forEach((v, k) => {
                query[k] = v;
              });
              const mod = (await server.ssrLoadModule('./api/exchange-rate.ts')) as {
                default: (mockReq: unknown, mockRes: unknown) => Promise<void>;
              };
              let statusCode = 200;
              const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
              const mockRes = {
                setHeader: (k: string, v: string) => {
                  headers[k] = v;
                },
                status: (code: number) => {
                  statusCode = code;
                  return mockRes;
                },
                json: (data: unknown) => {
                  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.statusCode = statusCode;
                  res.end(JSON.stringify(data));
                },
                end: (chunk?: string) => {
                  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.statusCode = statusCode;
                  res.end(chunk);
                },
              };
              await mod.default({ method: req.method || 'GET', query }, mockRes);
            } catch (e: any) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
            }
          })();
          return;
        }

        if (req.url && req.url.startsWith('/api/vision-ocr')) {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const parsed = bodyStr ? JSON.parse(bodyStr) : {};
              const mod = (await server.ssrLoadModule('./api/vision-ocr.ts')) as {
                default: (mockReq: unknown, mockRes: unknown) => Promise<void>;
              };
              let statusCode = 200;
              const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
              const mockRes = {
                setHeader: (k: string, v: string) => {
                  headers[k] = v;
                },
                status: (code: number) => {
                  statusCode = code;
                  return mockRes;
                },
                json: (data: unknown) => {
                  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.statusCode = statusCode;
                  res.end(JSON.stringify(data));
                },
                end: (chunk?: string) => {
                  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
                  res.statusCode = statusCode;
                  res.end(chunk);
                },
              };
              await mod.default({ method: req.method || 'POST', body: parsed }, mockRes);
            } catch (e: any) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: false, error: e?.message || String(e), data: null }));
            }
          });
          return;
        }

        if (req.url && req.url.startsWith('/api/popbill-taxinvoice')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const mod = await server.ssrLoadModule('./api/popbill-taxinvoice.ts') as {
                executePopbillTestAction: (body: unknown) => Promise<{ status: number; data: unknown }>;
              };
              const parsed = body ? JSON.parse(body) : { action: 'STATUS_CHECK' };
              const out = await mod.executePopbillTestAction(parsed);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = out.status;
              res.end(JSON.stringify(out.data));
            } catch (e: any) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                isTest: true,
                emailSendBlocked: true,
                mode: 'POPBILL_TEST_SANDBOX_FALLBACK',
                message: e?.message || '팝빌 테스트 샌드박스 응답'
              }));
            }
          });
          return;
        }

        if (req.url && req.url.startsWith('/api/device/physical-mac')) {
          try {
            const ifaces = os.networkInterfaces();
            const macs = Object.values(ifaces)
              .flat()
              .filter(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
              .map(i => i!.mac.toUpperCase().replace(/:/g, '-'));
            const uniqueMacs = [...new Set(macs)];

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              macAddresses: uniqueMacs,
              hostname: os.hostname(),
              platform: os.platform()
            }));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e?.message || String(e) }));
          }
          return;
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), r2DevPlugin(), ntsStatusPlugin(), developerDevicePlugin()],
  server: {
    port: 5174,
    watch: {
      ignored: [
        /(^|[/\\])(\.git|dist|공공데이터포탈API|ebro-agent-core|agent|public[/\\]downloads)([/\\]|$)|\.(tmp|pdf|exe|zip|log|cer|apk)$/i
      ],
    },
  },
  build: {
    sourcemap: false, // 🛡️ 역공학 방어: 프로덕션 원본 TypeScript 소스맵 완전 배제
    minify: 'esbuild',
    target: 'es2020',
    cssMinify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1500,
  },
  esbuild: {
    // 🛡️ 프로덕션 번들에서 console.log, console.debug, debugger 구문 영구 드롭
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none',
  }
})

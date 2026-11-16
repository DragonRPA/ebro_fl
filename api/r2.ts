// api/r2.ts
// Vercel Serverless Function — Cloudflare R2 클라우드 스토리지 S3 호환 API (멀티테넌트 격리 지원)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
  type ListObjectsV2CommandOutput
} from '@aws-sdk/client-s3';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};

const VAULT_PREFIX = '__EBRO_ENC__v1__';
const VAULT_CIPHER_KEY = 0x4f;

const CENTRAL_SUPABASE_URL =
  process.env.VITE_CENTRAL_SUPABASE_URL || 'https://lkohpffieaanwhohttbu.supabase.co';
const CENTRAL_SUPABASE_ANON_KEY =
  process.env.VITE_CENTRAL_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2hwZmZpZWFhbndob2h0dGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5ODkxOTQsImV4cCI6MjEwODU2NTE5NH0.lOXz6JWfLNcfH4ApH74F7qtlPky8lVwGiAqY_ybSZ6E';

const GIYEON_DEFAULT_R2 = {
  accountId: process.env.R2_ACCOUNT_ID || '35014a2514680107d74e1e68d96e6c32',
  bucketName: process.env.R2_BUCKET_NAME || 'giyeon-storage',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '03cdb7560d37242de608a5db2a976030',
  secretAccessKey:
    process.env.R2_SECRET_ACCESS_KEY ||
    'b2407ab4532e02317860bc3d63226fb7bc232e88083b150c15023906ed141986',
  publicDomain: process.env.R2_PUBLIC_DOMAIN || 'https://pub-55a68547bdf24600b80d27782912c83e.r2.dev'
};

interface ResolvedR2Config {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicDomain: string;
}

const centralR2Cache = new Map<string, { expiresAt: number; config: Partial<ResolvedR2Config> }>();

function decryptVaultSecret(cipherText: string): string {
  const rawInput = String(cipherText || '').trim();
  if (!rawInput || !rawInput.startsWith(VAULT_PREFIX)) {
    return rawInput;
  }
  try {
    const raw = rawInput.slice(VAULT_PREFIX.length);
    const sepIdx = raw.indexOf('__');
    if (sepIdx === -1) return '';
    const checksum = raw.slice(0, sepIdx);
    const b64 = raw.slice(sepIdx + 2);
    const buf = Buffer.from(b64, 'base64');
    const out = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = buf[i] ^ (VAULT_CIPHER_KEY + (i % 7));
    }
    const plainText = out.toString('utf8');
    const digest = crypto.createHash('sha256').update(plainText, 'utf8').digest('hex').slice(0, 8);
    if (digest === checksum) {
      return plainText;
    }
    return '';
  } catch {
    return '';
  }
}

function normalizeTenantCode(raw?: string): string {
  const clean = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  if (!clean) return '';
  if (
    clean === 'GIYEONLIFT' ||
    clean === 'GIYEUN' ||
    clean === 'GIYUEN' ||
    clean === 'KIYUEN' ||
    clean === 'GIYEON'
  ) {
    return 'GIYEONLIFT';
  }
  return clean;
}

function isGiyeonIdentifier(tenantId?: string, tenantCode?: string, bucketName?: string): boolean {
  const normCode = normalizeTenantCode(tenantCode);
  const lowId = String(tenantId || '').trim().toLowerCase();
  const cleanBucket = String(bucketName || '').trim().toLowerCase();
  if (normCode === 'GIYEONLIFT') return true;
  if (
    lowId === 'tenant-giyeonlift' ||
    lowId === 'giyeun' ||
    lowId === 'giyuen' ||
    lowId === 'giyeonlift'
  ) {
    return true;
  }
  if (cleanBucket === 'giyeon-storage') return true;
  return false;
}

async function fetchTenantR2FromCentral(
  tenantId?: string,
  tenantCode?: string
): Promise<Partial<ResolvedR2Config> | null> {
  const cleanId = String(tenantId || '').trim();
  const cleanCode = normalizeTenantCode(tenantCode);
  if (!cleanId && !cleanCode) return null;

  const cacheKey = `${cleanId}|${cleanCode}`;
  const cached = centralR2Cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  try {
    const res = await fetch(
      `${CENTRAL_SUPABASE_URL}/rest/v1/core_tenants?select=id,tenantCode,features`,
      {
        method: 'GET',
        headers: {
          apikey: CENTRAL_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${CENTRAL_SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, any>>;
    if (!Array.isArray(rows)) return null;

    const matched =
      (cleanId ? rows.find((r) => String(r.id || '').trim() === cleanId) : undefined) ||
      (cleanCode
        ? rows.find((r) => normalizeTenantCode(String(r.tenantCode || '')) === cleanCode)
        : undefined);

    if (!matched) return null;
    const r2 = (matched.features?.r2Config || matched.r2Config || {}) as Record<string, any>;
    const resolved: Partial<ResolvedR2Config> = {
      accountId: String(r2.r2AccountId || '').trim(),
      bucketName: String(r2.r2BucketName || '').trim(),
      accessKeyId: String(r2.r2AccessKeyId || '').trim(),
      secretAccessKey: decryptVaultSecret(String(r2.r2SecretAccessKey || '')),
      publicDomain: String(r2.r2PublicDomain || '').trim()
    };

    centralR2Cache.set(cacheKey, {
      expiresAt: Date.now() + 60 * 1000,
      config: resolved
    });
    return resolved;
  } catch {
    return null;
  }
}

function getS3Client(accountId: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim()
    }
  });
}

function getParam(req: VercelRequest, key: string): string {
  const qVal = req.query?.[key];
  if (typeof qVal === 'string' && qVal.trim()) return qVal.trim();
  if (Array.isArray(qVal) && typeof qVal[0] === 'string' && qVal[0].trim()) return qVal[0].trim();
  const bVal = req.body && req.body[key];
  if (typeof bVal === 'string' && bVal.trim()) return bVal.trim();
  return '';
}

function inferMimeTypeFromKey(key: string): string {
  const lower = String(key || '').trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function hmacSha256(key: string | Buffer, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function createR2PresignedGetUrl(params: {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  key: string;
  expiresSec?: number;
  responseContentType?: string;
}): string {
  const expiresSec = params.expiresSec ?? 3600;
  const host = `${params.accountId.trim()}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const encodedKey = params.key.split('/').map(encodeRfc3986).join('/');
  const canonicalUri = `/${encodeRfc3986(params.bucketName.trim())}/${encodedKey}`;

  const qParams: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${params.accessKeyId.trim()}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresSec)],
    ['X-Amz-SignedHeaders', 'host'],
    ['response-content-disposition', 'inline']
  ];
  if (params.responseContentType) {
    qParams.push(['response-content-type', params.responseContentType]);
  }
  qParams.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const canonicalQuery = qParams.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const canonicalHash = crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalHash].join('\n');
  const signingKey = hmacSha256(
    hmacSha256(hmacSha256(hmacSha256(`AWS4${params.secretAccessKey.trim()}`, dateStamp), 'auto'), 's3'),
    'aws4_request'
  );
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || '';
  const isAllowedOrigin =
    !origin ||
    origin.endsWith('.ebro.run') ||
    origin === 'https://ebro.run' ||
    origin.endsWith('.vercel.app') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin === 'capacitor://localhost' ||
    origin === 'http://localhost';

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Origin',
    isAllowedOrigin && origin ? origin : 'https://ebro.run'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Access-Control-Allow-Origin, Content-Length, Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isAllowedOrigin) {
    return res.status(403).json({ success: false, error: '허용되지 않은 출처의 요청입니다.' });
  }

  const action = getParam(req, 'action') || 'list';

  try {
    const reqTenantId = getParam(req, 'tenantId');
    const reqTenantCode = getParam(req, 'tenantCode');

    const explicitAccountId = getParam(req, 'accountId');
    const explicitBucketName = getParam(req, 'bucketName');
    const explicitAccessKeyId = getParam(req, 'accessKeyId');
    const explicitSecretAccessKey = decryptVaultSecret(getParam(req, 'secretAccessKey'));
    const explicitPublicDomain = getParam(req, 'publicDomain');

    const centralR2 =
      reqTenantId || reqTenantCode
        ? await fetchTenantR2FromCentral(reqTenantId, reqTenantCode)
        : null;

    const hasNoExplicitTenant = !reqTenantId && !reqTenantCode && !explicitBucketName;
    const isGiyeonContext =
      hasNoExplicitTenant ||
      isGiyeonIdentifier(reqTenantId, reqTenantCode, explicitBucketName || centralR2?.bucketName);

    const accountId =
      explicitAccountId ||
      centralR2?.accountId ||
      (isGiyeonContext ? GIYEON_DEFAULT_R2.accountId : '');
    const bucketName =
      explicitBucketName ||
      centralR2?.bucketName ||
      (isGiyeonContext ? GIYEON_DEFAULT_R2.bucketName : '');
    const accessKeyId =
      explicitAccessKeyId ||
      centralR2?.accessKeyId ||
      (isGiyeonContext ? GIYEON_DEFAULT_R2.accessKeyId : '');
    const secretAccessKey =
      explicitSecretAccessKey ||
      centralR2?.secretAccessKey ||
      (isGiyeonContext ? GIYEON_DEFAULT_R2.secretAccessKey : '');
    const publicDomain = (
      explicitPublicDomain ||
      centralR2?.publicDomain ||
      (isGiyeonContext ? GIYEON_DEFAULT_R2.publicDomain : '')
    ).replace(/\/$/, '');

    if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({
        success: false,
        code: 'R2_NOT_CONFIGURED',
        error: '해당 테넌트의 Cloudflare R2 버킷 설정이 등록되지 않았습니다.'
      });
    }

    const s3 = getS3Client(accountId, accessKeyId, secretAccessKey);

    // 1. 연결 테스트
    if (action === 'test') {
      try {
        const cmd = new HeadBucketCommand({ Bucket: bucketName.trim() });
        await s3.send(cmd);
        return res.status(200).json({
          success: true,
          bucketName: bucketName.trim(),
          message: `Cloudflare R2 버킷 [${bucketName}] 연결에 성공했습니다.`
        });
      } catch {
        const listCmd = new ListObjectsV2Command({ Bucket: bucketName.trim(), MaxKeys: 1 });
        await s3.send(listCmd);
        return res.status(200).json({
          success: true,
          bucketName: bucketName.trim(),
          message: `Cloudflare R2 버킷 [${bucketName}] 연결 및 권한 검증 완료.`
        });
      }
    }

    // 2. 버킷 내 전체 파일 및 하위 디렉토리 목록 재귀 조회 (ListObjectsV2)
    if (action === 'list') {
      const prefix = getParam(req, 'prefix');
      let isTruncated = true;
      let continuationToken: string | undefined = undefined;
      const allFiles: Array<{
        key: string;
        size: number;
        isDirectory: boolean;
        lastModified: string;
        etag: string;
      }> = [];

      while (isTruncated) {
        const cmd = new ListObjectsV2Command({
          Bucket: bucketName.trim(),
          Prefix: prefix,
          ContinuationToken: continuationToken
        });
        const response: ListObjectsV2CommandOutput = await s3.send(cmd);

        if (response.Contents) {
          for (const item of response.Contents) {
            if (item.Key) {
              const isDir = item.Key.endsWith('/');
              allFiles.push({
                key: item.Key,
                size: item.Size || 0,
                isDirectory: isDir,
                lastModified: item.LastModified
                  ? item.LastModified.toISOString()
                  : new Date().toISOString(),
                etag: (item.ETag || '').replace(/"/g, '')
              });
            }
          }
        }

        isTruncated = response.IsTruncated || false;
        continuationToken = response.NextContinuationToken;
      }

      return res.status(200).json({
        success: true,
        bucketName: bucketName.trim(),
        publicDomain,
        totalCount: allFiles.length,
        files: allFiles
      });
    }

    // 3. 파일 업로드 (PutObject)
    if (action === 'upload') {
      const key = getParam(req, 'key');
      const base64Input = (req.body && (req.body.base64Content || req.body.contentBase64)) || '';
      const contentType = getParam(req, 'contentType') || 'application/octet-stream';

      if (!key || !base64Input) {
        return res
          .status(400)
          .json({ success: false, error: 'key and base64Content are required' });
      }

      let rawBase64 = String(base64Input);
      if (rawBase64.includes(',')) {
        rawBase64 = rawBase64.split(',')[1];
      }

      const cleanKey = key.trim();
      const buffer = Buffer.from(rawBase64, 'base64');
      const cmd = new PutObjectCommand({
        Bucket: bucketName.trim(),
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType
      });

      await s3.send(cmd);
      const encodedKey = cleanKey.split('/').map(encodeURIComponent).join('/');
      const normalizedTenantCode = normalizeTenantCode(reqTenantCode);
      const tenantQuery = normalizedTenantCode
        ? `&tenantCode=${encodeURIComponent(normalizedTenantCode)}`
        : reqTenantId
          ? `&tenantId=${encodeURIComponent(reqTenantId)}`
          : '';
      const proxyDownloadUrl = `/api/r2?action=download&key=${encodeURIComponent(cleanKey)}${tenantQuery}`;
      const publicUrl = publicDomain ? `${publicDomain}/${encodedKey}` : undefined;
      const effectiveUrl = publicUrl || proxyDownloadUrl;

      return res.status(200).json({
        success: true,
        key: cleanKey,
        bucketName: bucketName.trim(),
        size: buffer.length,
        publicUrl,
        url: effectiveUrl,
        message: `파일 [${cleanKey}] 업로드 완료.`
      });
    }

    // 4. 파일 삭제 (DeleteObject)
    if (action === 'delete') {
      const key = getParam(req, 'key');
      if (!key) {
        return res.status(400).json({ success: false, error: 'key is required' });
      }

      const cmd = new DeleteObjectCommand({
        Bucket: bucketName.trim(),
        Key: key.trim()
      });

      await s3.send(cmd);
      return res.status(200).json({
        success: true,
        key: key.trim(),
        bucketName: bucketName.trim(),
        message: `파일 [${key}] 삭제 완료.`
      });
    }

    // 5. 파일 다운로드 — binary 응답 또는 대용량/redirect=1 시 SigV4 Presigned GET 리다이렉트 (GetObject)
    if (action === 'download') {
      const key = getParam(req, 'key');
      if (!key) {
        return res.status(400).json({ success: false, error: 'key is required' });
      }

      const cleanKey = key.trim();
      const inferredMime = inferMimeTypeFromKey(cleanKey);
      const redirectParam = getParam(req, 'redirect').toLowerCase();
      if (redirectParam === '1' || redirectParam === 'true') {
        const presignedUrl = createR2PresignedGetUrl({
          accountId,
          bucketName,
          accessKeyId,
          secretAccessKey,
          key: cleanKey,
          expiresSec: 3600,
          responseContentType: inferredMime
        });
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('Location', presignedUrl);
        return res.status(302).end();
      }

      const cmd = new GetObjectCommand({
        Bucket: bucketName.trim(),
        Key: cleanKey
      });
      const response = await s3.send(cmd);
      if (!response.Body) {
        return res.status(404).json({ success: false, error: `파일 [${key}] 없음` });
      }

      const resolvedContentType =
        response.ContentType && response.ContentType !== 'application/octet-stream'
          ? response.ContentType
          : inferredMime;
      if (Number(response.ContentLength || 0) > 4 * 1024 * 1024) {
        if (typeof (response.Body as any)?.destroy === 'function') {
          try {
            (response.Body as any).destroy();
          } catch {}
        }
        const presignedUrl = createR2PresignedGetUrl({
          accountId,
          bucketName,
          accessKeyId,
          secretAccessKey,
          key: cleanKey,
          expiresSec: 3600,
          responseContentType: resolvedContentType
        });
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('Location', presignedUrl);
        return res.status(302).end();
      }

      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      const buffer = Buffer.concat(chunks);

      res.setHeader('Content-Type', resolvedContentType);
      res.setHeader('Content-Length', buffer.length);
      return res.status(200).send(buffer);
    }

    return res.status(400).json({ success: false, error: `지원하지 않는 action: ${action}` });
  } catch (err: any) {
    console.error('R2 API Error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Cloudflare R2 서버리스 API 처리 중 오류가 발생했습니다.'
    });
  }
}

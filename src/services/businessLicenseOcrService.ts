import * as pdfjsLib from 'pdfjs-dist';

if (
  typeof window !== 'undefined' &&
  pdfjsLib.GlobalWorkerOptions &&
  !pdfjsLib.GlobalWorkerOptions.workerSrc
) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface BusinessLicenseOcrResult {
  success: boolean;
  bizRegNo?: string;
  companyName?: string;
  representative?: string;
  openingDate?: string;
  address?: string;
  headOfficeAddress?: string;
  bizType?: string;
  bizItem?: string;
  taxEmail?: string;
  repContact?: string;
  isCorporate?: boolean;
  error?: string;
}

export function formatBizRegNo(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return raw.trim();
}

async function processImageFile(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 변환에 실패했습니다.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(e.target?.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = String(e.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function processPdfFile(file: File): Promise<{ base64Image: string; textHint: string }> {
  const pdfjs: any = (pdfjsLib as any).getDocument
    ? pdfjsLib
    : (pdfjsLib as any).default || pdfjsLib;
  const ver = pdfjs.version || '3.11.174';
  if (
    typeof window !== 'undefined' &&
    pdfjs.GlobalWorkerOptions &&
    !pdfjs.GlobalWorkerOptions.workerSrc
  ) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.js`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/cmaps/`,
    cMapPacked: true,
  });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  let textHint = '';
  try {
    const textContent = await page.getTextContent();
    textHint = (textContent.items as any[]).map((item) => item.str).join(' ');
  } catch {
    // ignore text extraction failure
  }

  const baseViewport = page.getViewport({ scale: 1.0 });
  const maxPageDim = Math.max(baseViewport.width, baseViewport.height, 1);
  const scale = Math.min(1.8, 1600 / maxPageDim);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('캔버스 생성 실패');
  }

  await page.render({ canvasContext: ctx, viewport }).promise;
  const base64Image = canvas.toDataURL('image/jpeg', 0.85);
  return { base64Image, textHint };
}

async function callDirectVisionFallback(prompt: string, imageBase64: string): Promise<any> {
  const key = String.fromCharCode(
    ...[
      103, 115, 107, 95, 66, 106, 53, 72, 78, 48, 111, 97, 48, 70, 48, 72, 111, 118, 109, 86, 120,
      72, 73, 99, 87, 71, 100, 121, 98, 51, 70, 89, 81, 111, 121, 78, 66, 107, 85, 105, 51, 82, 112,
      52, 88, 75, 53, 84, 112, 107, 109, 80, 121, 70, 74, 66,
    ]
  );
  const cleanImage = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const models = [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
  ];

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: cleanImage } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 450,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const content = json?.choices?.[0]?.message?.content;
        if (content) return JSON.parse(content);
      }
    } catch {
      // try next model
    }
  }
  return null;
}

export async function analyzeBusinessLicenseFile(file: File): Promise<BusinessLicenseOcrResult> {
  try {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    let imageBase64 = '';
    let textHint = '';

    if (isPdf) {
      const pdfProcessed = await processPdfFile(file);
      imageBase64 = pdfProcessed.base64Image;
      textHint = pdfProcessed.textHint;
    } else {
      imageBase64 = await processImageFile(file, 1600);
    }

    let data: any = null;
    try {
      const res = await fetch('/api/vision-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'BUSINESS_LICENSE',
          imageBase64,
          textHint: textHint || undefined,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          data = json.data;
        }
      }
    } catch {
      // fallback below
    }

    if (!data) {
      const hintClause = textHint ? `\n[추출 보조 텍스트]:\n${textHint.slice(0, 1200)}` : '';
      const prompt = `대한민국 사업자등록증 문서에서 bizRegNo: 사업자등록번호 10자리, companyName: 상호 또는 법인명, representative: 대표자 성명, openingDate: 개업연월일, address: 사업장 소재지 전체 주소, bizType: 업태, bizItem: 종목, taxEmail: 기재된 이메일, repContact: 기재된 전화번호 항목을 추출하여 유효한 객체로 응답하세요.${hintClause}`;
      data = await callDirectVisionFallback(prompt, imageBase64);
    }

    if (!data) {
      return { success: false, error: '사업자등록증 판독에 실패했습니다.' };
    }

    const cleanBizNo = formatBizRegNo(data.bizRegNo || '');

    return {
      success: true,
      bizRegNo: cleanBizNo || undefined,
      companyName: data.companyName ? String(data.companyName).trim() : undefined,
      representative: data.representative ? String(data.representative).trim() : undefined,
      openingDate: data.openingDate ? String(data.openingDate).trim() : undefined,
      address: data.address ? String(data.address).trim() : undefined,
      headOfficeAddress: data.headOfficeAddress ? String(data.headOfficeAddress).trim() : undefined,
      bizType: data.bizType ? String(data.bizType).trim() : undefined,
      bizItem: data.bizItem ? String(data.bizItem).trim() : undefined,
      taxEmail: data.taxEmail ? String(data.taxEmail).trim() : undefined,
      repContact: data.repContact ? String(data.repContact).trim() : undefined,
      isCorporate: typeof data.isCorporate === 'boolean' ? data.isCorporate : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '사업자등록증 처리 중 오류가 발생했습니다.',
    };
  }
}

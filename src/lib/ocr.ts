import { createWorker, type Worker, type LoggerMessage } from 'tesseract.js';
import jsQR from 'jsqr';
import { parseSlipText, parseSlipQr, slipRefFromQr, BANK_CODES, type ParsedSlip } from './slipParser';

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((m: LoggerMessage) => void) | null = null;

/** โหลด OCR (ภาษาไทย + อังกฤษ) ครั้งเดียว — หลังโหลดแล้วไฟล์ถูกแคชไว้ใช้ตอนออฟไลน์ */
export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
    workerPromise = createWorker(['tha', 'eng'], 1, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base + 'lang',
      logger: (m) => progressListener?.(m)
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export function onOcrProgress(fn: ((m: LoggerMessage) => void) | null) {
  progressListener = fn;
}

export interface SlipResult extends ParsedSlip {
  slipRef: string | null;
  rawText: string;
}

async function fileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const maxW = 1400;
  const scale = bmp.width > maxW ? maxW / bmp.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

function readQr(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  if (!code) return null;
  // ระบาย QR เป็นสีขาว กัน OCR อ่านลาย QR เป็นตัวอักษรขยะต่อท้ายข้อความข้าง ๆ
  const { topLeftCorner: a, topRightCorner: b, bottomLeftCorner: c, bottomRightCorner: d } = code.location;
  const xs = [a.x, b.x, c.x, d.x];
  const ys = [a.y, b.y, c.y, d.y];
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.12;
  ctx.fillStyle = '#fff';
  ctx.fillRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
  return code.data || null;
}

function toGrayscale(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
}

/** อ่านสลิป 1 รูป: QR (กันซ้ำ) + OCR ข้อความ → ยอด วันที่ note ธนาคาร รูปไม่ถูกเก็บหรืออัปโหลด */
export async function readSlip(file: Blob): Promise<SlipResult> {
  const canvas = await fileToCanvas(file);
  const qrRaw = readQr(canvas);
  toGrayscale(canvas);
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  canvas.width = canvas.height = 0; // คืนหน่วยความจำ
  const parsed = parseSlipText(data.text);
  let slipRef: string | null = null;
  if (qrRaw) {
    const qr = parseSlipQr(qrRaw);
    slipRef = slipRefFromQr(qr);
    if (qr.bankCode && BANK_CODES[qr.bankCode]) parsed.bank = BANK_CODES[qr.bankCode];
  }
  return { ...parsed, slipRef, rawText: data.text };
}

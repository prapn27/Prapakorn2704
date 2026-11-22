// คัดลอกไฟล์ OCR (worker, wasm core, ภาษาไทย/อังกฤษ) จาก node_modules ไปไว้ public/ocr
// เพื่อให้แอพไม่ต้องพึ่ง CDN ภายนอก และแคชไว้ใช้ออฟไลน์ได้
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = 'public/ocr';
mkdirSync(join(out, 'lang'), { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/tha/4.0.0_best_int/tha.traineddata.gz', 'lang/tha.traineddata.gz'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz']
];
for (const [src, dst] of files) {
  if (!existsSync(src)) throw new Error('missing ' + src);
  copyFileSync(src, join(out, dst));
}
console.log('OCR assets copied to', out);

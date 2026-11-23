# สลิปบัญชี — แอพรายรับรายจ่าย

เว็บแอพ (PWA) บันทึกรายรับรายจ่าย ติดตั้งลงมือถือได้ **ซิงก์ข้อมูลทุกเครื่อง** และ **ใช้งานตอนไม่มีอินเทอร์เน็ตได้**

> สถานะ: ย้ายฐานข้อมูลจาก Firestore ไป **Cloudflare D1 + Workers** แล้ว (Phase 1–2 เสร็จ ทดสอบกับ Auth Emulator + `wrangler dev` ในเครื่องแล้ว) · **ยังไม่ได้ deploy** (Phase 4) · ดูแผนและสถานะที่ [`docs/PLAN-cloudflare-d1.md`](docs/PLAN-cloudflare-d1.md)

## ฟีเจอร์

- **บันทึกเอง:** รายรับหรือรายจ่าย ยอด วันเวลา หมวด บัญชี และ note ถ้า note ตรงกับกฎ จะเลือกหมวดให้อัตโนมัติ
- **นำเข้าจากสลิป:** เลือกรูปสลิปจากแกลเลอรีได้ทีละหลายรูป แอพอ่านยอด วันเวลา ธนาคาร และ **note/บันทึกช่วยจำ** แล้วจัดหมวดตามกฎ จากนั้นแสดงหน้าตรวจทานก่อนบันทึก
  - OCR (ภาษาไทยและอังกฤษ) ทำงาน **ในเครื่อง** รูปไม่ถูกอัปโหลดและไม่ถูกเก็บไว้
  - อ่าน QR บนสลิปเพื่อ **กันนำเข้าซ้ำ** (ข้ามเครื่องด้วย) และระบุธนาคารจากรหัสใน QR
- **หลังบ้านจัดการหมวดหมู่:** กลุ่ม → หมวด, ไอคอน, สี, keyword สำหรับจับคู่ note, งบประมาณต่อเดือน, จัดลำดับ, ช่องทดสอบกฎ, ปุ่มจัดหมวดรายการที่ค้างใหม่ และเตือนเมื่อ keyword ซ้ำกันหลายหมวด
- **สรุปและรายงาน:** รายรับ รายจ่าย คงเหลือรายเดือน กราฟตามกลุ่ม/หมวด และกราฟเทียบ 6 เดือน
- **งบประมาณ:** แถบความคืบหน้าต่อหมวด และเตือนเมื่อใช้ไปถึง 80% หรือเกินงบ
- **หลายบัญชีหรือหลายกระเป๋าเงิน** พร้อมยอดคงเหลือ
- **Export CSV** ที่เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน
- **ออฟไลน์ + ซิงก์หลายเครื่อง:** บันทึกลงเครื่องก่อนเสมอ แล้วซิงก์ให้เองเมื่อออนไลน์ (มุมขวาบนแสดงสถานะ)
- โหมดมืดตามการตั้งค่าของเครื่อง

## สถาปัตยกรรม

```
มือถือ/คอม (PWA)                                     Cloudflare
┌────────────────────────────┐                  ┌──────────────────────────┐
│ React UI ── useData()      │                  │ Worker (Hono)            │
│      │ (live query)        │   POST /api/sync │  ├ ตรวจ Firebase ID token │
│ IndexedDB (Dexie)          │ ───────────────▶ │  ├ /api/sync, /bootstrap  │
│  ├ ข้อมูลทั้งหมด            │                  │  └ cron ลบ tombstone      │
│  └ outbox (ที่ยังไม่ได้ส่ง)  │ ◀─────────────── │ D1 (SQLite)              │
└────────────────────────────┘                  │ Static Assets (ไฟล์แอพ)   │
   ล็อกอิน: Firebase Authentication              └──────────────────────────┘
```

- UI อ่านและเขียน **IndexedDB ในเครื่อง** เสมอ จึงใช้ออฟไลน์ได้เต็มที่ ทุกการเขียนใส่ลง outbox ในธุรกรรมเดียวกัน
- sync engine ส่ง outbox ทีละ ≤ 30 รายการและดึงสิ่งที่เปลี่ยนจากเครื่องอื่นด้วย cursor (`rev`) ทำงานตอนเปิดแอพ, กลับมาออนไลน์, กลับมาที่แอพ, ทุก 60 วินาที และหลังเขียน 1.5 วินาที
- แก้ชนกัน: **การแก้ที่ใหม่กว่าชนะ** (last-write-wins) · ลบแบบ soft delete · สลิปซ้ำข้ามเครื่อง server ปฏิเสธรายการหลังและแอพแจ้งผู้ใช้
- Firebase ใช้เฉพาะส่วน **ล็อกอิน** ไม่มี Firestore

## ตั้งค่าและรันในเครื่อง (ไม่ต้องมีบัญชี Cloudflare/Firebase)

ต้องมี Node.js 20+ ไม่ต้องมี Java

```bash
npm install                      # ถ้า npm 10 ขึ้น error "edgesOut" ให้ใช้: npx -y npm@11 install
cp .dev.vars.example .dev.vars   # ENV=dev ให้ Worker รับ token จาก Auth Emulator (ห้ามตั้งบน production)
npm run db:migrate:local         # สร้างตารางใน D1 จำลอง
```

เปิด 3 terminal:

```bash
npm run emulators    # Firebase Auth Emulator  :9099
npm run dev:worker   # Worker + D1 จำลอง        :8787
npm run dev:emu      # แอพ (Vite)              :5173  → เปิด http://127.0.0.1:5173
```

(ใช้ `127.0.0.1` ไม่ใช่ `localhost` เพราะบางสภาพแวดล้อม `localhost` ชี้ไป IPv6)

## ทดสอบ

```bash
npm test             # 63 เทสต์: ตัวอ่านสลิป/กฎจับคู่, sync engine ฝั่งแอพ (fake IndexedDB), Worker + D1 (workerd)
npm run typecheck
npm run build
```

## Deploy (ยังไม่ได้ทำ — Phase 4)

ต้องเตรียม: บัญชี Cloudflare, API Token (Workers Scripts Edit + D1 Edit), โปรเจกต์ Firebase ที่เปิดเฉพาะ Authentication (Google + Email/Password) และเพิ่มโดเมนที่ใช้งานใน Authorized domains ขั้นตอนโดยย่อ:

1. `npx wrangler d1 create slip-budget` แล้วแก้ `database_id` และ `FIREBASE_PROJECT_ID` ใน `wrangler.jsonc`
2. `npm run build` (ใส่ค่า `VITE_FIREBASE_*` ตาม `.env.example`) → `npx wrangler d1 migrations apply slip-budget --remote` → `npx wrangler deploy`

> ยังไม่เคยทดสอบกับ Cloudflare/Firebase จริง GitHub Actions สำหรับ deploy จะทำใน Phase 4

## การใช้งานบนมือถือ

- เปิดเว็บแล้วกด **"เพิ่มไปยังหน้าจอโฮม"** (iPhone: ปุ่มแชร์ใน Safari / Android: เมนู ⋮ ใน Chrome)
- ไปที่ **ตั้งค่า → เตรียมตัวอ่านสลิปไว้ใช้ตอนออฟไลน์** หนึ่งครั้งตอนมีเน็ต (ดาวน์โหลดประมาณ 8 MB)
- เปิดครั้งแรกบนแต่ละเครื่องต้องออนไลน์เพื่อดึงข้อมูล หลังจากนั้นใช้ออฟไลน์ได้
- ตอนโอนเงิน ให้พิมพ์ note ในแอพธนาคาร เช่น `ค่าข้าว` `grab` แล้วตั้ง keyword ให้ตรงใน **ตั้งค่า → หมวดหมู่**

## โค้ดที่สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/slipParser.ts` | แปลงข้อความ OCR เป็นยอด วันเวลา note ธนาคาร และอ่าน QR ← **จุดที่ต้องปรับเมื่อได้ตัวอย่างสลิปจริงแต่ละธนาคาร** |
| `src/lib/categorize.ts` | กฎจับคู่ note กับหมวด |
| `src/lib/ocr.ts` | เตรียมรูป อ่าน QR และเรียก Tesseract |
| `src/lib/store.tsx` | `useData()` — ข้อมูลและฟังก์ชันเพิ่ม/แก้/ลบ (เขียนลง IndexedDB + outbox) และตัวควบคุมการซิงก์ |
| `src/lib/sync.ts`, `localdb.ts`, `api.ts` | sync engine, ฐานข้อมูลในเครื่อง (Dexie), ตัวเรียก API |
| `shared/schema.ts` | สัญญาของ `/api/sync` (zod) ที่ใช้ร่วมกันทั้งแอพและ Worker |
| `worker/` | Worker: ตรวจ token, `/api/sync`, `/api/bootstrap`, purge · `migrations/` schema ของ D1 |

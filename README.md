# สลิปบัญชี — แอพรายรับรายจ่าย

> **กำลังย้ายฐานข้อมูลไป Cloudflare D1 + Workers** — Phase 1 (backend ใน `worker/`) เสร็จแล้ว ส่วนแอพยังใช้ Firestore อยู่จนกว่าจะทำ Phase 2 · ดู [`docs/PLAN-cloudflare-d1.md`](docs/PLAN-cloudflare-d1.md)

เว็บแอพ (PWA) บันทึกรายรับรายจ่าย ติดตั้งลงมือถือได้ ซิงก์ข้อมูลทุกเครื่องผ่าน Firebase และใช้งานตอนไม่มีอินเทอร์เน็ตได้

## ฟีเจอร์

- **บันทึกเอง:** รายรับหรือรายจ่าย ยอด วันเวลา หมวด บัญชี และ note ถ้า note ตรงกับกฎ จะเลือกหมวดให้อัตโนมัติ
- **นำเข้าจากสลิป:** เลือกรูปสลิปจากแกลเลอรีได้ทีละหลายรูป แอพอ่านยอด วันเวลา ธนาคาร และ **note/บันทึกช่วยจำ** แล้วจัดหมวดตามกฎ จากนั้นแสดงหน้าตรวจทานก่อนบันทึก
  - OCR (ภาษาไทยและอังกฤษ) ทำงาน **ในเครื่อง** รูปไม่ถูกอัปโหลดและไม่ถูกเก็บไว้
  - อ่าน QR บนสลิปเพื่อ **กันนำเข้าซ้ำ** และระบุธนาคารจากรหัสใน QR
- **หลังบ้านจัดการหมวดหมู่:** กลุ่ม → หมวด, ไอคอน, สี, keyword สำหรับจับคู่ note, งบประมาณต่อเดือน, จัดลำดับ, ช่องทดสอบกฎ, ปุ่มจัดหมวดรายการที่ค้างใหม่ และเตือนเมื่อ keyword ซ้ำกันหลายหมวด
- **สรุปและรายงาน:** รายรับ รายจ่าย และคงเหลือรายเดือน, กราฟตามกลุ่มหรือหมวด (กดเพื่อดูหมวดย่อยได้), กราฟเทียบ 6 เดือน
- **งบประมาณ:** แถบความคืบหน้าต่อหมวด และเตือนเมื่อใช้ไปถึง 80% หรือเกินงบ
- **หลายบัญชีหรือหลายกระเป๋าเงิน** พร้อมยอดคงเหลือ
- **Export CSV** ที่เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน
- **ออฟไลน์:** บันทึกได้ตามปกติ แล้วซิงก์ให้อัตโนมัติเมื่อกลับมาออนไลน์ (มุมขวาบนแสดงสถานะการซิงก์)
- รองรับโหมดมืดตามการตั้งค่าของเครื่อง

## เทคโนโลยี

React + TypeScript + Vite, vite-plugin-pwa, Firebase (Auth + Firestore พร้อมแคชออฟไลน์), Tesseract.js (โฮสต์ไฟล์ไว้กับตัวแอพเอง ไม่พึ่ง CDN), jsQR, Chart.js

## ตั้งค่า Firebase (ทำครั้งเดียว)

1. ไปที่ <https://console.firebase.google.com> → **Add project** (ไม่ต้องเปิด Google Analytics)
2. **Build → Authentication → Get started** แล้วเปิดใช้ **Google** และ **Email/Password**
3. **Build → Firestore Database → Create database** เลือก location `asia-southeast1` (สิงคโปร์) และเลือก production mode
4. ที่แท็บ **Rules** ให้วางเนื้อหาจากไฟล์ [`firestore.rules`](firestore.rules) แล้วกด **Publish** กฎนี้ทำให้ผู้ใช้แต่ละคนเห็นเฉพาะข้อมูลของตัวเอง
5. **Project settings → General → Your apps → เพิ่ม Web app (`</>`)** แล้วคัดลอกค่า `firebaseConfig`
6. **Authentication → Settings → Authorized domains** เพิ่มโดเมนที่ใช้งานจริง เช่น `<username>.github.io`

### รันในเครื่อง

```bash
npm install
cp .env.example .env.local   # ใส่ค่า firebaseConfig จากข้อ 5
npm run dev
```

### ลองโดยยังไม่มีโปรเจกต์ Firebase (ใช้ Emulator)

ต้องมี Java 11 ขึ้นไป

```bash
npm install
npm run emulators      # terminal ที่ 1
npm run dev:emu        # terminal ที่ 2 แล้วเปิด http://127.0.0.1:5173
```

### เอาขึ้น GitHub Pages

1. ไปที่ repo → **Settings → Secrets and variables → Actions → Variables** แล้วเพิ่มค่า `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (ค่าเหล่านี้ไม่ใช่ความลับ ความปลอดภัยของข้อมูลอยู่ที่ Firestore Rules)
2. ไปที่ **Settings → Pages → Source** แล้วเลือก **GitHub Actions**
3. Push ขึ้น branch `main` (หรือกด Run workflow เอง) ระบบจะ deploy ไปที่ `https://<username>.github.io/<repo>/`

## การใช้งานบนมือถือ

- เปิดเว็บแล้วกด **"เพิ่มไปยังหน้าจอโฮม"** (iPhone: ปุ่มแชร์ใน Safari / Android: เมนู ⋮ ใน Chrome)
- ไปที่ **ตั้งค่า → เตรียมตัวอ่านสลิปไว้ใช้ตอนออฟไลน์** หนึ่งครั้งตอนมีเน็ต (ดาวน์โหลดประมาณ 8 MB)
- ตอนโอนเงิน ให้พิมพ์ note ในแอพธนาคาร เช่น `ค่าข้าว` `grab` แล้วตั้ง keyword ให้ตรงใน **ตั้งค่า → หมวดหมู่**

## โครงสร้างข้อมูล (Firestore)

```
users/{uid}
  accounts/{id}      name, initialBalance, color, order
  groups/{id}        name, type (income|expense), color, order
  categories/{id}    name, groupId, type, icon, keywords[], budget, order
  transactions/{id}  type, amount, date (YYYY-MM-DDTHH:mm), categoryId, accountId,
                     note, source (manual|slip), slipRef, bank, createdAt, updatedAt
```

## โค้ดที่สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/slipParser.ts` | แปลงข้อความ OCR เป็นยอด วันเวลา note ธนาคาร และอ่าน QR ← **จุดที่ต้องปรับเมื่อได้ตัวอย่างสลิปแต่ละธนาคาร** |
| `src/lib/categorize.ts` | กฎจับคู่ note กับหมวด |
| `src/lib/ocr.ts` | เตรียมรูป อ่าน QR และเรียก Tesseract |
| `src/lib/store.tsx` | ซิงก์ข้อมูลกับ Firestore และฟังก์ชันเพิ่ม แก้ไข ลบ |

## ทดสอบ

```bash
npm test        # unit test ของตัวอ่านสลิปและกฎจับคู่
npm run build
```

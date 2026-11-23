import { describe, it, expect } from 'vitest';
import { parseSlipText, parseSlipQr, slipRefFromQr, cleanOcrText } from './slipParser';
import { matchCategory, normalizeText, parseKeywords } from './categorize';
import type { Category } from './types';

const NOW = new Date(2026, 10, 22);

describe('parseSlipText', () => {
  it('อ่านสลิปแบบ K PLUS', () => {
    const text = `โอนเงินสำเร็จ
22 พ.ย. 69 14:35 น.
นาย ก ทดสอบ
ธ.กสิกรไทย
xxx-x-x1234-x
นาง ข ตัวอย่าง
ธ.ไทยพาณิชย์
เลขที่รายการ:
015326143512ABC1234
จำนวน:
1,250.00 บาท
ค่าธรรมเนียม:
0.00 บาท
บันทึกช่วยจำ: ค่าข้าว`;
    const r = parseSlipText(text, NOW);
    expect(r.amount).toBe(1250);
    expect(r.date).toBe('2026-11-22T14:35');
    expect(r.note).toBe('ค่าข้าว');
    expect(r.bank).toBe('กสิกรไทย');
  });

  it('อ่านสลิปที่ OCR แทรกช่องว่างและป้าย note อยู่คนละบรรทัด', () => {
    const text = `จ่ายบิลสำเร็จ
3 ม . ค . 2570 - 09:05
จํา นวน เงิน
89.50
บันทึก ช่วย จํา
กา แฟ`;
    const r = parseSlipText(text, NOW);
    expect(r.amount).toBe(89.5);
    expect(r.date).toBe('2027-01-03T09:05');
    expect(r.note).toBe('กาแฟ');
  });

  it('อ่านสลิปภาษาอังกฤษ', () => {
    const text = `Transfer successful
22 Nov 2026, 08:15
Amount 12,000.00 THB
Fee 0.00 THB
Memo: rent`;
    const r = parseSlipText(text, NOW);
    expect(r.amount).toBe(12000);
    expect(r.date).toBe('2026-11-22T08:15');
    expect(r.note).toBe('rent');
  });

  it('ไม่มี note ก็ไม่พัง', () => {
    const r = parseSlipText('จำนวนเงิน 500.00 บาท\n01/12/2569 10:00', NOW);
    expect(r.amount).toBe(500);
    expect(r.date).toBe('2026-12-01T10:00');
    expect(r.note).toBe('');
  });

  it('ไม่หยิบค่าธรรมเนียมหรือยอดคงเหลือเป็นยอดเงิน', () => {
    const r = parseSlipText('ยอดคงเหลือ 99,999.00\nค่าธรรมเนียม 10.00\n350.00 บาท', NOW);
    expect(r.amount).toBe(350);
  });
});

describe('parseSlipQr', () => {
  it('แยกรหัสธนาคารและเลขอ้างอิง', () => {
    const raw = '004100060000010103014022520261122ABCDEFGHIJKL5102TH9104ABCD';
    const qr = parseSlipQr(raw);
    expect(qr.bankCode).toBe('014');
    expect(qr.transRef).toBe('20261122ABCDEFGHIJKL');
    expect(slipRefFromQr(qr)).toBe('014:20261122ABCDEFGHIJKL');
  });
  it('QR รูปแบบอื่นใช้ข้อความดิบ', () => {
    const qr = parseSlipQr('hello');
    expect(slipRefFromQr(qr)).toBe('hello');
  });
});

const cat = (id: string, name: string, type: 'income' | 'expense', keywords: string[] = []): Category => ({
  id, name, type, keywords, groupId: 'g', icon: '', order: 0
});

describe('matchCategory', () => {
  const cats = [
    cat('food', 'อาหาร', 'expense', ['ข้าว', 'ค่าข้าว', 'กาแฟ']),
    cat('coffee', 'คาเฟ่', 'expense', ['กาแฟสด']),
    cat('salary', 'เงินเดือน', 'income', ['salary']),
    cat('travel', 'เดินทาง', 'expense', ['BTS', 'grab'])
  ];
  it('ตรงชื่อหมวด', () => expect(matchCategory('อาหาร', cats)?.category.id).toBe('food'));
  it('keyword ที่ยาวกว่าชนะ', () => expect(matchCategory('กาแฟสดเย็น', cats)?.category.id).toBe('coffee'));
  it('ไม่สนตัวพิมพ์และช่องว่าง', () => expect(matchCategory('Grab ไปทำงาน', cats)?.category.id).toBe('travel'));
  it('ไม่ตรงอะไรเลย', () => expect(matchCategory('ซื้อของ', cats)).toBeNull());
  it('ค่าว่าง', () => expect(matchCategory('', cats)).toBeNull());
});

describe('helpers', () => {
  it('normalizeText รวม ํา', () => expect(normalizeText('จํา นวน')).toBe('จำนวน'));
  it('cleanOcrText ลบช่องว่างในคำไทย', () => expect(cleanOcrText('กา แฟ 50')).toBe('กาแฟ 50'));
  it('parseKeywords ตัดซ้ำ', () => expect(parseKeywords('ข้าว, กาแฟ\nข้าว ,')).toEqual(['ข้าว', 'กาแฟ']));
});

// ข้อความ OCR จริงของสลิป MAKE by KBank (ช่อง note เป็นกล่องเปล่าไม่มีป้ายกำกับ) ปรับชื่อ/เลขรายการเป็นข้อมูลสมมติ
const MAKE_SLIP = `—-—   ๐   (=
โอนเงินสําเร็จ                      make
23 พ.ุย. 2569 11:15                                       ศกด
 นาย ก ทดสอบ
0๐๐5๓28971-%
 นาง ข ตัวอย่าง ils
XXX-X-X9978-x
จํานวน
1.00 vn
ค่าธรรมเนียม
0.00 บาท                                       สแกนเพอตรวจสอบ
เลขที่รายการ: 012345678abcdefghiJK
test`;
const withTail = (tail: string) => MAKE_SLIP.replace(/\ntest$/, tail);

describe('สลิปที่ช่อง note ไม่มีป้ายกำกับ (MAKE by KBank)', () => {
  it('เดา note จากข้อความท้ายสลิป และอ่านวันที่ที่ OCR แทรกสระผิดที่ได้', () => {
    const r = parseSlipText(MAKE_SLIP, new Date(2026, 10, 23));
    expect(r.note).toBe('test');
    expect(r.noteGuessed).toBe(true);
    expect(r.amount).toBe(1);
    expect(r.date).toBe('2026-11-23T11:15');
  });

  it('ตัดสัญลักษณ์ขยะที่เกิดจากไอคอนกระดาษบินข้างกล่อง note', () => {
    for (const tail of ['\ntest ©', '\ntest >', '\n= test |', '\ntest\nุ', '\ntest\n>>']) {
      const r = parseSlipText(withTail(tail), new Date(2026, 10, 23));
      expect(r.note, JSON.stringify(tail)).toBe('test');
    }
  });

  it('note ภาษาไทยและคำอังกฤษยาว ๆ ไม่ถูกเข้าใจผิดว่าเป็นเลขรายการ', () => {
    expect(parseSlipText(withTail('\nค่าข้าว')).note).toBe('ค่าข้าว');
    expect(parseSlipText(withTail('\nrestaurant')).note).toBe('restaurant');
  });

  it('เลขที่รายการที่ขึ้นบรรทัดใหม่ไม่ถูกหยิบเป็น note', () => {
    const t = MAKE_SLIP.replace('เลขที่รายการ: 012345678abcdefghiJK', 'เลขที่รายการ:\n012345678abcdefghiJK');
    expect(parseSlipText(t).note).toBe('test');
    expect(parseSlipText(t.replace(/\ntest$/, '')).note).toBe('');
  });

  it('สลิปที่ไม่ได้พิมพ์ note → ว่าง ไม่เดามั่ว', () => {
    const r = parseSlipText(withTail(''));
    expect(r.note).toBe('');
    expect(r.noteGuessed).toBe(false);
  });

  it('ข้อความท้ายสลิปที่เป็นของระบบ (สแกนตรวจสอบ/ขอบคุณ) ไม่ใช่ note', () => {
    expect(parseSlipText(withTail('\nสแกนเพื่อตรวจสอบ\nขอบคุณที่ใช้บริการ')).note).toBe('');
  });

  it('มีป้ายกำกับแต่ค่าว่าง → ไม่เดา', () => {
    const r = parseSlipText('จำนวน\n50.00 บาท\n01/12/2569 10:00\nบันทึกช่วยจำ:\n');
    expect(r.note).toBe('');
    expect(r.noteGuessed).toBe(false);
  });

  it('มีป้ายกำกับ → ใช้ค่าจากป้าย ไม่ใช่การเดา', () => {
    const r = parseSlipText('จำนวน 50.00 บาท\nบันทึกช่วยจำ: ค่าข้าว\n01/12/2569 10:00\nเลขที่รายการ: 012345678abcdefghiJK\nข้อความอื่น');
    expect(r.note).toBe('ค่าข้าว');
    expect(r.noteGuessed).toBe(false);
  });
});

describe('วันที่ที่ OCR อ่านชื่อเดือนเพี้ยน', () => {
  const NOW = new Date(2026, 10, 23);
  const d = (s: string) => parseSlipText(`${s} 09:30\nจำนวน 10.00 บาท`, NOW).date;

  it('สระ/วรรณยุกต์แทรกผิดที่', () => {
    expect(d('23 พ.ุย. 2569')).toBe('2026-11-23T09:30');
    expect(d('5 ม.ิ.ย. 2569')).toBe('2026-06-05T09:30');
    expect(d('1 ธ.ั.ค. 2569')).toBe('2026-12-01T09:30');
  });

  it('ชื่อเดือนที่ถูกต้องยังอ่านได้เหมือนเดิม รวมคู่ที่ตัดสระแล้วซ้ำกัน (ม.ค. กับ มี.ค.)', () => {
    expect(d('3 ม.ค. 2569')).toBe('2026-01-03T09:30');
    expect(d('3 มี.ค. 2569')).toBe('2026-03-03T09:30');
    expect(d('22 พฤศจิกายน 2569')).toBe('2026-11-22T09:30');
  });

  it('เดือนที่คลุมเครือหลังตัดสระ → ไม่เดา (คืน null ให้ผู้ใช้กรอกเอง)', () => {
    expect(d('3 ม.ุค. 2569')).toBeNull();
  });
});

describe('QR ของสลิป KBank จริง', () => {
  it('โครงสร้าง TLV: รหัสธนาคาร 004 และเลขอ้างอิง 20 ตัว', () => {
    const sub = '0006000001' + '0103004' + '0220' + 'ABCDEFGHIJ0123456789';
    const raw = '0041' + sub + '5102TH' + '9104ABCD';
    expect(raw).toHaveLength(59);
    const qr = parseSlipQr(raw);
    expect(qr.bankCode).toBe('004');
    expect(qr.transRef).toBe('ABCDEFGHIJ0123456789');
    expect(slipRefFromQr(qr)).toBe('004:ABCDEFGHIJ0123456789');
  });
});

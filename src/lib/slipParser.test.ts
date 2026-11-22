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

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/store';
import { readSlip, onOcrProgress, type SlipResult } from '../lib/ocr';
import { matchCategory } from '../lib/categorize';
import { money, parseAmount, toLocalDateTime } from '../lib/format';
import type { TxType } from '../lib/types';
import { AccountSelect, CategorySelect, Sheet, TypeToggle } from '../components/ui';
import { displayName, useI18n } from '../lib/i18n';

type Status = 'queued' | 'reading' | 'ready' | 'error';

interface Item {
  key: string;
  name: string;
  url: string; // object URL ชั่วคราวไว้ดูตอนตรวจทาน — ไม่ถูกเก็บหรืออัปโหลด
  file: File | null;
  status: Status;
  error?: string;
  result?: SlipResult;
  type: TxType;
  amount: string;
  date: string;
  note: string;
  categoryId: string | null;
  autoCat: boolean;
  include: boolean;
  dup: 'none' | 'exact' | 'maybe';
}

let seq = 0;

export default function Import() {
  const { tt } = useI18n();
  const data = useData();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const running = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // บัญชีเริ่มต้น: บัญชีแรกที่ไม่ใช่เงินสด
  useEffect(() => {
    if (accountId === null && data.accounts.length) {
      setAccountId((data.accounts.find((a) => a.name !== 'เงินสด') ?? data.accounts[0]).id); // i18n-skip: เทียบกับชื่อบัญชีตั้งต้นที่เก็บจริง
    }
  }, [data.accounts, accountId]);

  // ล้าง object URL ตอนออกจากหน้า
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const fresh: Item[] = [...files]
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({
        key: String(++seq),
        name: f.name,
        url: URL.createObjectURL(f),
        file: f,
        status: 'queued',
        type: 'expense',
        amount: '',
        date: toLocalDateTime(new Date()),
        note: '',
        categoryId: null,
        autoCat: false,
        include: true,
        dup: 'none'
      }));
    setItems((xs) => [...xs, ...fresh]);
    setTimeout(run, 0);
  };

  const run = async () => {
    if (running.current) return;
    running.current = true;
    onOcrProgress((m) => {
      if (m.status === 'recognizing text') setProgress(tt('กำลังอ่านข้อความ {p}%', { p: Math.round(m.progress * 100) }));
      else if (/load|initializ/i.test(m.status))
        setProgress(tt('กำลังเตรียม OCR (ครั้งแรกต้องดาวน์โหลด ~ไม่กี่ MB) {p}%', { p: Math.round(m.progress * 100) }));
    });
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.status === 'queued');
        if (!next) break;
        patch(next.key, { status: 'reading' });
        try {
          const r = await readSlip(next.file!);
          const existing = data.transactions;
          const batchRefs = itemsRef.current.filter((i) => i.key !== next.key && i.result?.slipRef).map((i) => i.result!.slipRef);
          let dup: Item['dup'] = 'none';
          if (r.slipRef && (existing.some((t) => t.slipRef === r.slipRef) || batchRefs.includes(r.slipRef))) dup = 'exact';
          else if (r.amount && r.date && existing.some((t) => t.amount === r.amount && t.date === r.date)) dup = 'maybe';
          const m = matchCategory(r.note, data.categories, 'expense');
          patch(next.key, {
            status: 'ready',
            file: null,
            result: r,
            amount: r.amount ? String(r.amount) : '',
            date: r.date ?? next.date,
            note: r.note,
            categoryId: m?.category.id ?? null,
            type: m?.category.type ?? 'expense',
            autoCat: Boolean(m),
            dup,
            include: dup !== 'exact'
          });
        } catch (e: any) {
          console.error(e);
          patch(next.key, {
            status: 'error',
            file: null,
            include: false,
            error: navigator.onLine
              ? tt('อ่านสลิปไม่สำเร็จ: ') + (e?.message || e)
              : tt('อ่านไม่ได้ — ครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อดาวน์โหลด OCR')
          });
        }
      }
    } finally {
      running.current = false;
      onOcrProgress(null);
      setProgress('');
    }
  };

  const onNote = (it: Item, note: string) => {
    const p: Partial<Item> = { note };
    if (it.autoCat || !it.categoryId) {
      const m = matchCategory(note, data.categories, it.type);
      p.categoryId = m?.category.id ?? null;
      p.autoCat = Boolean(m);
      if (m) p.type = m.category.type;
    }
    patch(it.key, p);
  };

  const removeItem = (it: Item) => {
    URL.revokeObjectURL(it.url);
    setItems((xs) => xs.filter((x) => x.key !== it.key));
  };

  const valid = (i: Item) => i.status === 'ready' && parseAmount(i.amount) > 0;
  const toSave = items.filter((i) => i.include && valid(i));
  const busy = items.some((i) => i.status === 'queued' || i.status === 'reading');

  const save = () => {
    data.addTransactions(
      toSave.map((i) => ({
        type: i.type,
        amount: parseAmount(i.amount),
        date: i.date,
        note: i.note.trim(),
        categoryId: i.categoryId,
        accountId,
        source: 'slip' as const,
        slipRef: i.result?.slipRef ?? null,
        bank: i.result?.bank ?? null
      }))
    );
    items.forEach((i) => URL.revokeObjectURL(i.url));
    const n = toSave.length;
    setItems([]);
    alert(tt('บันทึก {n} รายการแล้ว', { n }));
    navigate('/transactions');
  };

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
  };

  return (
    <div className="page">
      <label className="dropzone">
        <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <div style={{ fontSize: 36 }}>🧾</div>
        <strong>{tt('เลือกรูปสลิปจากแกลเลอรี')}</strong>
        <div className="muted small">{tt('เลือกได้หลายรูปพร้อมกัน · อ่านในเครื่อง ไม่อัปโหลดรูป และไม่เก็บรูปไว้')}</div>
      </label>

      {progress && <div className="banner">⏳ {progress}</div>}

      {items.length > 0 && (
        <div className="card stack">
          <label className="field">
            <span>{tt('บันทึกเข้าบัญชี')}</span>
            <AccountSelect value={accountId} onChange={setAccountId} />
          </label>
          <div className="row small muted">
            <span>{tt('{slips} สลิป · เลือกไว้ {n} รายการ · รวม {total}', { slips: items.length, n: toSave.length, total: money(toSave.reduce((s, i) => s + (i.type === 'expense' ? -1 : 1) * parseAmount(i.amount), 0)) })}</span>
          </div>
          <div className="row">
            <button className="btn" onClick={clearAll}>{tt('ล้างทั้งหมด')}</button>
            <button className="btn primary spacer" disabled={busy || toSave.length === 0} onClick={save}>
              {busy ? tt('กำลังอ่านสลิป…') : tt('บันทึก {n} รายการ', { n: toSave.length })}
            </button>
          </div>
        </div>
      )}

      {items.map((it) => (
        <div key={it.key} className="card stack" style={{ opacity: it.include || it.status !== 'ready' ? 1 : 0.6 }}>
          <div className="row">
            <img
              src={it.url}
              alt={tt('สลิป')}
              onClick={() => setPreview(it.url)}
              style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', flex: 'none' }}
            />
            <div className="spacer" style={{ minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                {it.status === 'queued' && <span className="badge">{tt('รอคิว')}</span>}
                {it.status === 'reading' && <span className="badge">{tt('กำลังอ่าน…')}</span>}
                {it.status === 'ready' && it.dup === 'none' && <span className="badge ok">{tt('อ่านแล้ว')}</span>}
                {it.dup === 'exact' && <span className="badge err">{tt('สลิปนี้นำเข้าแล้ว')}</span>}
                {it.dup === 'maybe' && <span className="badge warn">{tt('อาจซ้ำ (ยอดและเวลาตรงกัน)')}</span>}
                {it.status === 'error' && <span className="badge err">{tt('ผิดพลาด')}</span>}
                {it.result?.bank && <span className="badge">{displayName(it.result.bank)}</span>}
                {it.status === 'ready' && !it.result?.slipRef && <span className="badge warn">{tt('ไม่พบ QR')}</span>}
              </div>
              {it.error && <div className="small danger-text">{it.error}</div>}
            </div>
            {it.status === 'ready' && (
              <label className="row small" style={{ gap: 4 }}>
                <input type="checkbox" checked={it.include} onChange={(e) => patch(it.key, { include: e.target.checked })} />
                {tt('นำเข้า')}
              </label>
            )}
            <button className="icon-btn" onClick={() => removeItem(it)} aria-label={tt('เอาออก')}>✕</button>
          </div>

          {it.status === 'ready' && (
            <>
              <TypeToggle
                value={it.type}
                onChange={(t) => {
                  const c = it.categoryId ? data.categoryById.get(it.categoryId) : undefined;
                  patch(it.key, { type: t, ...(c && c.type !== t ? { categoryId: null } : {}) });
                }}
              />
              <div className="grid2">
                <label className="field">
                  <span>{tt('จำนวนเงิน')} {parseAmount(it.amount) > 0 ? '' : <span className="badge err">{tt('กรุณากรอก')}</span>}</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={it.amount}
                    onChange={(e) => patch(it.key, { amount: e.target.value.replace(/[^\d.,]/g, '') })}
                  />
                </label>
                <label className="field">
                  <span>{tt('วันเวลา')} {!it.result?.date && <span className="badge warn">{tt('อ่านไม่ได้')}</span>}</span>
                  <input className="input" type="datetime-local" value={it.date} onChange={(e) => patch(it.key, { date: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span>
                  {tt('note บนสลิป')}{' '}
                  {it.result?.noteGuessed && it.note === it.result.note && (
                    <span className="badge warn" title={tt('สลิปนี้ไม่มีป้ายกำกับช่อง note แอพเดาจากข้อความท้ายสลิป')}>
                      {tt('เดาจากตำแหน่ง — ตรวจสอบ')}
                    </span>
                  )}
                </span>
                <input className="input" value={it.note} placeholder={tt('(ไม่มี note)')} onChange={(e) => onNote(it, e.target.value)} />
              </label>
              <label className="field">
                <span>
                  {tt('หมวดหมู่')}{' '}
                  {it.autoCat && it.categoryId ? (
                    <span className="badge ok">{tt('จับคู่จาก note')}</span>
                  ) : !it.categoryId ? (
                    <span className="badge warn">{tt('ไม่ตรงกฎ — เลือกเอง หรือปล่อยไว้')}</span>
                  ) : null}
                </span>
                <CategorySelect
                  value={it.categoryId}
                  type={it.type}
                  onChange={(id) => patch(it.key, { categoryId: id, autoCat: false })}
                />
              </label>
              <details>
                <summary className="small muted">{tt('ข้อความที่ OCR อ่านได้')}</summary>
                <pre>{it.result?.rawText}</pre>
              </details>
            </>
          )}
        </div>
      ))}

      {items.length === 0 && (
        <div className="card small muted stack">
          <strong style={{ color: 'var(--text)' }}>{tt('วิธีใช้')}</strong>
          <div>{tt('1. ตอนโอนเงินในแอพธนาคาร ให้พิมพ์ "บันทึกช่วยจำ / note" เช่น')} <code>{tt('ค่าข้าว')}</code> <code>grab</code></div>
          <div>{tt('2. เลือกรูปสลิปที่แอพธนาคารบันทึกลงเครื่อง แอพจะอ่านยอด วันเวลา และ note ให้')}</div>
          <div>{tt('3. แอพจะจัดหมวดจาก note ตามกฎที่ตั้งไว้ใน')} <em>{tt('ตั้งค่า → หมวดหมู่')}</em> {tt('ตรวจทานแล้วกดบันทึก')}</div>
          <div>{tt('สลิปที่มี QR จะถูกจำไว้ ถ้านำเข้าซ้ำแอพจะเตือนให้')}</div>
        </div>
      )}

      {preview && (
        <Sheet title={tt('สลิป')} onClose={() => setPreview(null)}>
          <img src={preview} alt={tt('สลิป')} style={{ width: '100%', borderRadius: 12 }} />
        </Sheet>
      )}
    </div>
  );
}

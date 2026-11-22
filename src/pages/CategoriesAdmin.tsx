import { useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { matchCategory, normalizeText, parseKeywords } from '../lib/categorize';
import { money, parseAmount } from '../lib/format';
import { EMOJI_CHOICES, PALETTE } from '../lib/defaults';
import { useReapplyRules } from '../lib/useReapply';
import { Sheet } from '../components/ui';
import type { Category, CategoryGroup, TxType } from '../lib/types';

function move<T extends { id: string }>(list: T[], id: string, delta: number): string[] | null {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const ids = list.map((x) => x.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

export default function CategoriesAdmin() {
  const data = useData();
  const [type, setType] = useState<TxType>('expense');
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editGroup, setEditGroup] = useState<Partial<CategoryGroup> | null>(null);
  const [test, setTest] = useState('');
  const reapply = useReapplyRules();

  const groups = data.groups.filter((g) => g.type === type);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    data.transactions.forEach((t) => t.categoryId && m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1));
    return m;
  }, [data.transactions]);

  // keyword ที่ซ้ำกันหลายหมวด
  const conflicts = useMemo(() => {
    const seen = new Map<string, string[]>();
    data.categories.forEach((c) =>
      [c.name, ...(c.keywords || [])].forEach((k) => {
        const n = normalizeText(k);
        if (!n) return;
        const list = seen.get(n) ?? [];
        if (!list.includes(c.name)) list.push(c.name);
        seen.set(n, list);
      })
    );
    return [...seen.entries()].filter(([, cs]) => cs.length > 1);
  }, [data.categories]);

  const testResult = test.trim() ? matchCategory(test, data.categories) : null;
  const uncategorized = data.transactions.filter((t) => !t.categoryId).length;

  return (
    <div className="page">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>ทดสอบกฎจับคู่ note</h2>
        <input className="input" placeholder="พิมพ์ note เหมือนบนสลิป เช่น ค่าข้าวเที่ยง" value={test} onChange={(e) => setTest(e.target.value)} />
        {test.trim() && (
          <div className="small">
            {testResult ? (
              <>
                → <strong>{testResult.category.icon} {testResult.category.name}</strong>{' '}
                <span className="muted">
                  ({data.groupById.get(testResult.category.groupId)?.name} · ตรงกับคำว่า “{testResult.term}”)
                </span>
              </>
            ) : (
              <span className="muted">ไม่ตรงกฎไหน → จะเป็น “ยังไม่จัดหมวด”</span>
            )}
          </div>
        )}
        {uncategorized > 0 && (
          <button className="btn sm" onClick={reapply}>⚡ จัดหมวด {uncategorized} รายการที่ค้างอยู่ตามกฎปัจจุบัน</button>
        )}
        {conflicts.length > 0 && (
          <div className="small" style={{ color: 'var(--warn)' }}>
            ⚠ คำที่ซ้ำกันหลายหมวด (แอพจะเลือกหมวดที่ตรงยาวที่สุด/ตรงแรกสุด):{' '}
            {conflicts.map(([k, cs]) => `“${k}” (${cs.join(', ')})`).join(' · ')}
          </div>
        )}
      </div>

      <div className="seg">
        <button className={type === 'expense' ? 'on expense' : ''} onClick={() => setType('expense')}>หมวดรายจ่าย</button>
        <button className={type === 'income' ? 'on income' : ''} onClick={() => setType('income')}>หมวดรายรับ</button>
      </div>

      {groups.map((g) => {
        const cats = data.categories.filter((c) => c.groupId === g.id);
        return (
          <div key={g.id} className="group-block">
            <div className="group-head">
              <span className="dot" style={{ background: g.color }} />
              <strong>{g.name}</strong>
              <button className="icon-btn" aria-label="เลื่อนขึ้น" onClick={() => { const ids = move(groups, g.id, -1); if (ids) data.reorder('groups', ids); }}>↑</button>
              <button className="icon-btn" aria-label="เลื่อนลง" onClick={() => { const ids = move(groups, g.id, 1); if (ids) data.reorder('groups', ids); }}>↓</button>
              <button className="icon-btn" aria-label="แก้ไขกลุ่ม" onClick={() => setEditGroup(g)}>✎</button>
            </div>
            {cats.map((c) => (
              <div key={c.id} className="cat-row">
                <span className="emoji">{c.icon}</span>
                <div className="main">
                  <div>
                    {c.name}{' '}
                    {(c.budget ?? 0) > 0 && <span className="badge">งบ {money(c.budget!)}</span>}{' '}
                    <span className="muted small">{usage.get(c.id) ?? 0} รายการ</span>
                  </div>
                  <div className="chips">
                    {(c.keywords || []).length === 0 ? (
                      <span className="small muted">ไม่มี keyword (จับคู่จากชื่อหมวดอย่างเดียว)</span>
                    ) : (
                      c.keywords.map((k) => <span key={k} className="chip">{k}</span>)
                    )}
                  </div>
                </div>
                <button className="icon-btn" aria-label="เลื่อนขึ้น" onClick={() => { const ids = move(cats, c.id, -1); if (ids) data.reorder('categories', ids); }}>↑</button>
                <button className="icon-btn" aria-label="เลื่อนลง" onClick={() => { const ids = move(cats, c.id, 1); if (ids) data.reorder('categories', ids); }}>↓</button>
                <button className="icon-btn" aria-label="แก้ไขหมวด" onClick={() => setEditCat(c)}>✎</button>
              </div>
            ))}
            <div className="cat-row">
              <button className="btn sm ghost" onClick={() => setEditCat({ groupId: g.id, type: g.type, icon: '🧾', keywords: [], budget: 0 })}>
                + เพิ่มหมวดในกลุ่มนี้
              </button>
            </div>
          </div>
        );
      })}

      <button className="btn block" onClick={() => setEditGroup({ name: '', type, color: PALETTE[data.groups.length % PALETTE.length] })}>
        + เพิ่มกลุ่มใหม่
      </button>

      {editCat && <CategoryForm c={editCat} usage={editCat.id ? usage.get(editCat.id) ?? 0 : 0} onClose={() => setEditCat(null)} />}
      {editGroup && <GroupForm g={editGroup} onClose={() => setEditGroup(null)} />}
    </div>
  );
}

function CategoryForm({ c, usage, onClose }: { c: Partial<Category>; usage: number; onClose: () => void }) {
  const data = useData();
  const [name, setName] = useState(c.name ?? '');
  const [groupId, setGroupId] = useState(c.groupId ?? data.groups[0]?.id ?? '');
  const [icon, setIcon] = useState(c.icon ?? '🧾');
  const [keywords, setKeywords] = useState((c.keywords ?? []).join(', '));
  const [budget, setBudget] = useState(c.budget ? String(c.budget) : '');
  const group = data.groupById.get(groupId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !group) return;
    data.saveCategory({
      id: c.id,
      name: name.trim(),
      groupId,
      type: group.type,
      icon: icon || '🧾',
      keywords: parseKeywords(keywords),
      budget: group.type === 'expense' ? parseAmount(budget) || 0 : 0,
      order: c.order ?? 0
    });
    onClose();
  };

  const remove = () => {
    if (confirm(`ลบหมวด "${c.name}"?${usage ? `\nรายการ ${usage} รายการจะกลายเป็น "ยังไม่จัดหมวด"` : ''}`)) {
      data.deleteCategory(c.id!);
      onClose();
    }
  };

  return (
    <Sheet title={c.id ? 'แก้ไขหมวด' : 'เพิ่มหมวด'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>ชื่อหมวด</span><input className="input" value={name} autoFocus={!c.id} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">
          <span>อยู่ในกลุ่ม</span>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {(['expense', 'income'] as const).map((t) => (
              <optgroup key={t} label={t === 'expense' ? 'รายจ่าย' : 'รายรับ'}>
                {data.groups.filter((g) => g.type === t).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span>คำที่ใช้จับคู่กับ note บนสลิป (คั่นด้วย , )</span>
          <textarea className="input" rows={3} value={keywords} placeholder="เช่น ข้าว, ค่าข้าว, กับข้าว" onChange={(e) => setKeywords(e.target.value)} />
          <span className="small muted">ถ้า note มีคำเหล่านี้หรือชื่อหมวดอยู่ จะถูกจัดเข้าหมวดนี้อัตโนมัติ (ไม่สนตัวพิมพ์/ช่องว่าง)</span>
        </label>
        {group?.type === 'expense' && (
          <label className="field">
            <span>งบประมาณต่อเดือน (เว้นว่าง = ไม่ตั้งงบ)</span>
            <input className="input" inputMode="decimal" value={budget} placeholder="0" onChange={(e) => setBudget(e.target.value)} />
          </label>
        )}
        <div className="field">
          <span>ไอคอน</span>
          <div className="emoji-grid">
            {EMOJI_CHOICES.map((e) => (
              <button type="button" key={e} className={e === icon ? 'on' : ''} onClick={() => setIcon(e)}>{e}</button>
            ))}
          </div>
          <input className="input" value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} aria-label="ไอคอนกำหนดเอง" style={{ width: 90 }} />
        </div>
        <button className="btn primary block" disabled={!name.trim() || !group}>บันทึก</button>
        {c.id && <button type="button" className="btn danger block" onClick={remove}>ลบหมวด</button>}
      </form>
    </Sheet>
  );
}

function GroupForm({ g, onClose }: { g: Partial<CategoryGroup>; onClose: () => void }) {
  const data = useData();
  const [name, setName] = useState(g.name ?? '');
  const [type, setType] = useState<TxType>(g.type ?? 'expense');
  const [color, setColor] = useState(g.color ?? PALETTE[0]);
  const count = g.id ? data.categories.filter((c) => c.groupId === g.id).length : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    data.saveGroup({ id: g.id, name: name.trim(), type, color, order: g.order ?? 0 });
    onClose();
  };
  const remove = () => {
    if (count > 0) {
      alert(`กลุ่มนี้ยังมี ${count} หมวด — ย้ายหรือลบหมวดออกก่อน`);
      return;
    }
    if (confirm(`ลบกลุ่ม "${g.name}"?`)) {
      data.deleteGroup(g.id!);
      onClose();
    }
  };
  return (
    <Sheet title={g.id ? 'แก้ไขกลุ่ม' : 'เพิ่มกลุ่ม'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>ชื่อกลุ่ม</span><input className="input" value={name} autoFocus={!g.id} onChange={(e) => setName(e.target.value)} /></label>
        <div className="field">
          <span>ประเภท {g.id && count > 0 && <span className="small muted">(หมวดในกลุ่มจะเปลี่ยนตาม)</span>}</span>
          <div className="seg">
            <button type="button" className={type === 'expense' ? 'on expense' : ''} onClick={() => setType('expense')}>รายจ่าย</button>
            <button type="button" className={type === 'income' ? 'on income' : ''} onClick={() => setType('income')}>รายรับ</button>
          </div>
        </div>
        <div className="field"><span>สี (ใช้ในกราฟ)</span>
          <div className="swatches">{PALETTE.map((c) => <button type="button" key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        </div>
        <button className="btn primary block" disabled={!name.trim()}>บันทึก</button>
        {g.id && <button type="button" className="btn danger block" onClick={remove}>ลบกลุ่ม</button>}
      </form>
    </Sheet>
  );
}

import { useState } from 'react';
import { useData } from '../lib/store';
import { accountBalances } from '../lib/stats';
import { money, parseAmount } from '../lib/format';
import { PALETTE } from '../lib/defaults';
import { Sheet } from '../components/ui';
import type { Account } from '../lib/types';
import { displayName, useI18n } from '../lib/i18n';

export default function Accounts() {
  const { tt } = useI18n();
  const data = useData();
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const bal = accountBalances(data.accounts, data.transactions);
  const total = [...bal.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <h2>{tt('ยอดรวมทุกบัญชี')}</h2>
          <strong>{money(total)}</strong>
        </div>
        <div className="menu">
          {data.accounts.map((a) => (
            <button key={a.id} onClick={() => setEdit(a)}>
              <span className="ico" style={{ color: a.color }}>●</span>
              <span>{displayName(a.name)}</span>
              <span className="chev">{money(bal.get(a.id) ?? 0)} ›</span>
            </button>
          ))}
        </div>
      </div>
      <button className="btn block" onClick={() => setEdit({ name: '', initialBalance: 0, color: PALETTE[data.accounts.length % PALETTE.length] })}>
        {tt('+ เพิ่มบัญชี / กระเป๋าเงิน')}
      </button>
      {edit && <AccountForm a={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AccountForm({ a, onClose }: { a: Partial<Account>; onClose: () => void }) {
  const { tt } = useI18n();
  const data = useData();
  const [name, setName] = useState(a.name ?? '');
  const [initial, setInitial] = useState(String(a.initialBalance ?? 0));
  const [color, setColor] = useState(a.color ?? PALETTE[0]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    data.saveAccount({ id: a.id, name: name.trim(), initialBalance: parseAmount(initial) || 0, color, order: a.order ?? 0 });
    onClose();
  };
  const remove = () => {
    const n = data.transactions.filter((t) => t.accountId === a.id).length;
    if (confirm(tt('ลบบัญชี "{name}"?', { name: a.name ?? '' }) + (n ? '\n' + tt('มี {n} รายการที่ใช้บัญชีนี้ จะกลายเป็น "ไม่ระบุบัญชี"', { n }) : ''))) {
      data.deleteAccount(a.id!);
      onClose();
    }
  };
  return (
    <Sheet title={a.id ? tt('แก้ไขบัญชี') : tt('เพิ่มบัญชี')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>{tt('ชื่อ')}</span><input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={tt('เช่น กสิกร, เงินสด, บัตรเครดิต')} /></label>
        <label className="field"><span>{tt('ยอดเงินตั้งต้น')}</span><input className="input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} /></label>
        <div className="field"><span>{tt('สี')}</span>
          <div className="swatches">{PALETTE.map((c) => <button type="button" key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        </div>
        <button className="btn primary block" disabled={!name.trim()}>{tt('บันทึก')}</button>
        {a.id && <button type="button" className="btn danger block" onClick={remove}>{tt('ลบบัญชี')}</button>}
      </form>
    </Sheet>
  );
}

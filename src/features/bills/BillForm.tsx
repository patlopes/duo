import { useMemo, useState } from 'react';
import { useData } from '../../db/DataContext';
import {
  COUPLE_BILLS_CATEGORY_ID,
  createTransaction,
  deleteTransaction,
  ensureJointAccount,
  undoDeleteTransaction,
  updateTransaction,
} from '../../db/ops';
import { addMonths, dayInMonth, dayNumber, monthOf, today } from '../../domain/months';
import type { Category, Transaction } from '../../schemas/entities';
import { CategoryPicker } from '../../ui/CategoryPicker';
import { ChoiceChips, Field, MoneyField, Sheet } from '../../ui/parts';
import { useUi, type BillRequest } from '../../ui/uiStore';
import { useToast } from '../../ui/useToast';
import { useClosedMonthGuard, useScopePrompt } from '../form/useScopePrompt';

/** What couples pay together, in the order they think of it. */
const QUICK_NAMES = ['Moradia', 'Contas do casal', 'Casamento', 'Casa nova', 'Compras', 'Viagem'];

type Mode = 'recurring' | 'once' | 'installments';

function BillSheet({ request, onClose }: { request: BillRequest; onClose: () => void }) {
  const { categories } = useData();
  const month = useUi((s) => s.month);
  const presentToast = useToast();
  const askScope = useScopePrompt();
  const confirmClosed = useClosedMonthGuard();
  const editing = request.transaction ?? null;

  const defaultDate = () => {
    const now = today();
    return monthOf(now) === month ? now : dayInMonth(month, dayNumber(now));
  };
  const [name, setName] = useState(editing?.description ?? '');
  const [cents, setCents] = useState(editing?.amountCents ?? 0);
  const [mode, setMode] = useState<Mode>(request.mode ?? 'recurring');
  const [count, setCount] = useState(6);
  const [date, setDate] = useState(editing?.date ?? defaultDate());
  const [paid, setPaid] = useState(editing?.status === 'paid');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState('');

  const quick = useMemo(
    () =>
      QUICK_NAMES.map((n) =>
        categories.find((c) => c.name === n && c.kind === 'expense' && !c.archived),
      ).filter((c): c is Category => !!c),
    [categories],
  );
  const selected = categories.find((c) => c.id === categoryId);
  const isSeries = !!(editing?.recurrenceId || editing?.installmentGroupId);

  const save = async () => {
    if (!name.trim()) return setError('Dê um nome: aluguel, luz, buffet…');
    if (cents <= 0) return setError('Quanto é essa conta?');
    setError('');
    const fallback = categories.find(
      (c) => c.id === COUPLE_BILLS_CATEGORY_ID || c.name === 'Contas do casal',
    );
    if (editing) {
      if (!(await confirmClosed(editing.competenceMonth))) return;
      const scope = isSeries ? await askScope('Mudar em') : 'one';
      if (!scope) return;
      const patch: Partial<Transaction> = {
        description: name.trim(),
        amountCents: cents,
        categoryId: categoryId ?? fallback?.id ?? null,
        status: paid ? 'paid' : 'pending',
      };
      if (date !== editing.date) patch.date = date;
      await updateTransaction(editing.id, patch, scope);
      onClose();
      return;
    }
    const joint = await ensureJointAccount();
    await createTransaction({
      kind: 'expense',
      amountCents: cents,
      description: name,
      date,
      accountId: joint.id,
      cardId: null,
      categoryId: categoryId ?? fallback?.id ?? null,
      tagIds: [],
      status: paid ? 'paid' : 'pending',
      notes: '',
      payerMemberId: null,
      splitRule: 'proportional',
      goalId: null,
      goalItemId: null,
      repeat:
        mode === 'recurring'
          ? { mode: 'recurring', frequency: 'monthly', endDate: null }
          : mode === 'installments'
            ? { mode: 'installments', count }
            : { mode: 'none' },
    });
    onClose();
    void presentToast({
      message: mode === 'recurring' ? 'Conta fixa criada para todos os meses' : 'Conta adicionada',
      duration: 2000,
      position: 'top',
    });
  };

  const remove = async () => {
    if (!editing) return;
    if (!(await confirmClosed(editing.competenceMonth))) return;
    const scope = isSeries ? await askScope('Excluir') : 'one';
    if (!scope) return;
    const undo = await deleteTransaction(editing.id, scope);
    onClose();
    void presentToast({
      message: undo.ids.length > 1 ? `${undo.ids.length} contas excluídas` : 'Conta excluída',
      duration: 5000,
      position: 'top',
      buttons: [
        { text: 'Desfazer', handler: () => void undoDeleteTransaction(undo.ids, undo.recurrence) },
      ],
    });
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={editing ? 'Editar conta' : mode === 'recurring' ? 'Conta fixa' : 'Conta ou compra'}
      onSave={() => void save()}
    >
      <Field label="O que é">
        <input
          className="input"
          aria-label="Nome da conta"
          placeholder="Aluguel"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Quanto">
        <MoneyField value={cents} onChange={setCents} ariaLabel="Valor da conta" />
      </Field>
      {!editing && (
        <Field label="Repete?">
          <ChoiceChips
            ariaLabel="Repete"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'recurring', label: 'Todo mês' },
              { value: 'once', label: 'Só uma vez' },
              { value: 'installments', label: 'Parcelado' },
            ]}
          />
        </Field>
      )}
      {!editing && mode === 'installments' && (
        <Field label="Quantas parcelas">
          <input
            className="input tabular"
            inputMode="numeric"
            aria-label="Quantas parcelas"
            value={count}
            onChange={(e) =>
              setCount(Math.min(120, Math.max(2, Number(e.target.value.replace(/\D/g, '')) || 2)))
            }
          />
        </Field>
      )}
      <Field label={mode === 'recurring' && !editing ? 'Vence a partir de' : 'Vence em'}>
        <input
          type="date"
          className="input"
          aria-label="Vencimento"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </Field>
      {!editing && mode === 'once' && (
        <div className="chips" style={{ marginBottom: 'var(--space-4)' }}>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className="chip"
              onClick={() => setDate(dayInMonth(addMonths(monthOf(today()), n), 10))}
            >
              Daqui a {n} {n === 1 ? 'mês' : 'meses'}
            </button>
          ))}
        </div>
      )}
      <Field label="Faz parte de">
        <div className="chips">
          {quick.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip ${categoryId === c.id ? 'chip-on' : ''}`}
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${selected && !quick.includes(selected) ? 'chip-on' : ''}`}
            onClick={() => setPickerOpen(true)}
          >
            {selected && !quick.includes(selected) ? selected.name : 'Outra'}
          </button>
        </div>
      </Field>
      <label className="toggle-row">
        <span>Já está paga</span>
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
      </label>
      {error && <p className="tone-expense small">{error}</p>}
      {editing && (
        <button type="button" className="danger-button" onClick={() => void remove()}>
          Excluir conta
        </button>
      )}
      <CategoryPicker
        isOpen={pickerOpen}
        kind="expense"
        onClose={() => setPickerOpen(false)}
        onPick={(c) => {
          setCategoryId(c.id);
          setPickerOpen(false);
        }}
      />
    </Sheet>
  );
}

export default function BillFormHost() {
  const request = useUi((s) => s.bill);
  const close = useUi((s) => s.closeBill);
  if (!request) return null;
  return <BillSheet request={request} onClose={close} />;
}

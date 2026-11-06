import { useState } from 'react';
import { useData } from '../../db/DataContext';
import { today } from '../../domain/months';
import type { Invoice } from '../../domain/invoices';
import type { CreditCard } from '../../schemas/entities';
import { Field, MoneyField, Sheet } from '../../ui/parts';

/** Partial payments are allowed. It is a transfer account → card, never an expense (spec 2.2). */
export function PayInvoiceSheet({
  card,
  invoice,
  onClose,
}: {
  card: CreditCard;
  invoice: Invoice;
  onClose: () => void;
}) {
  const { accounts } = useData();
  const active = accounts.filter((a) => !a.archived);
  const [cents, setCents] = useState(invoice.remainingCents);
  const [accountId, setAccountId] = useState(card.paymentAccountId ?? active[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');

  const save = async () => {
    if (!accountId) return setError('Cadastre uma conta para pagar a fatura.');
    if (cents <= 0) return setError('Digite o valor do pagamento.');
    const { payInvoice } = await import('../../db/ops');
    await payInvoice(card, invoice.month, cents, accountId, date);
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title="Pagar fatura"
      onSave={() => void save()}
      saveLabel="Pagar"
      initial={0.92}
    >
      <Field label="Valor" hint="Pode ser menos que o total: a diferença continua em aberto.">
        <MoneyField value={cents} onChange={setCents} ariaLabel="Valor do pagamento" />
      </Field>
      <Field label="Pagar com">
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data">
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
    </Sheet>
  );
}

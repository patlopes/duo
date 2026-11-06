import { CreditCardIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import { softDelete, upsert } from '../../db/ops';
import {
  availableLimit,
  bestPurchaseDay,
  cardInvoices,
  invoiceDates,
  invoiceMonthFor,
  buildInvoice,
  type InvoiceStatus,
} from '../../domain/invoices';
import { addMonths, monthLabel, shortDay, today } from '../../domain/months';
import type { CreditCard } from '../../schemas/entities';
import { EmptyState } from '../../ui/EmptyState';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import { Field, MoneyField, ProgressBar, Section, Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { PayInvoiceSheet } from './PayInvoiceSheet';

const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  open: { label: 'Aberta', className: 'badge' },
  closed: { label: 'Fechada', className: 'badge badge-warning' },
  paid: { label: 'Paga', className: 'badge badge-income' },
  overdue: { label: 'Vencida', className: 'badge badge-expense' },
};

function CardForm({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  const { accounts, members, transactions } = useData();
  const [archived, setArchived] = useState(card?.archived ?? false);
  const inUse = !!card && transactions.some((t) => t.cardId === card.id);
  const [name, setName] = useState(card?.name ?? '');
  const [brand, setBrand] = useState(card?.brand ?? '');
  const [limit, setLimit] = useState(card?.limitCents ?? 0);
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? 3));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 10));
  const [paymentAccountId, setPaymentAccountId] = useState(
    card?.paymentAccountId ?? accounts[0]?.id ?? '',
  );
  const [ownerMemberId, setOwnerMemberId] = useState(card?.ownerMemberId ?? members[0].id);
  const [error, setError] = useState('');

  const save = async () => {
    const closing = Number(closingDay);
    const due = Number(dueDay);
    if (!name.trim()) return setError('Dê um nome ao cartão.');
    if (!(closing >= 1 && closing <= 31) || !(due >= 1 && due <= 31)) {
      return setError('Fechamento e vencimento são dias de 1 a 31.');
    }
    await upsert<CreditCard>('cards', {
      ...(card ?? {}),
      name: name.trim(),
      brand,
      limitCents: limit,
      closingDay: closing,
      dueDay: due,
      paymentAccountId: paymentAccountId || null,
      ownerMemberId,
      color: card?.color ?? '#6E2F6B',
      archived,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={card ? 'Editar cartão' : 'Novo cartão'}
      onSave={() => void save()}
    >
      <Field label="Nome">
        <input
          className="input"
          aria-label="Nome do cartão"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Bandeira">
        <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </Field>
      <Field label="Limite">
        <MoneyField value={limit} onChange={setLimit} ariaLabel="Limite" />
      </Field>
      <div className="two-cols">
        <Field label="Dia do fechamento">
          <input
            className="input tabular"
            inputMode="numeric"
            aria-label="Dia do fechamento"
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Dia do vencimento">
          <input
            className="input tabular"
            inputMode="numeric"
            aria-label="Dia do vencimento"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>
      <Field label="Conta que paga a fatura">
        <select
          className="select"
          value={paymentAccountId}
          onChange={(e) => setPaymentAccountId(e.target.value)}
        >
          <option value="">Escolher na hora</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dono do cartão">
        <select
          className="select"
          value={ownerMemberId}
          onChange={(e) => setOwnerMemberId(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
      {card && (
        <label className="toggle-row">
          <span>Arquivar (some das listas, o histórico fica)</span>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
        </label>
      )}
      {card && !inUse && (
        <button
          type="button"
          className="danger-button"
          onClick={() => void softDelete('cards', card.id).then(onClose)}
        >
          Excluir cartão
        </button>
      )}
    </Sheet>
  );
}

export function CardsPage() {
  const { cards, transactions, transfers } = useData();
  const [creating, setCreating] = useState(false);
  const now = today();
  return (
    <LargeTitlePage
      title="Cartões"
      backHref="/tabs/more"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setCreating(true)}>
          Novo
        </button>
      }
    >
      <div className="page-pad">
        {cards.length === 0 ? (
          <EmptyState
            icon={<CreditCardIcon />}
            title="Nenhum cartão por aqui"
            description="Cadastre o cartão para ver faturas, parcelas e o limite disponível."
            action={
              <button type="button" className="primary-button" onClick={() => setCreating(true)}>
                Cadastrar cartão
              </button>
            }
          />
        ) : (
          <div className="card-list">
            {cards.map((c) => {
              const available = availableLimit(c, transactions, transfers, now);
              return (
                <Link key={c.id} className="row" to={`/tabs/more/cards/${c.id}`}>
                  <span className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="row-sub">
                      Disponível: <MoneyText cents={available} />
                    </span>
                    <ProgressBar
                      value={c.limitCents ? 1 - available / c.limitCents : 0}
                      label="Limite usado"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {creating && <CardForm card={null} onClose={() => setCreating(false)} />}
    </LargeTitlePage>
  );
}

export function CardDetailPage() {
  const { id } = useParams();
  const { cards, transactions, transfers, categories } = useData();
  const openForm = useUi((s) => s.openForm);
  const card = cards.find((c) => c.id === id);
  const now = today();
  const [month, setMonth] = useState(() => (card ? invoiceMonthFor(now, card) : ''));
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!card) {
    return (
      <LargeTitlePage title="Cartão" backHref="/tabs/more/cards">
        <p className="empty-note">Este cartão não existe mais.</p>
      </LargeTitlePage>
    );
  }

  const invoice = buildInvoice(card, month, transactions, transfers, now);
  const dates = invoiceDates(month, card);
  const available = availableLimit(card, transactions, transfers, now);
  const months = cardInvoices(card, transactions, transfers, now).map((i) => i.month);
  const status = STATUS[invoice.status];
  const sorted = [...invoice.items].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <LargeTitlePage
      title={card.name}
      backHref="/tabs/more/cards"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Editar
        </button>
      }
    >
      <div className="page-pad">
        <div className="card">
          <span className="stat-label">Limite disponível</span>
          <MoneyText cents={available} className="stat-value" />
          <ProgressBar
            value={card.limitCents ? 1 - available / card.limitCents : 0}
            label="Limite usado"
          />
          <div className="limit-line">
            <span>
              Limite total: <MoneyText cents={card.limitCents} />
            </span>
            <span>Melhor dia: {shortDay(bestPurchaseDay(card, now))}</span>
          </div>
        </div>

        <div className="month-picker" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="icon-button"
            aria-label="Fatura anterior"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <CaretLeftIcon size={20} weight="bold" aria-hidden="true" />
          </button>
          <span className="month-picker-label center" style={{ lineHeight: '44px' }}>
            {monthLabel(month)}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Próxima fatura"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <CaretRightIcon size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="card">
          <div className="section-head">
            <span className="stat-label">Total da fatura</span>
            <span className={status.className}>{status.label}</span>
          </div>
          <MoneyText cents={invoice.totalCents} className="big-money" />
          <div className="limit-line">
            <span>Fecha {shortDay(dates.closing)}</span>
            <span>Vence {shortDay(dates.due)}</span>
          </div>
          {invoice.paidCents > 0 && (
            <div className="limit-line">
              <span>
                Pago: <MoneyText cents={invoice.paidCents} />
              </span>
              <span>
                Falta: <MoneyText cents={invoice.remainingCents} />
              </span>
            </div>
          )}
          {invoice.remainingCents > 0 && (
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => setPaying(true)}
            >
              Pagar fatura
            </button>
          )}
        </div>

        <Section title="Lançamentos da fatura">
          <div className="card-list">
            {sorted.length === 0 && <p className="empty-note">Nenhuma compra nesta fatura.</p>}
            {sorted.map((t) => (
              <button
                key={t.id}
                type="button"
                className="row"
                onClick={() => openForm({ type: 'card', transaction: t })}
              >
                <span className="row-main">
                  <span className="row-title">
                    {t.description ||
                      categories.find((c) => c.id === t.categoryId)?.name ||
                      'Compra'}
                  </span>
                  <span className="row-sub">
                    {shortDay(t.date)}
                    {t.installmentNumber ? ` · ${t.installmentNumber}/${t.installmentTotal}` : ''}
                  </span>
                </span>
                <MoneyText
                  className="row-end"
                  cents={t.kind === 'income' ? -t.amountCents : t.amountCents}
                />
              </button>
            ))}
          </div>
        </Section>
        {months.length > 1 && (
          <p className="small muted center" style={{ marginTop: 'var(--space-3)' }}>
            {months.length} faturas com movimento. Use as setas para navegar.
          </p>
        )}
      </div>
      {paying && <PayInvoiceSheet card={card} invoice={invoice} onClose={() => setPaying(false)} />}
      {editing && <CardForm card={card} onClose={() => setEditing(false)} />}
    </LargeTitlePage>
  );
}

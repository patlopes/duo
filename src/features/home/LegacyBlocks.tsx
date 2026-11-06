import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Data } from '../../db/DataContext';
import { toggleStatus } from '../../db/ops';
import { accountBalance, totalBalance, totalForecast } from '../../domain/balances';
import { budgetLines } from '../../domain/budgets';
import {
  availableLimit,
  buildInvoice,
  cardInvoices,
  invoiceMonthFor,
  type Invoice,
} from '../../domain/invoices';
import { formatBRLRound } from '../../domain/money';
import { addDays, dayLabel, shortDay } from '../../domain/months';
import { computeSettlement } from '../../domain/split';
import { monthTotals } from '../../domain/summaries';
import type { CreditCard, Transaction } from '../../schemas/entities';
import type { HomeBlock } from '../../schemas/settingsDefaults';
import { IconBubble } from '../../ui/icons';
import { MoneyText } from '../../ui/MoneyText';
import { ProgressBar, Section } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { PayInvoiceSheet } from '../cards/PayInvoiceSheet';

interface Bill {
  id: string;
  date: string;
  title: string;
  cents: number;
  transaction?: Transaction;
  invoice?: { card: CreditCard; invoice: Invoice };
}

function BillsBlock({ data, now }: { data: Data; now: string }) {
  const openForm = useUi((s) => s.openForm);
  const [paying, setPaying] = useState<{ card: CreditCard; invoice: Invoice } | null>(null);
  const horizon = addDays(now, 7);
  const bills: Bill[] = [];
  for (const t of data.transactions) {
    if (t.kind === 'expense' && t.status === 'pending' && !t.cardId && t.date <= horizon) {
      bills.push({
        id: t.id,
        date: t.date,
        title: t.description || 'Conta',
        cents: t.amountCents,
        transaction: t,
      });
    }
  }
  for (const card of data.cards) {
    for (const invoice of cardInvoices(card, data.transactions, data.transfers, now)) {
      if (invoice.remainingCents > 0 && invoice.due <= horizon) {
        bills.push({
          id: `${card.id}-${invoice.month}`,
          date: invoice.due,
          title: `Fatura ${card.name}`,
          cents: invoice.remainingCents,
          invoice: { card, invoice },
        });
      }
    }
  }
  if (bills.length === 0) return null;
  bills.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Section title="Contas a pagar">
      <div className="card-list">
        {bills.slice(0, 6).map((bill) => {
          const overdue = bill.date < now;
          return (
            <div key={bill.id} className="row">
              <button
                type="button"
                className="row-main link-reset"
                onClick={() =>
                  bill.transaction && openForm({ type: 'expense', transaction: bill.transaction })
                }
              >
                <span className="row-title">{bill.title}</span>
                <span className={`row-sub ${overdue ? 'tone-expense' : ''}`}>
                  {overdue ? `Vencido em ${shortDay(bill.date)}` : dayLabel(bill.date, now)} ·{' '}
                  <MoneyText cents={bill.cents} />
                </span>
              </button>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  bill.invoice ? setPaying(bill.invoice) : void toggleStatus(bill.id)
                }
              >
                Pagar
              </button>
            </div>
          );
        })}
      </div>
      {paying && (
        <PayInvoiceSheet
          card={paying.card}
          invoice={paying.invoice}
          onClose={() => setPaying(null)}
        />
      )}
    </Section>
  );
}

/** The detailed tracking blocks. Hidden by default: anyone who wants them turns them on in Ajustes. */
export function LegacyBlocks({
  block,
  data,
  month,
  now,
}: {
  block: HomeBlock;
  data: Data;
  month: string;
  now: string;
}) {
  switch (block) {
    case 'summary': {
      const totals = monthTotals(data.transactions, month);
      return (
        <Section title="Saldo das contas">
          <div className="card">
            <MoneyText
              cents={totalBalance(data.accounts, data.transactions, data.transfers)}
              className="big-money"
            />
            <span className="stat-label">
              Previsto para o fim do mês:{' '}
              <MoneyText
                cents={totalForecast(
                  data.accounts,
                  data.cards,
                  data.transactions,
                  data.transfers,
                  month,
                  now,
                )}
              />
            </span>
            <div className="two-cols" style={{ marginTop: 'var(--space-3)' }}>
              <div>
                <span className="stat-label">Entradas lançadas</span>
                <MoneyText cents={totals.incomeCents} tone="income" className="stat-value" />
              </div>
              <div>
                <span className="stat-label">Saídas lançadas</span>
                <MoneyText cents={totals.expenseCents} tone="expense" className="stat-value" />
              </div>
            </div>
          </div>
        </Section>
      );
    }
    case 'accounts':
      return (
        <Section
          title="Contas"
          action={
            <Link className="link-button" to="/tabs/home/accounts">
              Ver todas
            </Link>
          }
        >
          <div className="card-list">
            {data.accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <Link key={a.id} className="row" to={`/tabs/home/accounts/${a.id}`}>
                  <IconBubble name={a.icon} color={a.color} />
                  <span className="row-main">
                    <span className="row-title">{a.name}</span>
                  </span>
                  <MoneyText
                    className="row-end"
                    cents={accountBalance(a, data.transactions, data.transfers)}
                  />
                </Link>
              ))}
          </div>
        </Section>
      );
    case 'cards': {
      const cards = data.cards.filter((c) => !c.archived);
      if (cards.length === 0) return null;
      return (
        <Section
          title="Cartões"
          action={
            <Link className="link-button" to="/tabs/home/cards">
              Ver todos
            </Link>
          }
        >
          <div className="card-list">
            {cards.map((c) => {
              const invoice = buildInvoice(
                c,
                invoiceMonthFor(now, c),
                data.transactions,
                data.transfers,
                now,
              );
              const available = availableLimit(c, data.transactions, data.transfers, now);
              return (
                <Link key={c.id} className="row" to={`/tabs/home/cards/${c.id}`}>
                  <span className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="row-sub">
                      Fecha {shortDay(invoice.closing)} · vence {shortDay(invoice.due)}
                    </span>
                    <ProgressBar
                      value={c.limitCents > 0 ? 1 - available / c.limitCents : 0}
                      label={`Limite usado de ${c.name}`}
                    />
                  </span>
                  <MoneyText className="row-end" cents={invoice.totalCents} />
                </Link>
              );
            })}
          </div>
        </Section>
      );
    }
    case 'bills':
      return <BillsBlock data={data} now={now} />;
    case 'budgets': {
      const lines = budgetLines(data.budgets, data.categories, data.transactions, month, now).slice(
        0,
        3,
      );
      if (lines.length === 0) return null;
      return (
        <Section
          title="Orçamentos"
          action={
            <Link className="link-button" to="/tabs/planning">
              Ver todos
            </Link>
          }
        >
          <div className="card stack">
            {lines.map((l) => (
              <div key={l.category.id}>
                <div className="limit-line">
                  <span>{l.category.name}</span>
                  <span>
                    <MoneyText cents={l.committedCents} /> de <MoneyText cents={l.limitCents} />
                  </span>
                </div>
                <ProgressBar
                  value={l.committedCents / l.limitCents}
                  tone={l.state === 'over' ? 'expense' : l.state === 'limit' ? 'warning' : 'income'}
                  label={`Orçamento de ${l.category.name}`}
                />
              </div>
            ))}
          </div>
        </Section>
      );
    }
    case 'couple': {
      const s = computeSettlement({ ...data }, month);
      const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? '';
      return (
        <Section
          title="Entre vocês"
          action={
            <Link className="link-button" to="/tabs/home/couple">
              Acerto
            </Link>
          }
        >
          <Link className="card row-card" to="/tabs/home/couple">
            {s.transfer
              ? `${name(s.transfer.fromMemberId)} manda ${data.settings.hideValues ? 'R$ ••••' : formatBRLRound(s.transfer.amountCents)} para ${name(s.transfer.toMemberId)}`
              : 'Tudo certo entre vocês ✨'}
          </Link>
        </Section>
      );
    }
    default:
      return null;
  }
}

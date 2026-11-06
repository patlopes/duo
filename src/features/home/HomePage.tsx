import { EyeIcon, EyeSlashIcon, XIcon } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, type Data } from '../../db/DataContext';
import { accountBalance, totalBalance, totalForecast } from '../../domain/balances';
import { budgetLines, monthSummary } from '../../domain/budgets';
import { goalMetrics, emergencyTarget, GOAL_HEALTH_LABEL } from '../../domain/goals';
import {
  availableLimit,
  buildInvoice,
  cardInvoices,
  invoiceMonthFor,
  type Invoice,
} from '../../domain/invoices';
import { formatBRLRound } from '../../domain/money';
import { addDays, dayLabel, shortDay, today } from '../../domain/months';
import { computeSettlement } from '../../domain/split';
import { categorySlices, monthTotals, topSlices } from '../../domain/summaries';
import { shouldOfferInstallGuide } from '../../pwa/platform';
import { usePwaStore } from '../../pwa/pwaStore';
import type { CreditCard, Transaction } from '../../schemas/entities';
import type { HomeBlock } from '../../schemas/settingsDefaults';
import { Donut } from '../../ui/Donut';
import { IconBubble } from '../../ui/icons';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import { MonthPicker, useMonthSwipe } from '../../ui/MonthPicker';
import { ProgressBar, Section } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { PayInvoiceSheet } from '../cards/PayInvoiceSheet';

function CardList({ children }: { children: ReactNode }) {
  return <div className="card-list">{children}</div>;
}

function SummaryBlock({ data, month, now }: { data: Data; month: string; now: string }) {
  const swipe = useMonthSwipe();
  const totals = monthTotals(data.transactions, month);
  const balance = totalBalance(data.accounts, data.transactions, data.transfers);
  const forecast = totalForecast(
    data.accounts,
    data.cards,
    data.transactions,
    data.transfers,
    month,
    now,
  );
  const summary = monthSummary(data.budgets, data.categories, data.transactions, month, now);
  const biggest = Math.max(totals.incomeCents, totals.expenseCents, 1);
  const hidden = data.settings.hideValues;

  const toggleHide = () =>
    void import('../../db/ops').then((ops) => ops.updateSettings({ hideValues: !hidden }));

  return (
    <div className="card" {...swipe}>
      <div className="section-head">
        <span className="stat-label">Saldo geral</span>
        <button
          type="button"
          className="icon-button"
          aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          onClick={toggleHide}
        >
          {hidden ? (
            <EyeSlashIcon size={22} aria-hidden="true" />
          ) : (
            <EyeIcon size={22} aria-hidden="true" />
          )}
        </button>
      </div>
      <MoneyText cents={balance} animate className="big-money" />
      <span className="stat-label">
        Previsto para o fim do mês: <MoneyText cents={forecast} />
      </span>
      <div className="compare-bar" aria-hidden="true">
        <span
          style={{
            width: `${(totals.incomeCents / biggest) * 50}%`,
            background: 'var(--fill-income)',
          }}
        />
        <span
          style={{
            width: `${(totals.expenseCents / biggest) * 50}%`,
            background: 'var(--fill-expense)',
          }}
        />
      </div>
      <div className="two-cols" style={{ marginTop: 'var(--space-3)' }}>
        <div>
          <span className="stat-label">Receitas</span>
          <MoneyText cents={totals.incomeCents} tone="income" className="stat-value" />
        </div>
        <div>
          <span className="stat-label">Despesas</span>
          <MoneyText cents={totals.expenseCents} tone="expense" className="stat-value" />
        </div>
      </div>
      {!hidden && <p className="summary-sentence">{summary.sentence}</p>}
    </div>
  );
}

function AccountsBlock({ data }: { data: Data }) {
  const accounts = data.accounts.filter((a) => !a.archived);
  return (
    <Section
      title="Contas"
      action={
        <Link className="link-button" to="/tabs/more/accounts">
          Ver todas
        </Link>
      }
    >
      <CardList>
        {accounts.length === 0 && (
          <Link className="row" to="/tabs/more/accounts">
            Cadastre a primeira conta
          </Link>
        )}
        {accounts.map((a) => (
          <Link key={a.id} className="row" to={`/tabs/more/accounts/${a.id}`}>
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
      </CardList>
    </Section>
  );
}

function CardsBlock({ data, now }: { data: Data; now: string }) {
  const cards = data.cards.filter((c) => !c.archived);
  if (cards.length === 0) return null;
  return (
    <Section
      title="Cartões"
      action={
        <Link className="link-button" to="/tabs/more/cards">
          Ver todos
        </Link>
      }
    >
      <CardList>
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
            <Link key={c.id} className="row" to={`/tabs/more/cards/${c.id}`}>
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
      </CardList>
    </Section>
  );
}

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

  const pay = (bill: Bill) => {
    if (bill.invoice) setPaying(bill.invoice);
    else void import('../../db/ops').then((ops) => ops.toggleStatus(bill.id));
  };

  return (
    <Section title="Contas a pagar">
      <CardList>
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
                  {overdue ? 'Vencido em ' : ''}
                  {overdue ? shortDay(bill.date) : dayLabel(bill.date, now)} ·{' '}
                  <MoneyText cents={bill.cents} />
                </span>
              </button>
              <button type="button" className="chip" onClick={() => pay(bill)}>
                Pagar
              </button>
            </div>
          );
        })}
      </CardList>
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

function CategoriesBlock({ data, month }: { data: Data; month: string }) {
  const navigate = useNavigate();
  const setFilters = useUi((s) => s.setFilters);
  const slices = useMemo(
    () => topSlices(categorySlices(data.transactions, data.categories, month)),
    [data.transactions, data.categories, month],
  );
  if (slices.length === 0) return null;
  const open = (categoryId: string | null) => {
    if (categoryId && categoryId !== '__other')
      navigate(`/tabs/more/reports?category=${categoryId}`);
    else navigate('/tabs/more/reports');
    setFilters({});
  };
  return (
    <Section title="Gastos por categoria">
      <div className="card donut-wrap">
        <Donut
          slices={slices}
          label={`Gastos por categoria: ${slices.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}`}
        />
        <div className="donut-legend">
          {slices.map((s) => (
            <button
              key={s.name}
              type="button"
              className="donut-legend-row"
              onClick={() => open(s.categoryId)}
            >
              <span className="legend-dot" style={{ background: s.color }} />
              <span>{s.name}</span>
              <span className="tabular muted">{Math.round(s.share * 100)}%</span>
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function BudgetsBlock({ data, month, now }: { data: Data; month: string; now: string }) {
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

function DreamsBlock({ data, now }: { data: Data; now: string }) {
  const goals = data.goals.filter((g) => g.status !== 'done');
  if (goals.length === 0) return null;
  return (
    <Section
      title="Sonhos"
      action={
        <Link className="link-button" to="/tabs/planning?view=goals">
          Ver todos
        </Link>
      }
    >
      <div className="hscroll">
        {goals.map((g) => {
          const target =
            g.type === 'emergency'
              ? emergencyTarget(
                  data.settings.emergencyMonths,
                  data.transactions,
                  data.categories,
                  data.closes,
                  now,
                )
              : (g.targetCents ?? 0);
          const m = goalMetrics(g, target, data.goalMovements, data.transactions, now);
          return (
            <Link
              key={g.id}
              className="dream-card"
              to={`/tabs/planning/goals/${g.id}`}
              style={{ textDecoration: 'none' }}
            >
              <span className="dream-emoji" aria-hidden="true">
                {g.emoji || '✨'}
              </span>
              <span className="row-title strong">{g.name}</span>
              <span className="row-sub">
                {Math.round(m.progress * 100)}% · {GOAL_HEALTH_LABEL[m.health]}
              </span>
              <ProgressBar value={m.progress} label={`Progresso de ${g.name}`} />
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

function CoupleBlock({ data, month }: { data: Data; month: string }) {
  const s = useMemo(
    () => computeSettlement({ ...data, household: data.household }, month),
    [data, month],
  );
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? '';
  return (
    <Section
      title="Entre vocês"
      action={
        <Link className="link-button" to="/tabs/more/couple">
          Acerto
        </Link>
      }
    >
      <Link className="card row-card" to="/tabs/more/couple">
        {s.transfer
          ? data.settings.hideValues
            ? `${name(s.transfer.fromMemberId)} manda ${'R$ ••••'} para ${name(s.transfer.toMemberId)} para deixar o mês certinho`
            : `${name(s.transfer.fromMemberId)} manda ${formatBRLRound(s.transfer.amountCents)} para ${name(s.transfer.toMemberId)} para deixar o mês certinho`
          : 'Tudo certo entre vocês ✨'}
      </Link>
    </Section>
  );
}

function Notices({ data }: { data: Data }) {
  const installPrompt = usePwaStore((s) => s.installPrompt);
  const [nowMs] = useState(() => Date.now());
  const dismissInstall = () =>
    void import('../../db/ops').then((ops) => ops.updateSettings({ installGuideDismissed: true }));
  const { lastChangeAt, lastBackupAt, backupReminderDays, backupReminderSnoozedAt } = data.settings;
  const days = backupReminderDays * 86_400_000;
  // Before any backup, the clock starts at the first entry: nagging on day one teaches people to dismiss it.
  const firstEntry = data.transactions.reduce(
    (oldest, t) => Math.min(oldest, new Date(t.createdAt).getTime()),
    nowMs,
  );
  const reference = Math.max(
    lastBackupAt ? new Date(lastBackupAt).getTime() : firstEntry,
    backupReminderSnoozedAt ? new Date(backupReminderSnoozedAt).getTime() : 0,
  );
  const backupDue =
    backupReminderDays > 0 &&
    lastChangeAt !== null &&
    (!lastBackupAt || lastChangeAt > lastBackupAt) &&
    nowMs - reference >= days;

  return (
    <>
      {!data.settings.installGuideDismissed && shouldOfferInstallGuide() && (
        <div className="notice">
          <div>
            <strong>Instale no celular</strong>
            <br />
            Assim o app abre em tela cheia e funciona sem internet.{' '}
            {installPrompt ? (
              <button
                type="button"
                className="link-button"
                onClick={() => void installPrompt.prompt()}
              >
                Instalar agora
              </button>
            ) : (
              <Link to="/install" className="tone-link">
                Ver como instalar
              </Link>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Dispensar aviso de instalação"
            onClick={dismissInstall}
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {backupDue && (
        <div className="notice">
          <div>
            <strong>Hora de um backup</strong>
            <br />
            Os dados de vocês ficam só neste aparelho.{' '}
            <Link to="/tabs/more/backup" className="tone-link">
              Fazer backup
            </Link>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Lembrar depois"
            onClick={() =>
              void import('../../db/ops').then((ops) =>
                ops.updateSettings({ backupReminderSnoozedAt: new Date().toISOString() }),
              )
            }
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

export function HomePage() {
  const data = useData();
  const month = useUi((s) => s.month);
  const now = today();
  const { homeBlocks, hiddenHomeBlocks } = data.settings;

  const render = (block: HomeBlock) => {
    switch (block) {
      case 'summary':
        return <SummaryBlock key={block} data={data} month={month} now={now} />;
      case 'accounts':
        return <AccountsBlock key={block} data={data} />;
      case 'cards':
        return <CardsBlock key={block} data={data} now={now} />;
      case 'bills':
        return <BillsBlock key={block} data={data} now={now} />;
      case 'categories':
        return <CategoriesBlock key={block} data={data} month={month} />;
      case 'budgets':
        return <BudgetsBlock key={block} data={data} month={month} now={now} />;
      case 'dreams':
        return <DreamsBlock key={block} data={data} now={now} />;
      case 'couple':
        return <CoupleBlock key={block} data={data} month={month} />;
    }
  };

  return (
    <LargeTitlePage title="Início">
      <div className="home-pad">
        <MonthPicker />
        <Notices data={data} />
        <div style={{ height: 'var(--space-2)' }} />
        {homeBlocks.filter((b) => !hiddenHomeBlocks.includes(b)).map(render)}
      </div>
    </LargeTitlePage>
  );
}

export default HomePage;

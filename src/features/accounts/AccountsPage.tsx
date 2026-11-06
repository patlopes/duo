import { BankIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import { adjustBalance, softDelete, upsert } from '../../db/ops';
import { accountBalance, accountStatement, type StatementLine } from '../../domain/balances';
import { daysInMonth, shortDay, today } from '../../domain/months';
import type { Account, AccountType, Transaction, Transfer } from '../../schemas/entities';
import { EmptyState } from '../../ui/EmptyState';
import { ACCOUNT_ICONS, IconBubble } from '../../ui/icons';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import { MonthPicker } from '../../ui/MonthPicker';
import { ChoiceChips, Field, MoneyField, Section, Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { transferTitle } from '../transactions/listModel';

const TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  investment: 'Investimento',
  joint: 'Conjunta',
};

const COLORS = ['#6E2F6B', '#3A6EA5', '#2A9D8F', '#D9774B', '#C9A227', '#5C6B73'];

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { members, transactions, transfers, cards } = useData();
  // Rows would be left pointing at nothing, so an account with history can only be archived.
  const inUse =
    !!account &&
    (transactions.some((t) => t.accountId === account.id) ||
      transfers.some((t) => t.fromAccountId === account.id || t.toAccountId === account.id) ||
      cards.some((c) => c.paymentAccountId === account.id));
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [owner, setOwner] = useState<string | null>(
    account ? account.ownerMemberId : members[0].id,
  );
  const [initial, setInitial] = useState(account?.initialBalanceCents ?? 0);
  const [color, setColor] = useState(account?.color ?? COLORS[0]!);
  const [icon, setIcon] = useState(account?.icon ?? 'bank');
  const [includeInTotal, setIncludeInTotal] = useState(account?.includeInTotal ?? true);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) return setError('Dê um nome à conta.');
    await upsert<Account>('accounts', {
      ...(account ?? {}),
      name: name.trim(),
      type,
      ownerMemberId: type === 'joint' ? null : owner,
      initialBalanceCents: initial,
      color,
      icon,
      includeInTotal,
      archived,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={account ? 'Editar conta' : 'Nova conta'}
      onSave={() => void save()}
    >
      <Field label="Nome">
        <input
          className="input"
          aria-label="Nome da conta"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Tipo">
        <ChoiceChips
          value={type}
          onChange={setType}
          options={(Object.keys(TYPE_LABEL) as AccountType[]).map((value) => ({
            value,
            label: TYPE_LABEL[value],
          }))}
        />
      </Field>
      {type !== 'joint' && (
        <Field label="Dono">
          <ChoiceChips
            value={owner}
            onChange={setOwner}
            options={[
              { value: members[0].id, label: members[0].name },
              { value: members[1].id, label: members[1].name },
              { value: null, label: 'Do casal' },
            ]}
          />
        </Field>
      )}
      <Field label="Saldo inicial">
        <MoneyField value={initial} onChange={setInitial} allowNegative ariaLabel="Saldo inicial" />
      </Field>
      <Field label="Ícone">
        <div className="chips">
          {ACCOUNT_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className="icon-button"
              aria-label={`Ícone ${i}`}
              aria-pressed={icon === i}
              onClick={() => setIcon(i)}
            >
              <IconBubble name={i} color={icon === i ? color : '#B8B2AC'} size={36} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Cor">
        <div className="chips">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="icon-button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            >
              <span
                className="legend-dot"
                style={{
                  background: c,
                  width: color === c ? 30 : 22,
                  height: color === c ? 30 : 22,
                }}
              />
            </button>
          ))}
        </div>
      </Field>
      <label className="toggle-row">
        <span>Incluir no saldo geral</span>
        <input
          type="checkbox"
          checked={includeInTotal}
          onChange={(e) => setIncludeInTotal(e.target.checked)}
        />
      </label>
      {account && (
        <label className="toggle-row">
          <span>Arquivar (some das listas, o histórico fica)</span>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
        </label>
      )}
      {error && <p className="tone-expense small">{error}</p>}
      {account && !inUse && (
        <button
          type="button"
          className="danger-button"
          onClick={() => void softDelete('accounts', account.id).then(onClose)}
        >
          Excluir conta
        </button>
      )}
    </Sheet>
  );
}

export function AccountsPage() {
  const { accounts, transactions, transfers } = useData();
  const [creating, setCreating] = useState(false);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const row = (a: Account) => (
    <Link key={a.id} className="row" to={`/tabs/more/accounts/${a.id}`}>
      <IconBubble name={a.icon} color={a.color} />
      <span className="row-main">
        <span className="row-title">{a.name}</span>
        <span className="row-sub">{TYPE_LABEL[a.type]}</span>
      </span>
      <MoneyText className="row-end" cents={accountBalance(a, transactions, transfers)} />
    </Link>
  );
  return (
    <LargeTitlePage
      title="Contas"
      backHref="/tabs/more"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setCreating(true)}>
          Nova
        </button>
      }
    >
      <div className="page-pad">
        {accounts.length === 0 ? (
          <EmptyState
            icon={<BankIcon />}
            title="Cadastre a primeira conta"
            description="Pode ser banco, carteira ou a conta conjunta de vocês."
            action={
              <button type="button" className="primary-button" onClick={() => setCreating(true)}>
                Nova conta
              </button>
            }
          />
        ) : (
          <div className="card-list">{active.map(row)}</div>
        )}
        {archived.length > 0 && (
          <Section title="Arquivadas">
            <div className="card-list">{archived.map(row)}</div>
          </Section>
        )}
      </div>
      {creating && <AccountForm account={null} onClose={() => setCreating(false)} />}
    </LargeTitlePage>
  );
}

/** One line per day of the month; the Y axis only needs to show the shape. */
function BalanceSparkline({
  lines,
  opening,
  month,
}: {
  lines: StatementLine[];
  opening: number;
  month: string;
}) {
  const days = daysInMonth(month);
  const points: number[] = [];
  let current = opening;
  for (let d = 1; d <= days; d++) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    const lastOfDay = lines.filter((l) => l.date === day).at(-1);
    if (lastOfDay) current = lastOfDay.balanceCents;
    points.push(current);
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 320;
  const H = 72;
  const path = points
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${((i / (days - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / range) * (H - 8)).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label="Evolução do saldo no mês"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function AccountDetailPage() {
  const { id } = useParams();
  const { accounts, transactions, transfers } = useData();
  const month = useUi((s) => s.month);
  const openForm = useUi((s) => s.openForm);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const account = accounts.find((a) => a.id === id);

  const statement = useMemo(
    () => (account ? accountStatement(account, transactions, transfers, transferTitle) : []),
    [account, transactions, transfers],
  );

  if (!account) {
    return (
      <LargeTitlePage title="Conta" backHref="/tabs/more/accounts">
        <p className="empty-note">Esta conta não existe mais.</p>
      </LargeTitlePage>
    );
  }

  const balance = accountBalance(account, transactions, transfers);
  const before = statement.filter((l) => l.date.slice(0, 7) < month).at(-1);
  const opening = before?.balanceCents ?? account.initialBalanceCents;
  const lines = statement.filter((l) => l.date.slice(0, 7) === month);

  const open = (line: StatementLine) => {
    const source = line.source;
    if ('kind' in source && (source.kind === 'expense' || source.kind === 'income')) {
      const t = source as Transaction;
      openForm({ type: t.kind, transaction: t });
    } else {
      openForm({ type: 'transfer', transfer: source as Transfer });
    }
  };

  return (
    <LargeTitlePage
      title={account.name}
      backHref="/tabs/more/accounts"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Editar
        </button>
      }
    >
      <div className="page-pad">
        <div className="card">
          <span className="stat-label">Saldo atual</span>
          <MoneyText cents={balance} className="big-money" />
          <button type="button" className="link-button" onClick={() => setAdjusting(true)}>
            Ajustar saldo
          </button>
        </div>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <MonthPicker />
        </div>
        <div className="card">
          <BalanceSparkline lines={lines} opening={opening} month={month} />
        </div>
        <Section title="Extrato">
          <div className="card-list">
            {lines.length === 0 && <p className="empty-note">Nenhum movimento neste mês.</p>}
            {[...lines].reverse().map((l) => (
              <button key={l.id} type="button" className="row" onClick={() => open(l)}>
                <span className="row-main">
                  <span className="row-title">{l.description || 'Sem descrição'}</span>
                  <span className="row-sub">
                    {shortDay(l.date)}
                    {l.status === 'pending' ? ' · pendente' : ''}
                  </span>
                </span>
                <span className="row-end">
                  <MoneyText
                    cents={l.deltaCents}
                    tone={l.deltaCents > 0 ? 'income' : undefined}
                    plus
                  />
                  <span className="row-sub">
                    <MoneyText cents={l.balanceCents} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>
      {editing && <AccountForm account={account} onClose={() => setEditing(false)} />}
      {adjusting && (
        <AdjustSheet account={account} current={balance} onClose={() => setAdjusting(false)} />
      )}
    </LargeTitlePage>
  );
}

function AdjustSheet({
  account,
  current,
  onClose,
}: {
  account: Account;
  current: number;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title="Ajustar saldo"
      breakpoints={[0, 0.5]}
      initial={0.5}
      onSave={() => void adjustBalance(account, value, undefined, today()).then(onClose)}
    >
      <Field
        label="Quanto há na conta agora"
        hint="A diferença vira um lançamento de ajuste, fora dos relatórios."
      >
        <MoneyField value={value} onChange={setValue} allowNegative ariaLabel="Saldo real" />
      </Field>
    </Sheet>
  );
}

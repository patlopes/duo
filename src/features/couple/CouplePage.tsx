import { useIonAlert } from '@ionic/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import {
  closeMonth,
  createTransfer,
  reopenMonth,
  softDelete,
  updateSettings,
  upsert,
} from '../../db/ops';
import { formatBRLRound } from '../../domain/money';
import { addMonths, monthLabel, today } from '../../domain/months';
import { isGeneratedIncome } from '../../domain/salary';
import { computeSettlement, isMonthClosed, suggestJointDeposits } from '../../domain/split';
import type { Member, MemberIncome } from '../../schemas/entities';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import { MonthPicker } from '../../ui/MonthPicker';
import { Mascot } from '../../ui/Mascot';
import { ChoiceChips, Field, MoneyField, Section, Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';

async function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, zIndex: 30000 });
}

export function CouplePage() {
  const data = useData();
  const month = useUi((s) => s.month);
  const [presentAlert] = useIonAlert();
  const [settling, setSettling] = useState(false);
  const [editingNames, setEditingNames] = useState(false);
  const [depositing, setDepositing] = useState<{ memberId: string; cents: number } | null>(null);
  const [jointOpen, setJointOpen] = useState(false);
  const [a, b] = data.members;

  const s = computeSettlement({ ...data, household: data.household }, month);
  const closed = isMonthClosed(data.closes, month);
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? '';
  const hasIncome = s.incomeA + s.incomeB > 0;
  const settlements = data.transfers
    .filter((t) => t.kind === 'settlement')
    .sort((x, y) => y.date.localeCompare(x.date));
  const joint = suggestJointDeposits(data.settings.jointBudgetCents, s.pctA);
  const jointAccount = data.accounts.find((acc) => acc.type === 'joint' && !acc.archived);

  const close = () =>
    void presentAlert({
      header: `Fechar ${monthLabel(month)}?`,
      message:
        'Os percentuais e o acerto ficam congelados. Mudar um lançamento deste mês exigirá reabri-lo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Fechar mês',
          handler: () => {
            void closeMonth(month).then(() => celebrate());
          },
        },
      ],
    });

  return (
    <LargeTitlePage
      title="Acerto do mês"
      backHref="/tabs/more"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setEditingNames(true)}>
          Nomes
        </button>
      }
    >
      <div className="page-pad">
        <MonthPicker />

        <div className="card">
          <p
            className="strong"
            style={{ margin: 0, fontSize: 'var(--type-title3)', lineHeight: 1.3 }}
          >
            {s.transfer
              ? data.settings.hideValues
                ? `${name(s.transfer.fromMemberId)} manda R$ •••• para ${name(s.transfer.toMemberId)}`
                : `${name(s.transfer.fromMemberId)} manda ${formatBRLRound(s.transfer.amountCents)} para ${name(s.transfer.toMemberId)}`
              : 'Tudo certo entre vocês ✨'}
          </p>
          {closed && (
            <span className="badge" style={{ marginTop: 8 }}>
              Mês fechado
            </span>
          )}
          {s.transfer && !closed && (
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => setSettling(true)}
            >
              Registrar acerto
            </button>
          )}
        </div>

        <Section title="Devido × pago">
          <div className="card">
            <table className="table-mini">
              <thead>
                <tr>
                  <th></th>
                  <th>Parte</th>
                  <th>Devido</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{a.name}</td>
                  <td>{Math.round(s.pctA * 100)}%</td>
                  <td>
                    <MoneyText cents={s.owedA} />
                  </td>
                  <td>
                    <MoneyText cents={s.paidA} />
                  </td>
                </tr>
                <tr>
                  <td>{b.name}</td>
                  <td>{100 - Math.round(s.pctA * 100)}%</td>
                  <td>
                    <MoneyText cents={s.owedB} />
                  </td>
                  <td>
                    <MoneyText cents={s.paidB} />
                  </td>
                </tr>
              </tbody>
            </table>
            {!hasIncome && (
              <p className="summary-sentence">
                Sem renda lançada neste mês: usando o percentual do mês anterior.{' '}
                <Link to="/tabs/more/salaries" className="tone-link">
                  Lançar rendas
                </Link>
              </p>
            )}
            {s.fairnessA !== null && s.fairnessB !== null && !data.settings.hideValues && (
              <p className="summary-sentence">
                {a.name} colocou {Math.round(s.fairnessA * 100)}% da própria renda nas contas da
                casa, e {b.name}, {Math.round(s.fairnessB * 100)}%.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Conta conjunta"
          action={
            <button type="button" className="link-button" onClick={() => setJointOpen(true)}>
              Orçamento
            </button>
          }
        >
          <div className="card">
            {data.settings.jointBudgetCents === 0 ? (
              <p className="muted subhead" style={{ margin: 0 }}>
                Digam quanto a conjunta precisa por mês, e o app sugere o depósito de cada um.
              </p>
            ) : (
              <>
                <table className="table-mini">
                  <tbody>
                    {([a, b] as Member[]).map((m, i) => (
                      <tr key={m.id}>
                        <td>{m.name} deposita</td>
                        <td>
                          <MoneyText cents={joint.byMember[i]!} />
                        </td>
                        <td>
                          {jointAccount && (
                            <button
                              type="button"
                              className="chip"
                              onClick={() =>
                                setDepositing({ memberId: m.id, cents: joint.byMember[i]! })
                              }
                            >
                              Registrar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!jointAccount && (
                  <p className="summary-sentence">
                    <Link to="/tabs/more/accounts" className="tone-link">
                      Crie uma conta do tipo conjunta
                    </Link>{' '}
                    para registrar os depósitos.
                  </p>
                )}
              </>
            )}
          </div>
        </Section>

        <div style={{ marginTop: 'var(--space-5)' }}>
          {closed ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void reopenMonth(month)}
            >
              Reabrir mês
            </button>
          ) : (
            <button type="button" className="secondary-button" onClick={close}>
              Fechar {monthLabel(month)}
            </button>
          )}
        </div>

        <Section title="Histórico de acertos">
          <div className="card-list">
            {settlements.length === 0 && (
              <p className="empty-note">Nenhum acerto registrado ainda.</p>
            )}
            {settlements.slice(0, 24).map((t) => {
              const from = data.accounts.find((x) => x.id === t.fromAccountId);
              const to = data.accounts.find((x) => x.id === t.toAccountId);
              return (
                <div key={t.id} className="row">
                  <span className="row-main">
                    <span className="row-title">
                      {name(from?.ownerMemberId ?? '')} → {name(to?.ownerMemberId ?? '')}
                    </span>
                    <span className="row-sub">{monthLabel(t.competenceMonth)}</span>
                  </span>
                  <MoneyText className="row-end" cents={t.amountCents} />
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {settling && s.transfer && (
        <SettleSheet
          fromMemberId={s.transfer.fromMemberId}
          toMemberId={s.transfer.toMemberId}
          cents={s.transfer.amountCents}
          month={month}
          onClose={() => setSettling(false)}
        />
      )}
      {editingNames && <NamesSheet onClose={() => setEditingNames(false)} />}
      {jointOpen && <JointBudgetSheet onClose={() => setJointOpen(false)} />}
      {depositing && jointAccount && (
        <DepositSheet
          {...depositing}
          jointAccountId={jointAccount.id}
          month={month}
          onClose={() => setDepositing(null)}
        />
      )}
    </LargeTitlePage>
  );
}

function accountsOf(accounts: ReturnType<typeof useData>['accounts'], memberId: string) {
  return accounts.filter((a) => a.ownerMemberId === memberId && !a.archived);
}

function SettleSheet({
  fromMemberId,
  toMemberId,
  cents,
  month,
  onClose,
}: {
  fromMemberId: string;
  toMemberId: string;
  cents: number;
  month: string;
  onClose: () => void;
}) {
  const { accounts, members } = useData();
  const from = accountsOf(accounts, fromMemberId);
  const to = accountsOf(accounts, toMemberId);
  const [value, setValue] = useState(cents);
  const [fromId, setFromId] = useState(from[0]?.id ?? '');
  const [toId, setToId] = useState(to[0]?.id ?? '');
  const [error, setError] = useState('');
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? '';

  const save = async () => {
    if (!fromId || !toId) {
      return setError(
        'Cada um precisa ter uma conta própria para registrar o acerto. Cadastre em Mais → Contas.',
      );
    }
    await createTransfer({
      kind: 'settlement',
      fromAccountId: fromId,
      toAccountId: toId,
      amountCents: value,
      date: today(),
      competenceMonth: month,
    });
    onClose();
  };

  return (
    <Sheet isOpen onClose={onClose} title="Registrar acerto" onSave={() => void save()}>
      <Field label="Valor">
        <MoneyField value={value} onChange={setValue} ariaLabel="Valor do acerto" />
      </Field>
      <Field label={`Sai da conta de ${name(fromMemberId)}`}>
        <select className="select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {from.length === 0 && <option value="">Nenhuma conta</option>}
          {from.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Entra na conta de ${name(toMemberId)}`}>
        <select className="select" value={toId} onChange={(e) => setToId(e.target.value)}>
          {to.length === 0 && <option value="">Nenhuma conta</option>}
          {to.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
    </Sheet>
  );
}

function DepositSheet({
  memberId,
  cents,
  jointAccountId,
  month,
  onClose,
}: {
  memberId: string;
  cents: number;
  jointAccountId: string;
  month: string;
  onClose: () => void;
}) {
  const { accounts } = useData();
  const own = accountsOf(accounts, memberId);
  const [value, setValue] = useState(cents);
  const [fromId, setFromId] = useState(own[0]?.id ?? '');
  const [error, setError] = useState('');
  const save = async () => {
    if (!fromId) return setError('Cadastre uma conta própria para registrar o depósito.');
    await createTransfer({
      kind: 'joint_deposit',
      fromAccountId: fromId,
      toAccountId: jointAccountId,
      amountCents: value,
      date: today(),
      competenceMonth: month,
    });
    onClose();
  };
  return (
    <Sheet isOpen onClose={onClose} title="Depósito na conjunta" onSave={() => void save()}>
      <Field label="Valor">
        <MoneyField value={value} onChange={setValue} ariaLabel="Valor do depósito" />
      </Field>
      <Field label="Sai da conta">
        <select className="select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {own.length === 0 && <option value="">Nenhuma conta</option>}
          {own.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
    </Sheet>
  );
}

function JointBudgetSheet({ onClose }: { onClose: () => void }) {
  const { settings } = useData();
  const [value, setValue] = useState(settings.jointBudgetCents);
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title="Orçamento da conjunta"
      breakpoints={[0, 0.5]}
      initial={0.5}
      onSave={() => void updateSettings({ jointBudgetCents: value }).then(onClose)}
    >
      <Field label="Quanto a conta conjunta precisa por mês">
        <MoneyField value={value} onChange={setValue} ariaLabel="Orçamento da conjunta" />
      </Field>
    </Sheet>
  );
}

const ANIMAL_ARTICLE = { giraffe: 'a girafa', monkey: 'o macaquinho' } as const;

/** The name shown next to each animal, and which animal stands for whom. */
export function NamesSheet({ onClose }: { onClose: () => void }) {
  const { members, settings } = useData();
  const [nameA, setNameA] = useState(members[0].name);
  const [nameB, setNameB] = useState(members[1].name);
  const [animalA, animalB] = settings.memberAnimals;
  const save = async () => {
    if (nameA.trim()) await upsert<Member>('members', { ...members[0], name: nameA.trim() });
    if (nameB.trim()) await upsert<Member>('members', { ...members[1], name: nameB.trim() });
    onClose();
  };
  const rows = [
    { animal: animalA, value: nameA, set: setNameA, label: 'Nome da pessoa 1' },
    { animal: animalB, value: nameB, set: setNameB, label: 'Nome da pessoa 2' },
  ];
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title="Nomes e bichinhos"
      breakpoints={[0, 0.7, 0.92]}
      initial={0.7}
      onSave={() => void save()}
    >
      {rows.map((row) => (
        <div key={row.label} className="name-row">
          {settings.mascots && <Mascot animal={row.animal} size={56} />}
          <Field label={settings.mascots ? `Quem é ${ANIMAL_ARTICLE[row.animal]}` : 'Nome'}>
            <input
              className="input"
              aria-label={row.label}
              value={row.value}
              onChange={(e) => row.set(e.target.value)}
            />
          </Field>
        </div>
      ))}
      {settings.mascots && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => void updateSettings({ memberAnimals: [animalB, animalA] })}
        >
          Trocar os bichinhos
        </button>
      )}
    </Sheet>
  );
}

const INCOME_LABEL: Record<MemberIncome['type'], string> = {
  salary: 'Salário',
  pj: 'PJ',
  bonus: 'Bônus',
  '13th': '13º',
  freelance: 'Freela',
  other: 'Outra',
};

/** Windfalls stay out of the split by default, so a bonus does not change what each one owes. */
const COUNTS_BY_DEFAULT: Record<MemberIncome['type'], boolean> = {
  salary: true,
  pj: true,
  bonus: false,
  '13th': false,
  freelance: false,
  other: false,
};

function IncomeSheet({
  income,
  month,
  onClose,
}: {
  income: MemberIncome | null;
  month: string;
  onClose: () => void;
}) {
  const { members } = useData();
  const [memberId, setMemberId] = useState(income?.memberId ?? members[0].id);
  const [type, setType] = useState<MemberIncome['type']>(income?.type ?? 'salary');
  const [cents, setCents] = useState(income?.amountCents ?? 0);
  const [counts, setCounts] = useState(income?.countsForSplit ?? true);
  const [error, setError] = useState('');

  const save = async () => {
    if (cents <= 0) return setError('Digite o valor líquido.');
    await upsert<MemberIncome>('incomes', {
      ...(income ?? {}),
      memberId,
      competenceMonth: income?.competenceMonth ?? month,
      type,
      amountCents: cents,
      countsForSplit: counts,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={income ? 'Editar renda' : 'Nova renda'}
      onSave={() => void save()}
    >
      <Field label="De quem">
        <ChoiceChips
          value={memberId}
          onChange={setMemberId}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
      </Field>
      <Field label="Tipo">
        <ChoiceChips
          value={type}
          onChange={(t) => {
            setType(t);
            setCounts(COUNTS_BY_DEFAULT[t]);
          }}
          options={(Object.keys(INCOME_LABEL) as MemberIncome['type'][]).map((value) => ({
            value,
            label: INCOME_LABEL[value],
          }))}
        />
      </Field>
      <Field label="Valor líquido">
        <MoneyField value={cents} onChange={setCents} ariaLabel="Valor da renda" />
      </Field>
      <label className="toggle-row">
        <span>Conta para a divisão do casal</span>
        <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
      </label>
      {error && <p className="tone-expense small">{error}</p>}
      {income && (
        <button
          type="button"
          className="danger-button"
          onClick={() => void softDelete('incomes', income.id).then(onClose)}
        >
          Excluir renda
        </button>
      )}
    </Sheet>
  );
}

export function IncomesPage() {
  const data = useData();
  const month = useUi((s) => s.month);
  const [editing, setEditing] = useState<MemberIncome | null>(null);
  const [creating, setCreating] = useState(false);
  const closed = isMonthClosed(data.closes, month);
  const rows = data.incomes.filter((i) => i.competenceMonth === month && !isGeneratedIncome(i));
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? '';

  const copyPrevious = async () => {
    const previous = data.incomes.filter(
      (i) =>
        i.competenceMonth === addMonths(month, -1) && i.countsForSplit && !isGeneratedIncome(i),
    );
    for (const { id: _id, createdAt: _c, updatedAt: _u, ...rest } of previous) {
      await upsert<MemberIncome>('incomes', { ...rest, competenceMonth: month });
    }
  };

  return (
    <LargeTitlePage
      title="Outras rendas"
      backHref="/tabs/more"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setCreating(true)}>
          Nova
        </button>
      }
    >
      <div className="page-pad">
        <MonthPicker />
        {closed && (
          <div className="notice">
            <div>Este mês está fechado: mudar uma renda aqui não altera mais a divisão dele.</div>
          </div>
        )}
        <div className="card-list" style={{ marginTop: 'var(--space-2)' }}>
          {rows.length === 0 && <p className="empty-note">Nenhuma renda em {monthLabel(month)}.</p>}
          {rows.map((i) => (
            <button key={i.id} type="button" className="row" onClick={() => setEditing(i)}>
              <span className="row-main">
                <span className="row-title">{name(i.memberId)}</span>
                <span className="row-sub">
                  {INCOME_LABEL[i.type]}
                  {i.countsForSplit ? '' : ' · fora da divisão'}
                </span>
              </span>
              <MoneyText className="row-end" cents={i.amountCents} />
            </button>
          ))}
        </div>
        {rows.length === 0 && (
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => void copyPrevious()}
          >
            Copiar as rendas do mês anterior
          </button>
        )}
      </div>
      {(creating || editing) && (
        <IncomeSheet
          income={editing}
          month={month}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </LargeTitlePage>
  );
}

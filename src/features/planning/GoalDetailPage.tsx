import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import { softDelete, upsert } from '../../db/ops';
import {
  emergencyTarget,
  GOAL_HEALTH_LABEL,
  goalFairness,
  goalMetrics,
  ITEM_STATE_LABEL,
  itemProgress,
} from '../../domain/goals';
import { formatBRLRound } from '../../domain/money';
import { monthLabel, monthOf, shortDay, today } from '../../domain/months';
import { memberAPct } from '../../domain/split';
import type { Goal, GoalItem, GoalMovement } from '../../schemas/entities';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import {
  ChoiceChips,
  DualProgress,
  Field,
  MoneyField,
  ProgressBar,
  Section,
  Sheet,
} from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { GoalForm } from './PlanningPage';

const KIND_LABEL: Record<GoalMovement['kind'], string> = {
  contribution: 'Aporte',
  initial: 'Saldo inicial',
  withdrawal: 'Resgate',
};

async function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, zIndex: 30000 });
}

export default function GoalDetailPage() {
  const { id } = useParams();
  const data = useData();
  const openForm = useUi((s) => s.openForm);
  const goal = data.goals.find((g) => g.id === id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<GoalMovement['kind'] | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const now = today();
  const [a, b] = data.members;

  const target = useMemo(() => {
    if (!goal) return 0;
    return goal.type === 'emergency'
      ? emergencyTarget(
          data.settings.emergencyMonths,
          data.transactions,
          data.categories,
          data.closes,
          now,
        )
      : (goal.targetCents ?? 0);
  }, [goal, data, now]);

  if (!goal) {
    return (
      <LargeTitlePage title="Sonho" backHref="/tabs/planning">
        <p className="empty-note">Este sonho não existe mais.</p>
      </LargeTitlePage>
    );
  }

  const metrics = goalMetrics(goal, target, data.goalMovements, data.transactions, now);
  const movements = data.goalMovements
    .filter((m) => m.goalId === goal.id)
    .sort((x, y) => y.date.localeCompare(x.date));
  const items = data.goalItems.filter((i) => i.goalId === goal.id);
  const fairness = goalFairness(goal, data.goalMovements, data.household.memberIds, (month) =>
    memberAPct({ ...data, household: data.household }, month),
  );
  const itemTotal = items.reduce((s, i) => s + i.budgetCents, 0);
  const progressByItem = items.map((i) => ({
    item: i,
    progress: itemProgress(i, data.transactions),
  }));
  const itemsPaid = progressByItem.reduce((s, x) => s + x.progress.paidCents, 0);
  const itemsScheduled = progressByItem.reduce((s, x) => s + x.progress.scheduledCents, 0);

  const healthClass = {
    on_track: 'badge badge-income',
    attention: 'badge badge-warning',
    late: 'badge badge-expense',
    paused: 'badge',
    done: 'badge badge-income',
  }[metrics.health];

  const leader = fairness.deviationA >= 0 ? a : b;
  const deviation = Math.abs(fairness.deviationA);

  return (
    <LargeTitlePage
      title={goal.name}
      backHref="/tabs/planning"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Editar
        </button>
      }
    >
      <div className="page-pad">
        <div className="card">
          <div className="section-head">
            <span className="dream-emoji" aria-hidden="true">
              {goal.emoji || '✨'}
            </span>
            <span className={healthClass}>{GOAL_HEALTH_LABEL[metrics.health]}</span>
          </div>
          <MoneyText cents={metrics.baseCents} className="big-money" />
          <span className="stat-label">
            de <MoneyText cents={target} /> · {Math.round(metrics.progress * 100)}%
          </span>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <ProgressBar value={metrics.progress} label={`Progresso de ${goal.name}`} />
          </div>
          {!data.settings.hideValues &&
            metrics.monthsLeft !== null &&
            metrics.remainingCents > 0 && (
              <p className="summary-sentence">
                Faltam {metrics.monthsLeft} {metrics.monthsLeft === 1 ? 'mês' : 'meses'}: guardem{' '}
                {formatBRLRound(metrics.neededPerMonthCents ?? 0)}/mês.
              </p>
            )}
          <div className="limit-line">
            <span>
              Ritmo: <MoneyText cents={metrics.paceCents} />
              /mês
            </span>
            <span>
              {metrics.forecastMonth
                ? `Previsão: ${monthLabel(metrics.forecastMonth)}`
                : 'Sem previsão ainda'}
            </span>
          </div>
        </div>

        <div className="two-cols" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="primary-button"
            onClick={() => setAdding('contribution')}
          >
            Aportar
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAdding('withdrawal')}
          >
            Resgatar
          </button>
        </div>

        {goal.type === 'project' && (
          <Section
            title="Itens do projeto"
            action={
              <button type="button" className="link-button" onClick={() => setAddingItem(true)}>
                Adicionar
              </button>
            }
          >
            <div className="card">
              <div className="limit-line" style={{ marginTop: 0 }}>
                <span>
                  Pago: <MoneyText cents={itemsPaid} />
                </span>
                <span>
                  Agendado: <MoneyText cents={itemsScheduled} />
                </span>
              </div>
              <DualProgress
                first={itemTotal ? itemsPaid / itemTotal : 0}
                second={itemTotal ? itemsScheduled / itemTotal : 0}
                label="Itens pagos e agendados"
              />
            </div>
            <div className="card-list" style={{ marginTop: 'var(--space-2)' }}>
              {progressByItem.length === 0 && (
                <p className="empty-note">Liste o que precisa ser pago: buffet, vestido, espaço…</p>
              )}
              {progressByItem.map(({ item, progress }) => (
                <button
                  key={item.id}
                  type="button"
                  className="row"
                  onClick={() =>
                    openForm({
                      type: 'expense',
                      goalId: goal.id,
                      goalItemId: item.id,
                      prefill: { description: item.name },
                    })
                  }
                >
                  <span className="row-main">
                    <span className="row-title">{item.name}</span>
                    <span className="row-sub">
                      {ITEM_STATE_LABEL[progress.state]} · <MoneyText cents={progress.paidCents} />{' '}
                      de <MoneyText cents={item.budgetCents} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Quem aportou">
          <div className="card">
            <table className="table-mini">
              <thead>
                <tr>
                  <th></th>
                  <th>Aportou</th>
                  <th>Parte</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{a.name}</td>
                  <td>
                    <MoneyText cents={fairness.contributedA} />
                  </td>
                  <td>
                    <MoneyText cents={fairness.expectedA} />
                  </td>
                </tr>
                <tr>
                  <td>{b.name}</td>
                  <td>
                    <MoneyText cents={fairness.contributedB} />
                  </td>
                  <td>
                    <MoneyText cents={fairness.expectedB} />
                  </td>
                </tr>
              </tbody>
            </table>
            {!data.settings.hideValues && (
              <p className="summary-sentence">
                {deviation < 100
                  ? 'Tudo certo: cada um aportou a sua parte ✨'
                  : `${leader.name} aportou ${formatBRLRound(deviation)} acima da sua parte.`}
              </p>
            )}
          </div>
        </Section>

        <Section title="Movimentos">
          <div className="card-list">
            {movements.length === 0 && (
              <p className="empty-note">Nenhum aporte ainda. Que tal o primeiro?</p>
            )}
            {movements.map((m) => (
              <button
                key={m.id}
                type="button"
                className="row"
                aria-label={`Excluir ${KIND_LABEL[m.kind]} de ${shortDay(m.date)}`}
                onClick={() => void softDelete('goalMovements', m.id)}
              >
                <span className="row-main">
                  <span className="row-title">{KIND_LABEL[m.kind]}</span>
                  <span className="row-sub">
                    {data.members.find((x) => x.id === m.memberId)?.name} · {shortDay(m.date)} ·
                    toque para excluir
                  </span>
                </span>
                <MoneyText
                  className="row-end"
                  cents={m.kind === 'withdrawal' ? -m.amountCents : m.amountCents}
                  plus
                  tone={m.kind === 'withdrawal' ? undefined : 'income'}
                />
              </button>
            ))}
          </div>
        </Section>
      </div>

      {editing && <GoalForm goal={goal} onClose={() => setEditing(false)} />}
      {adding && (
        <MovementSheet
          goalId={goal.id}
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={(amount) => {
            if (
              adding !== 'withdrawal' &&
              target > 0 &&
              metrics.baseCents < target &&
              metrics.baseCents + amount >= target
            ) {
              void celebrate();
              void upsert<Goal>('goals', { ...goal, status: 'done' });
            }
          }}
        />
      )}
      {addingItem && <ItemSheet goalId={goal.id} onClose={() => setAddingItem(false)} />}
    </LargeTitlePage>
  );
}

function MovementSheet({
  goalId,
  kind,
  onClose,
  onSaved,
}: {
  goalId: string;
  kind: GoalMovement['kind'];
  onClose: () => void;
  onSaved: (amount: number) => void;
}) {
  const { members } = useData();
  const [cents, setCents] = useState(0);
  const [memberId, setMemberId] = useState(members[0].id);
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState(kind);
  const [error, setError] = useState('');

  const save = async () => {
    if (cents <= 0) return setError('Digite o valor.');
    await upsert<GoalMovement>('goalMovements', {
      goalId,
      memberId,
      kind: mode,
      amountCents: cents,
      date,
      competenceMonth: monthOf(date),
    });
    onSaved(cents);
    onClose();
  };

  return (
    <Sheet isOpen onClose={onClose} title={KIND_LABEL[mode]} onSave={() => void save()}>
      <Field label="Valor">
        <MoneyField value={cents} onChange={setCents} ariaLabel="Valor do movimento" />
      </Field>
      <Field label="Quem">
        <ChoiceChips
          value={memberId}
          onChange={setMemberId}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
      </Field>
      {kind !== 'withdrawal' && (
        <Field label="É um">
          <ChoiceChips
            value={mode}
            onChange={setMode}
            options={[
              { value: 'contribution', label: 'Aporte' },
              { value: 'initial', label: 'Saldo que já existia' },
            ]}
          />
        </Field>
      )}
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

function ItemSheet({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState(0);
  const [vendor, setVendor] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    if (!name.trim()) return setError('Dê um nome ao item.');
    await upsert<GoalItem>('goalItems', {
      goalId,
      name: name.trim(),
      budgetCents: budget,
      vendor,
      dueDate: dueDate || null,
    });
    onClose();
  };
  return (
    <Sheet isOpen onClose={onClose} title="Novo item" onSave={() => void save()}>
      <Field label="Nome">
        <input
          className="input"
          aria-label="Nome do item"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Orçamento do item">
        <MoneyField value={budget} onChange={setBudget} ariaLabel="Orçamento do item" />
      </Field>
      <Field label="Fornecedor">
        <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      </Field>
      <Field label="Vencimento">
        <input
          type="date"
          className="input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
    </Sheet>
  );
}

import { IonLabel, IonSegment, IonSegmentButton } from '@ionic/react';
import { TargetIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData, type Data } from '../../db/DataContext';
import { setBudget, softDelete, upsert } from '../../db/ops';
import {
  BUDGET_BAR_LABEL,
  budgetLines,
  copyBudgetsFromMonth,
  effectiveBudget,
  monthSummary,
  previousMonth,
  type BudgetLine,
} from '../../domain/budgets';
import { emergencyTarget, GOAL_HEALTH_LABEL, goalMetrics } from '../../domain/goals';
import { monthLabel, today } from '../../domain/months';
import type { Category, Goal } from '../../schemas/entities';
import { CategoryPicker } from '../../ui/CategoryPicker';
import { EmptyState } from '../../ui/EmptyState';
import { IconBubble } from '../../ui/icons';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import { MonthPicker } from '../../ui/MonthPicker';
import { ChoiceChips, Field, MoneyField, ProgressBar, Section, Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { useToast } from '../../ui/useToast';

const STATE_TONE = { calm: 'income', limit: 'warning', over: 'expense' } as const;

function BudgetSheet({
  category,
  month,
  current,
  onClose,
}: {
  category: Category;
  month: string;
  current: number;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);
  const [scope, setScope] = useState<'default' | 'month'>('default');
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={category.name}
      onSave={() =>
        void setBudget(category.id, scope === 'month' ? month : null, value).then(onClose)
      }
    >
      <Field label="Quanto vocês querem gastar por mês">
        <MoneyField value={value} onChange={setValue} ariaLabel="Valor do orçamento" />
      </Field>
      <Field label="Vale para">
        <ChoiceChips
          value={scope}
          onChange={setScope}
          options={[
            { value: 'default', label: 'Todos os meses' },
            { value: 'month', label: `Só ${monthLabel(month)}` },
          ]}
        />
      </Field>
    </Sheet>
  );
}

function BudgetsView({ data }: { data: Data }) {
  const month = useUi((s) => s.month);
  const presentToast = useToast();
  const now = today();
  const [editing, setEditing] = useState<Category | null>(null);
  const [picking, setPicking] = useState(false);
  const lines = budgetLines(data.budgets, data.categories, data.transactions, month, now);
  const summary = monthSummary(data.budgets, data.categories, data.transactions, month, now);

  const copyPrevious = async () => {
    const list = copyBudgetsFromMonth(data.budgets, data.categories, previousMonth(month));
    if (list.length === 0) {
      void presentToast({
        message: 'O mês anterior não tem orçamento.',
        duration: 2000,
        position: 'top',
      });
      return;
    }
    for (const b of list) await setBudget(b.categoryId, month, b.amountCents);
    void presentToast({
      message: 'Orçamento copiado do mês anterior.',
      duration: 2000,
      position: 'top',
    });
  };

  const row = (l: BudgetLine) => (
    <button
      key={l.category.id}
      type="button"
      className="row"
      onClick={() => setEditing(l.category)}
    >
      <IconBubble name={l.category.icon} color={l.category.color} />
      <span className="row-main">
        <span className="row-title">{l.category.name}</span>
        <span className="limit-line">
          <span>
            <MoneyText cents={l.committedCents} /> de <MoneyText cents={l.limitCents} />
          </span>
          <span className={`tone-${STATE_TONE[l.state]}`}>
            {l.aheadOfPace && l.state === 'calm' ? 'Acima do ritmo' : BUDGET_BAR_LABEL[l.state]}
          </span>
        </span>
        <ProgressBar
          value={l.committedCents / l.limitCents}
          tone={STATE_TONE[l.state]}
          label={`Orçamento de ${l.category.name}`}
        />
      </span>
    </button>
  );

  return (
    <div className="page-pad">
      <MonthPicker />
      <div className="card">
        <div className="two-cols">
          <div>
            <span className="stat-label">Orçamento</span>
            <MoneyText cents={summary.budgetCents} className="stat-value" />
          </div>
          <div>
            <span className="stat-label">Disponível</span>
            <MoneyText
              cents={summary.availableCents}
              tone={summary.availableCents < 0 ? 'expense' : undefined}
              className="stat-value"
            />
          </div>
        </div>
        {!data.settings.hideValues && <p className="summary-sentence">{summary.sentence}</p>}
      </div>
      <Section
        title="Por categoria"
        action={
          <button type="button" className="link-button" onClick={() => setPicking(true)}>
            Adicionar
          </button>
        }
      >
        {lines.length === 0 ? (
          <div className="card stack">
            <p className="muted center subhead" style={{ margin: 0 }}>
              Nenhum orçamento neste mês.
            </p>
            <button type="button" className="primary-button" onClick={() => setPicking(true)}>
              Criar orçamento
            </button>
          </div>
        ) : (
          <div className="card-list">{lines.map(row)}</div>
        )}
      </Section>
      <button
        type="button"
        className="secondary-button"
        style={{ marginTop: 'var(--space-4)' }}
        onClick={() => void copyPrevious()}
      >
        Copiar orçamento do mês anterior
      </button>
      <CategoryPicker
        isOpen={picking}
        kind="expense"
        onClose={() => setPicking(false)}
        onPick={(c) => {
          setPicking(false);
          setEditing(c);
        }}
      />
      {editing && (
        <BudgetSheet
          category={editing}
          month={month}
          current={effectiveBudget(data.budgets, editing.id, month)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const EMOJIS = ['💍', '🏠', '✈️', '🚗', '🛟', '🌴', '🐶', '📚', '🎉', '🔨', '🌅', '✨'];

export function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { accounts, transactions, goalMovements } = useData();
  const inUse =
    !!goal &&
    (transactions.some((t) => t.goalId === goal.id) ||
      goalMovements.some((m) => m.goalId === goal.id));
  const [name, setName] = useState(goal?.name ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji ?? '✨');
  const [type, setType] = useState<Goal['type']>(goal?.type ?? 'saving');
  const [target, setTarget] = useState(goal?.targetCents ?? 0);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [splitRule, setSplitRule] = useState<Goal['splitRule']>(goal?.splitRule ?? 'proportional');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [reported, setReported] = useState(goal?.reportedBalanceCents ?? 0);
  const [useReported, setUseReported] = useState(goal?.reportedBalanceCents != null);
  const [status, setStatus] = useState<Goal['status']>(goal?.status ?? 'active');
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) return setError('Dê um nome ao sonho.');
    if (type !== 'emergency' && target <= 0) return setError('Digite quanto vocês querem juntar.');
    await upsert<Goal>('goals', {
      ...(goal ?? {}),
      name: name.trim(),
      emoji,
      coverAssetId: goal?.coverAssetId ?? null,
      type,
      targetCents: type === 'emergency' ? null : target,
      targetDate: targetDate || null,
      priority: goal?.priority ?? 3,
      splitRule,
      accountId: accountId || null,
      reportedBalanceCents: useReported ? reported : null,
      status,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={goal ? 'Editar sonho' : 'Novo sonho'}
      onSave={() => void save()}
    >
      <Field label="Nome">
        <input
          className="input"
          aria-label="Nome do sonho"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Ícone">
        <div className="chips">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`chip ${emoji === e ? 'chip-on' : ''}`}
              aria-pressed={emoji === e}
              onClick={() => setEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Tipo">
        <ChoiceChips
          value={type}
          onChange={setType}
          options={[
            { value: 'saving', label: 'Juntar um valor' },
            { value: 'project', label: 'Projeto com itens' },
            { value: 'emergency', label: 'Reserva de emergência' },
          ]}
        />
      </Field>
      {type !== 'emergency' && (
        <Field label="Quanto">
          <MoneyField value={target} onChange={setTarget} ariaLabel="Valor do sonho" />
        </Field>
      )}
      <Field label="Prazo (opcional)">
        <input
          type="date"
          className="input"
          aria-label="Prazo"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </Field>
      <Field label="Como dividir os aportes">
        <ChoiceChips
          value={splitRule}
          onChange={setSplitRule}
          options={[
            { value: 'proportional', label: 'Proporcional' },
            { value: 'equal', label: 'Metade' },
          ]}
        />
      </Field>
      <Field label="Onde o dinheiro está guardado">
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Não informado</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="toggle-row">
        <span>Informar o saldo real (com rendimento)</span>
        <input
          type="checkbox"
          checked={useReported}
          onChange={(e) => setUseReported(e.target.checked)}
        />
      </label>
      {useReported && (
        <Field label="Saldo real">
          <MoneyField value={reported} onChange={setReported} ariaLabel="Saldo real do sonho" />
        </Field>
      )}
      {goal && (
        <Field label="Situação">
          <ChoiceChips
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Ativo' },
              { value: 'paused', label: 'Pausado' },
              { value: 'done', label: 'Concluído' },
            ]}
          />
        </Field>
      )}
      {error && <p className="tone-expense small">{error}</p>}
      {goal && !inUse && (
        <button
          type="button"
          className="danger-button"
          onClick={() => void softDelete('goals', goal.id).then(onClose)}
        >
          Excluir sonho
        </button>
      )}
    </Sheet>
  );
}

function GoalsView({ data }: { data: Data }) {
  const [creating, setCreating] = useState(false);
  const now = today();
  return (
    <div className="page-pad">
      {data.goals.length === 0 ? (
        <EmptyState
          icon={<TargetIcon />}
          title="Qual é o próximo sonho de vocês?"
          description="Casamento, viagem, entrada do apê: aqui vocês acompanham e dividem de um jeito justo."
          action={
            <button type="button" className="primary-button" onClick={() => setCreating(true)}>
              Criar sonho
            </button>
          }
        />
      ) : (
        <>
          <div className="card-list" style={{ marginTop: 'var(--space-3)' }}>
            {data.goals.map((g) => {
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
                <Link key={g.id} className="row" to={`/tabs/planning/goals/${g.id}`}>
                  <span className="dream-emoji" aria-hidden="true">
                    {g.emoji || '✨'}
                  </span>
                  <span className="row-main">
                    <span className="row-title">{g.name}</span>
                    <span className="limit-line">
                      <span>
                        <MoneyText cents={m.baseCents} /> de <MoneyText cents={target} />
                      </span>
                      <span>{GOAL_HEALTH_LABEL[m.health]}</span>
                    </span>
                    <ProgressBar value={m.progress} label={`Progresso de ${g.name}`} />
                  </span>
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => setCreating(true)}
          >
            Criar outro sonho
          </button>
        </>
      )}
      {creating && <GoalForm goal={null} onClose={() => setCreating(false)} />}
    </div>
  );
}

export default function PlanningPage() {
  const data = useData();
  const [params] = useSearchParams();
  const [view, setView] = useState(params.get('view') === 'goals' ? 'goals' : 'budgets');
  return (
    <LargeTitlePage title="Planejamento">
      <div className="page-pad" style={{ paddingBottom: 0 }}>
        <IonSegment
          aria-label="Planejamento"
          value={view}
          onIonChange={(e) => setView(String(e.detail.value))}
        >
          <IonSegmentButton value="budgets">
            <IonLabel>Orçamentos</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="goals">
            <IonLabel>Sonhos</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>
      {view === 'budgets' ? <BudgetsView data={data} /> : <GoalsView data={data} />}
    </LargeTitlePage>
  );
}

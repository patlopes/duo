import {
  CaretDownIcon,
  CheckFatIcon,
  EyeIcon,
  EyeSlashIcon,
  PiggyBankIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  TrendUpIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, type Data } from '../../db/DataContext';
import { recordJointDeposit, softDelete, toggleStatus, updateSettings } from '../../db/ops';
import { formatBRL, formatBRLRound } from '../../domain/money';
import { dayLabel, monthName, shortDay, today } from '../../domain/months';
import {
  buildMonthPlan,
  projectMonths,
  type Bucket,
  type MonthPlan,
  type PlanData,
} from '../../domain/plan';
import { payState, salaryOf } from '../../domain/salary';
import { shouldOfferInstallGuide } from '../../pwa/platform';
import { usePwaStore } from '../../pwa/pwaStore';
import type { Transaction } from '../../schemas/entities';
import type { HomeBlock } from '../../schemas/settingsDefaults';
import { Donut } from '../../ui/Donut';
import { IconBubble, IconByName } from '../../ui/icons';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Mascot, randomJoke, type Pose } from '../../ui/Mascot';
import { MoneyText } from '../../ui/MoneyText';
import { MonthPicker, useMonthSwipe } from '../../ui/MonthPicker';
import { ProgressBar, Section, Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { useToast } from '../../ui/useToast';
import { useDeleteBill } from '../bills/useDeleteBill';
import { AccountBar } from '../google/AccountBar';
import { requestToken } from '../google/googleAuth';
import { GoogleButton } from '../google/GoogleButton';
import { runSync, saveToken, useSheetState } from '../google/sheetSession';
import { NamesSheet } from '../couple/CouplePage';
import { InviteSheet } from '../share/InviteSheet';
import { LegacyBlocks } from './LegacyBlocks';

export function planDataOf(data: Data): PlanData {
  return { ...data, emergencyMonths: data.settings.emergencyMonths };
}

const riseStyle = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

function moodOf(plan: MonthPlan, data: Data): { pose: Pose; line: string } {
  if (!data.salaryPlans.length && !plan.hasIncome) {
    return { pose: 'wink', line: 'Quanto cada um ganha? O resto a gente calcula.' };
  }
  if (plan.bills.length === 0)
    return { pose: 'wink', line: 'Quais são as contas de vocês este mês?' };
  if (plan.overdue.length > 0) {
    return {
      pose: 'worried',
      line:
        plan.overdue.length === 1
          ? 'Eita! Tem uma conta vencida.'
          : `Eita! ${plan.overdue.length} contas vencidas.`,
    };
  }
  if (plan.leftoverCents < 0)
    return { pose: 'worried', line: 'As contas passaram da renda deste mês.' };
  if (plan.allPaid) return { pose: 'cheer', line: 'Tudo pago! Mês resolvido.' };
  if (plan.missing[0] + plan.missing[1] > 0) {
    return { pose: 'happy', line: 'Falta passar a parte de vocês para a conjunta.' };
  }
  return { pose: 'happy', line: 'Dinheiro na conjunta. Agora é só pagar.' };
}

function Hero({
  plan,
  data,
  month,
  now,
}: {
  plan: MonthPlan;
  data: Data;
  month: string;
  now: string;
}) {
  const navigate = useNavigate();
  const swipe = useMonthSwipe();
  const [joke, setJoke] = useState<string | null>(null);
  const hidden = data.settings.hideValues;
  const mood = moodOf(plan, data);
  const [a, b] = data.members;
  const [animalA, animalB] = data.settings.memberAnimals;
  const usage = plan.incomeCents > 0 ? Math.min(1, plan.toPayCents / plan.incomeCents) : 0;
  const payA = payState(salaryOf(data.salaryPlans, a.id, month), month, now);
  const payB = payState(salaryOf(data.salaryPlans, b.id, month), month, now);
  const payText = (name: string, state: typeof payA) =>
    state && `${name} ${state.received ? 'recebeu' : 'recebe'} dia ${state.date.slice(8)}`;

  return (
    <div className="hero rise" {...swipe}>
      {data.settings.mascots && (
        <>
          <p className="hero-bubble" key={joke ?? mood.line} aria-live="polite">
            {joke ?? mood.line}
          </p>
          <div className="hero-mascots">
            <Mascot
              animal={animalA}
              pose={mood.pose}
              size={84}
              idle
              onTap={() => setJoke(randomJoke())}
            />
            <Mascot
              animal={animalB}
              pose={mood.pose === 'wink' ? 'happy' : mood.pose}
              size={76}
              idle
              delay={0.8}
              onTap={() => setJoke(randomJoke())}
            />
          </div>
        </>
      )}
      <button
        type="button"
        className="icon-button hero-eye"
        aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
        onClick={() => void updateSettings({ hideValues: !hidden })}
      >
        {hidden ? (
          <EyeSlashIcon size={20} aria-hidden="true" />
        ) : (
          <EyeIcon size={20} aria-hidden="true" />
        )}
      </button>
      <span className="hero-label">Juntos, vocês têm em {monthName(month)}</span>
      <MoneyText cents={plan.incomeCents} animate className="hero-amount" />
      <div
        className={`hero-meter ${plan.leftoverCents < 0 ? 'is-over' : ''}`}
        role="img"
        aria-label={`${Math.round(usage * 100)}% da renda vai para as contas`}
      >
        <span style={{ width: `${usage * 100}%` }} />
      </div>
      <div className="hero-row">
        <div>
          <span className="hero-label">Precisam pagar</span>
          <MoneyText cents={plan.toPayCents} animate className="hero-strong" />
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="hero-label">{plan.leftoverCents < 0 ? 'Faltam' : 'Sobram'}</span>
          <MoneyText cents={Math.abs(plan.leftoverCents)} animate className="hero-strong" />
        </div>
      </div>
      {!plan.hasIncome && (
        <button
          type="button"
          className="hero-cta pressable"
          onClick={() => navigate('/tabs/home/salaries')}
        >
          Colocar o salário de cada um
        </button>
      )}
      {plan.hasIncome && (
        <div className="hero-foot">
          {payA && <span className="hero-chip">{payText(a.name, payA)}</span>}
          {payB && <span className="hero-chip">{payText(b.name, payB)}</span>}
          <button
            type="button"
            className="hero-chip hero-edit pressable"
            onClick={() => navigate('/tabs/home/salaries')}
          >
            <PencilSimpleIcon size={14} weight="bold" aria-hidden="true" /> Editar salários
          </button>
        </div>
      )}
    </div>
  );
}

function SplitCard({
  plan,
  data,
  month,
  now,
}: {
  plan: MonthPlan;
  data: Data;
  month: string;
  now: string;
}) {
  const presentToast = useToast();
  const [namesOpen, setNamesOpen] = useState(false);
  const mode = data.settings.splitMode;
  const [a, b] = data.members;
  const [animalA, animalB] = data.settings.memberAnimals;
  const hidden = data.settings.hideValues;
  const pctA = Math.round(plan.incomePctA * 100);
  const other = mode === 'equal' ? plan.shareIfProportional : plan.shareIfEqual;
  const closedHere = data.closes.some((c) => c.month === month && !c.reopenedAt);
  const total = plan.share[0] + plan.share[1];

  const transfer = async (memberId: string, cents: number, name: string) => {
    const row = await recordJointDeposit(memberId, cents, month, now);
    void presentToast({
      message: `${name} transferiu ${formatBRL(cents)} para a conjunta`,
      duration: 5000,
      position: 'top',
      buttons: [{ text: 'Desfazer', handler: () => void softDelete('transfers', row.id) }],
    });
  };

  if (total === 0) return null;
  const people = [
    { member: a, animal: animalA, index: 0 as const },
    { member: b, animal: animalB, index: 1 as const },
  ];

  return (
    <Section title="Quem paga quanto">
      <div className="card rise" style={riseStyle(1)}>
        <div
          className="switch"
          data-on={mode === 'equal' ? '1' : '0'}
          role="group"
          aria-label="Como dividir"
        >
          <span className="switch-thumb" />
          <button
            type="button"
            aria-pressed={mode === 'proportional'}
            onClick={() =>
              void updateSettings({
                splitMode: 'proportional',
                splitModeAt: new Date().toISOString(),
              })
            }
          >
            Pela renda
            <small>
              {pctA}% e {100 - pctA}%
            </small>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'equal'}
            onClick={() =>
              void updateSettings({ splitMode: 'equal', splitModeAt: new Date().toISOString() })
            }
          >
            Metade para cada
            <small>50% e 50%</small>
          </button>
        </div>
        {closedHere && (
          <p className="other-option" style={{ border: 0 }}>
            Este mês está fechado: a divisão dele não muda mais.
          </p>
        )}
        <div className="split-bar" aria-hidden="true">
          <span className="a" style={{ flexGrow: Math.max(plan.share[0], 1) }} />
          <span className="b" style={{ flexGrow: Math.max(plan.share[1], 1) }} />
        </div>
        <div className="people">
          {people.map(({ member, animal, index }) => (
            <div key={member.id} className="person">
              <div className="person-head">
                {data.settings.mascots && <Mascot animal={animal} size={40} />}
                <button
                  type="button"
                  className="person-name"
                  aria-label={`Mudar o nome de ${member.name}`}
                  onClick={() => setNamesOpen(true)}
                >
                  <span>{member.name}</span>
                  <PencilSimpleIcon size={12} weight="bold" aria-hidden="true" />
                </button>
              </div>
              <MoneyText cents={plan.share[index]} animate className="person-amount" />
              <span className="person-sub">
                {plan.hasIncome ? (
                  <>
                    Sobra <MoneyText cents={plan.leftoverByMember[index]} />
                  </>
                ) : (
                  `${Math.round((plan.share[index] / total) * 100)}% do total`
                )}
              </span>
            </div>
          ))}
        </div>
        {!hidden && (
          <p className="other-option">
            {mode === 'equal' ? 'Pela renda' : 'Se fosse metade'}, {a.name} pagaria{' '}
            {formatBRLRound(other[0])} e {b.name}, {formatBRLRound(other[1])}.
          </p>
        )}
        {people.map(({ member, animal, index }) =>
          plan.missing[index] > 0 ? (
            <div key={member.id} className="call">
              {data.settings.mascots && <Mascot animal={animal} pose="wink" size={46} />}
              <div className="call-text">
                <strong>{member.name}</strong> transfere{' '}
                <strong>
                  <MoneyText cents={plan.missing[index]} />
                </strong>{' '}
                para a conjunta
                {plan.deadline ? (
                  <>
                    {' '}
                    até <strong>{shortDay(plan.deadline)}</strong>
                  </>
                ) : (
                  ''
                )}
              </div>
              <button
                type="button"
                onClick={() => void transfer(member.id, plan.missing[index], member.name)}
              >
                Transferi
              </button>
            </div>
          ) : null,
        )}
        {plan.missing[0] + plan.missing[1] === 0 && (
          <div className="call call-done">
            <CheckFatIcon size={20} weight="fill" aria-hidden="true" /> Cada um já passou a sua
            parte.
          </div>
        )}
        {plan.joint && (
          <p className="other-option">
            Na conjunta agora:{' '}
            <strong>
              <MoneyText cents={plan.jointBalanceCents ?? 0} />
            </strong>
            {plan.jointShortfallCents > 0 && !hidden
              ? ` · faltam ${formatBRLRound(plan.jointShortfallCents)} para as contas em aberto`
              : ''}
          </p>
        )}
      </div>
      {namesOpen && <NamesSheet onClose={() => setNamesOpen(false)} />}
    </Section>
  );
}

function BillRow({ bill, now }: { bill: Transaction; now: string }) {
  const openBill = useUi((s) => s.openBill);
  const deleteBill = useDeleteBill();
  const paid = bill.status === 'paid' || bill.cardId !== null;
  const overdue = !paid && bill.date < now;
  return (
    <div className={`bill ${paid ? 'bill-paid' : ''} ${overdue ? 'bill-overdue' : ''}`}>
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={paid}
        aria-label={`Marcar ${bill.description || 'conta'} como paga`}
        disabled={bill.cardId !== null}
        onClick={() => void toggleStatus(bill.id)}
      >
        <CheckFatIcon size={16} weight="fill" aria-hidden="true" />
      </button>
      <button type="button" className="bill-main" onClick={() => openBill({ transaction: bill })}>
        <span className="row-title">{bill.description || 'Sem nome'}</span>
        <span className="row-sub">
          {overdue ? 'Venceu ' : paid ? '' : 'Vence '}
          {dayLabel(bill.date, now).toLowerCase()}
          {bill.recurrenceId
            ? ' · todo mês'
            : bill.installmentNumber
              ? ` · ${bill.installmentNumber}/${bill.installmentTotal}`
              : ''}
        </span>
      </button>
      <MoneyText className="row-end" cents={bill.amountCents} />
      <button
        type="button"
        className="icon-button bill-delete"
        aria-label={`Excluir ${bill.description || 'conta'}`}
        onClick={() => void deleteBill(bill)}
      >
        <TrashIcon size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function BucketCard({
  bucket,
  index,
  total,
  now,
}: {
  bucket: Bucket;
  index: number;
  total: number;
  now: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(index === 0);
  const pending = bucket.bills.filter((b) => b.status === 'pending' && !b.cardId).length;
  const share = total > 0 ? bucket.totalCents / total : 0;

  const toggle = () => {
    if (bucket.dream) navigate(`/tabs/home/goals/${bucket.dream.goal.id}`);
    else setOpen(!open);
  };

  return (
    <div className="bucket rise" data-open={open} style={riseStyle(index + 2)}>
      <button type="button" className="bucket-head" aria-expanded={open} onClick={toggle}>
        <span className="tile" style={{ background: bucket.color }} aria-hidden="true">
          {bucket.dream ? (
            <PiggyBankIcon size={24} weight="fill" />
          ) : (
            <IconByName name={bucket.icon} size={24} />
          )}
        </span>
        <span className="bucket-info">
          <span className="bucket-name">{bucket.name}</span>
          <span className="bucket-sub">
            {bucket.dream
              ? 'por mês, para chegar no prazo'
              : pending > 0
                ? `${pending} em aberto`
                : 'tudo pago'}
          </span>
          <ProgressBar
            value={
              bucket.dream ? share : bucket.totalCents ? bucket.paidCents / bucket.totalCents : 0
            }
            tone={bucket.dream ? 'primary' : 'income'}
            label={`${bucket.name}: pago`}
          />
        </span>
        <MoneyText className="bucket-amount" cents={bucket.totalCents} />
        {!bucket.dream && (
          <CaretDownIcon className="bucket-caret" size={16} weight="bold" aria-hidden="true" />
        )}
      </button>
      {!bucket.dream && (
        <div className="bucket-body">
          <div>
            {bucket.bills.map((bill) => (
              <BillRow key={bill.id} bill={bill} now={now} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanBlock({
  plan,
  data,
  month,
  now,
}: {
  plan: MonthPlan;
  data: Data;
  month: string;
  now: string;
}) {
  const openBill = useUi((s) => s.openBill);
  return (
    <>
      <SplitCard plan={plan} data={data} month={month} now={now} />
      <Section
        title="Para onde vai"
        action={
          <button
            type="button"
            className="link-button"
            onClick={() => openBill({ mode: 'recurring' })}
          >
            <PlusIcon size={14} weight="bold" aria-hidden="true" /> Conta
          </button>
        }
      >
        {plan.buckets.length === 0 ? (
          <div className="card empty-hero rise">
            {data.settings.mascots && <Mascot animal="monkey" pose="wink" idle />}
            <strong>Quais são as contas de vocês?</strong>
            <span className="muted subhead">
              Aluguel, condomínio, luz, casamento: só o que vocês pagam juntos.
            </span>
            <button
              type="button"
              className="primary-button"
              onClick={() => openBill({ mode: 'recurring' })}
            >
              Adicionar a primeira conta
            </button>
          </div>
        ) : (
          plan.buckets.map((bucket, i) => (
            <BucketCard
              key={bucket.key}
              bucket={bucket}
              index={i}
              total={plan.toPayCents}
              now={now}
            />
          ))
        )}
      </Section>
    </>
  );
}

function CategoriesBlock({ plan }: { plan: MonthPlan }) {
  const openBill = useUi((s) => s.openBill);
  const [picked, setPicked] = useState<Bucket | null>(null);
  const buckets = plan.buckets.filter((b) => b.totalCents > 0);
  if (buckets.length < 2) return null;
  const slices = buckets.map((b) => ({
    name: b.name,
    color: b.color,
    share: b.totalCents / plan.toPayCents,
  }));
  return (
    <Section title="O mês em um olhar">
      <div className="card donut-wrap rise">
        <Donut
          slices={slices}
          label={`Divisão das contas: ${slices.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}`}
          onSlice={(i) => setPicked(buckets[i] ?? null)}
        />
        <div className="donut-legend">
          {buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              className="donut-legend-row"
              onClick={() => setPicked(b)}
            >
              <span className="legend-dot" style={{ background: b.color }} />
              <span>{b.name}</span>
              <span className="tabular muted">
                {Math.round((b.totalCents / plan.toPayCents) * 100)}%
              </span>
            </button>
          ))}
        </div>
      </div>
      {picked && (
        <Sheet
          isOpen
          onClose={() => setPicked(null)}
          title={picked.name}
          breakpoints={[0, 0.6, 0.92]}
          initial={0.6}
        >
          <div className="section-head">
            <span className="stat-label">
              {Math.round((picked.totalCents / plan.toPayCents) * 100)}% do que vocês pagam
            </span>
            <MoneyText cents={picked.totalCents} className="stat-value" />
          </div>
          {picked.dream ? (
            <p className="subhead">
              Quanto guardar por mês para chegar no prazo de {picked.dream.goal.name}.
            </p>
          ) : (
            <div className="card-list">
              {picked.bills.map((bill) => (
                <button
                  key={bill.id}
                  type="button"
                  className="row"
                  onClick={() => {
                    setPicked(null);
                    openBill({ transaction: bill });
                  }}
                >
                  <IconBubble name={picked.icon} color={picked.color} size={32} />
                  <span className="row-main">
                    <span className="row-title">{bill.description || 'Sem nome'}</span>
                    <span className="row-sub">
                      {shortDay(bill.date)} · {bill.status === 'paid' ? 'paga' : 'em aberto'}
                    </span>
                  </span>
                  <MoneyText className="row-end" cents={bill.amountCents} />
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </Section>
  );
}

function FutureBlock({ data, month, now }: { data: Data; month: string; now: string }) {
  const setMonth = useUi((s) => s.setMonth);
  const months = useMemo(() => projectMonths(planDataOf(data), now, 6), [data, now]);
  const next = months[1];
  if (!next) return null;
  const top = Math.max(...months.map((m) => m.toPayCents), 1);
  const here = months[0]!;
  const diff = next.toPayCents - here.toPayCents;
  const hidden = data.settings.hideValues;

  return (
    <Section
      title={`E em ${monthName(next.month)}?`}
      action={
        <Link className="link-button" to="/tabs/home/simulator">
          <TrendUpIcon size={14} weight="bold" aria-hidden="true" /> Simular
        </Link>
      }
    >
      <div className="card rise" style={riseStyle(4)}>
        <div className="two-cols">
          <div>
            <span className="stat-label">Vocês vão pagar</span>
            <MoneyText cents={next.toPayCents} className="stat-value" />
          </div>
          <div>
            <span className="stat-label">
              {next.leftoverCents < 0 ? 'Vão faltar' : 'Vão sobrar'}
            </span>
            <MoneyText
              cents={Math.abs(next.leftoverCents)}
              className="stat-value"
              tone={next.leftoverCents < 0 ? 'expense' : 'income'}
            />
          </div>
        </div>
        {!hidden && diff !== 0 && (
          <p className="other-option" style={{ border: 0, paddingTop: 0 }}>
            {formatBRLRound(Math.abs(diff))} {diff > 0 ? 'a mais' : 'a menos'} que em{' '}
            {monthName(here.month)}.
          </p>
        )}
        <div className="bars" role="group" aria-label="Contas dos próximos meses">
          {months.map((m, i) => (
            <button
              key={m.month}
              type="button"
              className="bar-col"
              data-now={m.month === month}
              data-low={m.leftoverCents < 0}
              aria-label={`Ver ${monthName(m.month)}: ${formatBRL(m.toPayCents)}`}
              onClick={() => setMonth(m.month)}
            >
              <i
                style={{
                  height: `${Math.max(8, (m.toPayCents / top) * 86)}%`,
                  ['--i' as string]: i,
                }}
              />
              <span>{monthName(m.month).slice(0, 3)}</span>
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Notices({ data }: { data: Data }) {
  const installPrompt = usePwaStore((s) => s.installPrompt);
  const presentToast = useToast();
  const sheetStatus = useSheetState((s) => s.status);
  const [inviting, setInviting] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const dismissInstall = () => void updateSettings({ installGuideDismissed: true });
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

  const signInToSync = () => {
    // Straight from the tap: Safari blocks Google's window otherwise.
    requestToken('').then(
      (token) => {
        saveToken(token);
        void runSync();
      },
      (error: Error) =>
        void presentToast({ message: error.message, duration: 3500, position: 'top' }),
    );
  };

  const me = data.settings.deviceMemberIndex;
  const other = data.members[me === 0 ? 1 : 0];
  const dismissPrompt = () => void updateSettings({ googlePromptDismissed: true });
  const closeButton = (
    <button
      type="button"
      className="icon-button"
      aria-label="Dispensar aviso da conta Google"
      onClick={dismissPrompt}
    >
      <XIcon size={18} aria-hidden="true" />
    </button>
  );

  return (
    <>
      {data.settings.onboarded &&
        !data.settings.googleSheetId &&
        !data.settings.googlePromptDismissed && (
          <div className="notice rise">
            <div>
              <strong>Vejam tudo nos dois celulares e no computador</strong>
              <p className="notice-text">Entre com o Google e os dados atualizam sozinhos.</p>
              <GoogleButton />
            </div>
            {closeButton}
          </div>
        )}
      {data.settings.googleSheetId &&
        !data.settings.googleEmails[me === 0 ? 1 : 0] &&
        !data.settings.googlePromptDismissed && (
          <div className="notice rise">
            <div>
              <strong>Agora falta {other.name}</strong>
              <p className="notice-text">Com um link, {other.name} passa a ver as mesmas contas.</p>
              <button type="button" className="primary-button" onClick={() => setInviting(true)}>
                Convidar {other.name}
              </button>
            </div>
            {closeButton}
          </div>
        )}
      {inviting && <InviteSheet onClose={() => setInviting(false)} />}
      {data.settings.googleSheetId && sheetStatus === 'needs-login' && (
        <div className="notice rise">
          <div>
            <strong>Atualizar com a planilha</strong>
            <br />
            Toque para buscar o que mudou no outro celular.{' '}
            <button type="button" className="link-button" onClick={signInToSync}>
              Atualizar agora
            </button>
          </div>
        </div>
      )}
      {!data.settings.installGuideDismissed && shouldOfferInstallGuide() && (
        <div className="notice rise">
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
        <div className="notice rise">
          <div>
            <strong>Hora de um backup</strong>
            <br />
            Os dados de vocês ficam só neste aparelho.{' '}
            <Link to="/tabs/home/backup" className="tone-link">
              Fazer backup
            </Link>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Lembrar depois"
            onClick={() =>
              void updateSettings({ backupReminderSnoozedAt: new Date().toISOString() })
            }
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  const data = useData();
  const month = useUi((s) => s.month);
  const now = today();
  const { homeBlocks, hiddenHomeBlocks } = data.settings;
  const plan = useMemo(() => buildMonthPlan(planDataOf(data), month, now), [data, month, now]);

  const render = (block: HomeBlock) => {
    switch (block) {
      case 'plan':
        return <PlanBlock key={block} plan={plan} data={data} month={month} now={now} />;
      case 'categories':
        return <CategoriesBlock key={block} plan={plan} />;
      case 'future':
        return <FutureBlock key={block} data={data} month={month} now={now} />;
      case 'dreams':
        return null;
      default:
        return <LegacyBlocks key={block} block={block} data={data} month={month} now={now} />;
    }
  };

  return (
    <LargeTitlePage title="Início">
      <div className="home-pad">
        <div className="month-pill">
          <MonthPicker />
        </div>
        <AccountBar />
        <Notices data={data} />
        <Hero plan={plan} data={data} month={month} now={now} />
        {homeBlocks.filter((b) => !hiddenHomeBlocks.includes(b)).map(render)}
      </div>
    </LargeTitlePage>
  );
}

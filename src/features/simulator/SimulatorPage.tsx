import { lazy, Suspense, useState } from 'react';
import { useData } from '../../db/DataContext';
import { upsert } from '../../db/ops';
import { formatBRL, formatBRLRound } from '../../domain/money';
import { addMonths, monthLabel, monthName, monthOf, monthShort, today } from '../../domain/months';
import { projectMonths, type ProjectedMonth, type Scenario } from '../../domain/plan';
import { salaryOf } from '../../domain/salary';
import type { SalaryPlan } from '../../schemas/entities';
import type { SplitMode } from '../../schemas/settingsDefaults';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Mascot } from '../../ui/Mascot';
import { ChoiceChips, Field, MoneyField, Section, Sheet, Skeleton } from '../../ui/parts';
import { useToast } from '../../ui/useToast';
import { planDataOf } from '../home/HomePage';

const Lines = lazy(() => import('../reports/ReportCharts').then((m) => ({ default: m.Lines })));

const COUNT = 12;

function Delta({ cents }: { cents: number }) {
  if (cents === 0) return null;
  return (
    <span className={`sim-delta ${cents < 0 ? 'down' : ''}`}>
      {cents > 0 ? '+' : '−'}
      {formatBRLRound(Math.abs(cents))}
    </span>
  );
}

function MonthDetail({
  row,
  base,
  names,
  onClose,
}: {
  row: ProjectedMonth;
  base: ProjectedMonth;
  names: [string, string];
  onClose: () => void;
}) {
  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={monthLabel(row.month)}
      breakpoints={[0, 0.7, 0.92]}
      initial={0.7}
    >
      <div className="two-cols">
        <div>
          <span className="stat-label">Renda dos dois</span>
          <span className="stat-value tabular">{formatBRL(row.incomeCents)}</span>
        </div>
        <div>
          <span className="stat-label">Para pagar</span>
          <span className="stat-value tabular">{formatBRL(row.toPayCents)}</span>
        </div>
        <div>
          <span className="stat-label">{row.leftoverCents < 0 ? 'Faltam' : 'Sobram'}</span>
          <span className="stat-value tabular">{formatBRL(Math.abs(row.leftoverCents))}</span>{' '}
          <Delta cents={row.leftoverCents - base.leftoverCents} />
        </div>
        <div>
          <span className="stat-label">Acumulado até aqui</span>
          <span className="stat-value tabular">{formatBRL(row.accumulatedCents)}</span>
        </div>
      </div>
      <h3 className="sheet-label">As duas formas de dividir</h3>
      <div className="card">
        <table className="table-mini">
          <thead>
            <tr>
              <th></th>
              <th>{names[0]}</th>
              <th>{names[1]}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pela renda</td>
              <td>{formatBRL(row.shareIfProportional[0])}</td>
              <td>{formatBRL(row.shareIfProportional[1])}</td>
            </tr>
            <tr>
              <td>Metade</td>
              <td>{formatBRL(row.shareIfEqual[0])}</td>
              <td>{formatBRL(row.shareIfEqual[1])}</td>
            </tr>
            <tr>
              <td>Sobra de cada um</td>
              <td>{formatBRL(row.leftoverByMember[0])}</td>
              <td>{formatBRL(row.leftoverByMember[1])}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}

export default function SimulatorPage() {
  const data = useData();
  const presentToast = useToast();
  const now = today();
  const current = monthOf(now);
  const [a, b] = data.members;
  const planData = planDataOf(data);
  const salaryA = salaryOf(data.salaryPlans, a.id, current);
  const salaryB = salaryOf(data.salaryPlans, b.id, current);

  const [incomeA, setIncomeA] = useState(salaryA?.amountCents ?? 0);
  const [incomeB, setIncomeB] = useState(salaryB?.amountCents ?? 0);
  const [from, setFrom] = useState(addMonths(current, 1));
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [oneOff, setOneOff] = useState(0);
  const [oneOffMonth, setOneOffMonth] = useState(addMonths(current, 1));
  const [mode, setMode] = useState<SplitMode>(data.settings.splitMode);
  const [picked, setPicked] = useState<number | null>(null);

  const changedA = salaryA ? incomeA !== salaryA.amountCents : incomeA > 0;
  const changedB = salaryB ? incomeB !== salaryB.amountCents : incomeB > 0;

  const base = projectMonths(planData, now, COUNT);
  const scenario: Scenario = {
    salary: [changedA ? incomeA : null, changedB ? incomeB : null],
    salaryFrom: from,
    extraMonthlyCents: extraMonthly,
    oneOff: oneOff > 0 ? { month: oneOffMonth, cents: oneOff } : null,
    mode,
  };
  const simulated = projectMonths(planData, now, COUNT, scenario);
  const hidden = data.settings.hideValues;
  const months = Array.from({ length: COUNT }, (_, i) => addMonths(current, i + 1));
  const reference = simulated.find((m) => m.month === from) ?? simulated[1]!;
  const referenceBase = base.find((m) => m.month === from) ?? base[1]!;
  const end = simulated[COUNT - 1]!;
  const endBase = base[COUNT - 1]!;
  const gain = end.accumulatedCents - endBase.accumulatedCents;
  const chart = simulated.map((m, i) => ({
    label: monthShort(m.month),
    hoje: base[i]!.leftoverCents,
    simulado: m.leftoverCents,
  }));

  const applyRaises = async () => {
    const save = async (memberId: string, cents: number, existing: SalaryPlan | null) => {
      const same = data.salaryPlans.find((p) => p.memberId === memberId && p.startMonth === from);
      await upsert<SalaryPlan>('salaryPlans', {
        ...(same ?? {}),
        memberId,
        amountCents: cents,
        payDay: existing?.payDay ?? 5,
        startMonth: from,
      });
    };
    if (changedA) await save(a.id, incomeA, salaryA);
    if (changedB) await save(b.id, incomeB, salaryB);
    void presentToast({
      message: `Combinado: entra sozinho em ${monthName(from)}.`,
      duration: 2500,
      position: 'top',
    });
  };

  return (
    <LargeTitlePage title="Simulador" backHref="/tabs/more">
      <div className="page-pad">
        <div
          className="card rise"
          style={{ background: 'var(--color-primary-tint)', boxShadow: 'none' }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {data.settings.mascots && (
              <Mascot animal="giraffe" pose={gain >= 0 ? 'happy' : 'worried'} size={64} idle />
            )}
            <span className="subhead">
              Mexam nos números à vontade: nada aqui muda as contas de vocês até escolherem salvar.
            </span>
          </div>
        </div>

        <Section title="E se…">
          <div className="card rise" style={{ ['--i' as string]: 1 }}>
            <Field label={`${a.name} ganhasse`}>
              <MoneyField
                value={incomeA}
                onChange={setIncomeA}
                ariaLabel={`Salário simulado de ${a.name}`}
              />
            </Field>
            <Field label={`${b.name} ganhasse`}>
              <MoneyField
                value={incomeB}
                onChange={setIncomeB}
                ariaLabel={`Salário simulado de ${b.name}`}
              />
            </Field>
            <Field label="A partir de">
              <select
                className="select"
                aria-label="A partir de"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Uma conta nova todo mês">
              <MoneyField
                value={extraMonthly}
                onChange={setExtraMonthly}
                ariaLabel="Conta nova por mês"
              />
            </Field>
            <Field label="Uma compra única">
              <MoneyField value={oneOff} onChange={setOneOff} ariaLabel="Compra única" />
            </Field>
            {oneOff > 0 && (
              <Field label="Em">
                <select
                  className="select"
                  aria-label="Mês da compra"
                  value={oneOffMonth}
                  onChange={(e) => setOneOffMonth(e.target.value)}
                >
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Dividindo">
              <ChoiceChips
                ariaLabel="Dividindo"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'proportional', label: 'Pela renda' },
                  { value: 'equal', label: 'Metade' },
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section title={`Em ${monthName(reference.month)} ficaria`}>
          <div className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="people">
              {[0, 1].map((i) => (
                <div key={i} className="person">
                  <div className="person-head">
                    {data.settings.mascots && (
                      <Mascot animal={data.settings.memberAnimals[i]!} size={36} />
                    )}
                    <span>{data.members[i]!.name}</span>
                  </div>
                  <span className="person-amount tabular">
                    {hidden ? 'R$ ••••' : formatBRL(reference.share[i]!)}
                  </span>
                  <span className="person-sub">
                    Sobra {hidden ? 'R$ ••••' : formatBRL(reference.leftoverByMember[i]!)}
                  </span>
                </div>
              ))}
            </div>
            <p className="other-option">
              Juntos, {hidden ? 'R$ ••••' : formatBRL(reference.incomeCents)} de renda e{' '}
              {hidden ? 'R$ ••••' : formatBRL(reference.toPayCents)} para pagar.{' '}
              {reference.leftoverCents < 0 ? 'Faltam' : 'Sobram'}{' '}
              {hidden ? 'R$ ••••' : formatBRL(Math.abs(reference.leftoverCents))}.{' '}
              {!hidden && <Delta cents={reference.leftoverCents - referenceBase.leftoverCents} />}
            </p>
            {!hidden && gain !== 0 && (
              <p className="other-option" style={{ border: 0, paddingTop: 0, marginTop: 4 }}>
                Em 12 meses, isso dá {formatBRLRound(Math.abs(gain))}{' '}
                {gain > 0 ? 'a mais' : 'a menos'} para vocês.
              </p>
            )}
          </div>
        </Section>

        <Section title="Quanto sobra por mês">
          <div className="card rise" style={{ ['--i' as string]: 3 }}>
            <Suspense fallback={<Skeleton height={220} />}>
              <Lines
                rows={chart}
                hidden={hidden}
                series={[
                  { key: 'hoje', label: 'Como está', color: 'var(--color-text-secondary)' },
                  { key: 'simulado', label: 'Simulado', color: 'var(--color-primary)' },
                ]}
                onPick={setPicked}
              />
            </Suspense>
            <p className="small muted center" style={{ margin: 0 }}>
              Toque em um mês para ver o resumo.
            </p>
          </div>
        </Section>

        <Section title="Mês a mês">
          <div className="card-list">
            {simulated.map((m, i) => (
              <button key={m.month} type="button" className="row" onClick={() => setPicked(i)}>
                <span className="row-main">
                  <span className="row-title" style={{ textTransform: 'capitalize' }}>
                    {monthName(m.month)}
                  </span>
                  <span className="row-sub">
                    Pagam {hidden ? 'R$ ••••' : formatBRLRound(m.toPayCents)}
                    {m.oneOffCents ? ' · com a compra' : ''}
                  </span>
                </span>
                <span
                  className={`row-end tabular ${m.leftoverCents < 0 ? 'tone-expense' : 'tone-income'}`}
                >
                  {hidden
                    ? 'R$ ••••'
                    : `${m.leftoverCents < 0 ? '−' : '+'}${formatBRLRound(Math.abs(m.leftoverCents))}`}
                </span>
              </button>
            ))}
          </div>
        </Section>

        {(changedA || changedB) && (
          <button
            type="button"
            className="primary-button"
            style={{ marginTop: 'var(--space-5)' }}
            onClick={() => void applyRaises()}
          >
            Salvar como aumento a partir de {monthName(from)}
          </button>
        )}
      </div>
      {picked !== null && simulated[picked] && (
        <MonthDetail
          row={simulated[picked]}
          base={base[picked]!}
          names={[a.name, b.name]}
          onClose={() => setPicked(null)}
        />
      )}
    </LargeTitlePage>
  );
}

import { PencilSimpleIcon, TrendUpIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import { softDelete, upsert } from '../../db/ops';
import { addMonths, monthLabel, monthOf, today } from '../../domain/months';
import { payState, salaryOf, upcomingRaises } from '../../domain/salary';
import type { Member, SalaryPlan } from '../../schemas/entities';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Mascot } from '../../ui/Mascot';
import { MoneyText } from '../../ui/MoneyText';
import { Field, MoneyField, Sheet } from '../../ui/parts';
import { NamesSheet } from '../couple/CouplePage';

type Editor = { member: Member; kind: 'salary' | 'raise'; plan?: SalaryPlan };

function SalarySheet({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { salaryPlans } = useData();
  const current = monthOf(today());
  const inForce = salaryOf(salaryPlans, editor.member.id, current);
  const isRaise = editor.kind === 'raise';
  const [cents, setCents] = useState(editor.plan?.amountCents ?? inForce?.amountCents ?? 0);
  const [payDay, setPayDay] = useState(String(editor.plan?.payDay ?? inForce?.payDay ?? 5));
  const [start, setStart] = useState(
    editor.plan?.startMonth ?? (isRaise ? addMonths(current, 1) : current),
  );
  const [error, setError] = useState('');

  const save = async () => {
    const day = Number(payDay);
    if (cents <= 0) return setError('Digite o salário líquido.');
    if (!(day >= 1 && day <= 31)) return setError('O dia do pagamento vai de 1 a 31.');
    // A month holds one salary: landing on another plan's month replaces that plan.
    const sameMonth = salaryPlans.find(
      (p) => p.memberId === editor.member.id && p.startMonth === start,
    );
    if (editor.plan && sameMonth && sameMonth.id !== editor.plan.id) {
      await softDelete('salaryPlans', sameMonth.id);
    }
    await upsert<SalaryPlan>('salaryPlans', {
      ...(editor.plan ?? sameMonth ?? {}),
      memberId: editor.member.id,
      amountCents: cents,
      payDay: day,
      startMonth: start,
    });
    onClose();
  };

  const months = Array.from({ length: 24 }, (_, i) => addMonths(current, isRaise ? i + 1 : i - 3));
  if (!months.includes(start)) months.unshift(start);

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={isRaise ? `Aumento de ${editor.member.name}` : `Salário de ${editor.member.name}`}
      onSave={() => void save()}
    >
      <Field label={isRaise ? 'Novo salário líquido' : 'Quanto cai na conta por mês'}>
        <MoneyField value={cents} onChange={setCents} ariaLabel="Salário" />
      </Field>
      <Field label="Dia do pagamento" hint="A renda do mês conta como recebida a partir deste dia.">
        <input
          className="input tabular"
          inputMode="numeric"
          aria-label="Dia do pagamento"
          value={payDay}
          onChange={(e) => setPayDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
        />
      </Field>
      <Field
        label={isRaise ? 'Vale a partir de' : 'Desde'}
        hint={isRaise ? undefined : 'Corrigir aqui muda a renda de todos os meses desde esta data.'}
      >
        <select
          className="select"
          aria-label="Mês de início"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
      {isRaise && editor.plan && (
        <button
          type="button"
          className="danger-button"
          onClick={() => void softDelete('salaryPlans', editor.plan!.id).then(onClose)}
        >
          Cancelar este aumento
        </button>
      )}
    </Sheet>
  );
}

export default function SalariesPage() {
  const { members, salaryPlans, settings } = useData();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [namesOpen, setNamesOpen] = useState(false);
  const { pathname } = useLocation();
  const now = today();
  const month = monthOf(now);

  return (
    <LargeTitlePage title="Salários" backHref="/tabs/more">
      <div className="page-pad">
        <p className="muted subhead">
          Digitem uma vez. Todo mês a renda entra sozinha no dia do pagamento, e a divisão se
          ajusta.
        </p>
        {members.map((member, i) => {
          const plan = salaryOf(salaryPlans, member.id, month);
          const pay = payState(plan, month, now);
          const raises = upcomingRaises(salaryPlans, member.id, month);
          return (
            <div
              key={member.id}
              className="card rise"
              style={{ marginTop: 'var(--space-3)', ['--i' as string]: i }}
            >
              <div className="person-head" style={{ fontSize: 'var(--type-headline)' }}>
                {settings.mascots && (
                  <Mascot
                    animal={settings.memberAnimals[i]!}
                    pose={plan ? 'happy' : 'wink'}
                    size={52}
                    idle
                    delay={i}
                  />
                )}
                <button
                  type="button"
                  className="person-name"
                  aria-label={`Mudar o nome de ${member.name}`}
                  onClick={() => setNamesOpen(true)}
                >
                  <span>{member.name}</span>
                  <PencilSimpleIcon size={14} weight="bold" aria-hidden="true" />
                </button>
              </div>
              {plan ? (
                <>
                  <MoneyText cents={plan.amountCents} className="big-money" />
                  <span className="stat-label">
                    {pay?.received
                      ? `Entrou no dia ${pay.date.slice(8)} deste mês`
                      : `Entra no dia ${pay?.date.slice(8)} deste mês`}
                  </span>
                </>
              ) : (
                <p className="muted subhead">Ainda sem salário.</p>
              )}
              {raises.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="call"
                  style={{
                    width: '100%',
                    border: 0,
                    textAlign: 'left',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                  onClick={() => setEditor({ member, kind: 'raise', plan: r })}
                >
                  <TrendUpIcon size={22} weight="bold" aria-hidden="true" />
                  <span className="call-text">
                    Sobe para{' '}
                    <strong>
                      <MoneyText cents={r.amountCents} />
                    </strong>{' '}
                    em {monthLabel(r.startMonth)}
                  </span>
                </button>
              ))}
              <div className="two-cols" style={{ marginTop: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditor({ member, kind: 'salary', plan: plan ?? undefined })}
                >
                  {plan ? 'Editar' : 'Colocar salário'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!plan}
                  onClick={() => setEditor({ member, kind: 'raise' })}
                >
                  Agendar aumento
                </button>
              </div>
            </div>
          );
        })}
        <Link
          className="secondary-button"
          to={pathname.replace(/salaries$/, 'simulator')}
          style={{ marginTop: 'var(--space-4)', textDecoration: 'none' }}
        >
          E se tiver um aumento? Simular
        </Link>
      </div>
      {editor && <SalarySheet editor={editor} onClose={() => setEditor(null)} />}
      {namesOpen && <NamesSheet onClose={() => setNamesOpen(false)} />}
    </LargeTitlePage>
  );
}

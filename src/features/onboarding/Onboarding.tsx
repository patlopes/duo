import { useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useData } from '../../db/DataContext';
import { ensureJointAccount, ensurePersonalAccount, updateSettings, upsert } from '../../db/ops';
import { monthOf, today } from '../../domain/months';
import type { Member, SalaryPlan } from '../../schemas/entities';
import { Mascot } from '../../ui/Mascot';
import { Field, MoneyField } from '../../ui/parts';

const SLIDES: { art: ReactNode; title: string; text: string }[] = [
  {
    art: (
      <>
        <Mascot animal="giraffe" idle />
        <Mascot animal="monkey" idle delay={0.7} />
      </>
    ),
    title: 'As contas que vocês pagam juntos',
    text: 'Moradia, casamento, compras da casa. O que cada um gasta sozinho não entra aqui.',
  },
  {
    art: <Mascot animal="monkey" pose="wink" idle />,
    title: 'Sem fazer conta',
    text: 'Digam o salário de cada um e quanto precisam pagar. O app diz quanto cabe a cada um, pela renda ou meio a meio.',
  },
  {
    art: <Mascot animal="giraffe" pose="cheer" />,
    title: 'Vejam o mês que vem de longe',
    text: 'Quanto vai sobrar, quando transferir para a conjunta e o que muda se vier um aumento.',
  },
];

export default function Onboarding() {
  const { members } = useData();
  const [step, setStep] = useState(0);
  const [nameA, setNameA] = useState(members[0].name);
  const [nameB, setNameB] = useState(members[1].name === 'Pessoa B' ? '' : members[1].name);
  const [salaryA, setSalaryA] = useState(0);
  const [salaryB, setSalaryB] = useState(0);
  const [dayA, setDayA] = useState('5');
  const [dayB, setDayB] = useState('5');

  const finish = async (useForm: boolean) => {
    if (useForm) {
      if (nameA.trim()) await upsert<Member>('members', { ...members[0], name: nameA.trim() });
      if (nameB.trim()) await upsert<Member>('members', { ...members[1], name: nameB.trim() });
      const startMonth = monthOf(today());
      const save = (memberId: string, amountCents: number, payDay: string) =>
        amountCents > 0
          ? upsert<SalaryPlan>('salaryPlans', {
              memberId,
              amountCents,
              payDay: Math.min(31, Math.max(1, Number(payDay) || 5)),
              startMonth,
            })
          : null;
      await save(members[0].id, salaryA, dayA);
      await save(members[1].id, salaryB, dayB);
    }
    // Everything the home screen offers needs these, even if the welcome was skipped.
    await ensureJointAccount();
    await ensurePersonalAccount(members[0].id);
    await ensurePersonalAccount(members[1].id);
    await updateSettings({ onboarded: true });
  };

  const onSlide = step < SLIDES.length;
  const slide = SLIDES[step];

  return (
    <div
      className="onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Boas-vindas ao ${BRAND.name}`}
    >
      <div style={{ textAlign: 'right' }}>
        <button type="button" className="link-button" onClick={() => void finish(false)}>
          Pular
        </button>
      </div>
      <div className="onboarding-body" key={step}>
        {onSlide && slide ? (
          <div className="rise">
            <div className="mascot-onboarding">{slide.art}</div>
            <h1>{slide.title}</h1>
            <p>{slide.text}</p>
          </div>
        ) : (
          <div className="rise">
            <h1>Quem são vocês?</h1>
            <p style={{ marginBottom: 'var(--space-4)' }}>
              O salário é o líquido. Dá para ajustar depois.
            </p>
            <Field label="Seu nome">
              <input
                className="input"
                aria-label="Seu nome"
                value={nameA}
                onChange={(e) => setNameA(e.target.value)}
              />
            </Field>
            <div className="two-cols">
              <Field label="Seu salário">
                <MoneyField value={salaryA} onChange={setSalaryA} ariaLabel="Seu salário" />
              </Field>
              <Field label="Cai no dia">
                <input
                  className="input tabular"
                  inputMode="numeric"
                  aria-label="Dia do seu pagamento"
                  value={dayA}
                  onChange={(e) => setDayA(e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
              </Field>
            </div>
            <Field label="Nome de quem divide com você">
              <input
                className="input"
                aria-label="Nome de quem divide com você"
                value={nameB}
                onChange={(e) => setNameB(e.target.value)}
              />
            </Field>
            <div className="two-cols">
              <Field label="Salário">
                <MoneyField
                  value={salaryB}
                  onChange={setSalaryB}
                  ariaLabel="Salário de quem divide com você"
                />
              </Field>
              <Field label="Cai no dia">
                <input
                  className="input tabular"
                  inputMode="numeric"
                  aria-label="Dia do pagamento de quem divide com você"
                  value={dayB}
                  onChange={(e) => setDayB(e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
              </Field>
            </div>
          </div>
        )}
      </div>
      <div className="dots-steps" aria-hidden="true">
        {[...SLIDES, null].map((_, i) => (
          <span key={i} className={i === step ? 'on' : ''} />
        ))}
      </div>
      {onSlide ? (
        <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>
          Continuar
        </button>
      ) : (
        <button type="button" className="primary-button" onClick={() => void finish(true)}>
          Começar
        </button>
      )}
    </div>
  );
}

import { HandCoinsIcon, ReceiptIcon, TargetIcon } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useData } from '../../db/DataContext';
import { updateSettings, upsert } from '../../db/ops';
import type { Account, Member } from '../../schemas/entities';
import { Field, MoneyField } from '../../ui/parts';

const SLIDES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ReceiptIcon size={48} aria-hidden="true" />,
    title: 'Lance um gasto em segundos',
    text: 'Abriu, tocou no +, digitou o valor e escolheu a categoria. Funciona mesmo sem internet.',
  },
  {
    icon: <HandCoinsIcon size={48} aria-hidden="true" />,
    title: 'Dividam de um jeito justo',
    text: 'Cada um paga na proporção da própria renda, e o app diz quem acerta com quem no fim do mês.',
  },
  {
    icon: <TargetIcon size={48} aria-hidden="true" />,
    title: 'Realizem sonhos juntos',
    text: 'Casamento, viagem, entrada do apê: vocês veem quanto falta e se estão no ritmo.',
  },
];

export default function Onboarding() {
  const { members, accounts } = useData();
  const [step, setStep] = useState(0);
  const [nameA, setNameA] = useState(members[0].name === 'Patrick' ? 'Patrick' : members[0].name);
  const [nameB, setNameB] = useState(members[1].name === 'Pessoa B' ? '' : members[1].name);
  const [balance, setBalance] = useState(0);

  const finish = async (createNamed: boolean) => {
    const a = nameA.trim() || members[0].name;
    const b = nameB.trim() || members[1].name;
    if (createNamed) {
      await upsert<Member>('members', { ...members[0], name: a });
      await upsert<Member>('members', { ...members[1], name: b });
    }
    // The form needs somewhere to put the first expense, even if the guide was skipped.
    if (accounts.length === 0) {
      await upsert<Account>('accounts', {
        name: `Conta de ${a}`,
        type: 'checking',
        ownerMemberId: members[0].id,
        initialBalanceCents: balance,
        color: '#3A6EA5',
        icon: 'bank',
        includeInTotal: true,
        archived: false,
      });
      await upsert<Account>('accounts', {
        name: `Conta de ${b}`,
        type: 'checking',
        ownerMemberId: members[1].id,
        initialBalanceCents: 0,
        color: '#D9774B',
        icon: 'bank',
        includeInTotal: true,
        archived: false,
      });
    }
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
      <div className="onboarding-body">
        {onSlide && slide ? (
          <>
            <div className="onboarding-art">{slide.icon}</div>
            <h1>{slide.title}</h1>
            <p>{slide.text}</p>
          </>
        ) : (
          <>
            <h1>Quem são vocês?</h1>
            <p style={{ marginBottom: 'var(--space-4)' }}>Dá para mudar depois, em Ajustes.</p>
            <Field label="Seu nome">
              <input
                className="input"
                aria-label="Seu nome"
                value={nameA}
                onChange={(e) => setNameA(e.target.value)}
              />
            </Field>
            <Field label="Nome de quem divide com você">
              <input
                className="input"
                aria-label="Nome de quem divide com você"
                value={nameB}
                onChange={(e) => setNameB(e.target.value)}
              />
            </Field>
            <Field label="Quanto há na sua conta hoje (opcional)">
              <MoneyField
                value={balance}
                onChange={setBalance}
                allowNegative
                ariaLabel="Saldo inicial"
              />
            </Field>
          </>
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

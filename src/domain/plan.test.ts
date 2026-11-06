import type {
  Account,
  Goal,
  GoalMovement,
  MemberIncome,
  Recurrence,
  SalaryPlan,
  Transaction,
  Transfer,
} from '../schemas/entities';
import {
  billsOf,
  buildMonthPlan,
  dreamLines,
  fixedBills,
  futureMonths,
  isSharedBill,
  jointAccountOf,
  projectMonths,
  type PlanData,
} from './plan';
import {
  isGeneratedIncome,
  mergeSalaryIncomes,
  payState,
  salaryOf,
  upcomingRaises,
} from './salary';

const stamp = {
  householdId: 'h',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};
const NOW = '2026-11-06';

const account = (
  id: string,
  type: Account['type'],
  owner: string | null,
  initial = 0,
): Account => ({
  ...stamp,
  id,
  name: id,
  type,
  ownerMemberId: owner,
  initialBalanceCents: initial,
  color: '',
  icon: '',
  includeInTotal: true,
  archived: false,
});
const income = (memberId: string, amountCents: number): MemberIncome => ({
  ...stamp,
  id: `i-${memberId}`,
  memberId,
  competenceMonth: '2026-11',
  type: 'salary',
  amountCents,
  countsForSplit: true,
});
let seq = 0;
const bill = (over: Partial<Transaction> = {}): Transaction => {
  const date = over.date ?? '2026-11-10';
  return {
    ...stamp,
    id: `b${++seq}`,
    kind: 'expense',
    amountCents: 100_000,
    description: 'Aluguel',
    date,
    competenceMonth: date.slice(0, 7),
    accountId: 'joint',
    cardId: null,
    invoiceMonth: null,
    categoryId: null,
    tagIds: [],
    status: 'pending',
    recurrenceId: null,
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    payerMemberId: null,
    splitRule: 'proportional',
    goalId: null,
    goalItemId: null,
    notes: '',
    attachmentIds: [],
    source: 'manual',
    externalId: null,
    ...over,
  };
};
const deposit = (from: string, amountCents: number): Transfer => ({
  ...stamp,
  id: `d${++seq}`,
  kind: 'joint_deposit',
  fromAccountId: from,
  toAccountId: 'joint',
  toCardId: null,
  invoiceMonth: null,
  amountCents,
  date: '2026-11-02',
  competenceMonth: '2026-11',
  status: 'paid',
  notes: '',
});
const goal = (over: Partial<Goal> = {}): Goal => ({
  ...stamp,
  id: 'g',
  name: 'Casamento',
  emoji: '',
  coverAssetId: null,
  type: 'saving',
  targetCents: 1_000_000,
  targetDate: '2027-09-15',
  priority: 1,
  splitRule: 'proportional',
  accountId: null,
  reportedBalanceCents: null,
  status: 'active',
  ...over,
});
const movement = (over: Partial<GoalMovement> = {}): GoalMovement => ({
  ...stamp,
  id: `m${++seq}`,
  goalId: 'g',
  memberId: 'A',
  kind: 'contribution',
  amountCents: 10_000,
  date: '2026-11-03',
  competenceMonth: '2026-11',
  ...over,
});

const data = (over: Partial<PlanData> = {}): PlanData => ({
  household: { memberIds: ['A', 'B'] },
  accounts: [
    account('a', 'checking', 'A'),
    account('b', 'checking', 'B'),
    account('joint', 'joint', null, 50_000),
  ],
  cards: [],
  goals: [],
  goalMovements: [],
  categories: [],
  incomes: [income('A', 600_000), income('B', 400_000)],
  closes: [],
  transactions: [],
  transfers: [],
  recurrences: [],
  emergencyMonths: 6,
  ...over,
});

describe('contas de vocês no mês', () => {
  it('só entra o que é dos dois', () => {
    expect(isSharedBill(bill(), [])).toBe(true);
    expect(isSharedBill(bill({ splitRule: 'equal' }), [])).toBe(true);
    expect(isSharedBill(bill({ splitRule: 'memberA' }), [])).toBe(false);
    expect(isSharedBill(bill({ kind: 'income' }), [])).toBe(false);
    expect(isSharedBill(bill({ source: 'adjustment' }), [])).toBe(false);
    const fund = goal({ accountId: 'fund' });
    expect(isSharedBill(bill({ goalId: 'g', accountId: 'fund' }), [fund])).toBe(false);
    expect(isSharedBill(bill({ goalId: 'g', accountId: 'joint' }), [fund])).toBe(true);
  });

  it('ordena por vencimento e separa o mês', () => {
    const rows = [
      bill({ date: '2026-11-20', description: 'Luz' }),
      bill({ date: '2026-11-05' }),
      bill({ date: '2026-12-05' }),
    ];
    expect(billsOf(rows, [], '2026-11').map((r) => r.date)).toEqual(['2026-11-05', '2026-11-20']);
  });

  it('divide pela renda e diz quanto falta para cada um', () => {
    const plan = buildMonthPlan(
      data({ transactions: [bill()], transfers: [deposit('a', 20_000)] }),
      '2026-11',
      NOW,
    );
    expect(plan.totalCents).toBe(100_000);
    expect(plan.share).toEqual([60_000, 40_000]);
    expect(plan.covered).toEqual([20_000, 0]);
    expect(plan.missing).toEqual([40_000, 40_000]);
    expect(plan.deadline).toBe('2026-11-10');
  });

  it('depositar a mais não vira falta negativa', () => {
    const plan = buildMonthPlan(
      data({ transactions: [bill()], transfers: [deposit('a', 90_000)] }),
      '2026-11',
      NOW,
    );
    expect(plan.missing).toEqual([0, 40_000]);
  });

  it('metade para cada ignora a renda', () => {
    const plan = buildMonthPlan(
      data({ transactions: [bill({ splitRule: 'equal' })] }),
      '2026-11',
      NOW,
    );
    expect(plan.share).toEqual([50_000, 50_000]);
  });

  it('conta paga do próprio bolso já vale como a parte de quem pagou', () => {
    const rows = [
      bill({ accountId: 'b', status: 'paid', amountCents: 30_000 }),
      bill({ amountCents: 70_000 }),
    ];
    const plan = buildMonthPlan(data({ transactions: rows }), '2026-11', NOW);
    expect(plan.covered).toEqual([0, 30_000]);
    expect(plan.missing).toEqual([60_000, 10_000]);
  });

  it('paga pela conjunta não credita ninguém duas vezes', () => {
    const plan = buildMonthPlan(
      data({
        transactions: [bill({ status: 'paid' })],
        transfers: [deposit('a', 60_000), deposit('b', 40_000)],
      }),
      '2026-11',
      NOW,
    );
    expect(plan.missing).toEqual([0, 0]);
    expect(plan.allPaid).toBe(true);
    expect(plan.paidCents).toBe(100_000);
    expect(plan.pendingCents).toBe(0);
    expect(plan.deadline).toBeNull();
  });

  it('marca o que venceu e o que falta na conjunta', () => {
    const rows = [
      bill({ date: '2026-11-01', amountCents: 80_000 }),
      bill({ date: '2026-11-20', amountCents: 20_000 }),
    ];
    const plan = buildMonthPlan(data({ transactions: rows }), '2026-11', NOW);
    expect(plan.overdue).toHaveLength(1);
    expect(plan.deadline).toBe('2026-11-01');
    expect(plan.jointBalanceCents).toBe(50_000);
    expect(plan.jointShortfallCents).toBe(50_000);
  });

  it('funciona sem conta conjunta e sem contas no mês', () => {
    const plan = buildMonthPlan(
      data({ accounts: [account('a', 'checking', 'A')] }),
      '2026-11',
      NOW,
    );
    expect(plan.joint).toBeUndefined();
    expect(plan.jointBalanceCents).toBeNull();
    expect(plan.allPaid).toBe(false);
    expect(jointAccountOf([{ ...account('j', 'joint', null), archived: true }])).toBeUndefined();
  });

  it('compra no cartão conta como já paga e credita o dono', () => {
    const card = {
      ...stamp,
      id: 'c',
      name: '',
      brand: '',
      limitCents: 1,
      closingDay: 3,
      dueDay: 10,
      paymentAccountId: null,
      ownerMemberId: 'A',
      color: '',
      archived: false,
    };
    const plan = buildMonthPlan(
      data({
        cards: [card],
        transactions: [bill({ accountId: null, cardId: 'c', invoiceMonth: '2026-12' })],
      }),
      '2026-11',
      NOW,
    );
    expect(plan.paidCents).toBe(100_000);
    expect(plan.covered).toEqual([100_000, 0]);
    expect(plan.deadline).toBeNull();
  });
});

describe('sonhos dentro do mês', () => {
  it('pede o aporte necessário, dividido pela regra do sonho', () => {
    const plan = buildMonthPlan(data({ goals: [goal()] }), '2026-11', NOW);
    expect(plan.dreams[0]!.monthlyCents).toBe(100_000);
    expect(plan.share).toEqual([60_000, 40_000]);
    expect(plan.dreamsCents).toBe(100_000);
  });

  it('o aporte do mês cobre a parte de quem aportou, sem reduzir o que o mês pedia', () => {
    const plan = buildMonthPlan(
      data({ goals: [goal()], goalMovements: [movement({ amountCents: 60_000 })] }),
      '2026-11',
      NOW,
    );
    expect(plan.dreams[0]!.monthlyCents).toBe(100_000);
    expect(plan.missing).toEqual([0, 40_000]);
  });

  it('ignora sonho pausado, sem prazo ou já alcançado', () => {
    const d = data({ goals: [goal({ status: 'paused' }), goal({ id: 'x', targetDate: null })] });
    expect(dreamLines(d, '2026-11', NOW)).toEqual([]);
    const done = data({
      goals: [goal()],
      goalMovements: [
        movement({ amountCents: 2_000_000, competenceMonth: '2026-01', date: '2026-01-01' }),
      ],
    });
    expect(dreamLines(done, '2026-11', NOW)).toEqual([]);
  });

  it('reserva de emergência usa o alvo calculado', () => {
    const category = {
      ...stamp,
      id: 'casa',
      name: 'Casa',
      kind: 'expense' as const,
      parentId: null,
      icon: '',
      color: '',
      nature: 'essential' as const,
      defaultSplitRule: 'proportional' as const,
      archived: false,
      system: false,
    };
    const rows = [bill({ categoryId: 'casa', date: '2026-10-05', status: 'paid' })];
    const lines = dreamLines(
      data({
        goals: [goal({ type: 'emergency', targetCents: null })],
        categories: [category],
        transactions: rows,
      }),
      '2026-11',
      NOW,
    );
    expect(lines[0]!.monthlyCents).toBe(60_000);
  });

  it('mês futuro calcula pelo prazo que restará', () => {
    const lines = dreamLines(data({ goals: [goal({ targetDate: '2027-03-15' })] }), '2027-01', NOW);
    expect(lines[0]!.monthlyCents).toBe(500_000);
  });
});

describe('próximos meses', () => {
  it('separa o fixo do que é fora do comum', () => {
    const rows = [
      bill({ date: '2026-12-05', recurrenceId: 'r', amountCents: 100_000 }),
      bill({ date: '2026-12-20', description: 'Sofá', amountCents: 50_000 }),
      bill({ date: '2027-01-05', recurrenceId: 'r', amountCents: 100_000 }),
      bill({ date: '2026-11-05', description: 'mês atual' }),
    ];
    const months = futureMonths(data({ transactions: rows }), NOW, 2);
    expect(months.map((m) => m.month)).toEqual(['2026-12', '2027-01']);
    expect(months[0]!.totalCents).toBe(150_000);
    expect(months[0]!.fixedCents).toBe(100_000);
    expect(months[0]!.oneOff.map((t) => t.description)).toEqual(['Sofá']);
    expect(months[0]!.share).toEqual([90_000, 60_000]);
    expect(months[1]!.oneOff).toEqual([]);
  });
});

describe('contas fixas', () => {
  const recurrence = (id: string, description: string): Recurrence => ({
    ...stamp,
    id,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-05',
    endDate: null,
    generatedUntil: '2027-11-30',
    template: {
      kind: 'expense',
      amountCents: 1,
      description,
      accountId: 'joint',
      cardId: null,
      categoryId: null,
      tagIds: [],
      payerMemberId: null,
      splitRule: 'proportional',
      notes: '',
    },
  });

  it('acha a próxima ocorrência e esconde as que já acabaram', () => {
    const rows = [
      bill({ recurrenceId: 'r', date: '2026-10-05', status: 'paid' }),
      bill({ recurrenceId: 'r', date: '2026-11-05', status: 'paid' }),
      bill({ recurrenceId: 'r', date: '2026-12-05' }),
      bill({ recurrenceId: 'velha', date: '2026-02-05', status: 'paid' }),
    ];
    const list = fixedBills([recurrence('r', 'Aluguel'), recurrence('velha', 'Antiga')], rows, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]!.next!.date).toBe('2026-12-05');
  });

  it('ordena por nome', () => {
    const rows = [
      bill({ recurrenceId: 'b', date: '2026-12-05' }),
      bill({ recurrenceId: 'a', date: '2026-12-05' }),
    ];
    const list = fixedBills([recurrence('b', 'Luz'), recurrence('a', 'Aluguel')], rows, NOW);
    expect(list.map((x) => x.recurrence.id)).toEqual(['a', 'b']);
  });
});

describe('renda, comparação e sobra', () => {
  it('mostra quanto vocês têm, quanto pagam e quanto sobra', () => {
    const plan = buildMonthPlan(
      data({ transactions: [bill({ amountCents: 300_000 })] }),
      '2026-11',
      NOW,
    );
    expect(plan.incomeCents).toBe(1_000_000);
    expect(plan.toPayCents).toBe(300_000);
    expect(plan.leftoverCents).toBe(700_000);
    expect(plan.leftoverByMember).toEqual([420_000, 280_000]);
  });

  it('compara proporcional e metade sobre o mesmo total', () => {
    const plan = buildMonthPlan(
      data({ transactions: [bill({ amountCents: 100_001 })] }),
      '2026-11',
      NOW,
    );
    expect(plan.shareIfProportional).toEqual([60_001, 40_000]);
    expect(plan.shareIfEqual).toEqual([50_001, 50_000]);
    expect(plan.share).toEqual(plan.shareIfProportional);
  });

  it('escolher metade muda o que cada um paga, e a comparação continua igual', () => {
    const plan = buildMonthPlan(
      data({ transactions: [bill()], splitMode: 'equal' }),
      '2026-11',
      NOW,
    );
    expect(plan.share).toEqual([50_000, 50_000]);
    expect(plan.shareIfProportional).toEqual([60_000, 40_000]);
    expect(plan.incomePctA).toBeCloseTo(0.6);
    expect(plan.pctA).toBe(0.5);
  });

  it('mês fechado mantém o que foi fechado, mesmo escolhendo metade', () => {
    const close = {
      ...stamp,
      id: '2026-11',
      month: '2026-11',
      pctByMember: { A: 0.7, B: 0.3 },
      incomeByMember: {},
      owedByMember: {},
      paidByMember: {},
      settlement: null,
      closedAt: stamp.createdAt,
      reopenedAt: null,
    };
    const plan = buildMonthPlan(
      data({ transactions: [bill()], splitMode: 'equal', closes: [close] }),
      '2026-11',
      NOW,
    );
    expect(plan.pctA).toBe(0.7);
  });

  it('agrupa em moradia, casamento e o que mais houver', () => {
    const cat = (id: string, name: string, parentId: string | null = null) => ({
      ...stamp,
      id,
      name,
      kind: 'expense' as const,
      parentId,
      icon: 'house',
      color: '#123',
      nature: 'essential' as const,
      defaultSplitRule: 'proportional' as const,
      archived: false,
      system: false,
    });
    const plan = buildMonthPlan(
      data({
        categories: [cat('moradia', 'Moradia'), cat('luz', 'Luz', 'moradia')],
        goals: [goal()],
        transactions: [
          bill({ categoryId: 'moradia', amountCents: 200_000, status: 'paid' }),
          bill({ categoryId: 'luz', amountCents: 10_000 }),
          bill({ categoryId: null, amountCents: 5_000 }),
        ],
      }),
      '2026-11',
      NOW,
    );
    expect(plan.buckets.map((x) => x.name)).toEqual([
      'Moradia',
      'Contas do casal',
      'Guardar: Casamento',
    ]);
    expect(plan.buckets[0]!.totalCents).toBe(210_000);
    expect(plan.buckets[0]!.paidCents).toBe(200_000);
    expect(plan.buckets[0]!.bills).toHaveLength(2);
    expect(plan.buckets[2]!.dream).toBeDefined();
  });
});

describe('projeção e simulador', () => {
  const salary = (memberId: string, amountCents: number, startMonth = '2026-01'): SalaryPlan => ({
    ...stamp,
    id: `s-${memberId}-${startMonth}`,
    memberId,
    amountCents,
    payDay: 5,
    startMonth,
  });
  const recurring = ['2026-11-05', '2026-12-05', '2027-01-05'].map((date) =>
    bill({ date, recurrenceId: 'r', amountCents: 100_000 }),
  );
  const base = (over: Partial<PlanData> = {}) =>
    data({
      incomes: mergeSalaryIncomes([], [salary('A', 700_000), salary('B', 300_000)], NOW),
      salaryPlans: [salary('A', 700_000), salary('B', 300_000)],
      transactions: recurring,
      ...over,
    });

  it('projeta renda, contas e sobra acumulada mês a mês', () => {
    const months = projectMonths(base(), NOW, 3);
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(months[0]!.shareIfProportional).toEqual([70_000, 30_000]);
    expect(months[0]!.leftoverCents).toBe(900_000);
    expect(months[2]!.accumulatedCents).toBe(2_700_000);
  });

  it('simula um aumento a partir de um mês, sem mexer nos dados', () => {
    const d = base();
    const before = JSON.stringify(d.transactions);
    const months = projectMonths(d, NOW, 3, { salary: [null, 700_000], salaryFrom: '2026-12' });
    expect(months[0]!.incomeByMember).toEqual([700_000, 300_000]);
    expect(months[1]!.incomeByMember).toEqual([700_000, 700_000]);
    // Com rendas iguais, a divisão proporcional passa a ser meio a meio.
    expect(months[1]!.shareIfProportional).toEqual([50_000, 50_000]);
    expect(JSON.stringify(d.transactions)).toBe(before);
  });

  it('simula conta nova e compra única', () => {
    const months = projectMonths(base(), NOW, 3, {
      extraMonthlyCents: 50_000,
      oneOff: { month: '2026-12', cents: 200_000 },
    });
    expect(months[0]!.toPayCents).toBe(150_000);
    expect(months[1]!.toPayCents).toBe(350_000);
    expect(months[1]!.oneOffCents).toBe(200_000);
    expect(months[2]!.toPayCents).toBe(150_000);
  });

  it('compara as duas divisões e usa a escolhida na sobra de cada um', () => {
    const [m] = projectMonths(base(), NOW, 1, { mode: 'equal' });
    expect(m!.share).toEqual([50_000, 50_000]);
    expect(m!.leftoverByMember).toEqual([650_000, 250_000]);
    expect(m!.shareIfProportional).toEqual([70_000, 30_000]);
  });

  it('aumento já cadastrado entra sozinho na projeção', () => {
    const plans = [salary('A', 700_000), salary('B', 300_000), salary('B', 400_000, '2027-01')];
    const months = projectMonths(
      base({ incomes: mergeSalaryIncomes([], plans, NOW), salaryPlans: plans }),
      NOW,
      3,
    );
    expect(months[1]!.incomeByMember[1]).toBe(300_000);
    expect(months[2]!.incomeByMember[1]).toBe(400_000);
  });

  it('sem renda nenhuma, divide meio a meio', () => {
    const [m] = projectMonths(data({ incomes: [], transactions: recurring }), NOW, 1);
    expect(m!.shareIfProportional).toEqual([50_000, 50_000]);
    expect(m!.leftoverCents).toBe(-100_000);
  });

  it('além do horizonte gerado, usa o salário em vigor', () => {
    const [, far] = projectMonths(base({ incomes: [] }), NOW, 2);
    expect(far!.incomeByMember).toEqual([700_000, 300_000]);
  });
});

describe('salários', () => {
  const s = (
    memberId: string,
    amountCents: number,
    startMonth: string,
    payDay = 5,
  ): SalaryPlan => ({
    ...stamp,
    id: `${memberId}-${startMonth}`,
    memberId,
    amountCents,
    payDay,
    startMonth,
  });

  it('o aumento só vale do mês dele em diante', () => {
    const plans = [s('A', 500_000, '2026-01'), s('A', 600_000, '2027-03')];
    expect(salaryOf(plans, 'A', '2025-12')).toBeNull();
    expect(salaryOf(plans, 'A', '2027-02')!.amountCents).toBe(500_000);
    expect(salaryOf(plans, 'A', '2027-03')!.amountCents).toBe(600_000);
    expect(upcomingRaises(plans, 'A', '2026-11').map((p) => p.amountCents)).toEqual([600_000]);
  });

  it('vira renda sozinho, e a renda digitada à mão tem prioridade', () => {
    const manual: MemberIncome = {
      ...stamp,
      id: 'm',
      memberId: 'A',
      competenceMonth: '2026-11',
      type: 'salary',
      amountCents: 999,
      countsForSplit: true,
    };
    const merged = mergeSalaryIncomes([manual], [s('A', 500_000, '2026-10')], NOW);
    const of = (month: string) => merged.filter((i) => i.competenceMonth === month);
    expect(of('2026-09')).toEqual([]);
    expect(of('2026-10')[0]!.amountCents).toBe(500_000);
    expect(isGeneratedIncome(of('2026-10')[0]!)).toBe(true);
    expect(of('2026-11')).toEqual([manual]);
    expect(of('2026-12')[0]!.amountCents).toBe(500_000);
    expect(isGeneratedIncome(manual)).toBe(false);
  });

  it('13º e bônus não impedem o salário do mês', () => {
    const bonus: MemberIncome = {
      ...stamp,
      id: 'b',
      memberId: 'A',
      competenceMonth: '2026-11',
      type: '13th',
      amountCents: 1,
      countsForSplit: false,
    };
    const merged = mergeSalaryIncomes([bonus], [s('A', 500_000, '2026-11')], NOW);
    expect(merged.filter((i) => i.competenceMonth === '2026-11')).toHaveLength(2);
  });

  it('sabe se o pagamento do mês já entrou', () => {
    const plan = s('A', 500_000, '2026-01', 5);
    expect(payState(plan, '2026-11', '2026-11-04')!.received).toBe(false);
    expect(payState(plan, '2026-11', '2026-11-05')!.received).toBe(true);
    expect(payState(s('A', 1, '2026-01', 31), '2027-02', NOW)!.date).toBe('2027-02-28');
    expect(payState(null, '2026-11', NOW)).toBeNull();
  });
});

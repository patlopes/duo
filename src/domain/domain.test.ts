import type {
  Account,
  Budget,
  Category,
  CreditCard,
  Goal,
  GoalItem,
  GoalMovement,
  MemberIncome,
  MonthClose,
  Transaction,
  Transfer,
} from '../schemas/entities';
import {
  accountBalance,
  accountForecast,
  accountStatement,
  balanceSeries,
  totalBalance,
  totalForecast,
} from './balances';
import {
  budgetBarState,
  budgetLines,
  copyBudgetsFromMonth,
  effectiveBudget,
  monthSummary,
} from './budgets';
import { emergencyTarget, goalFairness, goalMetrics, itemProgress } from './goals';
import { planInstallments, recurrenceDates } from './installments';
import {
  availableLimit,
  bestPurchaseDay,
  buildInvoice,
  cardInvoices,
  closingAfter,
  dueAfter,
  invoiceDates,
  invoiceMonthFor,
} from './invoices';
import {
  formatBRL,
  formatBRLRound,
  parseAmount,
  pressKeypad,
  splitByPct,
  splitEvenly,
} from './money';
import {
  addDays,
  addMonths,
  dayInMonth,
  dayLabel,
  daysInMonth,
  monthDiff,
  monthLabel,
  monthsBetween,
  monthShort,
  shortDay,
} from './months';
import {
  computeSettlement,
  countsForSettlement,
  isMonthClosed,
  memberAPct,
  shareOf,
  suggestJointDeposits,
  type SplitContext,
} from './split';
import {
  applyRules,
  categorySlices,
  descriptionSuggestions,
  groupByDay,
  moneyLeaks,
  monthTotals,
  ruleMatches,
  similarDescriptions,
  suggestRuleFromCorrections,
  topSlices,
} from './summaries';

const stamp = {
  householdId: 'h',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

function account(id: string, over: Partial<Account> = {}): Account {
  return {
    ...stamp,
    id,
    name: id,
    type: 'checking',
    ownerMemberId: null,
    initialBalanceCents: 0,
    color: '#000',
    icon: 'bank',
    includeInTotal: true,
    archived: false,
    ...over,
  };
}

function card(over: Partial<CreditCard> = {}): CreditCard {
  return {
    ...stamp,
    id: 'c1',
    name: 'Cartão',
    brand: 'Visa',
    limitCents: 500_000,
    closingDay: 3,
    dueDay: 10,
    paymentAccountId: null,
    ownerMemberId: 'A',
    color: '#000',
    archived: false,
    ...over,
  };
}

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  const date = over.date ?? '2026-11-05';
  return {
    ...stamp,
    id: `t${++seq}`,
    kind: 'expense',
    amountCents: 1000,
    description: 'x',
    date,
    competenceMonth: date.slice(0, 7),
    accountId: over.cardId ? null : 'a1',
    cardId: null,
    invoiceMonth: null,
    categoryId: null,
    tagIds: [],
    status: 'paid',
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
}

function transfer(over: Partial<Transfer> = {}): Transfer {
  const date = over.date ?? '2026-11-05';
  return {
    ...stamp,
    id: `x${++seq}`,
    kind: 'transfer',
    fromAccountId: 'a1',
    toAccountId: 'a2',
    toCardId: null,
    invoiceMonth: null,
    amountCents: 1000,
    date,
    competenceMonth: date.slice(0, 7),
    status: 'paid',
    notes: '',
    ...over,
  };
}

function category(id: string, over: Partial<Category> = {}): Category {
  return {
    ...stamp,
    id,
    name: id,
    kind: 'expense',
    parentId: null,
    icon: 'tag',
    color: '#123456',
    nature: 'lifestyle',
    defaultSplitRule: 'proportional',
    archived: false,
    system: false,
    ...over,
  };
}

function budget(categoryId: string, amountCents: number, month: string | null = null): Budget {
  return { ...stamp, id: `b${++seq}`, categoryId, month, amountCents };
}

function income(memberId: string, amountCents: number, month: string, counts = true): MemberIncome {
  return {
    ...stamp,
    id: `i${++seq}`,
    memberId,
    competenceMonth: month,
    type: 'salary',
    amountCents,
    countsForSplit: counts,
  };
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    ...stamp,
    id: 'g1',
    name: 'Sonho',
    emoji: '',
    coverAssetId: null,
    type: 'saving',
    targetCents: 1_000_000,
    targetDate: '2027-11-01',
    priority: 3,
    splitRule: 'proportional',
    accountId: null,
    reportedBalanceCents: null,
    status: 'active',
    ...over,
  };
}

function movement(over: Partial<GoalMovement> = {}): GoalMovement {
  return {
    ...stamp,
    id: `m${++seq}`,
    goalId: 'g1',
    memberId: 'A',
    kind: 'contribution',
    amountCents: 10_000,
    date: '2026-11-01',
    competenceMonth: '2026-11',
    ...over,
  };
}

function ctx(over: Partial<SplitContext> = {}): SplitContext {
  return {
    household: { memberIds: ['A', 'B'] },
    accounts: [
      account('a', { ownerMemberId: 'A' }),
      account('b', { ownerMemberId: 'B' }),
      account('joint', { type: 'joint', ownerMemberId: null }),
    ],
    cards: [card({ id: 'ca', ownerMemberId: 'A' }), card({ id: 'cb', ownerMemberId: 'B' })],
    goals: [],
    incomes: [income('A', 800_000, '2026-11'), income('B', 200_000, '2026-11')],
    closes: [],
    transactions: [],
    transfers: [],
    ...over,
  };
}

describe('dinheiro', () => {
  it('divide sem perder centavos, com o resto nas primeiras partes', () => {
    expect(splitEvenly(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitEvenly(7, 7)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(() => splitEvenly(10, 0)).toThrow();
  });

  it('divide por percentual fechando sempre o total', () => {
    for (const [total, pct] of [
      [1001, 0.615],
      [1, 0.5],
      [99999, 1 / 3],
    ] as const) {
      const [a, b] = splitByPct(total, pct);
      expect(a + b).toBe(total);
    }
  });

  it('formata em reais', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRLRound(123456)).toBe('R$ 1.235');
  });

  it('o teclado funciona como o de banco', () => {
    let v = 0;
    for (const k of ['1', '2', '3', '4'] as const) v = pressKeypad(v, k);
    expect(v).toBe(1234);
    expect(pressKeypad(v, 'back')).toBe(123);
    expect(pressKeypad(12, '000')).toBe(12000);
    expect(pressKeypad(99_999_999_999, '9')).toBe(99_999_999_999);
  });

  it.each([
    ['1.234,56', 123456],
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['-12,3', -1230],
    ['R$ 10', 1000],
    ['1.234', 123400],
    ['(45,90)', -4590],
    ['0,05', 5],
  ])('lê o valor %s', (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });

  it('não inventa número em texto', () => {
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('meses e datas', () => {
  it('atravessa a virada do ano nos dois sentidos', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', -23)).toBe('2024-12');
    expect(monthDiff('2026-11', '2027-02')).toBe(3);
    expect(monthsBetween('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('usa o último dia em meses curtos', () => {
    expect(dayInMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dayInMonth('2028-02', 30)).toBe('2028-02-29');
    expect(daysInMonth('2026-04')).toBe(30);
  });

  it('soma dias atravessando meses', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('escreve em português', () => {
    expect(monthLabel('2026-11')).toBe('novembro de 2026');
    expect(monthShort('2026-11')).toBe('nov');
    expect(dayLabel('2026-11-06', '2026-11-06')).toBe('Hoje');
    expect(dayLabel('2026-11-05', '2026-11-06')).toBe('Ontem');
    expect(dayLabel('2026-11-07', '2026-11-06')).toBe('Amanhã');
    expect(dayLabel('2026-11-01', '2026-11-06')).toContain('nov');
    expect(shortDay('2026-11-03')).toContain('nov');
  });
});

describe('fatura do cartão (5.2)', () => {
  const c = (closingDay: number, dueDay: number) => ({ closingDay, dueDay });

  it('fechamento 3, vencimento 10', () => {
    expect(invoiceMonthFor('2026-11-02', c(3, 10))).toBe('2026-11');
    expect(invoiceMonthFor('2026-11-04', c(3, 10))).toBe('2026-12');
  });

  it('fechamento 25, vencimento 5: vira o mês', () => {
    expect(invoiceMonthFor('2026-11-20', c(25, 5))).toBe('2026-12');
    expect(invoiceMonthFor('2026-11-26', c(25, 5))).toBe('2027-01');
  });

  it('fechamento 31 em fevereiro', () => {
    expect(closingAfter('2026-02-10', 31)).toBe('2026-02-28');
    expect(closingAfter('2026-02-28', 31)).toBe('2026-03-31');
    expect(invoiceMonthFor('2026-02-10', c(31, 10))).toBe('2026-03');
    expect(invoiceMonthFor('2026-02-28', c(31, 10))).toBe('2026-04');
  });

  it('compra exatamente no dia do fechamento cai na fatura seguinte', () => {
    expect(invoiceMonthFor('2026-11-03', c(3, 10))).toBe('2026-12');
    expect(invoiceMonthFor('2026-11-25', c(25, 5))).toBe('2027-01');
  });

  it('vencimento no mesmo dia do fechamento vai para o mês seguinte', () => {
    expect(dueAfter('2026-11-10', 10)).toBe('2026-12-10');
  });

  it('calcula as datas da fatura a partir do mês', () => {
    expect(invoiceDates('2026-11', c(3, 10))).toEqual({
      closing: '2026-11-03',
      due: '2026-11-10',
      periodStart: '2026-10-03',
      periodEnd: '2026-11-02',
    });
    expect(invoiceDates('2026-12', c(25, 5)).closing).toBe('2026-11-25');
  });

  it('segue os estados aberta, fechada, paga e vencida', () => {
    const k = card();
    const rows = [tx({ cardId: 'c1', invoiceMonth: '2026-11', amountCents: 5000 })];
    const status = (now: string, pay: Transfer[] = []) =>
      buildInvoice(k, '2026-11', rows, pay, now).status;
    expect(status('2026-11-02')).toBe('open');
    expect(status('2026-11-03')).toBe('closed');
    expect(status('2026-11-11')).toBe('overdue');
    const pay = transfer({
      kind: 'invoice_payment',
      toAccountId: null,
      toCardId: 'c1',
      invoiceMonth: '2026-11',
      amountCents: 5000,
    });
    expect(status('2026-11-11', [pay])).toBe('paid');
    const partial = { ...pay, amountCents: 1000 };
    const invoice = buildInvoice(k, '2026-11', rows, [partial], '2026-11-05');
    expect(invoice.status).toBe('closed');
    expect(invoice.remainingCents).toBe(4000);
  });

  it('estorno no cartão reduz a fatura', () => {
    const rows = [
      tx({ cardId: 'c1', invoiceMonth: '2026-11', amountCents: 5000 }),
      tx({ cardId: 'c1', invoiceMonth: '2026-11', amountCents: 1000, kind: 'income' }),
    ];
    expect(buildInvoice(card(), '2026-11', rows, [], '2026-11-01').totalCents).toBe(4000);
  });

  it('lista faturas e calcula o limite com parcelas futuras', () => {
    const k = card();
    const rows = [
      tx({ cardId: 'c1', invoiceMonth: '2026-11', amountCents: 10_000 }),
      tx({ cardId: 'c1', invoiceMonth: '2026-12', amountCents: 20_000 }),
      tx({ cardId: 'c1', invoiceMonth: '2027-01', amountCents: 30_000 }),
    ];
    expect(cardInvoices(k, rows, [], '2026-11-01').map((i) => i.month)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
    expect(availableLimit(k, rows, [], '2026-11-01')).toBe(500_000 - 60_000);
    const paid = transfer({
      kind: 'invoice_payment',
      toAccountId: null,
      toCardId: 'c1',
      invoiceMonth: '2026-11',
      amountCents: 10_000,
    });
    expect(availableLimit(k, rows, [paid], '2026-11-01')).toBe(500_000 - 50_000);
  });

  it('o melhor dia de compra é o dia seguinte ao fechamento', () => {
    expect(bestPurchaseDay(c(3, 10), '2026-11-01')).toBe('2026-11-04');
    expect(bestPurchaseDay(c(3, 10), '2026-11-03')).toBe('2026-11-04');
    expect(bestPurchaseDay(c(3, 10), '2026-11-04')).toBe('2026-12-04');
  });
});

describe('parcelas e recorrências (5.3, 2.5)', () => {
  it('parcela no cartão anda de fatura em fatura', () => {
    const plan = planInstallments(270_000, 6, '2026-11-02', card());
    expect(plan.map((p) => p.invoiceMonth)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
    ]);
    expect(plan.every((p) => p.date === '2026-11-02')).toBe(true);
    expect(plan.reduce((s, p) => s + p.amountCents, 0)).toBe(270_000);
    expect(plan[5]!.number).toBe(6);
    expect(plan[1]!.competenceMonth).toBe('2026-12');
  });

  it('parcela em conta anda de data, respeitando meses curtos', () => {
    const plan = planInstallments(100_000, 3, '2026-12-31', null);
    expect(plan.map((p) => p.date)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
    expect(plan[0]!.invoiceMonth).toBeNull();
  });

  it('gera datas mensais, semanais e anuais', () => {
    const base = { interval: 1, endDate: null };
    expect(
      recurrenceDates(
        { ...base, frequency: 'monthly', startDate: '2026-01-31' },
        null,
        '2026-03-31',
      ),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(
      recurrenceDates(
        { ...base, frequency: 'weekly', startDate: '2026-11-01' },
        null,
        '2026-11-15',
      ),
    ).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
    expect(
      recurrenceDates(
        { ...base, frequency: 'yearly', startDate: '2026-02-28' },
        null,
        '2028-12-31',
      ),
    ).toEqual(['2026-02-28', '2027-02-28', '2028-02-28']);
  });

  it('continua de onde parou e respeita a data final', () => {
    const rule = {
      frequency: 'monthly' as const,
      interval: 1,
      startDate: '2026-01-10',
      endDate: '2026-04-01',
    };
    expect(recurrenceDates(rule, '2026-02-10', '2027-01-01')).toEqual(['2026-03-10']);
  });
});

describe('saldos (5.4)', () => {
  const a1 = account('a1', { initialBalanceCents: 100_000 });
  const a2 = account('a2');

  it('soma receitas e transferências, ignorando pendentes', () => {
    const rows = [
      tx({ amountCents: 20_000, kind: 'income' }),
      tx({ amountCents: 5_000 }),
      tx({ amountCents: 9_999, status: 'pending' }),
    ];
    const moves = [
      transfer({ amountCents: 1_000 }),
      transfer({ amountCents: 777, status: 'pending' }),
    ];
    expect(accountBalance(a1, rows, moves)).toBe(100_000 + 20_000 - 5_000 - 1_000);
    expect(accountBalance(a2, rows, moves)).toBe(1_000);
  });

  it('despesa de cartão não mexe na conta; só o pagamento da fatura', () => {
    const rows = [
      tx({ cardId: 'c1', invoiceMonth: '2026-11', amountCents: 40_000, accountId: null }),
    ];
    expect(accountBalance(a1, rows, [])).toBe(100_000);
    const pay = transfer({
      kind: 'invoice_payment',
      toAccountId: null,
      toCardId: 'c1',
      invoiceMonth: '2026-11',
      amountCents: 40_000,
    });
    expect(accountBalance(a1, rows, [pay])).toBe(60_000);
  });

  it('previsto inclui pendentes do mês e faturas a vencer', () => {
    const k = card({ paymentAccountId: 'a1' });
    const rows = [
      tx({ amountCents: 10_000, status: 'pending', date: '2026-11-20' }),
      tx({ amountCents: 2_000, status: 'pending', date: '2026-12-20' }),
      tx({ amountCents: 3_000, status: 'pending', kind: 'income', date: '2026-11-25' }),
      tx({ cardId: 'c1', accountId: null, invoiceMonth: '2026-11', amountCents: 4_000 }),
      tx({ cardId: 'c1', accountId: null, invoiceMonth: '2026-12', amountCents: 8_000 }),
    ];
    const moves = [transfer({ status: 'pending', amountCents: 500, date: '2026-11-21' })];
    expect(accountForecast(a1, [k], rows, moves, '2026-11-30', '2026-11-06')).toBe(
      100_000 - 10_000 + 3_000 - 500 - 4_000,
    );
    expect(accountForecast(a2, [k], rows, moves, '2026-11-30', '2026-11-06')).toBe(500);
  });

  it('total só conta contas incluídas e ativas', () => {
    const accounts = [
      a1,
      account('fora', { includeInTotal: false, initialBalanceCents: 5 }),
      account('velha', { archived: true, initialBalanceCents: 7 }),
    ];
    expect(totalBalance(accounts, [], [])).toBe(100_000);
    expect(totalForecast(accounts, [], [], [], '2026-11', '2026-11-06')).toBe(100_000);
  });

  it('extrato traz o saldo acumulado linha a linha', () => {
    const rows = [
      tx({ amountCents: 2_000, date: '2026-11-02' }),
      tx({ amountCents: 9_000, date: '2026-11-03', status: 'pending' }),
    ];
    const moves = [transfer({ amountCents: 1_000, date: '2026-11-04', notes: 'x' })];
    const lines = accountStatement(a1, rows, moves, () => 'Transferência');
    expect(lines.map((l) => l.balanceCents)).toEqual([98_000, 98_000, 97_000]);
    expect(lines[2]!.deltaCents).toBe(-1_000);
    const credit = accountStatement(a2, rows, moves, () => 'Transferência');
    expect(credit[0]!.deltaCents).toBe(1_000);
  });

  it('série de saldo fecha cada mês', () => {
    const rows = [tx({ amountCents: 1_000, date: '2026-10-15' }), tx({ amountCents: 2_000 })];
    expect(balanceSeries([a1], rows, [], '2026-11', 2)).toEqual([
      { month: '2026-10', balanceCents: 99_000 },
      { month: '2026-11', balanceCents: 97_000 },
    ]);
  });
});

describe('rateio e acerto (5.5)', () => {
  it('calcula o % pela renda que conta', () => {
    const c = ctx({
      incomes: [
        income('A', 800_000, '2026-11'),
        income('B', 500_000, '2026-11'),
        income('A', 900_000, '2026-11', false),
      ],
    });
    expect(memberAPct(c, '2026-11')).toBeCloseTo(8 / 13);
  });

  it('mês sem renda herda o % do mês anterior', () => {
    expect(memberAPct(ctx(), '2026-12')).toBeCloseTo(0.8);
    expect(memberAPct(ctx(), '2027-02')).toBeCloseTo(0.8);
  });

  it('sem nenhuma renda, divide igualmente', () => {
    expect(memberAPct(ctx({ incomes: [] }), '2026-11')).toBe(0.5);
  });

  it('mês fechado mantém o snapshot mesmo se a renda mudar', () => {
    const close: MonthClose = {
      ...stamp,
      id: '2026-11',
      month: '2026-11',
      pctByMember: { A: 0.6, B: 0.4 },
      incomeByMember: { A: 1, B: 1 },
      owedByMember: {},
      paidByMember: {},
      settlement: null,
      closedAt: stamp.createdAt,
      reopenedAt: null,
    };
    expect(memberAPct(ctx({ closes: [close] }), '2026-11')).toBe(0.6);
    expect(isMonthClosed([close], '2026-11')).toBe(true);
    const reopened = { ...close, reopenedAt: stamp.createdAt };
    expect(memberAPct(ctx({ closes: [reopened] }), '2026-11')).toBeCloseTo(0.8);
    expect(isMonthClosed([reopened], '2026-11')).toBe(false);
  });

  it('separa as partes por regra', () => {
    expect(shareOf(1000, 'memberA', 0.3)).toEqual([1000, 0]);
    expect(shareOf(1000, 'memberB', 0.3)).toEqual([0, 1000]);
    expect(shareOf(1001, 'equal', 0.3)).toEqual([501, 500]);
    expect(shareOf(1000, 'proportional', 0.3)).toEqual([300, 700]);
  });

  it('quem pagou mais recebe a diferença', () => {
    const c = ctx({
      transactions: [tx({ accountId: 'a', amountCents: 100_000, splitRule: 'proportional' })],
    });
    const s = computeSettlement(c, '2026-11');
    expect(s.owedA).toBe(80_000);
    expect(s.owedB).toBe(20_000);
    expect(s.paidA).toBe(100_000);
    expect(s.balanceA).toBe(20_000);
    expect(s.transfer).toEqual({ fromMemberId: 'B', toMemberId: 'A', amountCents: 20_000 });
  });

  it('o inverso: A deve a B', () => {
    const c = ctx({ transactions: [tx({ accountId: 'b', amountCents: 100_000 })] });
    expect(computeSettlement(c, '2026-11').transfer).toEqual({
      fromMemberId: 'A',
      toMemberId: 'B',
      amountCents: 80_000,
    });
  });

  it('regras igual e individual, com invariante saldoA + saldoB = 0', () => {
    const c = ctx({
      transactions: [
        tx({ accountId: 'a', amountCents: 3_333, splitRule: 'equal' }),
        tx({ accountId: 'b', amountCents: 7_777, splitRule: 'proportional' }),
        tx({ accountId: 'a', amountCents: 500, splitRule: 'memberB' }),
        tx({ accountId: 'b', amountCents: 1_001, splitRule: 'memberA' }),
        tx({ accountId: 'joint', amountCents: 12_345 }),
      ],
    });
    const s = computeSettlement(c, '2026-11');
    expect(s.paidA - s.owedA + (s.paidB - s.owedB)).toBe(0);
    expect(s.owedA + s.owedB).toBe(3_333 + 7_777 + 500 + 1_001 + 12_345);
  });

  it('conta conjunta usa a participação nos depósitos do mês', () => {
    const deposits = [
      transfer({
        kind: 'joint_deposit',
        fromAccountId: 'a',
        toAccountId: 'joint',
        amountCents: 75_000,
      }),
      transfer({
        kind: 'joint_deposit',
        fromAccountId: 'b',
        toAccountId: 'joint',
        amountCents: 25_000,
      }),
    ];
    const c = ctx({
      transactions: [tx({ accountId: 'joint', amountCents: 100_000 })],
      transfers: deposits,
    });
    const s = computeSettlement(c, '2026-11');
    expect(s.paidA).toBe(75_000);
    expect(s.paidB).toBe(25_000);
  });

  it('conta conjunta sem depósitos usa o % do mês', () => {
    const c = ctx({ transactions: [tx({ accountId: 'joint', amountCents: 100_000 })] });
    const s = computeSettlement(c, '2026-11');
    expect(s.paidA).toBe(80_000);
    expect(s.transfer).toBeNull();
  });

  it('o acerto registrado zera a diferença', () => {
    const c = ctx({
      transactions: [tx({ accountId: 'a', amountCents: 100_000 })],
      transfers: [
        transfer({ kind: 'settlement', fromAccountId: 'b', toAccountId: 'a', amountCents: 20_000 }),
      ],
    });
    const s = computeSettlement(c, '2026-11');
    expect(s.balanceA).toBe(0);
    expect(s.transfer).toBeNull();
    const reverse = ctx({
      transactions: [tx({ accountId: 'b', amountCents: 100_000 })],
      transfers: [
        transfer({ kind: 'settlement', fromAccountId: 'a', toAccountId: 'b', amountCents: 80_000 }),
      ],
    });
    expect(computeSettlement(reverse, '2026-11').balanceA).toBe(0);
  });

  it('compra no cartão entra no acerto mesmo com a fatura aberta', () => {
    const row = tx({
      cardId: 'cb',
      accountId: null,
      invoiceMonth: '2026-12',
      amountCents: 10_000,
      status: 'pending',
    });
    const s = computeSettlement(ctx({ transactions: [row] }), '2026-11');
    expect(s.paidB).toBe(10_000);
    expect(s.owedA).toBe(8_000);
  });

  it('pendente em conta e ajuste de saldo ficam fora do acerto', () => {
    const c = ctx();
    expect(countsForSettlement(tx({ accountId: 'a', status: 'pending' }), c)).toBe(false);
    expect(countsForSettlement(tx({ accountId: 'a', source: 'adjustment' }), c)).toBe(false);
    expect(countsForSettlement(tx({ kind: 'income' }), c)).toBe(false);
  });

  it('gasto com dinheiro do fundo fica fora; do bolso entra', () => {
    const c = ctx({
      goals: [goal({ accountId: 'fund' })],
      transactions: [
        tx({ accountId: 'fund', goalId: 'g1', amountCents: 50_000 }),
        tx({ accountId: 'b', goalId: 'g1', amountCents: 10_000 }),
      ],
    });
    const s = computeSettlement(c, '2026-11');
    expect(s.rows).toHaveLength(1);
    expect(s.paidB).toBe(10_000);
  });

  it('indicador de justiça iguala o esforço de cada renda', () => {
    const c = ctx({ transactions: [tx({ accountId: 'a', amountCents: 100_000 })] });
    const s = computeSettlement(c, '2026-11');
    expect(s.fairnessA).toBeCloseTo(s.fairnessB!);
    expect(s.fairnessA).toBeCloseTo(0.1);
    expect(computeSettlement(ctx({ incomes: [] }), '2026-11').fairnessA).toBeNull();
  });

  it('sugere o depósito de cada um na conjunta', () => {
    expect(suggestJointDeposits(100_000, 0.8).byMember).toEqual([80_000, 20_000]);
  });
});

describe('objetivos (5.6)', () => {
  const NOW = '2026-11-06';

  it('calcula progresso, necessário e ritmo', () => {
    const moves = [
      movement({ kind: 'initial', amountCents: 200_000, competenceMonth: '2026-01' }),
      movement({ amountCents: 30_000 }),
      movement({ amountCents: 30_000, competenceMonth: '2026-10' }),
      movement({ amountCents: 30_000, competenceMonth: '2026-09' }),
      movement({ amountCents: 99_999, competenceMonth: '2026-08' }),
      movement({ kind: 'withdrawal', amountCents: 10_000, competenceMonth: '2026-11' }),
    ];
    const m = goalMetrics(goal(), 1_000_000, moves, [], NOW);
    expect(m.accumulatedCents).toBe(379_999);
    expect(m.progress).toBeCloseTo(0.379999);
    expect(m.monthsLeft).toBe(12);
    expect(m.neededPerMonthCents).toBe(Math.ceil(620_001 / 12));
    expect(m.paceCents).toBe(30_000);
    expect(m.health).toBe('late');
    expect(m.forecastMonth).toBe(addMonths('2026-11', Math.ceil(620_001 / 30_000)));
  });

  it('estados de saúde', () => {
    const pace = (amount: number) => [
      movement({ amountCents: amount }),
      movement({ amountCents: amount, competenceMonth: '2026-10' }),
      movement({ amountCents: amount, competenceMonth: '2026-09' }),
    ];
    const g = goal({ targetDate: '2027-01-15' }); // 2 meses
    const h = (amount: number) => goalMetrics(g, 300_000, pace(amount), [], NOW).health;
    expect(h(90_000)).toBe('on_track');
    expect(h(56_000)).toBe('attention');
    expect(h(10_000)).toBe('late');
    expect(goalMetrics(goal({ status: 'paused' }), 1, [], [], NOW).health).toBe('paused');
    expect(goalMetrics(goal({ status: 'done' }), 1, [], [], NOW).health).toBe('done');
    expect(goalMetrics(g, 100, [movement({ amountCents: 100 })], [], NOW).health).toBe('done');
    expect(goalMetrics(goal({ targetDate: null }), 100, [], [], NOW).health).toBe('on_track');
  });

  it('saldo informado tem prioridade', () => {
    const m = goalMetrics(goal({ reportedBalanceCents: 500_000 }), 1_000_000, [], [], NOW);
    expect(m.progress).toBe(0.5);
    expect(m.forecastMonth).toBeNull();
  });

  it('gasto do fundo reduz a base de um objetivo comum, mas não a de um projeto', () => {
    const moves = [movement({ amountCents: 100_000 })];
    const spend = [tx({ accountId: 'fund', goalId: 'g1', amountCents: 40_000 })];
    const saving = goalMetrics(goal({ accountId: 'fund' }), 1_000_000, moves, spend, NOW);
    expect(saving.baseCents).toBe(60_000);
    const project = goalMetrics(
      goal({ accountId: 'fund', type: 'project' }),
      1_000_000,
      moves,
      spend,
      NOW,
    );
    expect(project.baseCents).toBe(100_000);
    expect(project.spentFromFundCents).toBe(40_000);
    const pocket = goalMetrics(
      goal({ accountId: 'fund', type: 'project' }),
      1_000_000,
      moves,
      [tx({ accountId: 'b', goalId: 'g1', amountCents: 5_000 })],
      NOW,
    );
    expect(pocket.spentOutOfPocketCents).toBe(5_000);
  });

  it('prazo vencido conta como um mês restante', () => {
    expect(goalMetrics(goal({ targetDate: '2026-01-01' }), 100, [], [], NOW).monthsLeft).toBe(1);
  });

  it('reserva: N vezes a média dos essenciais de meses fechados, em centenas', () => {
    const cats = [category('casa', { nature: 'essential' }), category('lazer')];
    const rows = [
      tx({ categoryId: 'casa', amountCents: 300_000, date: '2026-09-05' }),
      tx({ categoryId: 'casa', amountCents: 310_000, date: '2026-10-05' }),
      tx({ categoryId: 'lazer', amountCents: 999_999, date: '2026-10-05' }),
      tx({ categoryId: 'casa', amountCents: 999_999, date: '2026-11-05' }),
      tx({ categoryId: 'casa', amountCents: 999_999, date: '2026-10-05', source: 'adjustment' }),
    ];
    expect(emergencyTarget(6, rows, cats, [], NOW)).toBe(1_830_000);
    const closed = {
      ...stamp,
      id: '2026-09',
      month: '2026-09',
      pctByMember: {},
      incomeByMember: {},
      owedByMember: {},
      paidByMember: {},
      settlement: null,
      closedAt: stamp.createdAt,
      reopenedAt: null,
    };
    expect(emergencyTarget(6, rows, cats, [closed], NOW)).toBe(1_800_000);
    expect(emergencyTarget(6, [], cats, [], NOW)).toBe(0);
  });

  it('item do projeto: pago, agendado, em parte, a contratar', () => {
    const item: GoalItem = {
      ...stamp,
      id: 'it',
      goalId: 'g1',
      name: 'Buffet',
      budgetCents: 10_000,
      vendor: '',
      dueDate: null,
    };
    const paid = tx({ goalItemId: 'it', amountCents: 10_000 });
    const pending = tx({ goalItemId: 'it', amountCents: 5_000, status: 'pending' });
    const some = tx({ goalItemId: 'it', amountCents: 2_000 });
    expect(itemProgress(item, [paid]).state).toBe('paid');
    expect(itemProgress(item, [pending]).state).toBe('scheduled');
    expect(itemProgress(item, [some, pending]).state).toBe('partial');
    expect(itemProgress(item, []).state).toBe('to_hire');
  });

  it('placar: cada aporte é julgado pelo % do seu mês', () => {
    const moves = [
      movement({ memberId: 'A', amountCents: 10_000, competenceMonth: '2026-10' }),
      movement({ memberId: 'B', amountCents: 10_000, competenceMonth: '2026-11' }),
      movement({
        memberId: 'B',
        amountCents: 2_000,
        kind: 'withdrawal',
        competenceMonth: '2026-11',
      }),
    ];
    const pct = (m: string) => (m === '2026-10' ? 0.5 : 0.75);
    const f = goalFairness({ id: 'g1', splitRule: 'proportional' }, moves, ['A', 'B'], pct);
    expect(f.expectedA).toBe(5_000 + 7_500 - 1_500);
    expect(f.contributedB).toBe(8_000);
    expect(f.deviationA).toBe(10_000 - 11_000);
    expect(f.expectedA + f.expectedB).toBe(18_000);
    const eq = goalFairness({ id: 'g1', splitRule: 'equal' }, moves, ['A', 'B'], pct);
    expect(eq.expectedA).toBe(9_000);
    const onlyA = goalFairness({ id: 'g1', splitRule: 'memberA' }, moves, ['A', 'B'], pct);
    expect(onlyA.expectedB).toBe(0);
    const onlyB = goalFairness({ id: 'g1', splitRule: 'memberB' }, moves, ['A', 'B'], pct);
    expect(onlyB.expectedA).toBe(0);
  });
});

describe('orçamento e frase-resumo (5.7)', () => {
  const cats = [category('casa'), category('sub', { parentId: 'casa' }), category('vazia')];
  const NOW = '2026-11-16';
  const summary = (spent: number, budgeted = 100_000, month = '2026-11') =>
    monthSummary(
      [budget('casa', budgeted)],
      cats,
      spent ? [tx({ categoryId: 'casa', amountCents: spent, date: `${month}-05` })] : [],
      month,
      NOW,
    );

  it('faixas da barra', () => {
    expect(budgetBarState(84, 100)).toBe('calm');
    expect(budgetBarState(85, 100)).toBe('limit');
    expect(budgetBarState(100, 100)).toBe('limit');
    expect(budgetBarState(101, 100)).toBe('over');
    expect(budgetBarState(1, 0)).toBe('over');
    expect(budgetBarState(0, 0)).toBe('calm');
  });

  it('sobrescrita do mês vence o padrão', () => {
    const list = [budget('casa', 100), budget('casa', 200, '2026-11')];
    expect(effectiveBudget(list, 'casa', '2026-11')).toBe(200);
    expect(effectiveBudget(list, 'casa', '2026-12')).toBe(100);
    expect(effectiveBudget(list, 'x', '2026-12')).toBe(0);
  });

  it('subcategoria soma na categoria mãe e pendente conta como comprometido', () => {
    const rows = [
      tx({ categoryId: 'sub', amountCents: 1_000 }),
      tx({ categoryId: 'casa', amountCents: 500, status: 'pending' }),
      tx({ categoryId: 'casa', amountCents: 200, cardId: 'c', accountId: null, status: 'pending' }),
    ];
    const [line] = budgetLines([budget('casa', 10_000)], cats, rows, '2026-11', NOW);
    expect(line!.spentCents).toBe(1_200);
    expect(line!.pendingCents).toBe(500);
    expect(line!.committedCents).toBe(1_700);
  });

  it('avisa quando está acima do ritmo do mês', () => {
    const rows = [tx({ categoryId: 'casa', amountCents: 90_000 })];
    const [line] = budgetLines([budget('casa', 100_000)], cats, rows, '2026-11', '2026-11-05');
    expect(line!.aheadOfPace).toBe(true);
    const [past] = budgetLines([budget('casa', 100_000)], cats, rows, '2026-11', '2026-12-05');
    expect(past!.aheadOfPace).toBe(false);
    const [future] = budgetLines(
      [budget('casa', 100_000)],
      cats,
      [tx({ categoryId: 'casa', date: '2027-01-05', amountCents: 50_000 })],
      '2027-01',
      NOW,
    );
    expect(future!.aheadOfPace).toBe(true);
  });

  it('mês atual: tranquilo, apertado e estourou', () => {
    const calm = summary(50_000);
    expect(calm.mood).toBe('calm');
    expect(calm.sentence).toContain('Mês tranquilo');
    expect(calm.sentence).toContain('R$ 500');
    expect(calm.perDayCents).toBe(Math.floor(50_000 / 15));
    expect(summary(85_000).mood).toBe('calm');
    const tight = summary(90_000);
    expect(tight.mood).toBe('tight');
    expect(tight.sentence).toContain('apertado');
    const over = summary(120_000);
    expect(over.mood).toBe('over');
    expect(over.sentence).toContain('R$ 200');
  });

  it('mês passado: dentro, um pouco acima e acima', () => {
    expect(summary(90_000, 100_000, '2026-10').mood).toBe('within');
    expect(summary(90_000, 100_000, '2026-10').sentence).toContain('Outubro');
    expect(summary(100_000, 100_000, '2026-10').mood).toBe('within');
    expect(summary(110_000, 100_000, '2026-10').mood).toBe('slightly_over');
    expect(summary(111_000, 100_000, '2026-10').mood).toBe('over_past');
  });

  it('mês futuro e mês sem orçamento', () => {
    expect(summary(10_000, 100_000, '2027-01').mood).toBe('future');
    const none = monthSummary([], cats, [], '2026-12', NOW);
    expect(none.mood).toBe('no_budget');
    expect(none.sentence).toBe('Ainda sem gastos em dezembro.');
    const noBudgetButSpent = monthSummary(
      [],
      cats,
      [tx({ categoryId: 'casa', amountCents: 12_300 })],
      '2026-11',
      NOW,
    );
    expect(noBudgetButSpent.sentence).toContain('R$ 123');
  });

  it('gasto individual não consome o orçamento da casa', () => {
    const s = monthSummary(
      [budget('casa', 100_000)],
      cats,
      [tx({ categoryId: 'casa', amountCents: 90_000, splitRule: 'memberA' })],
      '2026-11',
      NOW,
    );
    expect(s.committedCents).toBe(0);
  });

  it('gasto de sonho não consome o orçamento da casa', () => {
    const s = monthSummary(
      [budget('casa', 100_000)],
      cats,
      [tx({ categoryId: 'casa', amountCents: 90_000, goalId: 'g1' })],
      '2026-11',
      NOW,
    );
    expect(s.committedCents).toBe(0);
  });

  it('copia o orçamento efetivo do mês anterior', () => {
    expect(
      copyBudgetsFromMonth([budget('casa', 100), budget('casa', 300, '2026-10')], cats, '2026-10'),
    ).toEqual([{ categoryId: 'casa', amountCents: 300 }]);
  });
});

describe('resumos', () => {
  const cats = [
    category('a', { color: '#111' }),
    category('a1', { parentId: 'a' }),
    category('b'),
    category('c'),
    category('fixa', { nature: 'essential' }),
  ];

  it('totais do mês ignoram ajustes', () => {
    const rows = [
      tx({ amountCents: 100 }),
      tx({ amountCents: 50, kind: 'income' }),
      tx({ amountCents: 999, source: 'adjustment' }),
      tx({ amountCents: 999, date: '2026-10-01' }),
    ];
    expect(monthTotals(rows, '2026-11')).toEqual({ incomeCents: 50, expenseCents: 100 });
  });

  it('fatias sobem para a categoria mãe e descem no drill-down', () => {
    const rows = [
      tx({ categoryId: 'a', amountCents: 100 }),
      tx({ categoryId: 'a1', amountCents: 300 }),
      tx({ categoryId: 'b', amountCents: 100 }),
      tx({ categoryId: null, amountCents: 500 }),
    ];
    const slices = categorySlices(rows, cats, '2026-11');
    expect(slices.map((s) => s.name)).toEqual(['Sem categoria', 'a', 'b']);
    expect(slices[1]!.cents).toBe(400);
    expect(slices[1]!.share).toBeCloseTo(0.4);
    const drill = categorySlices(rows, cats, '2026-11', 'a');
    expect(drill.map((s) => s.categoryId)).toEqual(['a1', 'a']);
  });

  it('agrupa o excedente em Outras', () => {
    const slices = Array.from({ length: 8 }, (_, i) => ({
      categoryId: `${i}`,
      name: `${i}`,
      color: '',
      icon: '',
      cents: 10,
      share: 0.125,
    }));
    const top = topSlices(slices);
    expect(top).toHaveLength(6);
    expect(top[5]!.cents).toBe(30);
    expect(topSlices(slices.slice(0, 6))).toHaveLength(6);
  });

  it('agrupa por dia, mais recente primeiro, com total', () => {
    const groups = groupByDay([
      { date: '2026-11-01', signedCents: -100 },
      { date: '2026-11-02', signedCents: 50 },
      { date: '2026-11-01', signedCents: -20 },
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-02', '2026-11-01']);
    expect(groups[1]!.totalCents).toBe(-120);
  });

  it('onde o dinheiro escapou ignora fixos, individuais e essenciais', () => {
    const keep = tx({ categoryId: 'b', amountCents: 500 });
    const rows = [
      keep,
      tx({ categoryId: 'b', amountCents: 900, recurrenceId: 'r' }),
      tx({ categoryId: 'b', amountCents: 900, splitRule: 'memberA' }),
      tx({ categoryId: 'fixa', amountCents: 900 }),
    ];
    expect(moneyLeaks(rows, cats, '2026-11')).toEqual([keep]);
  });

  it('descrições parecidas', () => {
    expect(similarDescriptions('UBER *TRIP', 'Uber trip')).toBe(true);
    expect(similarDescriptions('Padaria São João', 'Padaria Sao Joao')).toBe(true);
    expect(similarDescriptions('Mercado', 'Farmácia')).toBe(false);
    expect(similarDescriptions('', 'x')).toBe(false);
  });

  const rule = (match: object, set: object = { categoryId: 'b' }) => ({
    ...stamp,
    id: 'r',
    match,
    set,
  });

  it('regras: contém, regex e valor', () => {
    expect(ruleMatches(rule({ contains: 'ifood' }), 'IFOOD *Pedido', 1)).toBe(true);
    expect(ruleMatches(rule({ contains: 'ifood' }), 'Uber', 1)).toBe(false);
    expect(ruleMatches(rule({ regex: '^uber' }), 'UBER trip', 1)).toBe(true);
    expect(ruleMatches(rule({ regex: '^uber' }), 'x uber', 1)).toBe(false);
    expect(ruleMatches(rule({ regex: '(' }), 'x', 1)).toBe(false);
    expect(ruleMatches(rule({ amountCents: 5 }), 'x', 5)).toBe(true);
    expect(ruleMatches(rule({ amountCents: 5 }), 'x', 6)).toBe(false);
    expect(ruleMatches(rule({}), 'x', 6)).toBe(false);
    expect(applyRules([rule({ contains: 'x' })], 'x', 1)).toEqual({ categoryId: 'b' });
    expect(applyRules([rule({ contains: 'y' })], 'x', 1)).toBeNull();
  });

  it('autocomplete prioriza o que mais se repete', () => {
    const rows = [
      tx({ description: 'Mercado Extra', categoryId: 'a', date: '2026-11-01' }),
      tx({ description: 'Mercado Extra', categoryId: 'b', date: '2026-11-02' }),
      tx({ description: 'Mercado Dia', date: '2026-11-03' }),
      tx({ description: 'Salário', kind: 'income' }),
    ];
    const s = descriptionSuggestions(rows, 'merc', 'expense');
    expect(s.map((x) => x.description)).toEqual(['Mercado Extra', 'Mercado Dia']);
    expect(s[0]!.categoryId).toBe('b');
    expect(descriptionSuggestions(rows, 'm', 'expense')).toEqual([]);
    expect(descriptionSuggestions(rows, 'sal', 'expense')).toEqual([]);
  });

  it('sugere regra depois da segunda correção igual', () => {
    const one = [{ description: 'iFood', categoryId: 'b' }];
    expect(suggestRuleFromCorrections(one, [])).toBeNull();
    const two = [...one, { description: 'IFOOD', categoryId: 'b' }];
    expect(suggestRuleFromCorrections(two, [])).toEqual({ contains: 'IFOOD', categoryId: 'b' });
    expect(suggestRuleFromCorrections(two, [rule({ contains: 'ifood' })])).toBeNull();
    expect(suggestRuleFromCorrections([], [])).toBeNull();
  });
});

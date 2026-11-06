import { db } from '../../db/database';
import {
  closeMonth,
  createTransaction,
  createTransfer,
  payInvoice,
  setBudget,
  updateSettings,
  upsert,
  type TransactionDraft,
} from '../../db/ops';
import { addMonths, today } from '../../domain/months';
import type {
  Account,
  Category,
  CreditCard,
  Goal,
  GoalItem,
  GoalMovement,
  Member,
  SalaryPlan,
  SplitRule,
  Tag,
} from '../../schemas/entities';

/** The scenario from spec section 11: fictional amounts for testing, never real data. */
export async function loadDevSeed(): Promise<void> {
  const tables = [
    'accounts',
    'cards',
    'tags',
    'transactions',
    'transfers',
    'recurrences',
    'budgets',
    'goals',
    'goalItems',
    'goalMovements',
    'incomes',
    'salaryPlans',
    'closes',
    'rules',
    'importLogs',
  ];
  await db.transaction(
    'rw',
    tables.map((t) => db.table(t)),
    async () => {
      for (const t of tables) await db.table(t).clear();
    },
  );

  const household = (await db.households.toCollection().first())!;
  const [aId, bId] = household.memberIds;
  const memberA = (await db.members.get(aId))!;
  const memberB = (await db.members.get(bId))!;
  await upsert<Member>('members', { ...memberA, name: 'Patrick' });
  await upsert<Member>('members', { ...memberB, name: 'Pessoa B' });

  const account = (
    name: string,
    type: Account['type'],
    owner: string | null,
    initial: number,
    color: string,
    icon = 'bank',
  ) =>
    upsert<Account>('accounts', {
      name,
      type,
      ownerMemberId: owner,
      initialBalanceCents: initial,
      color,
      icon,
      includeInTotal: true,
      archived: false,
    });

  const contaA = await account('Conta do Patrick', 'checking', aId, 1_200_000, '#3A6EA5');
  const contaB = await account('Conta de Pessoa B', 'checking', bId, 650_000, '#D9774B');
  const joint = await account('Conta conjunta', 'joint', null, 300_000, '#6E2F6B', 'house');
  const fund = await account(
    'Investimentos dos sonhos',
    'investment',
    null,
    3_000_000,
    '#2A9D8F',
    'piggy',
  );

  const card = (name: string, owner: string, closingDay: number, dueDay: number, pay: string) =>
    upsert<CreditCard>('cards', {
      name,
      brand: 'Visa',
      limitCents: 1_500_000,
      closingDay,
      dueDay,
      paymentAccountId: pay,
      ownerMemberId: owner,
      color: '#6E2F6B',
      archived: false,
    });
  const cardA = await card('Cartão A', aId, 3, 10, contaA.id);
  const cardB = await card('Cartão B', bId, 28, 5, contaB.id);
  await upsert<Tag>('tags', { name: 'Fim de semana', color: '#6E2F6B' });

  const categories = await db.categories.toArray();
  const cat = (name: string) => (categories.find((c: Category) => c.name === name) as Category).id;

  const now = today();
  const current = now.slice(0, 7);
  const months = [-4, -3, -2, -1, 0].map((d) => addMonths(current, d));

  const salary = (memberId: string, startMonth: string, amountCents: number, payDay: number) =>
    upsert<SalaryPlan>('salaryPlans', { memberId, amountCents, payDay, startMonth });
  await salary(aId, months[0]!, 800_000, 5);
  await salary(bId, months[0]!, 500_000, 10);
  await salary(bId, addMonths(current, -1), 550_000, 10);
  await salary(aId, addMonths(current, 3), 920_000, 5);

  const draft = (
    over: Partial<TransactionDraft> &
      Pick<TransactionDraft, 'amountCents' | 'description' | 'date' | 'categoryId'>,
    split: SplitRule = 'proportional',
  ): TransactionDraft => ({
    kind: 'expense',
    accountId: joint.id,
    cardId: null,
    tagIds: [],
    status: 'paid',
    notes: '',
    payerMemberId: null,
    splitRule: split,
    goalId: null,
    goalItemId: null,
    ...over,
  });

  for (const [i, month] of months.entries()) {
    const past = month < current;
    const paid = (day: number) =>
      (past || `${month}-${String(day).padStart(2, '0')}` <= now ? 'paid' : 'pending') as
        'paid' | 'pending';
    const day = (n: number) => `${month}-${String(n).padStart(2, '0')}`;
    await createTransaction(
      draft({
        kind: 'income',
        amountCents: 800_000,
        description: 'Salário',
        date: day(1),
        accountId: contaA.id,
        categoryId: cat('Salário'),
      }),
    );
    await createTransaction(
      draft({
        kind: 'income',
        amountCents: month >= addMonths(current, -1) ? 550_000 : 500_000,
        description: 'Salário',
        date: day(1),
        accountId: contaB.id,
        categoryId: cat('Salário'),
      }),
    );

    for (const [from, value] of [
      [contaA.id, 260_000],
      [contaB.id, 170_000],
    ] as const) {
      // This month one of them still owes the joint account, which is what the app is there to say.
      if (!past && from === contaB.id) continue;
      await createTransfer({
        kind: 'joint_deposit',
        fromAccountId: from,
        toAccountId: joint.id,
        amountCents: value,
        date: day(2),
        competenceMonth: month,
      });
    }

    // This month is only what the couple pays together; older months keep the fuller history.
    if (!past) continue;

    await createTransaction(
      draft({
        amountCents: 240_000,
        description: 'Aluguel',
        date: day(5),
        categoryId: cat('Moradia'),
        status: paid(5),
      }),
    );
    await createTransaction(
      draft({
        amountCents: 62_000,
        description: 'Condomínio',
        date: day(5),
        categoryId: cat('Moradia'),
        status: paid(5),
      }),
    );
    await createTransaction(
      draft({
        amountCents: 21_300 + i * 700,
        description: 'Luz, água e gás',
        date: day(12),
        categoryId: cat('Moradia'),
        status: paid(12),
      }),
    );
    await createTransaction(
      draft({
        amountCents: 11_990,
        description: 'Internet',
        date: day(15),
        categoryId: cat('Assinaturas'),
        status: paid(15),
      }),
    );
    await createTransaction(
      draft({
        amountCents: 98_000 + i * 2_500,
        description: 'Mercado',
        date: day(4),
        categoryId: cat('Mercado'),
        status: paid(4),
      }),
    );
    if (past || paid(18) === 'paid') {
      await createTransaction(
        draft({
          amountCents: 41_000,
          description: 'Mercado',
          date: day(18),
          categoryId: cat('Mercado'),
        }),
      );
    }

    const onCard = async (
      cardId: string,
      d: number,
      amountCents: number,
      description: string,
      category: string,
      split: SplitRule = 'proportional',
    ) => {
      if (`${month}-${String(d).padStart(2, '0')}` > now) return;
      await createTransaction(
        draft(
          {
            accountId: null,
            cardId,
            amountCents,
            description,
            date: day(d),
            categoryId: cat(category),
          },
          split,
        ),
      );
    };
    await onCard(cardA.id, 2, 6_890, 'iFood', 'Delivery');
    await onCard(cardA.id, 3, 25_000, 'Combustível', 'Transporte');
    await onCard(cardA.id, 6, 3_990, 'Streaming', 'Assinaturas', 'equal');
    await onCard(cardB.id, 1, 18_700, 'Restaurante', 'Restaurantes');
    await onCard(cardB.id, 4, 4_600, 'Apps de transporte', 'Transporte');
    await onCard(cardB.id, 3, 12_900, 'Cinema e jantar', 'Lazer');
    await onCard(cardA.id, 5, 15_000 + i * 900, 'Pessoal do Patrick', 'Pessoal', 'memberA');
    await onCard(cardB.id, 5, 9_900, 'Pessoal da Pessoa B', 'Pessoal', 'memberB');
  }

  // The bills they set once and that come back on their own, from this month on.
  const firstDay = (n: number) => `${current}-${String(n).padStart(2, '0')}`;
  const statusOn = (n: number) => (firstDay(n) <= now ? 'paid' : 'pending') as 'paid' | 'pending';
  for (const [description, amountCents, n, category] of [
    ['Aluguel', 240_000, 5, 'Moradia'],
    ['Condomínio', 62_000, 5, 'Moradia'],
    ['Luz, água e gás', 24_100, 12, 'Moradia'],
    ['Internet', 11_990, 15, 'Contas do casal'],
    ['Plano de saúde', 58_000, 20, 'Contas do casal'],
  ] as const) {
    await createTransaction(
      draft({
        amountCents,
        description,
        date: firstDay(n),
        categoryId: cat(category),
        status: statusOn(n),
        repeat: { mode: 'recurring', frequency: 'monthly', endDate: null },
      }),
    );
  }
  await createTransaction(
    draft({
      amountCents: 950_000,
      description: 'Fotógrafo do casamento',
      date: firstDay(10),
      categoryId: cat('Casamento'),
      status: 'pending',
      repeat: { mode: 'installments', count: 10 },
    }),
  );
  await createTransaction(
    draft({
      amountCents: 320_000,
      description: 'Geladeira',
      date: `${addMonths(current, 2)}-08`,
      categoryId: cat('Casa nova'),
      status: 'pending',
    }),
  );

  // Sofa: 6× R$ 450 on card A, bought two months ago.
  await createTransaction(
    draft({
      accountId: null,
      cardId: cardA.id,
      amountCents: 270_000,
      description: 'Sofá',
      date: `${addMonths(current, -2)}-02`,
      categoryId: cat('Compras'),
      repeat: { mode: 'installments', count: 6 },
    }),
  );

  for (const [name, value] of [
    ['Moradia', 340_000],
    ['Mercado', 150_000],
    ['Delivery', 25_000],
    ['Restaurantes', 40_000],
    ['Transporte', 60_000],
    ['Lazer', 30_000],
    ['Assinaturas', 20_000],
  ] as const) {
    await setBudget(cat(name), null, value);
  }

  const goal = (over: Partial<Goal> & Pick<Goal, 'name' | 'emoji'>) =>
    upsert<Goal>('goals', {
      coverAssetId: null,
      type: 'saving',
      targetCents: null,
      targetDate: null,
      priority: 3,
      splitRule: 'proportional',
      accountId: fund.id,
      reportedBalanceCents: null,
      status: 'active',
      ...over,
    });
  const move = (
    goalId: string,
    memberId: string,
    amountCents: number,
    month: string,
    kind: GoalMovement['kind'] = 'contribution',
  ) =>
    upsert<GoalMovement>('goalMovements', {
      goalId,
      memberId,
      kind,
      amountCents,
      date: `${month}-08`,
      competenceMonth: month,
    });

  const wedding = await goal({
    name: 'Casamento',
    emoji: '💍',
    type: 'project',
    targetCents: 5_500_000,
    targetDate: `${addMonths(current, 10)}-15`,
    priority: 1,
  });
  const house = await goal({
    name: 'Entrada do apê',
    emoji: '🏠',
    targetCents: 9_000_000,
    targetDate: `${addMonths(current, 25)}-15`,
    priority: 2,
  });
  await goal({ name: 'Reserva de emergência', emoji: '🛟', type: 'emergency', priority: 1 });
  const honeymoon = await goal({
    name: 'Lua de mel',
    emoji: '🌴',
    targetCents: 1_800_000,
    targetDate: `${addMonths(current, 11)}-15`,
    splitRule: 'equal',
    accountId: null,
  });
  await goal({
    name: 'Custos do apê',
    emoji: '🔨',
    targetCents: 1_200_000,
    status: 'paused',
    accountId: null,
  });

  await move(wedding.id, aId, 800_000, months[0]!, 'initial');
  await move(wedding.id, bId, 500_000, months[0]!, 'initial');
  for (const month of months) {
    await move(wedding.id, aId, 150_000, month);
    await move(wedding.id, bId, 100_000, month);
    await move(house.id, aId, 40_000, month);
    await move(house.id, bId, 25_000, month);
    await move(honeymoon.id, aId, 30_000, month);
    await move(honeymoon.id, bId, 30_000, month);
  }

  const item = (name: string, budgetCents: number) =>
    upsert<GoalItem>('goalItems', {
      goalId: wedding.id,
      name,
      budgetCents,
      vendor: '',
      dueDate: null,
    });
  const buffet = await item('Buffet', 1_500_000);
  const dress = await item('Vestido', 800_000);
  const invites = await item('Convites', 120_000);
  await item('Espaço', 1_200_000);

  await createTransaction(
    draft({
      accountId: fund.id,
      amountCents: 1_500_000,
      description: 'Buffet',
      date: `${current}-10`,
      categoryId: cat('Casamento'),
      goalId: wedding.id,
      goalItemId: buffet.id,
      status: 'pending',
      repeat: { mode: 'installments', count: 6 },
    }),
  );
  await createTransaction(
    draft({
      accountId: fund.id,
      amountCents: 200_000,
      description: 'Vestido (sinal)',
      date: `${months[1]}-12`,
      categoryId: cat('Casamento'),
      goalId: wedding.id,
      goalItemId: dress.id,
    }),
  );
  await createTransaction(
    draft({
      accountId: contaB.id,
      amountCents: 120_000,
      description: 'Convites',
      date: `${months[3]}-20`,
      categoryId: cat('Casamento'),
      goalId: wedding.id,
      goalItemId: invites.id,
    }),
  );

  // Invoices already due were paid: the scenario is a couple keeping up, not one in arrears.
  const { cardInvoices } = await import('../../domain/invoices');
  for (const c of [cardA, cardB]) {
    const rows = (await db.transactions.toArray()).filter((t) => !t.deletedAt);
    const payments = (await db.transfers.toArray()).filter((t) => !t.deletedAt);
    for (const invoice of cardInvoices(c, rows, payments, now)) {
      if (invoice.due < now && invoice.remainingCents > 0) {
        await payInvoice(
          c,
          invoice.month,
          invoice.remainingCents,
          c.paymentAccountId!,
          invoice.due,
        );
      }
    }
  }

  await updateSettings({ jointBudgetCents: 430_000, onboarded: true });

  // Past months closed with their settlement recorded, as the scenario asks.
  for (const month of months.slice(0, 4)) {
    const { loadSplitContext } = await import('../../db/ops');
    const { computeSettlement } = await import('../../domain/split');
    const result = computeSettlement(await loadSplitContext(), month);
    if (result.transfer) {
      const from = result.transfer.fromMemberId === aId ? contaA : contaB;
      const to = result.transfer.toMemberId === aId ? contaA : contaB;
      await createTransfer({
        kind: 'settlement',
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: result.transfer.amountCents,
        date: `${addMonths(month, 1)}-01`,
        competenceMonth: month,
      });
    }
    await closeMonth(month);
  }
}

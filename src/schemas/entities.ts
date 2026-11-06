import { z } from 'zod';

const id = z.string().min(1);
const nullableId = id.nullable();
const cents = z.number().int().nonnegative();
export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const instant = z.iso.datetime({ offset: true });

/** Every syncable row carries these, so phase 7 needs no data migration. */
const base = {
  id,
  householdId: id,
  createdAt: instant,
  updatedAt: instant,
  deletedAt: instant.nullable(),
};

export const SplitRuleSchema = z.enum(['proportional', 'equal', 'memberA', 'memberB']);
export type SplitRule = z.infer<typeof SplitRuleSchema>;

export const HouseholdSchema = z.strictObject({
  ...base,
  name: z.string(),
  currency: z.literal('BRL'),
  memberIds: z.tuple([id, id]),
});
export type Household = z.infer<typeof HouseholdSchema>;

export const MemberSchema = z.strictObject({
  ...base,
  name: z.string().min(1),
  emoji: z.string(),
  color: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const AccountTypeSchema = z.enum(['checking', 'savings', 'wallet', 'investment', 'joint']);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountSchema = z.strictObject({
  ...base,
  name: z.string().min(1),
  type: AccountTypeSchema,
  ownerMemberId: nullableId,
  initialBalanceCents: z.number().int(),
  color: z.string(),
  icon: z.string(),
  includeInTotal: z.boolean(),
  archived: z.boolean(),
});
export type Account = z.infer<typeof AccountSchema>;

const dayOfMonth = z.number().int().min(1).max(31);

export const CreditCardSchema = z.strictObject({
  ...base,
  name: z.string().min(1),
  brand: z.string(),
  limitCents: cents,
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
  paymentAccountId: nullableId,
  ownerMemberId: nullableId,
  color: z.string(),
  archived: z.boolean(),
});
export type CreditCard = z.infer<typeof CreditCardSchema>;

export const CategorySchema = z.strictObject({
  ...base,
  name: z.string().min(1),
  kind: z.enum(['expense', 'income']),
  parentId: nullableId,
  icon: z.string(),
  color: z.string(),
  nature: z.enum(['essential', 'lifestyle', 'future']),
  defaultSplitRule: SplitRuleSchema,
  archived: z.boolean(),
  /** Internal categories, such as balance adjustments, never appear in pickers or reports. */
  system: z.boolean(),
});
export type Category = z.infer<typeof CategorySchema>;

export const TagSchema = z.strictObject({ ...base, name: z.string().min(1), color: z.string() });
export type Tag = z.infer<typeof TagSchema>;

export const TransactionSourceSchema = z.enum([
  'manual',
  'recurrence',
  'ofx',
  'csv',
  'ai',
  'sheet-import',
  'adjustment',
]);

export const StatusSchema = z.enum(['paid', 'pending']);
export type Status = z.infer<typeof StatusSchema>;

export const TransactionSchema = z
  .strictObject({
    ...base,
    kind: z.enum(['expense', 'income']),
    amountCents: cents,
    description: z.string(),
    date: DaySchema,
    competenceMonth: MonthSchema,
    accountId: nullableId,
    cardId: nullableId,
    invoiceMonth: MonthSchema.nullable(),
    categoryId: nullableId,
    tagIds: z.array(id),
    status: StatusSchema,
    recurrenceId: nullableId,
    installmentGroupId: nullableId,
    installmentNumber: z.number().int().positive().nullable(),
    installmentTotal: z.number().int().positive().nullable(),
    payerMemberId: nullableId,
    splitRule: SplitRuleSchema,
    goalId: nullableId,
    goalItemId: nullableId,
    notes: z.string(),
    attachmentIds: z.array(id),
    source: TransactionSourceSchema,
    externalId: z.string().nullable(),
  })
  .refine((t) => (t.accountId === null) !== (t.cardId === null), {
    message: 'Informe exatamente uma conta ou um cartão',
    path: ['accountId'],
  });
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransferKindSchema = z.enum([
  'transfer',
  'invoice_payment',
  'settlement',
  'joint_deposit',
  'goal_contribution',
]);
export type TransferKind = z.infer<typeof TransferKindSchema>;

export const TransferSchema = z.strictObject({
  ...base,
  kind: TransferKindSchema,
  fromAccountId: id,
  toAccountId: nullableId,
  toCardId: nullableId,
  invoiceMonth: MonthSchema.nullable(),
  amountCents: cents,
  date: DaySchema,
  competenceMonth: MonthSchema,
  status: StatusSchema,
  notes: z.string(),
});
export type Transfer = z.infer<typeof TransferSchema>;

export const RecurrenceTemplateSchema = z.strictObject({
  kind: z.enum(['expense', 'income']),
  amountCents: cents,
  description: z.string(),
  accountId: nullableId,
  cardId: nullableId,
  categoryId: nullableId,
  tagIds: z.array(id),
  payerMemberId: nullableId,
  splitRule: SplitRuleSchema,
  notes: z.string(),
});
export type RecurrenceTemplate = z.infer<typeof RecurrenceTemplateSchema>;

export const RecurrenceSchema = z.strictObject({
  ...base,
  template: RecurrenceTemplateSchema,
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  interval: z.number().int().positive(),
  startDate: DaySchema,
  endDate: DaySchema.nullable(),
  generatedUntil: DaySchema,
});
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const BudgetSchema = z.strictObject({
  ...base,
  categoryId: id,
  month: MonthSchema.nullable(),
  amountCents: cents,
});
export type Budget = z.infer<typeof BudgetSchema>;

export const GoalSchema = z.strictObject({
  ...base,
  name: z.string().min(1),
  emoji: z.string(),
  coverAssetId: nullableId,
  type: z.enum(['saving', 'project', 'emergency']),
  targetCents: cents.nullable(),
  targetDate: DaySchema.nullable(),
  priority: z.number().int().min(1).max(5),
  splitRule: SplitRuleSchema,
  accountId: nullableId,
  reportedBalanceCents: cents.nullable(),
  status: z.enum(['active', 'paused', 'done']),
});
export type Goal = z.infer<typeof GoalSchema>;

export const GoalItemSchema = z.strictObject({
  ...base,
  goalId: id,
  name: z.string().min(1),
  budgetCents: cents,
  vendor: z.string(),
  dueDate: DaySchema.nullable(),
});
export type GoalItem = z.infer<typeof GoalItemSchema>;

export const GoalMovementSchema = z.strictObject({
  ...base,
  goalId: id,
  memberId: id,
  kind: z.enum(['contribution', 'initial', 'withdrawal']),
  amountCents: cents,
  date: DaySchema,
  competenceMonth: MonthSchema,
});
export type GoalMovement = z.infer<typeof GoalMovementSchema>;

export const MemberIncomeSchema = z.strictObject({
  ...base,
  memberId: id,
  competenceMonth: MonthSchema,
  type: z.enum(['salary', 'pj', 'bonus', '13th', 'freelance', 'other']),
  amountCents: cents,
  countsForSplit: z.boolean(),
});
export type MemberIncome = z.infer<typeof MemberIncomeSchema>;

export const MonthCloseSchema = z.strictObject({
  ...base,
  /** Same value as `id`: one close per month. */
  month: MonthSchema,
  pctByMember: z.record(z.string(), z.number()),
  incomeByMember: z.record(z.string(), z.number()),
  owedByMember: z.record(z.string(), z.number()),
  paidByMember: z.record(z.string(), z.number()),
  settlement: z.strictObject({ fromMemberId: id, toMemberId: id, amountCents: cents }).nullable(),
  closedAt: instant,
  reopenedAt: instant.nullable(),
});
export type MonthClose = z.infer<typeof MonthCloseSchema>;

export const CategoryRuleSchema = z.strictObject({
  ...base,
  match: z.strictObject({
    contains: z.string().optional(),
    regex: z.string().optional(),
    amountCents: cents.optional(),
  }),
  set: z.strictObject({
    categoryId: id.optional(),
    tagIds: z.array(id).optional(),
    splitRule: SplitRuleSchema.optional(),
  }),
});
export type CategoryRule = z.infer<typeof CategoryRuleSchema>;

export const ChangeOpSchema = z.object({
  table: z.string(),
  id: z.string(),
  before: z.unknown().nullable(),
});
export type ChangeOp = z.infer<typeof ChangeOpSchema>;

export const ImportLogSchema = z.strictObject({
  ...base,
  kind: z.enum(['backup', 'changeset', 'ofx', 'csv', 'sheet']),
  appliedAt: instant,
  summary: z.string(),
  inverseOps: z.array(ChangeOpSchema),
  undoneAt: instant.nullable(),
});
export type ImportLog = z.infer<typeof ImportLogSchema>;

export interface Attachment {
  id: string;
  householdId: string;
  transactionId: string;
  blob: Blob;
  mime: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Tables a change-set or a backup can touch, with the schema that guards each one. */
export const ENTITY_SCHEMAS = {
  households: HouseholdSchema,
  members: MemberSchema,
  accounts: AccountSchema,
  cards: CreditCardSchema,
  categories: CategorySchema,
  tags: TagSchema,
  transactions: TransactionSchema,
  transfers: TransferSchema,
  recurrences: RecurrenceSchema,
  budgets: BudgetSchema,
  goals: GoalSchema,
  goalItems: GoalItemSchema,
  goalMovements: GoalMovementSchema,
  incomes: MemberIncomeSchema,
  closes: MonthCloseSchema,
  rules: CategoryRuleSchema,
} as const;
export type EntityTableName = keyof typeof ENTITY_SCHEMAS;

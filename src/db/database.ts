import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  Attachment,
  Budget,
  Category,
  CategoryRule,
  CreditCard,
  Goal,
  GoalItem,
  GoalMovement,
  Household,
  ImportLog,
  Member,
  MemberIncome,
  MonthClose,
  Recurrence,
  Tag,
  Transaction,
  Transfer,
} from '../schemas/entities';
import {
  DEFAULT_SETTINGS,
  SETTINGS_ID,
  withDefaults,
  type Settings,
} from '../schemas/settingsDefaults';

export type DuoDatabase = Dexie & {
  settings: EntityTable<Settings, 'id'>;
  households: EntityTable<Household, 'id'>;
  members: EntityTable<Member, 'id'>;
  accounts: EntityTable<Account, 'id'>;
  cards: EntityTable<CreditCard, 'id'>;
  categories: EntityTable<Category, 'id'>;
  tags: EntityTable<Tag, 'id'>;
  transactions: EntityTable<Transaction, 'id'>;
  transfers: EntityTable<Transfer, 'id'>;
  recurrences: EntityTable<Recurrence, 'id'>;
  budgets: EntityTable<Budget, 'id'>;
  goals: EntityTable<Goal, 'id'>;
  goalItems: EntityTable<GoalItem, 'id'>;
  goalMovements: EntityTable<GoalMovement, 'id'>;
  incomes: EntityTable<MemberIncome, 'id'>;
  closes: EntityTable<MonthClose, 'id'>;
  rules: EntityTable<CategoryRule, 'id'>;
  attachments: EntityTable<Attachment, 'id'>;
  importLogs: EntityTable<ImportLog, 'id'>;
};

export function createDatabase(name = 'duo'): DuoDatabase {
  const db = new Dexie(name) as DuoDatabase;
  db.version(1).stores({ settings: 'id' });
  db.version(2).stores({
    households: 'id',
    members: 'id',
    accounts: 'id',
    cards: 'id',
    categories: 'id, parentId',
    tags: 'id',
    transactions:
      'id, date, competenceMonth, accountId, cardId, invoiceMonth, recurrenceId, installmentGroupId, goalId, externalId',
    transfers: 'id, date, competenceMonth, fromAccountId, toAccountId, toCardId, kind',
    recurrences: 'id',
    budgets: 'id, categoryId',
    goals: 'id',
    goalItems: 'id, goalId',
    goalMovements: 'id, goalId',
    incomes: 'id, memberId, competenceMonth',
    closes: 'id, month',
    rules: 'id',
    attachments: 'id, transactionId',
    importLogs: 'id, appliedAt',
  });
  return db;
}

export const db = createDatabase();

export async function readSettings(database: DuoDatabase = db): Promise<Settings> {
  return withDefaults(await database.settings.get(SETTINGS_ID));
}

export { DEFAULT_SETTINGS };

import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type {
  Account,
  Budget,
  Category,
  CategoryRule,
  CreditCard,
  Goal,
  GoalItem,
  GoalMovement,
  Household,
  Member,
  MemberIncome,
  MonthClose,
  Recurrence,
  Tag,
  Transaction,
  Transfer,
} from '../schemas/entities';
import type { Settings } from '../schemas/settingsDefaults';
import { db, readSettings } from './database';

export interface Data {
  household: Household;
  members: [Member, Member];
  accounts: Account[];
  cards: CreditCard[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  transfers: Transfer[];
  recurrences: Recurrence[];
  budgets: Budget[];
  goals: Goal[];
  goalItems: GoalItem[];
  goalMovements: GoalMovement[];
  incomes: MemberIncome[];
  closes: MonthClose[];
  rules: CategoryRule[];
  settings: Settings;
}

const alive = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((row) => row.deletedAt === null);

/**
 * Everything but attachment blobs is held in memory and recomputed by pure functions. On a phone
 * this stays well under a frame budget for the 5,000 rows the spec targets, and it keeps every
 * screen consistent with no query code of its own.
 */
async function loadData(): Promise<Data | null> {
  const [household] = alive(await db.households.toArray());
  if (!household) return null;
  const members = alive(await db.members.toArray());
  const ordered = household.memberIds.map((id) => members.find((m) => m.id === id));
  if (!ordered[0] || !ordered[1]) return null;
  return {
    household,
    members: [ordered[0], ordered[1]],
    accounts: alive(await db.accounts.toArray()),
    cards: alive(await db.cards.toArray()),
    categories: alive(await db.categories.toArray()),
    tags: alive(await db.tags.toArray()),
    transactions: alive(await db.transactions.toArray()),
    transfers: alive(await db.transfers.toArray()),
    recurrences: alive(await db.recurrences.toArray()),
    budgets: alive(await db.budgets.toArray()),
    goals: alive(await db.goals.toArray()),
    goalItems: alive(await db.goalItems.toArray()),
    goalMovements: alive(await db.goalMovements.toArray()),
    incomes: alive(await db.incomes.toArray()),
    closes: alive(await db.closes.toArray()),
    rules: alive(await db.rules.toArray()),
    settings: await readSettings(),
  };
}

const DataContext = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const data = useLiveQuery(loadData, [], undefined);

  useEffect(() => {
    if (data === null) void import('./ops').then((ops) => ops.bootstrap());
  }, [data]);

  useEffect(() => {
    if (!data) return;
    // Recurring bills are generated ahead of time; this only tops up what is missing.
    void import('./ops').then((ops) => ops.syncRecurrences());
    // Runs once per launch: `data` changing later must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data !== undefined && data !== null]);

  if (!data) return null;
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData outside DataProvider');
  return data;
}

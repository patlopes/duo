/** Kept free of Zod so the first paint can read settings without loading the validator. */

export type ThemeMode = 'system' | 'light' | 'dark';
export type TxFormType = 'expense' | 'income' | 'card' | 'transfer';
export type Animal = 'giraffe' | 'monkey';
export type SplitMode = 'proportional' | 'equal';

export const SETTINGS_ID = 'settings';

export const HOME_BLOCKS = [
  'plan',
  'dreams',
  'future',
  'categories',
  'summary',
  'accounts',
  'cards',
  'bills',
  'budgets',
  'couple',
] as const;
export type HomeBlock = (typeof HOME_BLOCKS)[number];

export interface CsvPreset {
  name: string;
  date: string;
  description: string;
  amount: string;
  invertSign: boolean;
}

export interface Settings {
  id: typeof SETTINGS_ID;
  theme: ThemeMode;
  hideValues: boolean;
  installGuideDismissed: boolean;
  onboarded: boolean;
  homeBlocks: HomeBlock[];
  hiddenHomeBlocks: HomeBlock[];
  lockEnabled: boolean;
  lockSalt: string | null;
  lockHash: string | null;
  lockCredentialId: string | null;
  lastBackupAt: string | null;
  lastChangeAt: string | null;
  backupReminderDays: number;
  backupReminderSnoozedAt: string | null;
  emergencyMonths: number;
  jointBudgetCents: number;
  lastTxType: TxFormType;
  lastAccountId: string | null;
  lastCardId: string | null;
  recentCategoryIds: string[];
  categoryCorrections: { description: string; categoryId: string }[];
  dismissedRuleKeys: string[];
  csvPresets: CsvPreset[];
  /** Personal expenses of the other member stay out of the list on this phone (spec 2.10). */
  deviceMemberIndex: 0 | 1;
  showOtherPersonal: boolean;
  /** How the couple splits shared bills: by income, or half each. */
  splitMode: SplitMode;
  splitModeAt: string | null;
  googleSheetId: string | null;
  /** The account signed in on this device. Never leaves it. */
  googleAccount: string | null;
  /** Who signed in as each member, as the shared sheet last said. */
  googleEmails: [string | null, string | null];
  googlePromptDismissed: boolean;
  lastSyncAt: string | null;
  lastSyncSentAt: string | null;
  mascots: boolean;
  memberAnimals: [Animal, Animal];
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  theme: 'system',
  hideValues: false,
  installGuideDismissed: false,
  onboarded: false,
  homeBlocks: [...HOME_BLOCKS],
  // The app is about shared bills: full tracking stays available, but out of the first screen.
  hiddenHomeBlocks: ['summary', 'accounts', 'cards', 'bills', 'budgets', 'couple'],
  lockEnabled: false,
  lockSalt: null,
  lockHash: null,
  lockCredentialId: null,
  lastBackupAt: null,
  lastChangeAt: null,
  backupReminderDays: 14,
  backupReminderSnoozedAt: null,
  emergencyMonths: 6,
  jointBudgetCents: 0,
  lastTxType: 'expense',
  lastAccountId: null,
  lastCardId: null,
  recentCategoryIds: [],
  categoryCorrections: [],
  dismissedRuleKeys: [],
  csvPresets: [],
  deviceMemberIndex: 0,
  showOtherPersonal: false,
  splitMode: 'proportional',
  splitModeAt: null,
  googleSheetId: null,
  googleAccount: null,
  googleEmails: [null, null],
  googlePromptDismissed: false,
  lastSyncAt: null,
  lastSyncSentAt: null,
  mascots: true,
  memberAnimals: ['giraffe', 'monkey'],
  updatedAt: new Date(0).toISOString(),
};

/** Rows saved by older versions lack newer fields, and new home blocks must appear for them too. */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  // Layouts saved before the shared-bills home get the new one: their order no longer means anything.
  const legacy = stored?.homeBlocks && !stored.homeBlocks.includes('plan');
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    ...(legacy
      ? {
          homeBlocks: DEFAULT_SETTINGS.homeBlocks,
          hiddenHomeBlocks: DEFAULT_SETTINGS.hiddenHomeBlocks,
        }
      : {}),
  };
  const known = new Set(merged.homeBlocks);
  return {
    ...merged,
    homeBlocks: [...merged.homeBlocks, ...HOME_BLOCKS.filter((b) => !known.has(b))],
  };
}

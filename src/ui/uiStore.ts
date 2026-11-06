import { create } from 'zustand';
import { monthOf, today } from '../domain/months';
import type { TxFormType } from '../schemas/settingsDefaults';
import type { Transaction, Transfer } from '../schemas/entities';

export interface TxFilters {
  query: string;
  kind: 'all' | 'expense' | 'income' | 'transfer';
  accountId: string | null;
  cardId: string | null;
  categoryId: string | null;
  tagId: string | null;
  status: 'all' | 'paid' | 'pending';
  payerMemberId: string | null;
  splitRule: Transaction['splitRule'] | null;
}

export const EMPTY_FILTERS: TxFilters = {
  query: '',
  kind: 'all',
  accountId: null,
  cardId: null,
  categoryId: null,
  tagId: null,
  status: 'all',
  payerMemberId: null,
  splitRule: null,
};

export interface FormRequest {
  type: TxFormType;
  transaction?: Transaction;
  transfer?: Transfer;
  /** Starts a new row from an existing one: "Duplicar". */
  prefill?: Partial<Transaction>;
  goalId?: string;
  goalItemId?: string;
}

interface UiState {
  month: string;
  filters: TxFilters;
  form: FormRequest | null;
  setMonth: (month: string) => void;
  setFilters: (patch: Partial<TxFilters>) => void;
  resetFilters: () => void;
  openForm: (request: FormRequest) => void;
  closeForm: () => void;
}

export const useUi = create<UiState>((set) => ({
  month: monthOf(today()),
  filters: EMPTY_FILTERS,
  form: null,
  setMonth: (month) => set({ month }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  openForm: (form) => set({ form }),
  closeForm: () => set({ form: null }),
}));

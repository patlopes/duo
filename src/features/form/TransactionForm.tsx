import {
  IonButton,
  IonButtons,
  IonHeader,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react';
import { CameraIcon, CaretRightIcon, CopySimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useData } from '../../db/DataContext';
import { db } from '../../db/database';
import {
  createTransaction,
  createTransfer,
  deleteTransfer,
  reconcileTransfer,
  deleteTransaction,
  newId,
  reconcileInvoice,
  rememberCategory,
  undoDeleteTransaction,
  updateSettings,
  updateTransaction,
  upsert,
  type RepeatPlan,
} from '../../db/ops';
import { invoiceMonthFor } from '../../domain/invoices';
import { formatBRL } from '../../domain/money';
import { addDays, dayLabel, monthOf, today } from '../../domain/months';
import {
  applyRules,
  descriptionSuggestions,
  suggestRuleFromCorrections,
} from '../../domain/summaries';
import type {
  Attachment,
  Category,
  CategoryRule,
  SplitRule,
  Transaction,
  Transfer,
} from '../../schemas/entities';
import type { TxFormType } from '../../schemas/settingsDefaults';
import { AmountKeypad } from '../../ui/AmountKeypad';
import { CategoryPicker, categoriesFor } from '../../ui/CategoryPicker';
import { IconBubble } from '../../ui/icons';
import { ChoiceChips, Field, Sheet } from '../../ui/parts';
import { useUi, type FormRequest } from '../../ui/uiStore';
import { compressImage } from './compressImage';
import { useClosedMonthGuard, useScopePrompt } from './useScopePrompt';
import { AttachmentThumbs } from './AttachmentThumbs';
import { useToast } from '../../ui/useToast';

const TONE: Record<TxFormType, string> = {
  expense: 'tone-expense',
  card: 'tone-expense',
  income: 'tone-income',
  transfer: 'tone-transfer',
};

const TITLE: Record<TxFormType, string> = {
  expense: 'Despesa',
  card: 'Despesa no cartão',
  income: 'Receita',
  transfer: 'Transferência',
};

export default function TransactionFormHost() {
  const request = useUi((s) => s.form);
  const closeForm = useUi((s) => s.closeForm);
  // A fresh instance per request is what lets "new", "edit" and "duplicate" share one component.
  const key = useMemo(() => (request ? newId() : 'closed'), [request]);
  return (
    <IonModal isOpen={request !== null} onDidDismiss={closeForm}>
      {request && <TransactionForm key={key} request={request} onClose={closeForm} />}
    </IonModal>
  );
}

function TransactionForm({ request, onClose }: { request: FormRequest; onClose: () => void }) {
  const data = useData();
  const openForm = useUi((s) => s.openForm);
  const {
    settings,
    accounts,
    cards,
    categories,
    tags,
    goals,
    goalItems,
    members,
    transactions,
    rules,
  } = data;
  const presentToast = useToast();
  const askScope = useScopePrompt();
  const confirmClosedMonth = useClosedMonthGuard();

  const editing = request.transaction ?? null;
  const editingTransfer = request.transfer ?? null;
  const seed: Partial<Transaction> = editing ?? request.prefill ?? {};

  const activeAccounts = accounts.filter((a) => !a.archived);
  const activeCards = cards.filter((c) => !c.archived);

  const [type, setType] = useState<TxFormType>(request.type);
  const [cents, setCents] = useState(
    editing?.amountCents ?? editingTransfer?.amountCents ?? seed.amountCents ?? 0,
  );
  const [keypadOpen, setKeypadOpen] = useState(!editing && !editingTransfer);
  const [description, setDescription] = useState(seed.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(seed.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(
    seed.accountId ??
      (settings.lastAccountId && activeAccounts.some((a) => a.id === settings.lastAccountId)
        ? settings.lastAccountId
        : (activeAccounts[0]?.id ?? null)),
  );
  const [cardId, setCardId] = useState<string | null>(
    seed.cardId ??
      (settings.lastCardId && activeCards.some((c) => c.id === settings.lastCardId)
        ? settings.lastCardId
        : (activeCards[0]?.id ?? null)),
  );
  const [fromAccountId, setFromAccountId] = useState<string | null>(
    editingTransfer?.fromAccountId ?? activeAccounts[0]?.id ?? null,
  );
  const [toAccountId, setToAccountId] = useState<string | null>(
    editingTransfer?.toAccountId ?? activeAccounts[1]?.id ?? null,
  );
  const [date, setDate] = useState(editing?.date ?? editingTransfer?.date ?? today());
  const [paid, setPaid] = useState(
    (editing?.status ?? editingTransfer?.status ?? 'paid') === 'paid',
  );
  const [tagIds, setTagIds] = useState<string[]>(seed.tagIds ?? []);
  const [notes, setNotes] = useState(seed.notes ?? editingTransfer?.notes ?? '');
  const [payer, setPayer] = useState<string | null>(seed.payerMemberId ?? null);
  const [splitRule, setSplitRule] = useState<SplitRule>(seed.splitRule ?? 'proportional');
  const [splitTouched, setSplitTouched] = useState(!!editing);
  const [goalId, setGoalId] = useState<string | null>(request.goalId ?? seed.goalId ?? null);
  const [goalItemId, setGoalItemId] = useState<string | null>(
    request.goalItemId ?? seed.goalItemId ?? null,
  );
  const [repeatMode, setRepeatMode] = useState<RepeatPlan['mode']>('none');
  const [installments, setInstallments] = useState(2);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [endDate, setEndDate] = useState('');
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [suggestionsOn, setSuggestionsOn] = useState(false);

  const kind: Transaction['kind'] = type === 'income' ? 'income' : 'expense';
  const category = categories.find((c) => c.id === categoryId);
  const isTransfer = type === 'transfer';
  const isCard = type === 'card';
  const isSeries = !!(editing?.installmentGroupId || editing?.recurrenceId);

  const quickCategories = useMemo(() => {
    const available = categoriesFor(categories, kind);
    const recent = settings.recentCategoryIds
      .map((id) => available.find((c) => c.id === id))
      .filter((c): c is Category => !!c);
    const rest = available.filter((c) => !recent.includes(c));
    return [...recent, ...rest].slice(0, 8);
  }, [categories, kind, settings.recentCategoryIds]);

  const suggestions = useMemo(
    () => (suggestionsOn ? descriptionSuggestions(transactions, description, kind) : []),
    [suggestionsOn, transactions, description, kind],
  );

  const chooseCategory = (c: Category) => {
    setCategoryId(c.id);
    if (!splitTouched) setSplitRule(c.defaultSplitRule);
  };

  const applyDescriptionRules = (text: string) => {
    const set = applyRules(rules, text, cents);
    if (!set) return;
    if (set.categoryId && !categoryId) {
      const c = categories.find((x) => x.id === set.categoryId);
      if (c) chooseCategory(c);
    }
    if (set.tagIds?.length) setTagIds((current) => [...new Set([...current, ...set.tagIds!])]);
    if (set.splitRule) {
      setSplitRule(set.splitRule);
      setSplitTouched(true);
    }
  };

  const showError = (message: string) =>
    void presentToast({ message, duration: 2500, position: 'top', color: 'danger' });

  const reset = () => {
    setCents(0);
    setDescription('');
    setCategoryId(null);
    setNotes('');
    setTagIds([]);
    setRepeatMode('none');
    setPhotos([]);
    setKeypadOpen(true);
    setSplitTouched(false);
    setSplitRule('proportional');
    setDetailsOpen(false);
  };

  const saveAttachments = async (transactionId: string, householdId: string) => {
    if (photos.length === 0) return;
    const at = new Date().toISOString();
    const rows: Attachment[] = photos.map((blob) => ({
      id: newId(),
      householdId,
      transactionId,
      blob,
      mime: blob.type,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    }));
    await db.attachments.bulkPut(rows);
    const current = await db.transactions.get(transactionId);
    if (current) {
      await db.transactions.update(transactionId, {
        attachmentIds: [...current.attachmentIds, ...rows.map((r) => r.id)],
      });
    }
  };

  const save = async (another: boolean) => {
    if (saving) return;
    if (cents <= 0) {
      setKeypadOpen(true);
      showError('Digite o valor');
      return;
    }
    setSaving(true);
    try {
      if (isTransfer) await saveTransferRow();
      else if (!(await saveTransactionRow())) return;
      if (another) {
        reset();
        void presentToast({
          message: 'Salvo. Pode lançar o próximo.',
          duration: 1200,
          position: 'top',
        });
      } else {
        onClose();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  const saveTransferRow = async () => {
    const toCard = editingTransfer?.toCardId ?? null;
    if (!fromAccountId || (!toAccountId && !toCard)) throw new Error('Escolha as duas contas');
    if (!(await confirmClosedMonth(monthOf(date)))) return;
    if (editingTransfer) {
      if (fromAccountId === toAccountId) throw new Error('Escolha contas diferentes');
      const row: Transfer = {
        ...editingTransfer,
        fromAccountId,
        toAccountId,
        amountCents: cents,
        date,
        competenceMonth: monthOf(date),
        status: paid ? 'paid' : 'pending',
        notes,
      };
      await upsert<Transfer>('transfers', row);
      await reconcileTransfer(row.id);
      return;
    }
    await createTransfer({
      kind: 'transfer',
      fromAccountId,
      toAccountId,
      amountCents: cents,
      date,
      status: paid ? 'paid' : 'pending',
      notes,
    });
  };

  const saveTransactionRow = async (): Promise<boolean> => {
    const useAccount = isCard ? null : accountId;
    const useCard = isCard ? cardId : null;
    if (!useAccount && !useCard) {
      throw new Error(
        isCard ? 'Cadastre um cartão em Mais → Cartões' : 'Cadastre uma conta em Mais → Contas',
      );
    }
    const card = useCard ? cards.find((c) => c.id === useCard) : null;
    const competence = monthOf(date);
    if (!(await confirmClosedMonth(editing ? editing.competenceMonth : competence))) return false;

    if (editing) {
      const scope = isSeries ? await askScope('Salvar alterações em') : 'one';
      if (!scope) return false;
      const patch: Partial<Transaction> = {
        kind,
        amountCents: cents,
        description: description.trim(),
        categoryId,
        accountId: useAccount,
        cardId: useCard,
        tagIds,
        notes,
        payerMemberId: payer,
        splitRule,
        goalId,
        goalItemId,
      };
      if (date !== editing.date) patch.date = date;
      if (!useCard) patch.status = paid ? 'paid' : 'pending';
      await updateTransaction(editing.id, patch, scope);
      await saveAttachments(editing.id, editing.householdId);
      if (editing.cardId && editing.invoiceMonth && card)
        await reconcileInvoice(card, editing.invoiceMonth);
      await learnFromCorrection(editing);
    } else {
      const repeat: RepeatPlan =
        repeatMode === 'installments'
          ? { mode: 'installments', count: installments }
          : repeatMode === 'recurring'
            ? { mode: 'recurring', frequency, endDate: endDate || null }
            : { mode: 'none' };
      const ids = await createTransaction({
        kind,
        amountCents: cents,
        description,
        date,
        accountId: useAccount,
        cardId: useCard,
        categoryId,
        tagIds,
        status: paid ? 'paid' : 'pending',
        notes,
        payerMemberId: payer,
        splitRule,
        goalId,
        goalItemId,
        repeat,
      });
      if (ids[0]) await saveAttachments(ids[0], data.household.id);
      // A new purchase can reopen an invoice that had been paid in full.
      if (card) await reconcileInvoice(card, invoiceMonthFor(date, card));
    }
    await updateSettings({
      lastTxType: type,
      lastAccountId: useAccount ?? settings.lastAccountId,
      lastCardId: useCard ?? settings.lastCardId,
      recentCategoryIds: categoryId
        ? rememberCategory(settings, categoryId)
        : settings.recentCategoryIds,
    });
    return true;
  };

  /** Fixing the same description the same way twice earns an offer to automate it (spec 2.6). */
  const learnFromCorrection = async (before: Transaction) => {
    if (!categoryId || categoryId === before.categoryId || !before.description) return;
    const corrections = [
      ...settings.categoryCorrections,
      { description: before.description, categoryId },
    ].slice(-30);
    await updateSettings({ categoryCorrections: corrections });
    const idea = suggestRuleFromCorrections(corrections, rules);
    if (!idea || settings.dismissedRuleKeys.includes(idea.contains.toLowerCase())) return;
    const name = categories.find((c) => c.id === idea.categoryId)?.name ?? '';
    void presentToast({
      message: `Sempre usar ${name} para "${idea.contains}"?`,
      duration: 7000,
      position: 'top',
      buttons: [
        {
          text: 'Criar regra',
          handler: () =>
            void upsert<CategoryRule>('rules', {
              match: { contains: idea.contains },
              set: { categoryId: idea.categoryId },
            }),
        },
      ],
    });
  };

  const remove = async () => {
    if (editingTransfer) {
      if (!(await confirmClosedMonth(editingTransfer.competenceMonth))) return;
      await deleteTransfer(editingTransfer.id);
      onClose();
      return;
    }
    if (!editing) return;
    const scope = isSeries ? await askScope('Excluir lançamento') : 'one';
    if (!scope) return;
    if (!(await confirmClosedMonth(editing.competenceMonth))) return;
    const undo = await deleteTransaction(editing.id, scope);
    onClose();
    void presentToast({
      message:
        undo.ids.length > 1 ? `${undo.ids.length} lançamentos excluídos` : 'Lançamento excluído',
      duration: 5000,
      position: 'top',
      buttons: [
        { text: 'Desfazer', handler: () => void undoDeleteTransaction(undo.ids, undo.recurrence) },
      ],
    });
  };

  const duplicate = () => {
    if (!editing) return;
    const { id: _id, ...rest } = editing;
    openForm({ type, prefill: rest });
  };

  const createTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    const tag = await upsert<(typeof tags)[number]>('tags', { name, color: '#6E2F6B' });
    setTagIds((ids) => [...ids, tag.id]);
    setNewTag('');
  };

  const yesterday = addDays(today(), -1);
  const dateChoice = date === today() ? 'today' : date === yesterday ? 'yesterday' : 'other';
  const previewInvoice =
    isCard && cardId
      ? invoiceMonthFor(
          date,
          cards.find((c) => c.id === cardId)!,
        )
      : null;
  const items = goalItems.filter((i) => i.goalId === goalId);
  const closeKeypadAnd = (fn: () => void) => () => {
    setKeypadOpen(false);
    fn();
  };

  return (
    <div className="txform">
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onClose}>Cancelar</IonButton>
          </IonButtons>
          <IonTitle>
            {editing || editingTransfer ? `Editar ${TITLE[type].toLowerCase()}` : TITLE[type]}
          </IonTitle>
          {(editing || editingTransfer) && (
            <IonButtons slot="end">
              {editing && (
                <IonButton aria-label="Duplicar" onClick={duplicate}>
                  <CopySimpleIcon size={22} aria-hidden="true" />
                </IonButton>
              )}
              <IonButton aria-label="Excluir" color="danger" onClick={() => void remove()}>
                <TrashIcon size={22} aria-hidden="true" />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
        {!editing && !editingTransfer && (
          <IonToolbar>
            <IonSegment
              value={type}
              aria-label="Tipo de lançamento"
              onIonChange={(e) => {
                const value = e.detail.value as TxFormType;
                if (value !== type) {
                  setType(value);
                  setCategoryId(null);
                }
              }}
            >
              <IonSegmentButton value="expense">
                <IonLabel>Despesa</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="card">
                <IonLabel>Cartão</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="income">
                <IonLabel>Receita</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="transfer">
                <IonLabel>Transf.</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
      </IonHeader>

      <div className="txform-body">
        <button
          type="button"
          className={`amount-display ${TONE[type]}`}
          aria-label={`Valor: ${formatBRL(cents)}. Toque para editar`}
          onClick={() => setKeypadOpen(!keypadOpen)}
        >
          {formatBRL(cents)}
        </button>

        {!isTransfer && (
          <>
            <input
              className="input"
              placeholder="Descrição"
              aria-label="Descrição"
              autoComplete="off"
              value={description}
              onFocus={() => {
                setKeypadOpen(false);
                setSuggestionsOn(true);
              }}
              onBlur={() => {
                applyDescriptionRules(description);
                // Tapping a suggestion blurs the input first, so it must outlive the blur.
                setTimeout(() => setSuggestionsOn(false), 200);
              }}
              onChange={(e) => setDescription(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="card-list suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s.description}
                    type="button"
                    className="row"
                    onClick={() => {
                      setDescription(s.description);
                      const c = categories.find((x) => x.id === s.categoryId);
                      if (c) chooseCategory(c);
                      if (s.cardId && isCard) setCardId(s.cardId);
                      if (s.accountId && !isCard) setAccountId(s.accountId);
                      setSplitRule(s.splitRule);
                      setSplitTouched(true);
                      setSuggestionsOn(false);
                    }}
                  >
                    <span className="row-main">
                      <span className="row-title">{s.description}</span>
                      <span className="row-sub">
                        {categories.find((x) => x.id === s.categoryId)?.name}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="category-grid" role="group" aria-label="Categorias frequentes">
              {quickCategories.slice(0, 7).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`category-tile pressable ${categoryId === c.id ? 'chip-on' : ''}`}
                  aria-pressed={categoryId === c.id}
                  onClick={() => chooseCategory(c)}
                >
                  <IconBubble name={c.icon} color={c.color} size={34} />
                  <span>{c.name}</span>
                </button>
              ))}
              <button
                type="button"
                className={`category-tile pressable ${category && !quickCategories.slice(0, 7).includes(category) ? 'chip-on' : ''}`}
                onClick={closeKeypadAnd(() => setPickerOpen(true))}
              >
                <IconBubble
                  name={
                    category && !quickCategories.slice(0, 7).includes(category)
                      ? category.icon
                      : 'dots'
                  }
                  color={
                    category && !quickCategories.slice(0, 7).includes(category)
                      ? category.color
                      : '#8E8A86'
                  }
                  size={34}
                />
                <span>
                  {category && !quickCategories.slice(0, 7).includes(category)
                    ? category.name
                    : 'Mais'}
                </span>
              </button>
            </div>
          </>
        )}

        <div className="card-list form-rows">
          {isTransfer ? (
            <>
              <SelectRow
                label="De"
                value={fromAccountId}
                onChange={setFromAccountId}
                options={activeAccounts}
              />
              {!editingTransfer?.toCardId && (
                <SelectRow
                  label="Para"
                  value={toAccountId}
                  onChange={setToAccountId}
                  options={activeAccounts}
                />
              )}
            </>
          ) : isCard ? (
            <SelectRow
              label="Cartão"
              value={cardId}
              onChange={setCardId}
              options={activeCards}
              empty="Nenhum cartão cadastrado"
            />
          ) : (
            <SelectRow
              label="Conta"
              value={accountId}
              onChange={setAccountId}
              options={activeAccounts}
              empty="Nenhuma conta cadastrada"
            />
          )}
          <div className="row">
            <span className="row-main">Data</span>
            <span className="chips">
              <button
                type="button"
                className={`chip ${dateChoice === 'today' ? 'chip-on' : ''}`}
                onClick={() => setDate(today())}
              >
                Hoje
              </button>
              <button
                type="button"
                className={`chip ${dateChoice === 'yesterday' ? 'chip-on' : ''}`}
                onClick={() => setDate(yesterday)}
              >
                Ontem
              </button>
              <label className={`chip ${dateChoice === 'other' ? 'chip-on' : ''}`}>
                {dateChoice === 'other' ? dayLabel(date) : 'Outra'}
                <input
                  type="date"
                  className="sr-only"
                  aria-label="Outra data"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </label>
            </span>
          </div>
          {previewInvoice && (
            <div className="row">
              <span className="row-main">Fatura</span>
              <span className="form-row-value tabular">
                {previewInvoice.split('-').reverse().join('/')}
              </span>
            </div>
          )}
          {!isCard && (
            <div className="row">
              <span className="row-main">
                {kind === 'income' && !isTransfer ? 'Recebido' : 'Pago'}
              </span>
              <IonToggle
                aria-label="Pago"
                checked={paid}
                onIonChange={(e) => setPaid(e.detail.checked)}
              />
            </div>
          )}
          {!isTransfer && (
            <button
              type="button"
              className="row"
              onClick={closeKeypadAnd(() => setDetailsOpen(true))}
            >
              <span className="row-main">Mais opções</span>
              <span className="form-row-value">
                {[
                  repeatMode === 'installments' && `${installments}×`,
                  repeatMode === 'recurring' && 'Fixa',
                  (editing?.attachmentIds.length ?? 0) > 0 && 'Comprovante',
                  tagIds.length > 0 && `${tagIds.length} tag(s)`,
                  photos.length > 0 && 'Foto',
                  goalId && 'Sonho',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <CaretRightIcon size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {isTransfer && (
          <Field label="Observação">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        )}
      </div>

      <div className="txform-foot">
        {keypadOpen && <AmountKeypad cents={cents} onChange={setCents} />}
        <div className="save-bar">
          {editing || editingTransfer ? (
            <button
              type="button"
              className="primary-button"
              style={{ gridColumn: 'span 2' }}
              onClick={() => void save(false)}
            >
              Salvar
            </button>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={() => void save(true)}>
                Salvar e criar outro
              </button>
              <button type="button" className="primary-button" onClick={() => void save(false)}>
                Salvar
              </button>
            </>
          )}
        </div>
      </div>

      <CategoryPicker
        isOpen={pickerOpen}
        kind={kind}
        onClose={() => setPickerOpen(false)}
        onPick={(c) => {
          chooseCategory(c);
          setPickerOpen(false);
        }}
      />

      <Sheet
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Mais opções"
        onSave={() => setDetailsOpen(false)}
        saveLabel="Pronto"
      >
        {!editing && (
          <Field label="Repetir">
            <ChoiceChips
              ariaLabel="Repetir"
              value={repeatMode}
              onChange={setRepeatMode}
              options={[
                { value: 'none', label: 'Não' },
                { value: 'installments', label: 'Parcelado' },
                { value: 'recurring', label: 'Fixa' },
              ]}
            />
          </Field>
        )}
        {repeatMode === 'installments' && (
          <Field
            label="Número de parcelas"
            hint={
              cents > 0
                ? `${installments}× de cerca de ${formatBRL(Math.ceil(cents / installments))}`
                : undefined
            }
          >
            <input
              className="input tabular"
              inputMode="numeric"
              aria-label="Número de parcelas"
              value={installments}
              onChange={(e) =>
                setInstallments(
                  Math.min(120, Math.max(2, Number(e.target.value.replace(/\D/g, '')) || 2)),
                )
              }
            />
          </Field>
        )}
        {repeatMode === 'recurring' && (
          <>
            <Field label="Frequência">
              <ChoiceChips
                value={frequency}
                onChange={setFrequency}
                options={[
                  { value: 'monthly', label: 'Mensal' },
                  { value: 'weekly', label: 'Semanal' },
                  { value: 'yearly', label: 'Anual' },
                ]}
              />
            </Field>
            <Field label="Termina em (opcional)">
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </>
        )}
        <Field label="Quem pagou">
          <select
            className="select"
            value={payer ?? ''}
            onChange={(e) => setPayer(e.target.value || null)}
          >
            <option value="">Dono da conta ou do cartão</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Como dividir">
          <select
            className="select"
            value={splitRule}
            onChange={(e) => {
              setSplitRule(e.target.value as SplitRule);
              setSplitTouched(true);
            }}
          >
            <option value="proportional">Proporcional à renda</option>
            <option value="equal">Metade para cada</option>
            <option value="memberA">Só de {members[0].name}</option>
            <option value="memberB">Só de {members[1].name}</option>
          </select>
        </Field>
        <Field label="Tags">
          <div className="chips">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${tagIds.includes(t.id) ? 'chip-on' : ''}`}
                aria-pressed={tagIds.includes(t.id)}
                onClick={() =>
                  setTagIds((ids) =>
                    ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                  )
                }
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="search-row" style={{ marginTop: 8 }}>
            <input
              className="input"
              placeholder="Nova tag"
              aria-label="Nova tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
            />
            <button type="button" className="chip" onClick={() => void createTag()}>
              Criar
            </button>
          </div>
        </Field>
        <Field label="Observação">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {goals.length > 0 && (
          <Field label="Sonho vinculado">
            <select
              className="select"
              value={goalId ?? ''}
              onChange={(e) => {
                setGoalId(e.target.value || null);
                setGoalItemId(null);
              }}
            >
              <option value="">Nenhum</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {items.length > 0 && (
          <Field label="Item do projeto">
            <select
              className="select"
              value={goalItemId ?? ''}
              onChange={(e) => setGoalItemId(e.target.value || null)}
            >
              <option value="">Nenhum</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {editing && editing.attachmentIds.length > 0 && (
          <AttachmentThumbs ids={editing.attachmentIds} />
        )}
        <label className="secondary-button" style={{ position: 'relative' }}>
          <CameraIcon size={20} aria-hidden="true" />
          &nbsp;{photos.length > 0 ? `${photos.length} foto(s) pronta(s)` : 'Foto do comprovante'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Foto do comprovante"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void compressImage(file).then((blob) => setPhotos((list) => [...list, blob]));
            }}
          />
        </label>
      </Sheet>
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  options: { id: string; name: string }[];
  empty?: string;
}) {
  return (
    <label className="row">
      <span className="row-main">{label}</span>
      <select
        className="plain-select"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.length === 0 && <option value="">{empty ?? 'Nenhuma'}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

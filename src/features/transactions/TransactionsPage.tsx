import {
  IonContent,
  IonHeader,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import {
  CheckIcon,
  ClockIcon,
  FunnelIcon,
  PencilSimpleIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import { useData } from '../../db/DataContext';
import {
  deleteTransaction,
  deleteTransfer,
  restoreTransfer,
  toggleStatus,
  undoDeleteTransaction,
} from '../../db/ops';
import { dayLabel, today } from '../../domain/months';
import { groupByDay } from '../../domain/summaries';
import { IconBubble } from '../../ui/icons';
import { MonthPicker, useMonthSwipe } from '../../ui/MonthPicker';
import { MoneyText } from '../../ui/MoneyText';
import { useUi } from '../../ui/uiStore';
import { EmptyState } from '../../ui/EmptyState';
import { ReceiptIcon } from '@phosphor-icons/react';
import { useClosedMonthGuard, useScopePrompt } from '../form/useScopePrompt';
import { FiltersSheet } from './FiltersSheet';
import { activeFilterCount, buildListItems, type ListItem } from './listModel';
import { useToast } from '../../ui/useToast';

export function TransactionsPage() {
  const data = useData();
  const month = useUi((s) => s.month);
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const openForm = useUi((s) => s.openForm);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const presentToast = useToast();
  const askScope = useScopePrompt();
  const confirmClosed = useClosedMonthGuard();
  const swipe = useMonthSwipe();
  const now = today();
  const slidingRefs = useRef(new Map<string, { close: () => Promise<unknown> }>());

  const groups = useMemo(() => {
    const items = buildListItems(data, month, filters).sort((a, b) => b.id.localeCompare(a.id));
    return groupByDay(items);
  }, [data, month, filters]);
  const groupCounts = useMemo(() => groups.map((g) => g.items.length), [groups]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const closeSliding = (id: string) => void slidingRefs.current.get(id)?.close();

  const remove = async (item: ListItem) => {
    closeSliding(item.id);
    const month = item.transaction?.competenceMonth ?? item.transfer!.competenceMonth;
    if (!(await confirmClosed(month))) return;
    if (item.transfer) {
      const id = item.transfer.id;
      await deleteTransfer(id);
      void presentToast({
        message: 'Lançamento excluído',
        duration: 5000,
        position: 'top',
        buttons: [{ text: 'Desfazer', handler: () => void restoreTransfer(id) }],
      });
      return;
    }
    const t = item.transaction!;
    const scope =
      t.installmentGroupId || t.recurrenceId ? await askScope('Excluir lançamento') : 'one';
    if (!scope) return;
    const undo = await deleteTransaction(t.id, scope);
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

  const markPaid = async (item: ListItem) => {
    closeSliding(item.id);
    if (await confirmClosed(item.transaction!.competenceMonth)) await toggleStatus(item.id);
  };

  const edit = (item: ListItem) => {
    closeSliding(item.id);
    if (item.transaction) {
      openForm({
        type: item.transaction.cardId ? 'card' : item.transaction.kind,
        transaction: item.transaction,
      });
    } else if (item.transfer) {
      openForm({ type: 'transfer', transfer: item.transfer });
    }
  };

  const filterCount = activeFilterCount(filters);
  const isEmpty = flat.length === 0;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Lançamentos</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <div {...swipe}>
            <MonthPicker />
          </div>
          <div className="list-tools">
            <div className="search-row">
              <input
                className="input"
                type="search"
                placeholder="Buscar em todos os meses"
                aria-label="Buscar lançamentos"
                value={filters.query}
                onChange={(e) => setFilters({ query: e.target.value })}
              />
              <button
                type="button"
                className={`chip ${filterCount ? 'chip-on' : ''}`}
                aria-label={filterCount ? `Filtros, ${filterCount} ativos` : 'Filtros'}
                onClick={() => setFiltersOpen(true)}
              >
                <FunnelIcon size={18} aria-hidden="true" />
                {filterCount > 0 && <span className="tabular">{filterCount}</span>}
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        {isEmpty ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title={
              filterCount || filters.query
                ? 'Nada com esses filtros'
                : 'Lance o primeiro gasto do mês'
            }
            description={
              filterCount || filters.query
                ? 'Tente tirar um filtro ou mudar a busca.'
                : 'Toque no + aqui embaixo: leva poucos segundos.'
            }
          />
        ) : (
          <GroupedVirtuoso
            className="tall"
            groupCounts={groupCounts}
            groupContent={(index) => {
              const group = groups[index]!;
              return (
                <div className="day-head">
                  <span>{dayLabel(group.date, now)}</span>
                  <MoneyText cents={group.totalCents} className="small" />
                </div>
              );
            }}
            itemContent={(index) => {
              const item = flat[index]!;
              const overdue =
                item.status === 'pending' && item.date < now && !item.transaction?.cardId;
              return (
                <IonItemSliding
                  ref={(el) => {
                    if (el)
                      slidingRefs.current.set(
                        item.id,
                        el as unknown as { close: () => Promise<unknown> },
                      );
                    else slidingRefs.current.delete(item.id);
                  }}
                >
                  {item.transaction && !item.transaction.cardId && (
                    <IonItemOptions side="start" onIonSwipe={() => void markPaid(item)}>
                      <IonItemOption expandable color="success" onClick={() => void markPaid(item)}>
                        {item.status === 'paid' ? (
                          <ClockIcon size={22} aria-hidden="true" />
                        ) : (
                          <CheckIcon size={22} aria-hidden="true" />
                        )}
                        <span className="small">
                          {item.status === 'paid' ? 'Pendente' : 'Pago'}
                        </span>
                      </IonItemOption>
                    </IonItemOptions>
                  )}
                  <IonItem
                    className={`tx-item ${overdue ? 'tx-overdue' : ''}`}
                    lines="none"
                    detail={false}
                  >
                    <button type="button" className="row" onClick={() => edit(item)}>
                      <IconBubble name={item.icon} color={item.color} />
                      <span className="row-main">
                        <span className="row-title">{item.title}</span>
                        <span className="row-sub">
                          {overdue ? 'Vencido · ' : ''}
                          {item.subtitle}
                        </span>
                      </span>
                      <span className="row-end">
                        <MoneyText
                          cents={
                            item.tone === 'transfer' ? item.transfer!.amountCents : item.signedCents
                          }
                          tone={item.tone === 'expense' ? undefined : item.tone}
                          plus={item.tone === 'income'}
                        />
                        {item.status === 'pending' && !item.transaction?.cardId && (
                          <span className="row-sub">pendente</span>
                        )}
                      </span>
                    </button>
                  </IonItem>
                  <IonItemOptions side="end">
                    <IonItemOption color="medium" onClick={() => edit(item)} aria-label="Editar">
                      <PencilSimpleIcon size={22} aria-hidden="true" />
                      <span className="small">Editar</span>
                    </IonItemOption>
                    <IonItemOption
                      color="danger"
                      onClick={() => void remove(item)}
                      aria-label="Excluir"
                    >
                      <TrashIcon size={22} aria-hidden="true" />
                      <span className="small">Excluir</span>
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              );
            }}
          />
        )}
      </IonContent>
      <FiltersSheet isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </IonPage>
  );
}

export default TransactionsPage;

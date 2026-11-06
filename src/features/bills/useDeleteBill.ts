import { useCallback } from 'react';
import { deleteTransaction, undoDeleteTransaction } from '../../db/ops';
import type { Transaction } from '../../schemas/entities';
import { useToast } from '../../ui/useToast';
import { useClosedMonthGuard, useScopePrompt } from '../form/useScopePrompt';

/** Takes a bill off the couple's list. Resolves to false when they back out along the way. */
export function useDeleteBill(): (bill: Transaction) => Promise<boolean> {
  const presentToast = useToast();
  const askScope = useScopePrompt();
  const confirmClosed = useClosedMonthGuard();
  return useCallback(
    async (bill) => {
      if (!(await confirmClosed(bill.competenceMonth))) return false;
      const inSeries = !!(bill.recurrenceId || bill.installmentGroupId);
      const scope = inSeries ? await askScope(`Excluir ${bill.description || 'conta'}`) : 'one';
      if (!scope) return false;
      const undo = await deleteTransaction(bill.id, scope);
      void presentToast({
        message: undo.ids.length > 1 ? `${undo.ids.length} contas excluídas` : 'Conta excluída',
        duration: 5000,
        position: 'top',
        buttons: [
          {
            text: 'Desfazer',
            handler: () => void undoDeleteTransaction(undo.ids, undo.recurrence),
          },
        ],
      });
      return true;
    },
    [askScope, confirmClosed, presentToast],
  );
}

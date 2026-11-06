import { IonSegment, IonSegmentButton, IonLabel } from '@ionic/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import { balanceSeries } from '../../domain/balances';
import { monthShort, shortDay } from '../../domain/months';
import { categorySlices, moneyLeaks } from '../../domain/summaries';
import { BRAND } from '../../brand';
import { shareFile } from '../../io/share';
import { Donut } from '../../ui/Donut';
import { IconBubble } from '../../ui/icons';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { MoneyText } from '../../ui/MoneyText';
import { MonthPicker } from '../../ui/MonthPicker';
import { ChoiceChips, Section, Skeleton } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { MonthSummarySheet } from './MonthSummarySheet';
import {
  cashFlow,
  compareCategories,
  incomeVsExpense,
  monthRowsForExport,
  spendingBy,
} from './reportModel';
import { useToast } from '../../ui/useToast';

const GroupedBars = lazy(() => import('./ReportCharts').then((m) => ({ default: m.GroupedBars })));
const Lines = lazy(() => import('./ReportCharts').then((m) => ({ default: m.Lines })));

const INCOME = { key: 'income', label: 'Receitas', color: 'var(--fill-income)' };
const EXPENSE = { key: 'expense', label: 'Despesas', color: 'var(--fill-expense)' };

export default function ReportsPage() {
  const data = useData();
  const month = useUi((s) => s.month);
  const openForm = useUi((s) => s.openForm);
  const [params] = useSearchParams();
  const presentToast = useToast();
  const [drillId, setDrillId] = useState<string | null>(params.get('category'));
  const [range, setRange] = useState<'6' | '12'>('6');
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [dimension, setDimension] = useState<'tag' | 'account' | 'card'>('account');
  const hidden = data.settings.hideValues;

  const slices = useMemo(
    () => categorySlices(data.transactions, data.categories, month, drillId),
    [data.transactions, data.categories, month, drillId],
  );
  const drillCategory = data.categories.find((c) => c.id === drillId);
  const drillRows = useMemo(
    () =>
      drillId
        ? data.transactions
            .filter(
              (t) =>
                t.kind === 'expense' &&
                t.competenceMonth === month &&
                t.source !== 'adjustment' &&
                (t.categoryId === drillId ||
                  data.categories.find((c) => c.id === t.categoryId)?.parentId === drillId),
            )
            .sort((a, b) => b.amountCents - a.amountCents)
        : [],
    [data, month, drillId],
  );
  const bars = useMemo(() => incomeVsExpense(data, month, Number(range)), [data, month, range]);
  const series = useMemo(
    () =>
      balanceSeries(data.accounts, data.transactions, data.transfers, month, Number(range)).map(
        (p) => ({
          label: monthShort(p.month),
          month: p.month,
          balance: p.balanceCents,
        }),
      ),
    [data, month, range],
  );
  const flow = useMemo(() => cashFlow(data, month), [data, month]);
  const comparison = useMemo(() => compareCategories(data, month), [data, month]);
  const leaks = useMemo(() => moneyLeaks(data.transactions, data.categories, month), [data, month]);
  const byDimension = useMemo(() => spendingBy(data, month, dimension), [data, month, dimension]);
  const dimensionMax = byDimension[0]?.cents ?? 1;

  const exportFile = async (format: 'csv' | 'xlsx') => {
    const rows = monthRowsForExport(data, month);
    let file: File;
    if (format === 'csv') {
      const { default: Papa } = await import('papaparse');
      // The BOM is what makes Excel read the accents correctly.
      file = new File(
        ['﻿' + Papa.unparse(rows, { delimiter: ';' })],
        `${BRAND.fileSlug}-${month}.csv`,
        { type: 'text/csv' },
      );
    } else {
      const XLSX = await import('xlsx');
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), month);
      const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      file = new File([bytes], `${BRAND.fileSlug}-${month}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }
    const result = await shareFile(file);
    if (result === 'failed')
      void presentToast({ message: 'Não foi possível exportar.', duration: 2500, position: 'top' });
  };

  return (
    <LargeTitlePage title="Relatórios" backHref="/tabs/more">
      <div className="page-pad">
        <MonthPicker />

        <Section
          title={drillCategory ? drillCategory.name : 'Despesas por categoria'}
          action={
            drillId ? (
              <button type="button" className="link-button" onClick={() => setDrillId(null)}>
                Voltar
              </button>
            ) : undefined
          }
        >
          <div className="card">
            {slices.length === 0 ? (
              <p className="muted center subhead" style={{ margin: 0 }}>
                Sem despesas neste mês.
              </p>
            ) : (
              <div className="donut-wrap" style={{ justifyContent: 'center' }}>
                <Donut
                  onSlice={(i) => {
                    const id = slices[i]?.categoryId;
                    if (id && !drillId) setDrillId(id);
                  }}
                  slices={slices.slice(0, 8)}
                  label={`Despesas: ${slices.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}`}
                />
              </div>
            )}
          </div>
          {slices.length > 0 && (
            <div className="card-list" style={{ marginTop: 'var(--space-2)' }}>
              {slices.map((s) => (
                <button
                  key={s.categoryId ?? 'none'}
                  type="button"
                  className="row"
                  disabled={!s.categoryId || !!drillId}
                  onClick={() => setDrillId(s.categoryId)}
                >
                  <IconBubble name={s.icon} color={s.color} size={32} />
                  <span className="row-main">
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub tabular">{Math.round(s.share * 100)}%</span>
                  </span>
                  <MoneyText className="row-end" cents={s.cents} />
                </button>
              ))}
            </div>
          )}
          {drillRows.length > 0 && (
            <div className="card-list" style={{ marginTop: 'var(--space-2)' }}>
              {drillRows.slice(0, 30).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="row"
                  onClick={() => openForm({ type: t.cardId ? 'card' : t.kind, transaction: t })}
                >
                  <span className="row-main">
                    <span className="row-title">{t.description || 'Sem descrição'}</span>
                    <span className="row-sub">{shortDay(t.date)}</span>
                  </span>
                  <MoneyText className="row-end" cents={t.amountCents} />
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Onde o dinheiro escapou">
          <div className="card-list">
            {leaks.length === 0 && (
              <p className="empty-note">Nada de estilo de vida compartilhado neste mês.</p>
            )}
            {leaks.map((t) => (
              <button
                key={t.id}
                type="button"
                className="row"
                onClick={() => openForm({ type: t.cardId ? 'card' : t.kind, transaction: t })}
              >
                <span className="row-main">
                  <span className="row-title">{t.description || 'Sem descrição'}</span>
                  <span className="row-sub">
                    {data.categories.find((c) => c.id === t.categoryId)?.name} · {shortDay(t.date)}
                  </span>
                </span>
                <MoneyText className="row-end" cents={t.amountCents} />
              </button>
            ))}
          </div>
        </Section>

        <Section title="Receitas × despesas">
          <ChoiceChips
            ariaLabel="Período"
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6 meses' },
              { value: '12', label: '12 meses' },
            ]}
          />
          <div className="card" style={{ marginTop: 'var(--space-2)' }}>
            <Suspense fallback={<Skeleton height={220} />}>
              <GroupedBars
                rows={bars}
                series={[INCOME, EXPENSE]}
                hidden={hidden}
                onPick={(i) => setPickedMonth(bars[i]?.month ?? null)}
              />
            </Suspense>
          </div>
        </Section>

        <Section title="Evolução do saldo">
          <div className="card">
            <Suspense fallback={<Skeleton height={220} />}>
              <Lines
                rows={series}
                series={[{ key: 'balance', label: 'Saldo', color: 'var(--color-primary)' }]}
                hidden={hidden}
                onPick={(i) => setPickedMonth(series[i]?.month ?? null)}
              />
            </Suspense>
          </div>
        </Section>

        <Section title="Fluxo de caixa do mês">
          <div className="card">
            <Suspense fallback={<Skeleton height={220} />}>
              <Lines rows={flow} series={[INCOME, EXPENSE]} hidden={hidden} />
            </Suspense>
          </div>
        </Section>

        <Section title="Comparado ao mês anterior">
          <div className="card">
            {comparison.length === 0 ? (
              <p className="muted center subhead" style={{ margin: 0 }}>
                Sem despesas para comparar.
              </p>
            ) : (
              <table className="table-mini">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Antes</th>
                    <th>Agora</th>
                    <th>Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.categoryId}>
                      <td>{row.name}</td>
                      <td>
                        <MoneyText cents={row.previous} />
                      </td>
                      <td>
                        <MoneyText cents={row.current} />
                      </td>
                      <td
                        className={
                          row.change !== null && row.change > 0
                            ? 'tone-expense'
                            : row.change !== null && row.change < 0
                              ? 'tone-income'
                              : 'muted'
                        }
                      >
                        {row.change === null
                          ? 'novo'
                          : `${row.change > 0 ? '+' : ''}${Math.round(row.change * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>

        <Section title="Despesas por">
          <IonSegment
            aria-label="Agrupar por"
            value={dimension}
            onIonChange={(e) => setDimension(e.detail.value as typeof dimension)}
          >
            <IonSegmentButton value="account">
              <IonLabel>Conta</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="card">
              <IonLabel>Cartão</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="tag">
              <IonLabel>Tag</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          <div className="card stack" style={{ marginTop: 'var(--space-2)' }}>
            {byDimension.length === 0 && (
              <p className="muted center subhead" style={{ margin: 0 }}>
                Nada neste mês.
              </p>
            )}
            {byDimension.map((row) => (
              <div key={row.id}>
                <div className="limit-line">
                  <span>{row.name}</span>
                  <MoneyText cents={row.cents} />
                </div>
                <div className="progress">
                  <span
                    className="progress-fill fill-primary"
                    style={{ width: `${(row.cents / dimensionMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="two-cols" style={{ marginTop: 'var(--space-5)' }}>
          <button type="button" className="secondary-button" onClick={() => void exportFile('csv')}>
            Exportar CSV
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void exportFile('xlsx')}
          >
            Exportar XLSX
          </button>
        </div>
      </div>
      {pickedMonth && (
        <MonthSummarySheet month={pickedMonth} onClose={() => setPickedMonth(null)} />
      )}
    </LargeTitlePage>
  );
}

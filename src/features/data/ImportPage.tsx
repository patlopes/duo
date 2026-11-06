import { useMemo, useState, type ChangeEvent } from 'react';
import { useData } from '../../db/DataContext';
import { updateSettings } from '../../db/ops';
import { formatBRL } from '../../domain/money';
import { shortDay } from '../../domain/months';
import {
  applyImport,
  buildReview,
  decodeStatement,
  guessMapping,
  parseCsv,
  parseOfx,
  rowsFromCsv,
  type CsvMapping,
  type CsvTable,
  type ReviewRow,
  type StatementRow,
} from '../../io/statements';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Field, Section } from '../../ui/parts';
import { categoriesFor } from '../../ui/CategoryPicker';
import { useToast } from '../../ui/useToast';

export default function ImportPage() {
  const data = useData();
  const presentToast = useToast();
  const [chosenTarget, setTargetId] = useState('');
  // Derived, not stored: accounts may appear after this screen has mounted.
  const fallbackTarget = data.accounts[0]
    ? `a:${data.accounts[0].id}`
    : data.cards[0]
      ? `c:${data.cards[0].id}`
      : '';
  const targetId = chosenTarget || fallbackTarget;
  const [source, setSource] = useState<'ofx' | 'csv' | null>(null);
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [csv, setCsv] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({
    date: '',
    description: '',
    amount: '',
    invertSign: false,
  });
  const [presetName, setPresetName] = useState('');
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState('');

  const target = useMemo(() => {
    const id = targetId.slice(2);
    return targetId.startsWith('c:')
      ? { accountId: null, cardId: id, card: data.cards.find((c) => c.id === id) ?? null }
      : { accountId: id || null, cardId: null, card: null };
  }, [targetId, data.cards]);

  const startReview = (statement: StatementRow[]) => {
    setRows(statement);
    setReview(buildReview(statement, target, data.transactions, data.rules));
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setReview(null);
    setCsv(null);
    const text = decodeStatement(new Uint8Array(await file.arrayBuffer()));
    if (/<OFX>|OFXHEADER|<STMTTRN>/i.test(text)) {
      const statement = parseOfx(text);
      if (statement.length === 0) return setError('Não encontrei lançamentos neste OFX.');
      setSource('ofx');
      startReview(statement);
      return;
    }
    const table = await parseCsv(text);
    if (table.columns.length < 2 || table.rows.length === 0) {
      return setError('Não reconheci este arquivo. Use um OFX ou um CSV com cabeçalho.');
    }
    setSource('csv');
    setCsv(table);
    const preset = data.settings.csvPresets.find(
      (p) => table.columns.includes(p.date) && table.columns.includes(p.amount),
    );
    const guess = guessMapping(table.columns);
    setMapping(
      preset ?? {
        date: guess.date ?? table.columns[0]!,
        description: guess.description ?? table.columns[1]!,
        amount: guess.amount ?? table.columns[table.columns.length - 1]!,
        invertSign: !!target.cardId,
      },
    );
    if (preset) setPresetName(preset.name);
  };

  const confirmMapping = () => {
    if (!csv) return;
    const { rows: statement, skipped } = rowsFromCsv(csv, mapping);
    if (statement.length === 0)
      return setError('Nenhuma linha com data e valor válidos. Confira as colunas.');
    if (skipped > 0)
      void presentToast({
        message: `${skipped} linhas ignoradas por data ou valor inválido.`,
        duration: 3000,
        position: 'top',
      });
    if (presetName.trim()) {
      const others = data.settings.csvPresets.filter((p) => p.name !== presetName.trim());
      void updateSettings({ csvPresets: [...others, { name: presetName.trim(), ...mapping }] });
    }
    startReview(statement);
  };

  const patchRow = (key: number, patch: Partial<ReviewRow>) =>
    setReview((list) => list?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  const apply = async () => {
    if (!review || !source) return;
    let log;
    try {
      log = await applyImport(review, target, source);
    } catch {
      setError('Não foi possível importar. Escolha uma conta ou um cartão de destino.');
      return;
    }
    setReview(null);
    setCsv(null);
    setRows([]);
    void presentToast({
      message: `Importação concluída: ${log.summary}`,
      duration: 4000,
      position: 'top',
      buttons: [
        {
          text: 'Desfazer',
          handler: () => void import('../../io/changeset').then((m) => m.undoImport(log.id)),
        },
      ],
    });
  };

  const selected = review?.filter((r) => r.selected).length ?? 0;
  const expenseCats = categoriesFor(data.categories, 'expense');
  const incomeCats = categoriesFor(data.categories, 'income');

  return (
    <LargeTitlePage title="Importar extrato" backHref="/tabs/more">
      <div className="page-pad">
        <Field label="Para onde vão os lançamentos">
          <select
            className="select"
            aria-label="Destino da importação"
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setReview(null);
            }}
          >
            {data.accounts.map((a) => (
              <option key={a.id} value={`a:${a.id}`}>
                {a.name}
              </option>
            ))}
            {data.cards.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                Cartão: {c.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="primary-button" style={{ position: 'relative' }}>
          Escolher arquivo OFX ou CSV
          <input
            type="file"
            accept=".ofx,.qfx,.csv,.txt,text/csv,application/x-ofx"
            aria-label="Arquivo de extrato"
            style={{ position: 'absolute', inset: 0, opacity: 0 }}
            onChange={(e) => void pick(e)}
          />
        </label>
        {error && <p className="tone-expense small">{error}</p>}

        {csv && !review && (
          <Section title="Colunas do CSV">
            <div className="card">
              {(['date', 'description', 'amount'] as const).map((field) => (
                <Field
                  key={field}
                  label={{ date: 'Data', description: 'Descrição', amount: 'Valor' }[field]}
                >
                  <select
                    className="select"
                    aria-label={`Coluna de ${field}`}
                    value={mapping[field]}
                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  >
                    {csv.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <label className="toggle-row">
                <span>Valores positivos são gastos (comum em faturas)</span>
                <input
                  type="checkbox"
                  checked={mapping.invertSign}
                  onChange={(e) => setMapping({ ...mapping, invertSign: e.target.checked })}
                />
              </label>
              <Field label="Salvar como modelo deste banco (opcional)">
                <input
                  className="input"
                  placeholder="Nubank"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </Field>
              <button type="button" className="primary-button" onClick={confirmMapping}>
                Continuar
              </button>
            </div>
          </Section>
        )}

        {review && (
          <Section title={`Revisar ${rows.length} lançamentos`}>
            <div className="card-list">
              {review.map((r) => (
                <div key={r.key} className="row">
                  <input
                    type="checkbox"
                    aria-label={`Importar ${r.description}`}
                    checked={r.selected}
                    onChange={(e) => patchRow(r.key, { selected: e.target.checked })}
                  />
                  <span className="row-main">
                    <span className="row-title">{r.description}</span>
                    <span className="row-sub">
                      {shortDay(r.date)} · {formatBRL(Math.abs(r.amountCents))}
                      {r.amountCents > 0 ? ' · entrada' : ''}
                    </span>
                    {r.state === 'duplicate' && (
                      <span className="badge badge-warning">Já importado</span>
                    )}
                    {r.state === 'maybe_duplicate' && (
                      <span className="badge badge-warning">Pode duplicar “{r.duplicateOf}”</span>
                    )}
                    <select
                      className="plain-select"
                      style={{
                        maxWidth: '100%',
                        textAlign: 'left',
                        textAlignLast: 'left',
                        fontSize: 16,
                      }}
                      aria-label={`Categoria de ${r.description}`}
                      value={r.categoryId ?? ''}
                      onChange={(e) => patchRow(r.key, { categoryId: e.target.value || null })}
                    >
                      <option value="">Sem categoria</option>
                      {(r.amountCents > 0 ? incomeCats : expenseCats).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 'var(--space-3)' }}
              disabled={selected === 0}
              onClick={() => void apply()}
            >
              Importar {selected} lançamentos
            </button>
          </Section>
        )}
      </div>
    </LargeTitlePage>
  );
}

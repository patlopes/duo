import { useState, type ChangeEvent } from 'react';
import { useData } from '../../db/DataContext';
import { addMonths, monthLabel, today, monthOf } from '../../domain/months';
import { AI_TASKS, buildAiPackage, type AiTask } from '../../io/aiExport';
import {
  applyPlan,
  parseChangeset,
  planChangeset,
  summarizeCounts,
  undoImport,
  type Plan,
  type PlannedOp,
} from '../../io/changeset';
import { copyText, shareFile } from '../../io/share';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { ChoiceChips, Field, Section, Sheet } from '../../ui/parts';
import { HealthList } from '../data/HealthPage';
import { useToast } from '../../ui/useToast';

const ENTITY_LABEL: Record<string, string> = {
  transaction: 'Lançamento',
  transfer: 'Transferência',
  account: 'Conta',
  card: 'Cartão',
  category: 'Categoria',
  tag: 'Tag',
  budget: 'Orçamento',
  goal: 'Sonho',
  goalItem: 'Item de sonho',
  goalMovement: 'Aporte',
  income: 'Renda',
  rule: 'Regra',
};

const COPY_LIMIT_BYTES = 200 * 1024;

function describe(op: PlannedOp): string {
  const row = op.after ?? op.before ?? {};
  return String(row.description ?? row.name ?? ENTITY_LABEL[op.entity] ?? '');
}

function show(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function OpRow({ op, on, toggle }: { op: PlannedOp; on: boolean; toggle: () => void }) {
  const symbol = { create: '+', update: '~', delete: '−' }[op.op];
  const invalid = op.errors.length > 0;
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        aria-label={`Aplicar: ${describe(op)}`}
        checked={on && !invalid}
        disabled={invalid}
        onChange={toggle}
        style={{ marginTop: 4 }}
      />
      <span className="row-main subhead">
        <span className="strong wrap-anywhere">
          {symbol} {ENTITY_LABEL[op.entity]}: {describe(op)}
        </span>
        {op.op === 'create' && typeof op.after?.amountCents === 'number' && (
          <span className="row-sub">
            {(op.after.amountCents / 100).toFixed(2).replace('.', ',')} em{' '}
            {String(op.after.date ?? '')}
          </span>
        )}
        {op.changed.map((field) => (
          <span key={field} className="row-sub wrap-anywhere" style={{ whiteSpace: 'normal' }}>
            {field}: <span className="diff-old">{show(op.before?.[field])}</span> →{' '}
            {show(op.after?.[field])}
          </span>
        ))}
        {op.reason && (
          <span className="row-sub" style={{ whiteSpace: 'normal' }}>
            {op.reason}
          </span>
        )}
        {op.errors.map((e) => (
          <span key={e} className="row-sub tone-expense" style={{ whiteSpace: 'normal' }}>
            {e}
          </span>
        ))}
        {op.conflicts.map((e) => (
          <span key={e} className="row-sub tone-warning" style={{ whiteSpace: 'normal' }}>
            {e}
          </span>
        ))}
        {op.warnings.map((e) => (
          <span key={e} className="row-sub tone-warning" style={{ whiteSpace: 'normal' }}>
            {e}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function AiPage() {
  const data = useData();
  const presentToast = useToast();
  const current = monthOf(today());
  const [task, setTask] = useState<AiTask>('statement');
  const [question, setQuestion] = useState('');
  const [monthsBack, setMonthsBack] = useState('2');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [healthOpen, setHealthOpen] = useState(false);

  const toast = (message: string) =>
    void presentToast({ message, duration: 2500, position: 'top' });

  const makePackage = () => {
    const months = Array.from({ length: Number(monthsBack) }, (_, i) =>
      addMonths(current, -i),
    ).reverse();
    return {
      months,
      json: JSON.stringify(buildAiPackage(data, { task, months, question }), null, 1),
    };
  };

  const share = async () => {
    const { months, json } = makePackage();
    const name = `duo-ia-${task}-${today().replace(/-/g, '')}.json`;
    const result = await shareFile(new File([json], name, { type: 'application/json' }));
    if (result === 'failed') toast('Não foi possível compartilhar. Tente copiar.');
    if (result === 'downloaded') toast(`Arquivo salvo com ${months.length} meses de dados.`);
  };

  const copy = async () => {
    const { json } = makePackage();
    if (new Blob([json]).size > COPY_LIMIT_BYTES) {
      toast('Ficou grande demais para copiar. Use Compartilhar arquivo.');
      return;
    }
    toast(
      (await copyText(json)) ? 'Copiado. Cole na conversa com a IA.' : 'Não foi possível copiar.',
    );
  };

  const analyze = async (text: string) => {
    setError('');
    try {
      const next = await planChangeset(parseChangeset(text));
      setPlan(next);
      // Rows with conflicts start unticked: they need a person to look at them.
      setSelected(
        new Set(
          next.ops.filter((o) => !o.errors.length && !o.conflicts.length).map((o) => o.index),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler a resposta.');
    }
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await analyze(await file.text());
  };

  const apply = async () => {
    if (!plan) return;
    try {
      const log = await applyPlan(plan, selected);
      setPlan(null);
      setPasted('');
      void presentToast({
        message: `Aplicado: ${log.summary}`,
        duration: 6000,
        position: 'top',
        buttons: [{ text: 'Desfazer', handler: () => void undoImport(log.id) }],
      });
      setHealthOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar.');
      setPlan(null);
    }
  };

  const toggle = (index: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <LargeTitlePage title="Pedir para uma IA" backHref="/tabs/more">
      <div className="page-pad">
        <div className="notice">
          <div>
            Vocês mandam um arquivo para a IA de sua preferência, ela devolve as mudanças, e nada é
            aplicado sem passar pela revisão aqui. O arquivo contém dados financeiros de vocês: só
            saem do aparelho quando vocês o enviam.
          </div>
        </div>

        <Section title="1. O que vocês querem">
          <div className="card-list">
            {AI_TASKS.map((t) => (
              <label key={t.id} className="row">
                <input
                  type="radio"
                  name="ai-task"
                  checked={task === t.id}
                  onChange={() => setTask(t.id)}
                />
                <span className="row-main">
                  <span className="row-title">{t.title}</span>
                  <span className="row-sub">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
          {task === 'free' && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Field label="Sua pergunta">
                <textarea
                  className="textarea"
                  aria-label="Sua pergunta"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </Field>
            </div>
          )}
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Field label={`Dados enviados: até ${monthLabel(current)}`}>
              <ChoiceChips
                value={monthsBack}
                onChange={setMonthsBack}
                options={[
                  { value: '1', label: '1 mês' },
                  { value: '2', label: '2 meses' },
                  { value: '6', label: '6 meses' },
                  { value: '12', label: '12 meses' },
                ]}
              />
            </Field>
          </div>
          <div className="stack">
            <button type="button" className="primary-button" onClick={() => void share()}>
              Compartilhar arquivo
            </button>
            <button type="button" className="secondary-button" onClick={() => void copy()}>
              Copiar instruções e dados
            </button>
          </div>
        </Section>

        <Section title="2. Trazer a resposta">
          <div className="card stack">
            <label className="secondary-button" style={{ position: 'relative' }}>
              Escolher arquivo
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Arquivo de resposta da IA"
                style={{ position: 'absolute', inset: 0, opacity: 0 }}
                onChange={(e) => void pick(e)}
              />
            </label>
            <span className="small muted center">ou cole a resposta da IA</span>
            <textarea
              className="textarea"
              aria-label="Resposta da IA"
              placeholder="Pode colar tudo: o app encontra o JSON no meio do texto."
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              type="button"
              className="primary-button"
              disabled={!pasted.trim()}
              onClick={() => void analyze(pasted)}
            >
              Revisar mudanças
            </button>
            {error && (
              <p className="tone-expense small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {error}
              </p>
            )}
          </div>
        </Section>
      </div>

      {plan && (
        <Sheet
          isOpen
          onClose={() => setPlan(null)}
          title="Revisar mudanças"
          onSave={selected.size > 0 ? () => void apply() : undefined}
          saveLabel={`Aplicar ${selected.size}`}
        >
          <p className="strong" style={{ marginTop: 0 }}>
            {summarizeCounts(plan.counts)}
          </p>
          {plan.changeset.summary && <p className="subhead">{plan.changeset.summary}</p>}
          {(plan.changeset.questions?.length ?? 0) > 0 && (
            <div className="notice" style={{ marginBottom: 'var(--space-3)' }}>
              <div>
                <strong>A IA tem dúvidas:</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {plan.changeset.questions!.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {plan.hasErrors && (
            <p className="tone-expense small">
              Operações com erro não podem ser aplicadas e ficam de fora.
            </p>
          )}
          <div className="card-list">
            {plan.ops.map((op) => (
              <OpRow
                key={op.index}
                op={op}
                on={selected.has(op.index)}
                toggle={() => toggle(op.index)}
              />
            ))}
            {plan.ops.length === 0 && (
              <p className="empty-note">A resposta não propõe nenhuma mudança.</p>
            )}
          </div>
        </Sheet>
      )}

      {healthOpen && (
        <Sheet isOpen onClose={() => setHealthOpen(false)} title="Saúde dos dados">
          <HealthList />
        </Sheet>
      )}
    </LargeTitlePage>
  );
}

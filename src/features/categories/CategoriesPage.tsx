import { useState } from 'react';
import { useData } from '../../db/DataContext';
import { softDelete, upsert } from '../../db/ops';
import type { Category, CategoryRule, SplitRule } from '../../schemas/entities';
import { CategoryPicker } from '../../ui/CategoryPicker';
import { CATEGORY_ICONS, IconBubble } from '../../ui/icons';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { ChoiceChips, Field, Section, Sheet } from '../../ui/parts';

const NATURE_LABEL: Record<Category['nature'], string> = {
  essential: 'Essencial',
  lifestyle: 'Estilo de vida',
  future: 'Futuro',
};

const COLORS = [
  '#7A5C8E',
  '#3A9D6E',
  '#E07A3F',
  '#D9534F',
  '#3E7CB1',
  '#C9A227',
  '#2A9D8F',
  '#6A67CE',
  '#B5651D',
  '#5C6B73',
];

function CategoryForm({
  category,
  kind,
  parentId,
  onClose,
}: {
  category: Category | null;
  kind: Category['kind'];
  parentId: string | null;
  onClose: () => void;
}) {
  const { members } = useData();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'star');
  const [color, setColor] = useState(category?.color ?? COLORS[0]!);
  const [nature, setNature] = useState<Category['nature']>(category?.nature ?? 'lifestyle');
  const [split, setSplit] = useState<SplitRule>(category?.defaultSplitRule ?? 'proportional');
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) return setError('Dê um nome à categoria.');
    await upsert<Category>('categories', {
      ...(category ?? {}),
      name: name.trim(),
      kind: category?.kind ?? kind,
      parentId: category?.parentId ?? parentId,
      icon,
      color,
      nature,
      defaultSplitRule: split,
      archived: category?.archived ?? false,
      system: false,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={category ? 'Editar categoria' : parentId ? 'Nova subcategoria' : 'Nova categoria'}
      onSave={() => void save()}
    >
      <Field label="Nome">
        <input
          className="input"
          aria-label="Nome da categoria"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Natureza"
        hint="Alimenta a reserva de emergência e o relatório de onde o dinheiro escapou."
      >
        <ChoiceChips
          value={nature}
          onChange={setNature}
          options={(Object.keys(NATURE_LABEL) as Category['nature'][]).map((value) => ({
            value,
            label: NATURE_LABEL[value],
          }))}
        />
      </Field>
      <Field label="Divisão padrão">
        <select
          className="select"
          value={split}
          onChange={(e) => setSplit(e.target.value as SplitRule)}
        >
          <option value="proportional">Proporcional à renda</option>
          <option value="equal">Metade para cada</option>
          <option value="memberA">Só de {members[0].name}</option>
          <option value="memberB">Só de {members[1].name}</option>
        </select>
      </Field>
      <Field label="Cor">
        <div className="chips">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="icon-button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            >
              <span
                className="legend-dot"
                style={{
                  background: c,
                  width: color === c ? 30 : 22,
                  height: color === c ? 30 : 22,
                }}
              />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Ícone">
        <div className="chips">
          {CATEGORY_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className="icon-button"
              aria-label={`Ícone ${i}`}
              aria-pressed={icon === i}
              onClick={() => setIcon(i)}
            >
              <IconBubble name={i} color={icon === i ? color : '#B8B2AC'} size={34} />
            </button>
          ))}
        </div>
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
      {category && (
        <button
          type="button"
          className="danger-button"
          onClick={() =>
            void upsert<Category>('categories', { ...category, archived: true }).then(onClose)
          }
        >
          Arquivar categoria
        </button>
      )}
    </Sheet>
  );
}

export function CategoriesPage() {
  const { categories } = useData();
  const [kind, setKind] = useState<Category['kind']>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const visible = categories.filter((c) => c.kind === kind && !c.system && !c.archived);
  const roots = visible.filter((c) => !c.parentId);

  return (
    <LargeTitlePage
      title="Categorias"
      backHref="/tabs/more"
      toolbarEnd={
        <button
          type="button"
          className="link-button"
          onClick={() => setCreating({ parentId: null })}
        >
          Nova
        </button>
      }
    >
      <div className="page-pad">
        <ChoiceChips
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Despesas' },
            { value: 'income', label: 'Receitas' },
          ]}
        />
        <div className="card-list" style={{ marginTop: 'var(--space-3)' }}>
          {roots.map((c) => (
            <div key={c.id}>
              <div className="row">
                <button
                  type="button"
                  className="row-main link-reset"
                  style={{ display: 'flex', gap: 12, alignItems: 'center' }}
                  onClick={() => setEditing(c)}
                >
                  <IconBubble name={c.icon} color={c.color} />
                  <span className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="row-sub">{NATURE_LABEL[c.nature]}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-label={`Nova subcategoria de ${c.name}`}
                  onClick={() => setCreating({ parentId: c.id })}
                >
                  + Sub
                </button>
              </div>
              {visible
                .filter((sub) => sub.parentId === c.id)
                .map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className="row"
                    style={{ paddingLeft: 66 }}
                    onClick={() => setEditing(sub)}
                  >
                    <span className="row-title">{sub.name}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
      {(editing || creating) && (
        <CategoryForm
          category={editing}
          kind={kind}
          parentId={creating?.parentId ?? null}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
        />
      )}
    </LargeTitlePage>
  );
}

function RuleForm({ rule, onClose }: { rule: CategoryRule | null; onClose: () => void }) {
  const { categories, members } = useData();
  const [contains, setContains] = useState(rule?.match.contains ?? '');
  const [categoryId, setCategoryId] = useState(rule?.set.categoryId ?? '');
  const [split, setSplit] = useState<SplitRule | ''>(rule?.set.splitRule ?? '');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const category = categories.find((c) => c.id === categoryId);

  const save = async () => {
    if (!contains.trim()) return setError('Digite o texto a procurar na descrição.');
    if (!categoryId && !split) return setError('Escolha o que a regra deve aplicar.');
    await upsert<CategoryRule>('rules', {
      ...(rule ?? {}),
      match: { contains: contains.trim() },
      set: {
        ...(categoryId ? { categoryId } : {}),
        ...(split ? { splitRule: split } : {}),
      },
    });
    onClose();
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={rule ? 'Editar regra' : 'Nova regra'}
      onSave={() => void save()}
    >
      <Field label="Quando a descrição contém">
        <input
          className="input"
          aria-label="Texto da regra"
          placeholder="ifood"
          value={contains}
          onChange={(e) => setContains(e.target.value)}
        />
      </Field>
      <Field label="Usar a categoria">
        <button
          type="button"
          className="input"
          style={{ textAlign: 'left' }}
          onClick={() => setPicking(true)}
        >
          {category?.name ?? 'Escolher categoria'}
        </button>
      </Field>
      <Field label="Dividir como">
        <select
          className="select"
          value={split}
          onChange={(e) => setSplit(e.target.value as SplitRule | '')}
        >
          <option value="">Não mudar</option>
          <option value="proportional">Proporcional à renda</option>
          <option value="equal">Metade para cada</option>
          <option value="memberA">Só de {members[0].name}</option>
          <option value="memberB">Só de {members[1].name}</option>
        </select>
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
      {rule && (
        <button
          type="button"
          className="danger-button"
          onClick={() => void softDelete('rules', rule.id).then(onClose)}
        >
          Excluir regra
        </button>
      )}
      <CategoryPicker
        isOpen={picking}
        kind="expense"
        onClose={() => setPicking(false)}
        onPick={(c) => {
          setCategoryId(c.id);
          setPicking(false);
        }}
      />
    </Sheet>
  );
}

export function RulesPage() {
  const { rules, categories } = useData();
  const [editing, setEditing] = useState<CategoryRule | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <LargeTitlePage
      title="Regras automáticas"
      backHref="/tabs/more"
      toolbarEnd={
        <button type="button" className="link-button" onClick={() => setCreating(true)}>
          Nova
        </button>
      }
    >
      <div className="page-pad">
        <Section>
          <div className="card-list">
            {rules.length === 0 && (
              <p className="empty-note">
                Ensine o app: quando a descrição contiver um texto, ele já escolhe a categoria. Se
                vocês corrigirem a mesma descrição duas vezes, ele sugere uma regra.
              </p>
            )}
            {rules.map((r) => (
              <button key={r.id} type="button" className="row" onClick={() => setEditing(r)}>
                <span className="row-main">
                  <span className="row-title">Contém “{r.match.contains ?? r.match.regex}”</span>
                  <span className="row-sub">
                    → {categories.find((c) => c.id === r.set.categoryId)?.name ?? 'Só a divisão'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>
      {(creating || editing) && (
        <RuleForm
          rule={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </LargeTitlePage>
  );
}

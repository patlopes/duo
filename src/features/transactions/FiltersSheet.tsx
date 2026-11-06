import { useData } from '../../db/DataContext';
import { ChoiceChips, Field, Sheet } from '../../ui/parts';
import { useUi } from '../../ui/uiStore';
import { categoriesFor } from '../../ui/CategoryPicker';

export const SPLIT_LABEL = {
  proportional: 'Proporcional à renda',
  equal: 'Metade para cada',
  memberA: 'Só de um',
  memberB: 'Só de outro',
} as const;

function Choose({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { id: string; name: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function FiltersSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const data = useData();
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const resetFilters = useUi((s) => s.resetFilters);
  const [a, b] = data.members;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Filtros" onSave={onClose} saveLabel="Aplicar">
      <Field label="Tipo">
        <ChoiceChips
          ariaLabel="Tipo"
          value={filters.kind}
          onChange={(kind) => setFilters({ kind })}
          options={[
            { value: 'all', label: 'Tudo' },
            { value: 'expense', label: 'Despesas' },
            { value: 'income', label: 'Receitas' },
            { value: 'transfer', label: 'Transferências' },
          ]}
        />
      </Field>
      <Field label="Status">
        <ChoiceChips
          ariaLabel="Status"
          value={filters.status}
          onChange={(status) => setFilters({ status })}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'paid', label: 'Pagos' },
            { value: 'pending', label: 'Pendentes' },
          ]}
        />
      </Field>
      <Choose
        label="Conta"
        value={filters.accountId}
        options={data.accounts}
        onChange={(accountId) => setFilters({ accountId })}
      />
      <Choose
        label="Cartão"
        value={filters.cardId}
        options={data.cards}
        onChange={(cardId) => setFilters({ cardId })}
      />
      <Choose
        label="Categoria"
        value={filters.categoryId}
        options={[
          ...categoriesFor(data.categories, 'expense'),
          ...categoriesFor(data.categories, 'income'),
        ]}
        onChange={(categoryId) => setFilters({ categoryId })}
      />
      <Choose
        label="Tag"
        value={filters.tagId}
        options={data.tags}
        onChange={(tagId) => setFilters({ tagId })}
      />
      <Choose
        label="Quem pagou"
        value={filters.payerMemberId}
        options={data.members}
        onChange={(payerMemberId) => setFilters({ payerMemberId })}
      />
      <Field label="Regra de rateio">
        <select
          className="select"
          value={filters.splitRule ?? ''}
          onChange={(e) =>
            setFilters({ splitRule: (e.target.value || null) as typeof filters.splitRule })
          }
        >
          <option value="">Todas</option>
          <option value="proportional">{SPLIT_LABEL.proportional}</option>
          <option value="equal">{SPLIT_LABEL.equal}</option>
          <option value="memberA">Só de {a.name}</option>
          <option value="memberB">Só de {b.name}</option>
        </select>
      </Field>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          resetFilters();
          onClose();
        }}
      >
        Limpar filtros
      </button>
    </Sheet>
  );
}

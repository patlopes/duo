import { useMemo, useState } from 'react';
import { useData } from '../db/DataContext';
import { normalizeText } from '../domain/summaries';
import type { Category } from '../schemas/entities';
import { IconBubble } from './icons';
import { Sheet } from './parts';

export function categoriesFor(categories: Category[], kind: Category['kind']) {
  return categories.filter((c) => c.kind === kind && !c.system && !c.archived);
}

export function CategoryPicker({
  isOpen,
  kind,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  kind: Category['kind'];
  onClose: () => void;
  onPick: (category: Category) => void;
}) {
  const { categories, settings } = useData();
  const [query, setQuery] = useState('');
  const available = useMemo(() => categoriesFor(categories, kind), [categories, kind]);

  const q = normalizeText(query);
  const visible = q ? available.filter((c) => normalizeText(c.name).includes(q)) : available;
  const roots = visible.filter((c) => !c.parentId || q);
  const recent = q
    ? []
    : settings.recentCategoryIds
        .map((id) => available.find((c) => c.id === id))
        .filter((c): c is Category => !!c)
        .slice(0, 4);

  const tile = (c: Category, keyPrefix = '') => (
    <button
      key={keyPrefix + c.id}
      type="button"
      className="category-tile pressable"
      onClick={() => {
        onPick(c);
        setQuery('');
      }}
    >
      <IconBubble name={c.icon} color={c.color} />
      <span>{c.name}</span>
    </button>
  );

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Categoria">
      <input
        className="input"
        placeholder="Buscar categoria"
        aria-label="Buscar categoria"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {recent.length > 0 && (
        <>
          <h3 className="sheet-label">Recentes</h3>
          <div className="category-grid">{recent.map((c) => tile(c, 'r-'))}</div>
          <h3 className="sheet-label">Todas</h3>
        </>
      )}
      <div className="category-grid">
        {roots.map((c) => tile(c))}
        {!q && available.filter((c) => c.parentId).map((c) => tile(c))}
      </div>
      {visible.length === 0 && <p className="muted center">Nenhuma categoria com esse nome.</p>}
    </Sheet>
  );
}

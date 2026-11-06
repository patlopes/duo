import type { Category, SplitRule } from '../schemas/entities';

interface SeedCategory {
  key: string;
  name: string;
  kind: 'expense' | 'income';
  icon: string;
  color: string;
  nature: Category['nature'];
  split?: SplitRule;
}

/**
 * Colors come from the eight validated chart slots (scripts in the dataviz method): a category keeps
 * its hue across months, and charts always pair it with a label because 23 categories share 8 hues.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    key: 'moradia',
    name: 'Moradia',
    kind: 'expense',
    icon: 'house',
    color: '#2a78d6',
    nature: 'essential',
  },
  {
    key: 'mercado',
    name: 'Mercado',
    kind: 'expense',
    icon: 'cart',
    color: '#1baf7a',
    nature: 'essential',
  },
  {
    key: 'restaurantes',
    name: 'Restaurantes',
    kind: 'expense',
    icon: 'fork',
    color: '#eb6834',
    nature: 'lifestyle',
  },
  {
    key: 'delivery',
    name: 'Delivery',
    kind: 'expense',
    icon: 'moped',
    color: '#e34948',
    nature: 'lifestyle',
  },
  {
    key: 'transporte',
    name: 'Transporte',
    kind: 'expense',
    icon: 'car',
    color: '#6250d6',
    nature: 'essential',
  },
  {
    key: 'saude',
    name: 'Saúde',
    kind: 'expense',
    icon: 'heart',
    color: '#e87ba4',
    nature: 'essential',
  },
  {
    key: 'educacao',
    name: 'Educação',
    kind: 'expense',
    icon: 'book',
    color: '#008300',
    nature: 'future',
  },
  {
    key: 'lazer',
    name: 'Lazer',
    kind: 'expense',
    icon: 'popcorn',
    color: '#eda100',
    nature: 'lifestyle',
  },
  {
    key: 'viagem',
    name: 'Viagem',
    kind: 'expense',
    icon: 'plane',
    color: '#1baf7a',
    nature: 'lifestyle',
  },
  {
    key: 'assinaturas',
    name: 'Assinaturas',
    kind: 'expense',
    icon: 'repeat',
    color: '#6250d6',
    nature: 'lifestyle',
    split: 'equal',
  },
  {
    key: 'compras',
    name: 'Compras',
    kind: 'expense',
    icon: 'bag',
    color: '#eb6834',
    nature: 'lifestyle',
  },
  {
    key: 'pets',
    name: 'Pets',
    kind: 'expense',
    icon: 'paw',
    color: '#eda100',
    nature: 'essential',
  },
  {
    key: 'presentes',
    name: 'Presentes',
    kind: 'expense',
    icon: 'gift',
    color: '#e87ba4',
    nature: 'lifestyle',
  },
  {
    key: 'pessoal',
    name: 'Pessoal',
    kind: 'expense',
    icon: 'user',
    color: '#2a78d6',
    nature: 'lifestyle',
    split: 'memberA',
  },
  {
    key: 'impostos',
    name: 'Impostos e taxas',
    kind: 'expense',
    icon: 'receipt',
    color: '#6250d6',
    nature: 'essential',
  },
  {
    key: 'casamento',
    name: 'Casamento',
    kind: 'expense',
    icon: 'rings',
    color: '#e87ba4',
    nature: 'future',
  },
  {
    key: 'casa-nova',
    name: 'Casa nova',
    kind: 'expense',
    icon: 'key',
    color: '#008300',
    nature: 'future',
  },
  {
    key: 'salario',
    name: 'Salário',
    kind: 'income',
    icon: 'money',
    color: '#1baf7a',
    nature: 'essential',
  },
  {
    key: 'freela',
    name: 'Freela',
    kind: 'income',
    icon: 'laptop',
    color: '#2a78d6',
    nature: 'lifestyle',
  },
  {
    key: 'bonus',
    name: 'Bônus',
    kind: 'income',
    icon: 'star',
    color: '#eda100',
    nature: 'lifestyle',
  },
  {
    key: '13o',
    name: '13º',
    kind: 'income',
    icon: 'calendar',
    color: '#eb6834',
    nature: 'lifestyle',
  },
  {
    key: 'rendimentos',
    name: 'Rendimentos',
    kind: 'income',
    icon: 'chart',
    color: '#6250d6',
    nature: 'future',
  },
  {
    key: 'outros-receita',
    name: 'Outros',
    kind: 'income',
    icon: 'dots',
    color: '#e87ba4',
    nature: 'lifestyle',
  },
];

/** Balance adjustments need a category to satisfy the model, but must stay out of every list. */
export const ADJUSTMENT_CATEGORY_NAME = 'Ajuste de saldo';

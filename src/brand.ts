/**
 * Display identity. Renaming the app means changing this file only:
 * technical identifiers (`duo-backup`, `duo-changeset`, the database name) never follow the brand.
 */
export const BRAND = {
  name: 'Meu Bem',
  shortName: 'Meu Bem',
  description: 'As finanças de vocês dois, divididas de um jeito justo.',
  /** Slug used in file names the user sees, such as exports. */
  fileSlug: 'meu-bem',
  themeColorLight: '#F7F3EE',
  themeColorDark: '#141013',
} as const;

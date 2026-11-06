import { z } from 'zod';

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const SETTINGS_ID = 'settings';

export const SettingsSchema = z.strictObject({
  id: z.literal(SETTINGS_ID),
  theme: ThemeModeSchema,
  hideValues: z.boolean(),
  installGuideDismissed: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  id: SETTINGS_ID,
  theme: 'system',
  hideValues: false,
  installGuideDismissed: false,
};

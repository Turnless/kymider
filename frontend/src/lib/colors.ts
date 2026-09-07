export const borrowerTheme = {
  bg: '#FFF7EB',
  surface: '#000000',
  secondary: '#D46D25',
  text: '#0F172A',
  textLight: '#F8FAFC',
} as const;

export const lenderTheme = {
  bg: '#F9F0E0',
  surface: '#000000',
  secondary: '#D46D25',
  text: '#0F172A',
  textLight: '#F8FAFC',
} as const;

export type Theme = typeof borrowerTheme;

export const COLORS = {
  primary: '#02465B',
  primaryLight: '#E8F0F5',
  primaryMedium: '#2C5F7A',
  primaryDark: '#012B3A',
  accent: '#F5CA93',
  accentLight: '#FDF0E6',
  background: '#F7FAFC',
  surface: '#FFFFFF',
  text: '#02465B',
  textSecondary: '#5A7D8A',
  textMuted: '#8DA5B0',
  border: '#D1E0E8',
  borderLight: '#E8EFF3',
  success: '#4A9C6D',
  warning: '#D4A84B',
  error: '#C26565',
};

// School → classes mapping (extend as needed)
// The hardcoded school -> class list that used to live here is gone: schools,
// classes and streams are database tables now. Read them through
// lib/entities/classes.ts (listSchoolsDirectory) instead of a constant that
// silently goes stale the moment a school renames a class.
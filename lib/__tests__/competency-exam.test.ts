import { describe, it, expect } from 'vitest';
import {
  competencyExamName,
  competencyExamTitle,
  competencyResultFromScore,
  competencyScore,
  isCompetencyExamTitle,
} from '@/lib/competency-exam';

describe('competency exam scoring rule', () => {
  it('awards 100 / 70 / 0', () => {
    expect(competencyScore('completed')).toBe(100);
    expect(competencyScore('incomplete')).toBe(70);
    expect(competencyScore('absent')).toBe(0);
  });

  it('reads stored marks back as the same result', () => {
    expect(competencyResultFromScore(100, 100)).toBe('completed');
    expect(competencyResultFromScore(70, 100)).toBe('incomplete');
    expect(competencyResultFromScore(0, 100)).toBe('absent');
  });

  it('does not relabel a mark that is not one of the three', () => {
    expect(competencyResultFromScore(65, 100)).toBeNull();
    expect(competencyResultFromScore(null, 100)).toBeNull();
    expect(competencyResultFromScore(50, 0)).toBeNull();
  });

  it('round-trips exam names through the title convention', () => {
    const title = competencyExamTitle('  Excel practical ');
    expect(title).toBe('Competency Exam: Excel practical');
    expect(isCompetencyExamTitle(title)).toBe(true);
    expect(competencyExamName(title)).toBe('Excel practical');
    expect(isCompetencyExamTitle('Behaviour Rating')).toBe(false);
    expect(isCompetencyExamTitle(null)).toBe(false);
  });
});

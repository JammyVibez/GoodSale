import { describe, expect, it } from 'vitest';
import { initialsFor, renderAvatarSvg } from '@/lib/avatar';

describe('initialsFor', () => {
  it('uses first and last name initials', () => {
    expect(initialsFor('Chinedu Okafor')).toBe('CO');
    expect(initialsFor('Bolanle Akinwande')).toBe('BA');
  });

  it('ignores titles and punctuation', () => {
    expect(initialsFor('Engr. Chinedu Okafor')).toBe('CO');
    expect(initialsFor('Alhaji Musa Danjuma')).toBe('AD');
  });

  it('handles single names and empty input', () => {
    expect(initialsFor('GoodSale')).toBe('GO');
    expect(initialsFor('   ')).toBe('');
  });
});

describe('renderAvatarSvg', () => {
  it('renders the initials on a gradient', () => {
    const svg = renderAvatarSvg('Chinedu Okafor', 'CO');
    expect(svg).toContain('>CO</text>');
    expect(svg).toContain('linearGradient');
  });

  it('falls back to a neutral silhouette when there is no name', () => {
    const svg = renderAvatarSvg('12', '');
    expect(svg).not.toContain('<text');
    expect(svg).toContain('<circle');
  });

  it('escapes markup in the initials', () => {
    const svg = renderAvatarSvg('x', '<b>');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;');
  });

  it('is deterministic per seed', () => {
    expect(renderAvatarSvg('Aisha Suleiman', 'AS')).toBe(renderAvatarSvg('Aisha Suleiman', 'AS'));
    expect(renderAvatarSvg('seed-1', '')).not.toBe(renderAvatarSvg('seed-2', ''));
  });
});

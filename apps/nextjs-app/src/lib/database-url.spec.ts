import { describe, expect, it } from 'vitest';
import { getAppDatabaseUrl } from './database-url';

describe('getAppDatabaseUrl', () => {
  const metaUrl = 'postgresql://meta';
  const legacyUrl = 'postgresql://legacy';
  const env = (values: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv => ({
    NODE_ENV: 'test',
    ...values,
  });

  it('prefers the split meta database url', () => {
    expect(
      getAppDatabaseUrl(
        env({
          PRISMA_META_DATABASE_URL: metaUrl,
          PRISMA_DATABASE_URL: legacyUrl,
        })
      )
    ).toBe(metaUrl);
  });

  it('falls back to the legacy alias and DATABASE_URL', () => {
    expect(getAppDatabaseUrl(env({ PRISMA_DATABASE_URL: legacyUrl }))).toBe(legacyUrl);
    expect(getAppDatabaseUrl(env({ DATABASE_URL: 'postgresql://database-url' }))).toBe(
      'postgresql://database-url'
    );
  });

  it('uses the data db as a last-resort safety net', () => {
    expect(getAppDatabaseUrl(env({ PRISMA_DATA_DATABASE_URL: 'postgresql://data' }))).toBe(
      'postgresql://data'
    );
  });

  it('throws when no database url exists', () => {
    expect(() => getAppDatabaseUrl(env({}))).toThrow('Missing database url');
  });
});

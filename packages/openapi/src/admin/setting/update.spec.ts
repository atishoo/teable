import { describe, expect, it } from 'vitest';
import {
  aiConfigSchema,
  gatewayApiModelRawSchema,
  getImageModelTagsFromAbility,
  LLMProviderType,
} from './index';

const IMAGE_GENERATION_TAG = 'image-generation';

describe('setting index exports', () => {
  it('re-exports model ability helpers from the setting barrel', () => {
    expect(
      getImageModelTagsFromAbility(
        {
          generation: true,
          imageToImage: true,
        },
        undefined
      )
    ).toEqual([IMAGE_GENERATION_TAG, 'vision']);
  });

  it('accepts current AI Gateway image model providers', () => {
    expect(
      gatewayApiModelRawSchema.parse({
        id: 'prodia/flux-fast-schnell',
        type: 'image',
        owned_by: 'prodia',
        tags: [IMAGE_GENERATION_TAG],
      }).owned_by
    ).toBe('prodia');
    expect(
      gatewayApiModelRawSchema.parse({
        id: 'recraft/recraft-v4-pro',
        type: 'image',
        owned_by: 'recraft',
        tags: [IMAGE_GENERATION_TAG],
      }).owned_by
    ).toBe('recraft');
  });

  it('rejects duplicate LLM provider names for the same provider type', () => {
    const result = aiConfigSchema.safeParse({
      llmProviders: [
        {
          type: LLMProviderType.OPENAI,
          name: 'default',
          models: 'gpt-4o',
        },
        {
          type: LLMProviderType.OPENAI,
          name: ' DEFAULT ',
          models: 'gpt-4.1',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['llmProviders', 1, 'name'],
      message: 'Provider name must be unique for the selected provider type',
    });
  });

  it('allows the same LLM provider name across different provider types', () => {
    expect(() =>
      aiConfigSchema.parse({
        llmProviders: [
          {
            type: LLMProviderType.OPENAI,
            name: 'default',
            models: 'gpt-4o',
          },
          {
            type: LLMProviderType.ANTHROPIC,
            name: 'default',
            models: 'claude-sonnet-4',
          },
        ],
      })
    ).not.toThrow();
  });
});

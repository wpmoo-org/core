export type MessageTree = Readonly<Record<string, unknown>>;

export type LocaleMessageLoader = (locale: string) => Promise<MessageTree>;

export type CachedLocaleMessageLoaderOptions = Readonly<{
  defaultLocale: string;
  loadMessages: LocaleMessageLoader;
}>;

export function createCachedLocaleMessageLoader(
  options: CachedLocaleMessageLoaderOptions
): LocaleMessageLoader {
  const cache = new Map<string, Promise<MessageTree>>();

  return async (locale) => {
    const cached = cache.get(locale);

    if (cached !== undefined) {
      return cached;
    }

    const loading = loadMergedLocaleMessages(options, locale).catch((error: unknown) => {
      cache.delete(locale);
      throw error;
    });

    cache.set(locale, loading);

    return loading;
  };
}

export function deepMergeMessages(
  baseMessages: MessageTree,
  localeMessages: MessageTree
): MessageTree {
  const merged: Record<string, unknown> = { ...baseMessages };

  for (const [key, value] of Object.entries(localeMessages)) {
    const baseValue = merged[key];

    if (isMessageTree(baseValue) && isMessageTree(value)) {
      merged[key] = deepMergeMessages(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

async function loadMergedLocaleMessages(
  options: CachedLocaleMessageLoaderOptions,
  locale: string
): Promise<MessageTree> {
  const baseMessages = await options.loadMessages(options.defaultLocale);

  if (locale === options.defaultLocale) {
    return baseMessages;
  }

  return deepMergeMessages(baseMessages, await options.loadMessages(locale));
}

function isMessageTree(value: unknown): value is MessageTree {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

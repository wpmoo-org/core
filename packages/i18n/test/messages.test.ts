import { describe, expect, it, vi } from "vitest";
import {
  createCachedLocaleMessageLoader,
  deepMergeMessages,
  type MessageTree
} from "../src/index.js";

describe("@wpmoo/i18n messages", () => {
  it("deep-merges locale messages over English fallback messages", () => {
    expect(
      deepMergeMessages(
        {
          auth: {
            login: "Log in",
            register: "Register"
          },
          common: {
            save: "Save"
          }
        },
        {
          auth: {
            login: "Anmelden"
          }
        }
      )
    ).toEqual({
      auth: {
        login: "Anmelden",
        register: "Register"
      },
      common: {
        save: "Save"
      }
    });
  });

  it("caches merged messages once per locale", async () => {
    const messages = new Map<string, MessageTree>([
      [
        "en",
        {
          auth: {
            login: "Log in",
            register: "Register"
          }
        }
      ],
      [
        "de",
        {
          auth: {
            login: "Anmelden"
          }
        }
      ]
    ]);
    const loadMessages = vi.fn(async (locale: string) => messages.get(locale) ?? {});
    const loadCachedMessages = createCachedLocaleMessageLoader({
      defaultLocale: "en",
      loadMessages
    });

    await expect(loadCachedMessages("de")).resolves.toEqual({
      auth: {
        login: "Anmelden",
        register: "Register"
      }
    });
    await expect(loadCachedMessages("de")).resolves.toEqual({
      auth: {
        login: "Anmelden",
        register: "Register"
      }
    });

    expect(loadMessages).toHaveBeenCalledTimes(2);
    expect(loadMessages).toHaveBeenNthCalledWith(1, "en");
    expect(loadMessages).toHaveBeenNthCalledWith(2, "de");
  });

  it("evicts failed locale loads so transient failures can retry", async () => {
    const loadMessages = vi
      .fn<Parameters<typeof createCachedLocaleMessageLoader>[0]["loadMessages"]>()
      .mockRejectedValueOnce(new Error("temporary import failure"))
      .mockResolvedValueOnce({
        common: {
          save: "Save"
        }
      });
    const loadCachedMessages = createCachedLocaleMessageLoader({
      defaultLocale: "en",
      loadMessages
    });

    await expect(loadCachedMessages("en")).rejects.toThrow("temporary import failure");
    await expect(loadCachedMessages("en")).resolves.toEqual({
      common: {
        save: "Save"
      }
    });

    expect(loadMessages).toHaveBeenCalledTimes(2);
  });
});

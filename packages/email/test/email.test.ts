import { describe, expect, it } from "vitest";
import {
  createEmailConfig,
  createMailpitEmailProvider,
  type EmailMessage,
  type EmailTransport
} from "../src/index.js";

describe("@wpmoo/email", () => {
  it("defaults to the local Mailpit SMTP configuration", () => {
    expect(createEmailConfig({})).toEqual({
      provider: "mailpit",
      from: "noreply@localhost",
      smtp: {
        host: "localhost",
        port: 1025,
        user: "",
        pass: ""
      }
    });
  });

  it("rejects non-Mailpit providers until production adapters are added", () => {
    expect(() =>
      createEmailConfig({
        EMAIL_PROVIDER: "brevo"
      })
    ).toThrow("Only EMAIL_PROVIDER=mailpit is supported in this phase.");
  });

  it("sends through the configured local transport", async () => {
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = {
      async send(message) {
        sent.push(message);

        return {
          providerMessageId: "mailpit-local-1"
        };
      }
    };
    const provider = createMailpitEmailProvider({
      config: createEmailConfig({
        EMAIL_FROM: "security@example.test",
        SMTP_HOST: "mailpit",
        SMTP_PORT: "2525"
      }),
      transport
    });

    await expect(
      provider.send({
        to: ["admin@example.test"],
        subject: "Verify your email",
        text: "Use this one-time link.",
        html: "<p>Use this one-time link.</p>"
      })
    ).resolves.toEqual({
      provider: "mailpit",
      providerMessageId: "mailpit-local-1"
    });
    expect(sent).toEqual([
      {
        from: "security@example.test",
        to: ["admin@example.test"],
        subject: "Verify your email",
        text: "Use this one-time link.",
        html: "<p>Use this one-time link.</p>"
      }
    ]);
  });
});

import { createConnection, type Socket } from "node:net";

export type EmailProviderKind = "mailpit";

export type EmailConfig = Readonly<{
  provider: EmailProviderKind;
  from: string;
  smtp: Readonly<{
    host: string;
    port: number;
    user: string;
    pass: string;
  }>;
}>;

export type EmailMessage = Readonly<{
  from?: string;
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
}>;

export type EmailSendResult = Readonly<{
  provider: EmailProviderKind;
  providerMessageId: string | null;
}>;

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type EmailTransportResult = Readonly<{
  providerMessageId: string | null;
}>;

export interface EmailTransport {
  send(message: EmailMessage, config: EmailConfig): Promise<EmailTransportResult>;
}

export type MailpitEmailProviderOptions = Readonly<{
  config: EmailConfig;
  transport?: EmailTransport;
}>;

export function createEmailConfig(
  runtimeEnv: Record<string, string | undefined>
): EmailConfig {
  const provider = runtimeEnv.EMAIL_PROVIDER ?? "mailpit";

  if (provider !== "mailpit") {
    throw new Error("Only EMAIL_PROVIDER=mailpit is supported in this phase.");
  }

  return {
    provider,
    from: runtimeEnv.EMAIL_FROM ?? "noreply@localhost",
    smtp: {
      host: runtimeEnv.SMTP_HOST ?? "localhost",
      port: parseSmtpPort(runtimeEnv.SMTP_PORT),
      user: runtimeEnv.SMTP_USER ?? "",
      pass: runtimeEnv.SMTP_PASS ?? ""
    }
  };
}

export class MailpitEmailProvider implements EmailProvider {
  readonly #config: EmailConfig;
  readonly #transport: EmailTransport;

  constructor(options: MailpitEmailProviderOptions) {
    this.#config = options.config;
    this.#transport = options.transport ?? new SmtpEmailTransport();
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const normalizedMessage = {
      ...message,
      from: message.from ?? this.#config.from
    };
    const result = await this.#transport.send(normalizedMessage, this.#config);

    return {
      provider: this.#config.provider,
      providerMessageId: result.providerMessageId
    };
  }
}

export function createMailpitEmailProvider(
  options: MailpitEmailProviderOptions
): EmailProvider {
  return new MailpitEmailProvider(options);
}

class SmtpEmailTransport implements EmailTransport {
  async send(message: EmailMessage, config: EmailConfig): Promise<EmailTransportResult> {
    await sendSmtpMessage(message, config);

    return {
      providerMessageId: null
    };
  }
}

function parseSmtpPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) {
    return 1025;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

async function sendSmtpMessage(
  message: EmailMessage,
  config: EmailConfig
): Promise<void> {
  const socket = createConnection({
    host: config.smtp.host,
    port: config.smtp.port
  });

  await readUntil(socket, "220");
  await writeCommand(socket, `HELO localhost\r\n`, "250");
  await writeCommand(socket, `MAIL FROM:<${message.from ?? config.from}>\r\n`, "250");

  for (const recipient of message.to) {
    await writeCommand(socket, `RCPT TO:<${recipient}>\r\n`, "250");
  }

  await writeCommand(socket, "DATA\r\n", "354");
  socket.write(formatSmtpMessage(message, config));
  await readUntil(socket, "250");
  await writeCommand(socket, "QUIT\r\n", "221");
  socket.end();
}

function formatSmtpMessage(message: EmailMessage, config: EmailConfig): string {
  const from = message.from ?? config.from;
  const htmlPart = message.html === undefined ? "" : `\r\n${message.html}\r\n`;

  return `${[
    `From: ${from}`,
    `To: ${message.to.join(", ")}`,
    `Subject: ${message.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    message.text,
    htmlPart,
    "."
  ].join("\r\n")}\r\n`;
}

async function writeCommand(
  socket: Socket,
  command: string,
  expectedPrefix: string
): Promise<void> {
  socket.write(command);
  await readUntil(socket, expectedPrefix);
}

function readUntil(socket: Socket, expectedPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const line = chunk.toString("utf8");

      if (line.startsWith(expectedPrefix)) {
        cleanup();
        resolve();
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

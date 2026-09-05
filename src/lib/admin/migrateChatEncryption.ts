import "server-only";
import { prisma } from "../db";
import {
  classifyProtectedField,
  decryptProtectedField,
  encryptProtectedField,
  type ProtectedFieldClassification,
  type ProtectedFieldPurpose,
} from "../protectedField";

type StatusCounts = Record<ProtectedFieldClassification, number>;

export interface ChatEncryptionInspection {
  sessions: number;
  messages: number;
  titles: StatusCounts;
  contents: StatusCounts;
  thoughts: StatusCounts & { empty: number };
}

export interface ChatEncryptionMigrationResult {
  sessions: number;
  messages: number;
  migratedSessions: number;
  migratedMessages: number;
  alreadyEncrypted: number;
  malformedOrUnreadable: number;
  casSkipped: number;
  errors: number;
  dryRun: boolean;
}

function emptyStatusCounts(): StatusCounts {
  return { encrypted: 0, plaintext: 0, malformed: 0, unreadable: 0 };
}

function countStatus(
  counts: StatusCounts,
  value: string,
  purpose: ProtectedFieldPurpose
): ProtectedFieldClassification {
  const status = classifyProtectedField(value, purpose);
  counts[status]++;
  return status;
}

export async function inspectChatEncryption(
  db: typeof prisma = prisma
): Promise<ChatEncryptionInspection> {
  const [sessions, messages] = await Promise.all([
    db.chatSession.findMany({ select: { title: true } }),
    db.chatMessage.findMany({ select: { content: true, thought: true } }),
  ]);

  const titles = emptyStatusCounts();
  const contents = emptyStatusCounts();
  const thoughts = { ...emptyStatusCounts(), empty: 0 };

  for (const session of sessions) {
    countStatus(titles, session.title, "chat-session-title");
  }

  for (const message of messages) {
    countStatus(contents, message.content, "chat-message-content");
    if (message.thought === null) {
      thoughts.empty++;
    } else {
      countStatus(thoughts, message.thought, "chat-message-thought");
    }
  }

  return {
    sessions: sessions.length,
    messages: messages.length,
    titles,
    contents,
    thoughts,
  };
}

export async function migrateChatEncryption(
  options: { dryRun?: boolean; confirmed?: boolean } = {},
  db: typeof prisma = prisma
): Promise<ChatEncryptionMigrationResult> {
  const dryRun = options.dryRun !== false;
  if (!dryRun && !options.confirmed) {
    throw new Error("Live chat encryption requires explicit confirmed: true.");
  }

  const [sessions, messages] = await Promise.all([
    db.chatSession.findMany({ select: { id: true, title: true } }),
    db.chatMessage.findMany({ select: { id: true, content: true, thought: true } }),
  ]);

  let migratedSessions = 0;
  let migratedMessages = 0;
  let alreadyEncrypted = 0;
  let malformedOrUnreadable = 0;
  let casSkipped = 0;
  let errors = 0;

  for (const session of sessions) {
    try {
      const status = classifyProtectedField(session.title, "chat-session-title");
      if (status === "malformed" || status === "unreadable") {
        malformedOrUnreadable++;
        continue;
      }
      if (status === "encrypted") {
        alreadyEncrypted++;
        continue;
      }

      const encryptedTitle = encryptProtectedField(session.title, "chat-session-title");
      if (decryptProtectedField(encryptedTitle, "chat-session-title") !== session.title) {
        throw new Error("Chat title roundtrip verification failed.");
      }

      if (!dryRun) {
        const updated = await db.chatSession.updateMany({
          where: { id: session.id, title: session.title },
          data: { title: encryptedTitle },
        });
        if (updated.count !== 1) {
          casSkipped++;
          continue;
        }
      }
      migratedSessions++;
    } catch {
      errors++;
    }
  }

  for (const message of messages) {
    try {
      const contentStatus = classifyProtectedField(message.content, "chat-message-content");
      const thoughtStatus = message.thought === null
        ? "encrypted"
        : classifyProtectedField(message.thought, "chat-message-thought");

      if (
        contentStatus === "malformed" ||
        contentStatus === "unreadable" ||
        thoughtStatus === "malformed" ||
        thoughtStatus === "unreadable"
      ) {
        malformedOrUnreadable++;
        continue;
      }
      if (contentStatus === "encrypted" && thoughtStatus === "encrypted") {
        alreadyEncrypted++;
        continue;
      }

      const encryptedContent = encryptProtectedField(message.content, "chat-message-content");
      const encryptedThought = message.thought === null
        ? null
        : encryptProtectedField(message.thought, "chat-message-thought");

      if (
        decryptProtectedField(encryptedContent, "chat-message-content") !== message.content ||
        (encryptedThought !== null &&
          decryptProtectedField(encryptedThought, "chat-message-thought") !== message.thought)
      ) {
        throw new Error("Chat message roundtrip verification failed.");
      }

      if (!dryRun) {
        const updated = await db.chatMessage.updateMany({
          where: { id: message.id, content: message.content, thought: message.thought },
          data: { content: encryptedContent, thought: encryptedThought },
        });
        if (updated.count !== 1) {
          casSkipped++;
          continue;
        }
      }
      migratedMessages++;
    } catch {
      errors++;
    }
  }

  return {
    sessions: sessions.length,
    messages: messages.length,
    migratedSessions,
    migratedMessages,
    alreadyEncrypted,
    malformedOrUnreadable,
    casSkipped,
    errors,
    dryRun,
  };
}

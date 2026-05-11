import type { Message } from '../types';

export interface GroupedMessage {
  id: string;
  content: string;
  timestamp: string;
  senderType: string;
}

export interface MessageGroup {
  id: string;
  senderType: string;
  timestamp: string;
  messages: GroupedMessage[];
}

export interface DatedGroup {
  dateKey: string;
  label: string;
  groups: MessageGroup[];
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Group messages by date and by consecutive sender within 2 minutes.
 * Assumes messages are in chronological order (oldest first).
 */
export function groupMessagesByDateAndSender(
  messages: Message[],
): DatedGroup[] {
  if (!messages.length) return [];

  const result: DatedGroup[] = [];

  for (const msg of messages) {
    const msgDate = new Date(msg.timestamp);
    const dateKey = msgDate.toISOString().slice(0, 10);
    let dateGroup = result.find((g) => g.dateKey === dateKey);

    if (!dateGroup) {
      dateGroup = {
        dateKey,
        label: getDateLabel(msgDate),
        groups: [],
      };
      result.push(dateGroup);
    }

    const lastGroup = dateGroup.groups[dateGroup.groups.length - 1];
    const lastMessage = lastGroup?.messages[lastGroup.messages.length - 1];

    const withinTwoMinutes =
      lastMessage &&
      msg.senderType === lastGroup.senderType &&
      Math.abs(
        new Date(msg.timestamp).getTime() -
          new Date(lastMessage.timestamp).getTime(),
      ) <=
        2 * 60 * 1000;

    if (!lastGroup || !withinTwoMinutes) {
      dateGroup.groups.push({
        id: msg.id,
        senderType: msg.senderType,
        timestamp: msg.timestamp,
        messages: [
          {
            id: msg.id,
            content: msg.content,
            timestamp: msg.timestamp,
            senderType: msg.senderType,
          },
        ],
      });
    } else {
      lastGroup.messages.push({
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        senderType: msg.senderType,
      });
    }
  }

  return result;
}



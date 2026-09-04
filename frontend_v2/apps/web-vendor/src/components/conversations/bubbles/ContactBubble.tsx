import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { bubbleLinkClass, innerCardClass } from './shared/bubbleChrome';

interface ContactBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

interface ContactCard {
  name?: string;
  phones: { phone: string; type?: string }[];
  emails?: { email: string; type?: string }[];
  organization?: string;
}

function readContacts(message: Message): ContactCard[] {
  const p = message.structuredPayload ?? {};
  const list = Array.isArray(p.contacts) ? (p.contacts as Record<string, unknown>[]) : [];
  return list.map((c) => {
    const nameField = (c.name ?? {}) as Record<string, unknown>;
    const phones = Array.isArray(c.phones) ? (c.phones as Record<string, unknown>[]) : [];
    const emails = Array.isArray(c.emails) ? (c.emails as Record<string, unknown>[]) : [];
    const orgField = (c.org ?? {}) as Record<string, unknown>;
    return {
      name:
        (typeof nameField.formatted_name === 'string' && nameField.formatted_name) ||
        (typeof nameField.first_name === 'string' && nameField.first_name) ||
        undefined,
      phones: phones
        .map((ph) => ({
          phone: typeof ph.phone === 'string' ? ph.phone : '',
          type: typeof ph.type === 'string' ? ph.type : undefined,
        }))
        .filter((ph) => ph.phone),
      emails: emails
        .map((em) => ({
          email: typeof em.email === 'string' ? em.email : '',
          type: typeof em.type === 'string' ? em.type : undefined,
        }))
        .filter((em) => em.email),
      organization: typeof orgField.company === 'string' ? orgField.company : undefined,
    };
  });
}

function ContactBubbleComponent({ message, onJumpToMessage }: ContactBubbleProps) {
  const { t } = useTranslation('conversations');
  const contacts = readContacts(message);

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      <div className="flex flex-col gap-2">
        {contacts.length === 0 ? (
          <div className="text-xs italic text-[#667781]">{message.content || '—'}</div>
        ) : null}
        {contacts.map((c, idx) => {
          const primaryPhone = c.phones[0]?.phone;
          return (
            <div key={idx} className={`rounded-lg p-2.5 ${innerCardClass()}`}>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#072349] text-sm font-semibold text-white"
                >
                  {(c.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  {c.name ? <div className="truncate font-medium">{c.name}</div> : null}
                  {c.organization ? (
                    <div className="truncate text-xs text-[#667781]">{c.organization}</div>
                  ) : null}
                  {primaryPhone ? (
                    <div className="tabular-nums text-xs">{primaryPhone}</div>
                  ) : null}
                </div>
              </div>
              {primaryPhone ? (
                <div className="mt-2 flex gap-3">
                  <a href={`tel:${primaryPhone}`} className={`text-xs font-medium ${bubbleLinkClass()}`}>
                    {t('contact.callPhone')}
                  </a>
                  <a
                    href={`https://wa.me/${primaryPhone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs font-medium ${bubbleLinkClass()}`}
                  >
                    {t('contact.messageOnWhatsApp')}
                  </a>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </MessageShell>
  );
}

export const ContactBubble = memo(ContactBubbleComponent);

import fetch from 'node-fetch';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import {
  isInvalidQuoteContextError,
  parseGraphErrorBody,
  WhatsAppSendError
} from './whatsappSendErrors.js';

// Overridable so load tests can point both at a mock Graph API
// (docs/LOAD_TESTING.md §5). config/env.ts supplies these same literals as Zod
// defaults; the `??` keeps the real endpoint visible at the point of use and
// keeps partial `env` test doubles working.
const BASE_URL = env.WHATSAPP_GRAPH_BASE_URL ?? 'https://graph.facebook.com/v18.0';
const TYPING_GRAPH_BASE = env.WHATSAPP_TYPING_GRAPH_BASE_URL ?? 'https://graph.facebook.com/v21.0';
const TYPING_TIMEOUT_MS = 800;

export interface WhatsAppSendResult {
  messageId: string;
}

async function postToGraph(targetPhoneNumberId: string, body: any): Promise<WhatsAppSendResult> {
  const url = `${BASE_URL}/${targetPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errBody = await res.text();
    const parsed = parseGraphErrorBody(errBody);
    const invalidQuote = isInvalidQuoteContextError(
      res.status,
      parsed.graphCode,
      parsed.graphSubcode,
      parsed.message
    );
    logger.error(
      { status: res.status, body: errBody, payloadType: body?.type, invalidQuote },
      'Failed to send WhatsApp message'
    );
    throw new WhatsAppSendError(`WhatsApp send failed: ${res.status}`, res.status, {
      graphCode: parsed.graphCode,
      graphSubcode: parsed.graphSubcode,
      isInvalidQuoteContext: invalidQuote
    });
  }
  const json = (await res.json()) as { messages?: Array<{ id?: string }> };
  const messageId = json.messages?.[0]?.id;
  if (!messageId) {
    throw new Error('WhatsApp send succeeded but messageId missing from response');
  }
  return { messageId };
}

function resolveTargetPhoneNumberId(phoneNumberId?: string): string | null {
  const target = phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  if (!env.WHATSAPP_ACCESS_TOKEN || !target) {
    logger.error(
      {
        hasToken: !!env.WHATSAPP_ACCESS_TOKEN,
        hasPhoneNumberId: !!target,
        providedPhoneNumberId: phoneNumberId
      },
      'WhatsApp credentials missing; cannot send'
    );
    return null;
  }
  return target;
}

/**
 * Same resolution as resolveTargetPhoneNumberId, but throws instead of
 * returning null. Every actual message-send function below uses this one so
 * a missing phoneNumberId fails loudly -- callers (e.g. responseProcessor.ts)
 * already catch send errors, mark the message failed, and let SQS retry.
 * Silently returning undefined here previously let a failed send get logged
 * and deleted from the queue as if it had succeeded. sendTypingIndicator is
 * the one deliberate exception (see its docstring) and keeps calling
 * resolveTargetPhoneNumberId directly.
 */
function requireTargetPhoneNumberId(phoneNumberId?: string): string {
  const target = resolveTargetPhoneNumberId(phoneNumberId);
  if (!target) {
    throw new Error(
      'WhatsApp send failed: credentials not configured (missing access token, or no phoneNumberId from the message and no WHATSAPP_PHONE_NUMBER_ID env fallback)'
    );
  }
  return target;
}

/**
 * Mark an inbound message as read (customer blue ticks) and show a typing
 * indicator. Meta fuses both in one payload — there is no typing-only API.
 * Never throws; failures are logged and returned as `{ ok: false }`.
 */
export async function sendTypingIndicator(
  whatsappMessageId: string,
  phoneNumberId?: string
): Promise<{ ok: boolean }> {
  const target = resolveTargetPhoneNumberId(phoneNumberId);
  if (!target) {
    return { ok: false };
  }

  const url = `${TYPING_GRAPH_BASE}/${target}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: whatsappMessageId,
    typing_indicator: { type: 'text' }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TYPING_TIMEOUT_MS)
    });

    if (!res.ok) {
      const errBody = await res.text();
      logger.warn(
        {
          status: res.status,
          body: errBody.slice(0, 500),
          whatsappMessageId,
          phoneNumberId: target
        },
        'WhatsApp typing indicator request failed'
      );
      return { ok: false };
    }

    try {
      const json = (await res.json()) as { success?: boolean } | null;
      if (json && json.success === false) {
        logger.warn(
          {
            status: res.status,
            body: JSON.stringify(json).slice(0, 500),
            whatsappMessageId,
            phoneNumberId: target
          },
          'WhatsApp typing indicator request failed'
        );
        return { ok: false };
      }
    } catch {
      // 2xx with empty or non-JSON body is acceptable — do not require messages[0].id
    }

    return { ok: true };
  } catch (error) {
    logger.warn(
      { err: error, whatsappMessageId, phoneNumberId: target },
      'WhatsApp typing indicator request error'
    );
    return { ok: false };
  }
}

export async function sendWhatsAppText(
  to: string,
  text: string,
  phoneNumberId?: string,
  options?: { replyToWhatsappMessageId?: string }
): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(phoneNumberId);
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  };
  if (options?.replyToWhatsappMessageId) {
    payload.context = { message_id: options.replyToWhatsappMessageId };
  }
  return postToGraph(target, payload);
}

interface MediaSendInput {
  to: string;
  link?: string;
  mediaId?: string;
  caption?: string;
  filename?: string;
  phoneNumberId?: string;
}

function buildMediaPayload(kind: 'image' | 'audio' | 'video' | 'document' | 'sticker', input: MediaSendInput) {
  if (!input.mediaId && !input.link) {
    throw new Error('WhatsApp media send requires mediaId or link');
  }
  const inner: Record<string, any> = {};
  if (input.mediaId) inner.id = input.mediaId;
  else if (input.link) inner.link = input.link;
  if (input.caption && (kind === 'image' || kind === 'video' || kind === 'document')) {
    inner.caption = input.caption;
  }
  if (input.filename && kind === 'document') inner.filename = input.filename;
  return {
    messaging_product: 'whatsapp',
    to: input.to,
    type: kind,
    [kind]: inner
  };
}

/**
 * Upload bytes to WhatsApp-hosted media (preferred over `link` for catalog product media).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export async function uploadWhatsAppMedia(
  phoneNumberId: string,
  mimeType: string,
  body: Buffer,
  filename: string
): Promise<{ mediaId: string }> {
  const target = requireTargetPhoneNumberId(phoneNumberId);
  const url = `${BASE_URL}/${target}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([body], { type: mimeType }), filename);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`
    },
    body: form
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error(
      { status: res.status, body: errBody, mimeType, sizeBytes: body.byteLength, phoneNumberId: target },
      'Failed to upload WhatsApp media'
    );
    throw new WhatsAppSendError(`WhatsApp media upload failed: ${res.status}`, res.status, {
      graphCode: parseGraphErrorBody(errBody).graphCode,
      graphSubcode: parseGraphErrorBody(errBody).graphSubcode,
      isInvalidQuoteContext: false
    });
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new Error('WhatsApp media upload succeeded but id missing from response');
  }
  return { mediaId: json.id };
}

export async function sendWhatsAppImage(input: MediaSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, buildMediaPayload('image', input));
}

export async function sendWhatsAppAudio(input: MediaSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, buildMediaPayload('audio', input));
}

export async function sendWhatsAppVideo(input: MediaSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, buildMediaPayload('video', input));
}

export async function sendWhatsAppDocument(input: MediaSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, buildMediaPayload('document', input));
}

export async function sendWhatsAppSticker(input: MediaSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, buildMediaPayload('sticker', input));
}

export interface LocationSendInput {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  phoneNumberId?: string;
}

export async function sendWhatsAppLocation(input: LocationSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'location',
    location: {
      latitude: input.latitude,
      longitude: input.longitude,
      name: input.name,
      address: input.address
    }
  });
}

export interface ContactSendInput {
  to: string;
  contacts: Array<Record<string, any>>;
  phoneNumberId?: string;
}

export async function sendWhatsAppContacts(input: ContactSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'contacts',
    contacts: input.contacts
  });
}

export interface InteractiveSendInput {
  to: string;
  interactive: Record<string, any>;
  phoneNumberId?: string;
}

export async function sendWhatsAppInteractive(input: InteractiveSendInput): Promise<WhatsAppSendResult | undefined> {
  const target = requireTargetPhoneNumberId(input.phoneNumberId);
  return postToGraph(target, {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'interactive',
    interactive: input.interactive
  });
}

/**
 * Send WhatsApp template message
 * @param to - Customer phone number (E.164 format: +919876543210)
 * @param templateName - WhatsApp Business API template name
 * @param languageCode - Template language code (default: 'en')
 * @param parameters - Template parameters (body, header, buttons)
 * @param phoneNumberId - Optional phone number ID (uses env default if not provided)
 * @returns Message ID from WhatsApp API
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'en',
  parameters: {
    body?: Array<{ type: 'text'; text: string }>;
    header?: Array<{ type: 'text' | 'image' | 'document'; text?: string; image?: { link: string }; document?: { link: string; filename: string } }>;
    buttons?: Array<{ type: 'url'; text: string; url: string }>;
  },
  phoneNumberId?: string
): Promise<{ messageId: string }> {
  const targetPhoneNumberId = phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  
  if (!env.WHATSAPP_ACCESS_TOKEN || !targetPhoneNumberId) {
    logger.error({ 
      hasToken: !!env.WHATSAPP_ACCESS_TOKEN, 
      hasPhoneNumberId: !!targetPhoneNumberId,
      providedPhoneNumberId: phoneNumberId 
    }, 'WhatsApp credentials missing; skipping template send');
    throw new Error('WhatsApp credentials not configured');
  }
  
  const url = `${BASE_URL}/${targetPhoneNumberId}/messages`;
  
  const components: any[] = [];
  
  // Add header parameters if provided
  if (parameters.header && parameters.header.length > 0) {
    components.push({
      type: 'header',
      parameters: parameters.header
    });
  }
  
  // Add body parameters
  if (parameters.body && parameters.body.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters.body
    });
  }
  
  // Add button parameters
  if (parameters.buttons && parameters.buttons.length > 0) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: parameters.buttons.map(btn => ({
        type: 'text',
        text: btn.url
      }))
    });
  }
  
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components
    }
  };
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const body = await res.text();
    let errorBody: any;
    try {
      errorBody = JSON.parse(body);
    } catch {
      errorBody = { raw: body };
    }
    
    // Check if template doesn't exist (404 error)
    if (res.status === 404 && errorBody?.error?.code === 132001) {
      logger.warn({ 
        status: res.status, 
        templateName, 
        to,
        phoneNumberId: targetPhoneNumberId,
        errorMessage: errorBody?.error?.message || 'Template does not exist',
        errorDetails: errorBody?.error?.error_data
      }, 'WhatsApp template does not exist - template needs to be created and approved in WhatsApp Business Manager');
      throw new Error(`WhatsApp template "${templateName}" does not exist. Please create and approve the template in WhatsApp Business Manager.`);
    }
    
    logger.error({ 
      status: res.status, 
      body, 
      templateName, 
      to,
      phoneNumberId: targetPhoneNumberId,
      errorBody
    }, 'Failed to send WhatsApp template');
    throw new Error(`WhatsApp template send failed: ${res.status}`);
  }
  
  const response = await res.json() as { messages: Array<{ id: string }> };
  return { messageId: response.messages[0].id };
}



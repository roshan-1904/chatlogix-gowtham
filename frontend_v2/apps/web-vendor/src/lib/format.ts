/**
 * Formatting utilities for conversations and messages
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  if (diffInHours < 24) {
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return diffInMinutes < 1 ? 'Just now' : `${diffInMinutes}m ago`;
    }
    return `${Math.floor(diffInHours)}h ago`;
  } else if (diffInDays < 7) {
    return `${Math.floor(diffInDays)}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format phone number using libphonenumber-js for international support
 * Falls back to simple formatting if parsing fails
 */
export function formatPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return phone;
  }

  // Try to parse and format the phone number
  const phoneNumber = parsePhoneNumberFromString(phone);
  if (phoneNumber?.isValid()) {
    // Format as international: +91 98765 43210
    return phoneNumber.formatInternational();
  }

  // Fallback: Simple formatting for unparseable numbers
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return phone;

  // Add spaces for readability based on length
  if (digits.length <= 10) {
    // 10 digits or less: format as XXXXX XXXXX
    return digits.replace(/(\d{5})(\d{5})/, '$1 $2');
  }

  // For longer numbers, try to format with country code
  if (digits.length > 10 && digits.length <= 15) {
    // Assume last 10 digits are the national number
    const countryCode = digits.slice(0, -10);
    const nationalNumber = digits.slice(-10);
    return `+${countryCode} ${nationalNumber.slice(0, 5)} ${nationalNumber.slice(5)}`;
  }

  // If we can't format it, return as-is
  return phone;
}

/**
 * Strip HTML tags and decode common HTML entities
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replaceAll('&nbsp;', ' ') // Replace &nbsp; with space
    .replaceAll('&amp;', '&') // Replace &amp; with &
    .replaceAll('&lt;', '<') // Replace &lt; with <
    .replaceAll('&gt;', '>') // Replace &gt; with >
    .replaceAll('&quot;', '"') // Replace &quot; with "
    .replaceAll('&#39;', "'") // Replace &#39; with '
    .trim();
}

/**
 * Truncate message content for preview
 */
export function truncateMessage(content: string, maxLength: number = 60): string {
  const plainText = stripHtmlTags(content);
  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength) + '...';
}


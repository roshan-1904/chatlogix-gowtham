import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, Button } from '@chatlogix/ui';
import { useVendorConfig } from '../hooks/useVendorConfig';
import {
  getAllSupportChannels,
  formatDiagnosticsString,
} from '../lib/support';
import {
  IconChat,
  IconCatalog,
  IconFaq,
  IconWallet,
  IconSettings,
  IconWhatsApp,
} from '../components/icons';

const APP_VERSION = '0.1.0';

export function Support() {
  const { data: vendor, isLoading: vendorLoading } = useVendorConfig();
  const [copied, setCopied] = useState(false);

  const channels = getAllSupportChannels();

  const handleCopyDiagnostics = async () => {
    const text = formatDiagnosticsString(vendor);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      toast.success('Diagnostics copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy diagnostics');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Support & Help
        </h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Get direct help with your WhatsApp AI assistant, catalog, or account setup.
        </p>
      </div>

      {/* Direct Contact Cards */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Direct Support Channels
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WhatsApp Primary Contact */}
          {channels.whatsapp && (
            <Card className="p-6 border border-emerald-100 bg-emerald-50/40 hover:border-emerald-200 transition-all shadow-2xs">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                  <IconWhatsApp className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900">Chat on WhatsApp</h3>
                  <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                    Fastest response for urgent assistance, order issues, and onboarding questions.
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-emerald-800">
                      {channels.whatsapp.phone}
                    </span>
                    <a
                      href={channels.whatsapp.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs"
                      >
                        Message on WhatsApp &rarr;
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Email Support Contact */}
          {channels.email && (
            <Card className="p-6 border border-blue-100 bg-blue-50/30 hover:border-blue-200 transition-all shadow-2xs">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                  <span className="text-xl">✉️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900">Email Support</h3>
                  <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                    Send detailed inquiries, invoice requests, or custom catalog enhancement files.
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-blue-900 truncate max-w-[170px] font-medium">
                      {channels.email.email}
                    </span>
                    <a href={channels.email.href}>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border border-blue-200 text-blue-800 hover:bg-blue-100 text-xs"
                      >
                        Send Email &rarr;
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Fallback Help Center if no channels or as additional card */}
          {!channels.whatsapp && !channels.email && (
            <Card className="p-6 border border-gray-200 bg-white">
              <h3 className="text-base font-bold text-gray-900">ChatLogix Help Center</h3>
              <p className="mt-1 text-xs text-gray-600">
                Visit our online contact page for general support and service guides.
              </p>
              <div className="mt-4">
                <a
                  href={channels.fallback.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button size="sm">Visit Contact Page &rarr;</Button>
                </a>
              </div>
            </Card>
          )}
        </div>
        <p className="mt-2.5 text-[11px] text-gray-500 italic">
          Typical response time: within 2–4 hours during business hours (Mon–Sat, 9:00 AM – 7:00 PM IST).
        </p>
      </div>

      {/* Self-Serve Quick Help Links */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Common Questions & Self-Serve Fixes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Queries */}
          <Link to="/queries" className="block group">
            <Card className="p-5 h-full border border-gray-200/90 hover:border-primary-400 hover:shadow-sm transition-all bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
                  <IconChat className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary-600">
                  AI misunderstood a question?
                </h3>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Review real customer questions your assistant couldn't answer and teach it the correct replies.
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-600 group-hover:underline">
                Review Queries &rarr;
              </span>
            </Card>
          </Link>

          {/* 2. Catalog */}
          <Link to="/catalog" className="block group">
            <Card className="p-5 h-full border border-gray-200/90 hover:border-primary-400 hover:shadow-sm transition-all bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <IconCatalog className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary-600">
                  Product price or stock is wrong?
                </h3>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Update prices, descriptions, and toggle products in/out of stock so customers see accurate details.
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-600 group-hover:underline">
                Manage Catalog &rarr;
              </span>
            </Card>
          </Link>

          {/* 3. FAQs */}
          <Link to="/faqs" className="block group">
            <Card className="p-5 h-full border border-gray-200/90 hover:border-primary-400 hover:shadow-sm transition-all bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <IconFaq className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary-600">
                  Store policies or timings changed?
                </h3>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Add store hours, delivery radius, return rules, and payment options to your knowledge base.
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-600 group-hover:underline">
                Update FAQs &rarr;
              </span>
            </Card>
          </Link>

          {/* 4. Wallet */}
          <Link to="/wallet" className="block group">
            <Card className="p-5 h-full border border-gray-200/90 hover:border-primary-400 hover:shadow-sm transition-all bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <IconWallet className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary-600">
                  AI stopped replying to customers?
                </h3>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Check your wallet balance. When funds reach ₹0, assistant responses pause until topped up.
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-600 group-hover:underline">
                Check Wallet Balance &rarr;
              </span>
            </Card>
          </Link>

          {/* 5. WhatsApp Connection */}
          <Link to="/settings/whatsapp" className="block group">
            <Card className="p-5 h-full border border-gray-200/90 hover:border-primary-400 hover:shadow-sm transition-all bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-green-50 text-green-600">
                  <IconWhatsApp className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary-600">
                  WhatsApp connection disconnected?
                </h3>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Verify your Meta WhatsApp Business API connection status and reconnect if needed.
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-600 group-hover:underline">
                WhatsApp Connection &rarr;
              </span>
            </Card>
          </Link>

          {/* 6. Settings */}
          <Link to="/settings" className="block group">
            <Card className="p-5 h-full border border-gray-200/90 hover:border-primary-400 hover:shadow-sm transition-all bg-white">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
                  <IconSettings className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary-600">
                  Shop info, address, or tone?
                </h3>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Configure business information, AI bot personality, greeting messages, and delivery settings.
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary-600 group-hover:underline">
                Store Settings &rarr;
              </span>
            </Card>
          </Link>
        </div>
      </div>

      {/* Account Diagnostics Block */}
      <Card className="p-6 border border-gray-200/80 bg-white shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Account Diagnostics</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Copy and paste this identifier into support chat so we can locate your shop instantly.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyDiagnostics}
            disabled={vendorLoading}
            className="border border-gray-300 self-start sm:self-auto shrink-0 font-medium text-xs"
          >
            {copied ? '✓ Copied to Clipboard' : '📋 Copy Diagnostics'}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Shop Name
            </span>
            <span className="font-semibold text-gray-900 truncate block">
              {vendor?.businessName || (vendorLoading ? 'Loading…' : '—')}
            </span>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Vendor ID
            </span>
            <span className="font-mono text-gray-700 truncate block text-[11px]">
              {vendor?.id || (vendorLoading ? 'Loading…' : '—')}
            </span>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Plan
            </span>
            <span className="capitalize font-semibold text-gray-900 block">
              {vendor?.plan || 'Active'}
            </span>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              App Version
            </span>
            <span className="font-mono font-medium text-gray-700 block">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}


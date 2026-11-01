import { useEffect, useMemo, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card } from '@chatlogix/ui';
import { formatPaiseAsRupees, formatUsdInrRate, parseRupeeInput, rupeesToPaise } from '../lib/money';
import {
  billingDraftHasErrors,
  draftFromSettings,
  getPlatformSettings,
  parseBillingDraft,
  parsePresetRupees,
  refreshUsdInrRate,
  updatePlatformSettings,
  FX_OVERRIDE_MAX,
  FX_OVERRIDE_MIN,
  TRIAL_EXPIRY_DAYS_MAX,
  type BillingDraft,
  type BillingField,
  type BillingFieldErrors,
  type PlatformSettings,
} from '../lib/settings';

const SETTINGS_QUERY_KEY = ['admin-platform-settings'] as const;

const INPUT_CLASS =
  'w-full rounded-lg border bg-white py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  wide?: boolean;
}

function Field({
  id,
  label,
  hint,
  error,
  prefix,
  suffix,
  wide = false,
  className = '',
  ...props
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
      <div className={`relative mt-2 ${wide ? 'max-w-xl' : 'max-w-xs'}`}>
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          autoComplete="off"
          className={`${INPUT_CLASS} ${error ? 'border-red-500' : 'border-gray-300'} ${
            prefix ? 'pl-7 pr-3' : 'px-3'
          } ${suffix ? 'pr-14' : ''} ${className}`}
          {...props}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-[#072349]">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Not fetched yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not fetched yet';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function sourceLabel(source: string): string {
  if (source === 'frankfurter') return 'Frankfurter';
  if (source === 'fallback') return 'Fallback';
  return source;
}

function draftEffectiveRate(draft: BillingDraft, liveRate: number): number {
  const raw = draft.usdToInrOverride.trim();
  if (raw === '') return liveRate;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n >= FX_OVERRIDE_MIN && n <= FX_OVERRIDE_MAX ? n : liveRate;
}

export function Billing() {
  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: getPlatformSettings,
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Platform fees, trial wallet, catalog spend caps, and top-up limits. Amounts are in rupees.
        </p>
      </header>

      {settingsQuery.isLoading && <p className="text-sm text-gray-500">Loading billing settings…</p>}

      {settingsQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load billing settings.{' '}
          {settingsQuery.error instanceof Error ? settingsQuery.error.message : ''}
        </div>
      )}

      {settingsQuery.data ? <BillingForm settings={settingsQuery.data} /> : null}
    </div>
  );
}

function BillingForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => draftFromSettings(settings));
  const baselineRef = useRef(draftFromSettings(settings));
  const [fieldErrors, setFieldErrors] = useState<BillingFieldErrors>({});
  const [saved, setSaved] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baselineRef.current),
    [draft]
  );

  useEffect(() => {
    if (isDirty) return;
    const next = draftFromSettings(settings);
    setDraft(next);
    baselineRef.current = next;
  }, [settings, isDirty]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = parseBillingDraft(draft);
      setFieldErrors(parsed.errors);
      if (billingDraftHasErrors(parsed.errors)) {
        throw new Error('Fix the highlighted fields before saving.');
      }
      return updatePlatformSettings(parsed.patch);
    },
    onSuccess: (updated) => {
      baselineRef.current = draft;
      setSaved(true);
      setFieldErrors({});
      if (updated) {
        queryClient.setQueryData(SETTINGS_QUERY_KEY, updated);
        const next = draftFromSettings(updated);
        setDraft(next);
        baselineRef.current = next;
      }
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });

  const refreshFx = useMutation({
    mutationFn: refreshUsdInrRate,
    onSuccess: (updated) => {
      if (updated) {
        queryClient.setQueryData(SETTINGS_QUERY_KEY, updated);
      }
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });

  const updateField = <K extends BillingField>(key: K, value: BillingDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(false);
    save.reset();
    refreshFx.reset();
  };

  const effectiveRate = draftEffectiveRate(draft, settings.usdToInrRate);
  const overrideOn = draft.usdToInrOverride.trim() !== '';
  const presetPaise = parsePresetRupees(draft.walletTopUpPresets);
  const minRupees = parseRupeeInput(draft.minWalletTopUp);
  const maxRupees = parseRupeeInput(draft.maxWalletTopUp);

  const revert = () => {
    setDraft(baselineRef.current);
    setFieldErrors({});
    setSaved(false);
    save.reset();
    refreshFx.reset();
  };

  return (
    <div className="space-y-4">
      <Section
        title="USD to INR"
        hint="Live rate is fetched daily. An override pins the rate used for charges until you clear it."
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Effective rate
            </p>
            <p className="mt-1 text-2xl font-bold text-[#072349]">{formatUsdInrRate(effectiveRate)}</p>
            <p className="mt-1 text-xs text-gray-500">
              Live {formatUsdInrRate(settings.usdToInrRate)}
              {overrideOn ? ' · override is on' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={settings.usdToInrSource === 'frankfurter' ? 'success' : 'warning'}>
              {sourceLabel(settings.usdToInrSource)}
            </Badge>
            {overrideOn ? <Badge variant="info">Override</Badge> : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Last fetch: {formatTimestamp(settings.usdToInrFetchedAt)}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field
            id="usd-to-inr-override"
            label="Override"
            hint={`₹${FX_OVERRIDE_MIN}–₹${FX_OVERRIDE_MAX}. Leave blank to follow the live rate.`}
            prefix="₹"
            suffix="/ USD"
            inputMode="decimal"
            min={FX_OVERRIDE_MIN}
            max={FX_OVERRIDE_MAX}
            value={draft.usdToInrOverride}
            error={fieldErrors.usdToInrOverride}
            onChange={(event) => updateField('usdToInrOverride', event.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!overrideOn}
            onClick={() => updateField('usdToInrOverride', '')}
          >
            Clear override
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshFx.isPending}
            onClick={() => refreshFx.mutate()}
          >
            {refreshFx.isPending ? 'Refreshing…' : 'Refresh rate'}
          </Button>
        </div>

        {refreshFx.isError && (
          <p className="mt-2 text-xs text-red-600">
            {refreshFx.error instanceof Error
              ? refreshFx.error.message
              : 'Could not refresh the USD to INR rate.'}
          </p>
        )}
        {refreshFx.isSuccess && !refreshFx.isError && (
          <p className="mt-2 text-xs font-medium text-[#25D366]">Live rate updated.</p>
        )}
      </Section>

      <Section
        title="Platform fees"
        hint="Added to AI cost on each charge, before vendor markup. ₹0 means ChatLogix does not add a fee. This is not Meta's WhatsApp fee. Meta's cost is on Usage, and we do not charge it to shops yet."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="platform-fee-per-turn"
            label="Per conversation turn"
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.platformFeePerTurn}
            error={fieldErrors.platformFeePerTurn}
            onChange={(event) => updateField('platformFeePerTurn', event.target.value)}
          />
          <Field
            id="platform-fee-outbound-media"
            label="Outbound product media"
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.platformFeeOutboundMedia}
            error={fieldErrors.platformFeeOutboundMedia}
            onChange={(event) => updateField('platformFeeOutboundMedia', event.target.value)}
          />
        </div>
      </Section>

      <Section title="Trial" hint="Granted when a vendor signs up. Expiry is measured in days from signup.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="trial-grant"
            label="Trial grant"
            hint="This changes the grant for shops that sign up after you save. Shops that already signed up keep the grant they received."
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.trialGrant}
            error={fieldErrors.trialGrant}
            onChange={(event) => updateField('trialGrant', event.target.value)}
          />
          <Field
            id="trial-expiry-days"
            label="Trial length"
            suffix="days"
            inputMode="numeric"
            min={1}
            max={TRIAL_EXPIRY_DAYS_MAX}
            step={1}
            value={draft.trialExpiryDays}
            error={fieldErrors.trialExpiryDays}
            onChange={(event) => updateField('trialExpiryDays', event.target.value)}
          />
        </div>
      </Section>

      <Section
        title="Catalog daily caps"
        hint="How much a vendor can spend on catalog import and the enhancer each day."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="catalog-import-cap"
            label="Import"
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.catalogImportDailyCap}
            error={fieldErrors.catalogImportDailyCap}
            onChange={(event) => updateField('catalogImportDailyCap', event.target.value)}
          />
          <Field
            id="catalog-enhance-cap"
            label="Enhancer"
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.catalogEnhanceDailyCap}
            error={fieldErrors.catalogEnhanceDailyCap}
            onChange={(event) => updateField('catalogEnhanceDailyCap', event.target.value)}
          />
        </div>
      </Section>

      <Section title="Wallet top-up" hint="Limits and suggested amounts vendors see when they add money.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="min-wallet-top-up"
            label="Minimum"
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.minWalletTopUp}
            error={fieldErrors.minWalletTopUp}
            onChange={(event) => updateField('minWalletTopUp', event.target.value)}
          />
          <Field
            id="max-wallet-top-up"
            label="Maximum"
            prefix="₹"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.maxWalletTopUp}
            error={fieldErrors.maxWalletTopUp}
            onChange={(event) => updateField('maxWalletTopUp', event.target.value)}
          />
        </div>

        <div className="mt-4">
          <Field
            id="wallet-top-up-presets"
            label="Suggested amounts"
            hint="Comma-separated rupee amounts, for example 500, 1000, 2000, 5000."
            wide
            inputMode="decimal"
            value={draft.walletTopUpPresets}
            error={fieldErrors.walletTopUpPresets}
            onChange={(event) => updateField('walletTopUpPresets', event.target.value)}
          />
          {presetPaise && presetPaise.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presetPaise.map((paise, index) => (
                <Badge key={`${paise}-${index}`} variant="default">
                  {formatPaiseAsRupees(paise)}
                </Badge>
              ))}
            </div>
          ) : null}
          {minRupees !== null && maxRupees !== null ? (
            <p className="mt-2 text-xs text-gray-500">
              Allowed range {formatPaiseAsRupees(rupeesToPaise(minRupees))} –{' '}
              {formatPaiseAsRupees(rupeesToPaise(maxRupees))}.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-start gap-3">
          <input
            id="mock-wallet-top-up"
            type="checkbox"
            checked={draft.mockWalletTopUpEnabled}
            onChange={(event) => updateField('mockWalletTopUpEnabled', event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
          />
          <label htmlFor="mock-wallet-top-up" className="cursor-pointer">
            <span className="block text-sm font-medium text-gray-700">Mock wallet top-up</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Lets vendors add money without Razorpay. Turn this off before going live.
            </span>
          </label>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!isDirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="ghost" size="sm" disabled={!isDirty || save.isPending} onClick={revert}>
          Revert
        </Button>
      </div>

      {save.isError && (
        <p className="text-xs text-red-600">
          {save.error instanceof Error ? save.error.message : 'Could not save billing settings.'}
        </p>
      )}
      {saved && !isDirty && !save.isError && (
        <p className="text-xs font-medium text-[#25D366]">Saved.</p>
      )}
      {settings.updatedAt ? (
        <p className="text-xs text-gray-400">
          Last saved {formatTimestamp(settings.updatedAt)}
          {settings.updatedBy ? ` · ${settings.updatedBy}` : ''}
        </p>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Input } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { ChoiceChips } from '../../components/onboarding/ChoiceChips';
import { WhatsAppPhoneMock } from '../../components/onboarding/WhatsAppPhoneMock';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import { fetchOnboardingProfile, patchOnboarding, type ExtractedProfile } from '../../lib/onboarding';

const CATEGORIES = ['Food', 'Retail', 'Services', 'Healthcare', 'Education', 'Other'] as const;

const schema = z.object({
  businessName: z.string().min(3, 'Enter your shop name (at least 3 letters)'),
  category: z.enum(CATEGORIES),
  city: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  aiPickupDeliveryAddress: z.string().min(8, 'Enter the shop address for delivery questions'),
  aiDeliveryInstructions: z.string().optional(),
  aiBotName: z.string().min(1, 'Assistant name is required'),
  aiGreeting: z.string().min(1, 'Greeting is required'),
  aiPersonality: z.string().min(1, 'Personality is required'),
});

type FormData = z.infer<typeof schema>;

function pickExtracted(
  profile: ExtractedProfile | null | undefined,
  key: keyof ExtractedProfile,
  fallback = ''
): string {
  const field = profile?.[key] as ExtractedProfile[keyof ExtractedProfile] | string | undefined;
  if (typeof field === 'string' && field.trim()) return field.trim();
  if (field && typeof field === 'object' && field.value) {
    const confidence = field.confidence ?? 1;
    if (confidence >= 0.35) return String(field.value).trim();
  }
  return fallback;
}

function isPlaceholderShopName(name?: string | null): boolean {
  const n = (name ?? '').trim();
  if (n.length < 3) return true;
  return /^(shop|my shop|my store|vendor|business|store|untitled|new shop)$/i.test(n);
}

function mergePrefill(existing: string | null | undefined, extracted: string, fallback = ''): string {
  if (!isPlaceholderShopName(existing)) return existing!.trim();
  return extracted || fallback;
}

function FieldNote({ text }: { text: string }) {
  return <p className="mt-1 text-xs leading-snug text-gray-500">{text}</p>;
}

export function OnboardingConfirm() {
  const navigate = useNavigate();
  const copy = onboardingCopy.confirm;
  const [savedProductCount, setSavedProductCount] = useState<number | undefined>();
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'Food',
      aiBotName: 'Shop Assistant',
      aiGreeting: 'Hello! Welcome to our shop. How can I help you today?',
      aiPersonality: 'Friendly, helpful, and clear about prices and delivery.',
      aiPickupDeliveryAddress: '',
      aiDeliveryInstructions: '',
      email: '',
    },
  });

  const category = form.watch('category') ?? 'Food';
  const greeting = form.watch('aiGreeting');
  const botName = form.watch('aiBotName');

  useEffect(() => {
    void fetchOnboardingProfile().then((p) => {
      setSavedProductCount(p.productCount);
      const extracted = p.extractedProfile;
      const step1 = (p.onboardingData?.step1 ?? {}) as Partial<FormData>;
      const intake = ((p.onboardingData?.intake as { answers?: Record<string, string> })?.answers) ?? {};

      const extractedName = pickExtracted(extracted, 'businessName');
      const extractedAddr = pickExtracted(extracted, 'address');
      const extractedCity = pickExtracted(extracted, 'city');
      const extractedHours = pickExtracted(extracted, 'hours');
      const extractedDelivery = pickExtracted(extracted, 'deliveryNotes');

      const businessName = mergePrefill(p.businessName, extractedName, step1.businessName || '');
      const addr = mergePrefill(
        p.aiPickupDeliveryAddress,
        [extractedAddr, extractedCity].filter(Boolean).join(', '),
        step1.aiPickupDeliveryAddress || ''
      );
      const deliveryBase =
        p.aiDeliveryInstructions ||
        extractedDelivery ||
        intake.deliveryNotes ||
        step1.aiDeliveryInstructions ||
        '';
      const delivery =
        extractedHours && !deliveryBase.toLowerCase().includes(extractedHours.toLowerCase())
          ? [deliveryBase, `Hours: ${extractedHours}`].filter(Boolean).join('. ')
          : deliveryBase;
      const city = extractedCity || step1.city || intake.city || '';
      const catRaw =
        p.category ||
        pickExtracted(extracted, 'category') ||
        step1.category ||
        'Food';
      const categoryValue = CATEGORIES.includes(catRaw as (typeof CATEGORIES)[number])
        ? (catRaw as FormData['category'])
        : 'Food';

      form.reset({
        businessName,
        category: categoryValue,
        city,
        email: p.email || step1.email || '',
        aiPickupDeliveryAddress: addr,
        aiDeliveryInstructions: delivery,
        aiBotName: p.aiBotName ?? `${businessName || 'Shop'} assistant`.slice(0, 80),
        aiGreeting: p.aiGreeting ?? form.getValues('aiGreeting'),
        aiPersonality: p.aiPersonality ?? form.getValues('aiPersonality'),
      });
    });
  }, [form]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload: Record<string, unknown> = {
        ...data,
        email: data.email?.trim() || undefined,
      };
      await patchOnboarding({ step: 3, data: payload, advance: true });
      toast.success('Saved');
      navigate('/onboarding/demo-chat');
    } catch (err) {
      toast.error(mapOnboardingError(err));
    }
  };

  return (
    <OnboardingLayout
      step={3}
      guide={copy.guide}
      guideVisual={
        <WhatsAppPhoneMock
          botName={botName || 'Shop Assistant'}
          messages={[
            { from: 'assistant', text: greeting || '…' },
            { from: 'customer', text: 'Do you deliver today?' },
          ]}
        />
      }
    >
      <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="text-gray-700">
          {savedProductCount
            ? copy.productSummary.replace('{count}', String(savedProductCount))
            : copy.noProducts}
        </span>
        <Link to="/onboarding/catalog" className="font-medium text-primary-600">
          {copy.editCatalog}
        </Link>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{copy.shopName}</label>
            <Input {...form.register('businessName')} error={form.formState.errors.businessName?.message} />
            <FieldNote text={onboardingCopy.step1.fieldNotes.businessName} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{copy.emailOptional}</label>
            <Input type="email" {...form.register('email')} error={form.formState.errors.email?.message} />
            <FieldNote text={copy.emailNote} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{copy.city}</label>
              <Input {...form.register('city')} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">{copy.category}</p>
              <ChoiceChips
                ariaLabel="Business category"
                value={category}
                options={CATEGORIES}
                onChange={(v) => form.setValue('category', v, { shouldValidate: true })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {onboardingCopy.step1.addressLabel}
            </label>
            <textarea
              {...form.register('aiPickupDeliveryAddress')}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {form.formState.errors.aiPickupDeliveryAddress?.message ? (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.aiPickupDeliveryAddress.message}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {onboardingCopy.step1.deliveryNotesLabel}
            </label>
            <textarea
              {...form.register('aiDeliveryInstructions')}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{copy.assistantName}</label>
            <Input {...form.register('aiBotName')} error={form.formState.errors.aiBotName?.message} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{copy.greeting}</label>
            <textarea
              {...form.register('aiGreeting')}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{copy.personality}</label>
            <textarea
              {...form.register('aiPersonality')}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sticky bottom-0 z-10 -mx-5 mt-2 border-t border-gray-200 bg-white px-5 py-3 shadow-[0_-6px_16px_rgba(7,35,73,0.06)] sm:-mx-10 sm:px-10 lg:-mx-12 lg:px-12">
            <Button type="submit" className="w-full" isLoading={form.formState.isSubmitting}>
              {copy.save}
            </Button>
          </div>
        </form>
    </OnboardingLayout>
  );
}
import type { ComponentType, SVGProps } from 'react';
import {
  ArrowPathIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowTrendingUpIcon,
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  LifebuoyIcon,
  QuestionMarkCircleIcon,
  ShoppingBagIcon,
  Squares2X2Icon,
  WalletIcon,
  XMarkIcon
} from '@heroicons/react/20/solid';

/**
 * Icons for the app shell and dashboard, aliased from Heroicons `20/solid`.
 *
 * The 20px solid set is drawn for this exact size, so it stays legible at the
 * `h-4`/`h-5` sizes used here and tints with `currentColor` — an active nav item
 * colors the icon along with its label. Aliasing rather than importing Heroicons
 * directly keeps call sites on product names and makes a future set swap local
 * to this file.
 */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type HeroIcon = typeof ArrowPathIcon;

/**
 * Heroicons are `ForwardRefExoticComponent`, which TypeScript will not accept
 * where a plain `ComponentType` is expected, so each alias goes through a thin
 * function component. That also keeps consumers off the Heroicons prop type.
 */
function alias(Heroicon: HeroIcon, name: string): IconComponent {
  const Icon = (props: SVGProps<SVGSVGElement>) => <Heroicon {...props} />;
  Icon.displayName = name;
  return Icon;
}

export const IconRefresh = alias(ArrowPathIcon, 'IconRefresh');
export const IconOrders = alias(ShoppingBagIcon, 'IconOrders');
export const IconWallet = alias(WalletIcon, 'IconWallet');
export const IconChat = alias(ChatBubbleLeftRightIcon, 'IconChat');
export const IconRevenue = alias(ArrowTrendingUpIcon, 'IconRevenue');
export const IconCatalog = alias(CubeIcon, 'IconCatalog');
export const IconAlert = alias(ExclamationTriangleIcon, 'IconAlert');
export const IconChevronRight = alias(ChevronRightIcon, 'IconChevronRight');
export const IconChevronDown = alias(ChevronDownIcon, 'IconChevronDown');
export const IconDashboard = alias(Squares2X2Icon, 'IconDashboard');
export const IconInbox = alias(InboxArrowDownIcon, 'IconInbox');
export const IconFaq = alias(QuestionMarkCircleIcon, 'IconFaq');
export const IconTemplates = alias(DocumentTextIcon, 'IconTemplates');
export const IconSettings = alias(Cog6ToothIcon, 'IconSettings');
export const IconSupport = alias(LifebuoyIcon, 'IconSupport');
export const IconLogout = alias(ArrowRightStartOnRectangleIcon, 'IconLogout');
export const IconMenu = alias(Bars3Icon, 'IconMenu');
export const IconClose = alias(XMarkIcon, 'IconClose');
export const IconSidebarCollapse = alias(ChevronDoubleLeftIcon, 'IconSidebarCollapse');
export const IconSidebarExpand = alias(ChevronDoubleRightIcon, 'IconSidebarExpand');

/** Meta's brand mark, which Heroicons does not ship. */
export function IconWhatsApp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 2a8 8 0 0 0-6.93 12.03L2 18l4.12-1.08A8 8 0 1 0 10 2zm4.2 11.55c-.18.5-1.05.97-1.45 1.03-.37.06-.85.09-1.37-.09-.32-.11-.73-.26-1.26-.51-2.22-.96-3.67-3.2-3.78-3.35-.1-.15-.9-1.2-.9-2.31 0-1.1.58-1.64.78-1.87.2-.22.44-.28.59-.28.15 0 .3.01.43.01.14 0 .33-.05.51.39.18.44.62 1.52.67 1.63.05.11.09.24.02.39-.07.15-.11.24-.22.37-.11.13-.23.29-.33.39-.11.1-.22.21-.1.41.12.2.53.87 1.14 1.41.78.7 1.44.92 1.64 1.02.2.1.32.09.44-.05.12-.15.5-.58.64-.78.14-.2.27-.17.46-.1.19.07 1.2.57 1.41.67.2.1.34.15.39.23.05.08.05.47-.13.97z"
      />
    </svg>
  );
}

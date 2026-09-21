// Shared UI Components
// Lightweight primitive components for reuse across apps

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { BrandLogo } from './BrandLogo';
export type { BrandLogoProps, BrandLogoVariant } from './BrandLogo';

export {
  Button,
  Input,
  Card,
  Badge,
} from './primitives';
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  InputProps,
  CardProps,
  BadgeProps,
  BadgeVariant,
} from './primitives';

export { CountryCodeSelector } from './auth/CountryCodeSelector';
export type { CountryCodeSelectorProps } from './auth/CountryCodeSelector';
export { PhoneLoginForm } from './auth/PhoneLoginForm';
export type { PhoneLoginFormProps } from './auth/PhoneLoginForm';
export { OtpVerificationForm } from './auth/OtpVerificationForm';
export type { OtpVerificationFormProps } from './auth/OtpVerificationForm';

import { useLocation } from 'react-router-dom';
import { usePageMeta } from '@chatlogix/hooks';
import { resolveVendorPageMeta } from '../../lib/seo';

export function VendorRouteMeta() {
  const { pathname } = useLocation();
  usePageMeta(resolveVendorPageMeta(pathname));
  return null;
}

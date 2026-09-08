import { useLocation } from 'react-router-dom';
import { usePageMeta } from '@chatlogix/hooks';
import { resolveAdminPageMeta } from '../../lib/seo';

export function AdminRouteMeta() {
  const { pathname } = useLocation();
  usePageMeta(resolveAdminPageMeta(pathname));
  return null;
}

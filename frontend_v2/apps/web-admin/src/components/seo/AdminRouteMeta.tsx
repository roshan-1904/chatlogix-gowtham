import { useLocation } from 'react-router-dom';
import { usePageMeta } from '@chatlogix/hooks';
import { resolveAdminPageMeta } from '../../lib/seo';

export function AdminRouteMeta() {
  const location = useLocation() as { pathname: string };
  usePageMeta(resolveAdminPageMeta(location.pathname));
  return null;
}

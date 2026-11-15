import { NAVIGATION_PAGES } from '../../constants';
import type { NavigationLink } from './interfaces/navigation-link.interface';
import type { PageName } from './types/page-name.type';

export function buildNavigation(activePage: PageName): readonly NavigationLink[] {
  return NAVIGATION_PAGES.map((entry) => ({ label: entry.label, href: entry.href, isActive: entry.page === activePage }));
}

import { buildNavigation } from './navigation.builder';

describe('buildNavigation', () => {
  it('lists the built pages and marks the active one', () => {
    expect(buildNavigation('manage')).toEqual([
      { label: 'CHAT', href: '/', isActive: false },
      { label: 'MANAGE', href: '/manage', isActive: true },
    ]);
  });
});

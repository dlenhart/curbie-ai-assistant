import type { SettingsFieldErrors } from '../../../core/settings/types/settings-field-errors.type';
import type { NavigationLink } from './navigation-link.interface';
import type { SelectOption } from './select-option.interface';

export interface SettingsPageModel {
  readonly pageTitle: string;
  readonly navigation: readonly NavigationLink[];
  readonly modelOptions: readonly SelectOption[];
  readonly isModelListUnavailable: boolean;
  readonly timeZoneOptions: readonly SelectOption[];
  readonly unitOptions: readonly SelectOption[];
  readonly fieldErrors: SettingsFieldErrors;
  readonly isSaved: boolean;
}

import { Body, Controller, Get, Inject, Logger, Post, Query, Render, Res } from '@nestjs/common';
import { MODEL_CATALOG, MODEL_LOADER, SETTINGS } from '../../constants';
import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { ModelCatalogPort } from '../../core/model/interfaces/model-catalog-port.interface';
import type { ModelLoaderPort } from '../../core/model/interfaces/model-loader-port.interface';
import { InvalidSettingsError } from '../../core/settings/errors/invalid-settings.error';
import type { HouseholdSettingsService } from '../../core/settings/household-settings.service';
import type { HouseholdSettings } from '../../core/settings/interfaces/household-settings.interface';
import type { SettingsFieldErrors } from '../../core/settings/types/settings-field-errors.type';
import type { RenderingResponse } from './interfaces/rendering-response.interface';
import type { SettingsPageModel } from './interfaces/settings-page-model.interface';
import { buildSettingsPageModel } from './settings-page-model.builder';

@Controller()
export class SettingsPageController {
  constructor(
    @Inject(SETTINGS) private readonly settings: HouseholdSettingsService,
    @Inject(MODEL_CATALOG) private readonly modelCatalog: ModelCatalogPort,
    @Inject(MODEL_LOADER) private readonly modelLoader: ModelLoaderPort,
  ) {}

  @Get('/manage/settings')
  @Render('settings')
  async showSettings(@Query('saved') saved: unknown): Promise<SettingsPageModel> {
    const editable = this.settings.readForEditing();
    return this.buildPage(editable.settings, editable.fieldErrors, saved === '1');
  }

  @Post('/manage/settings')
  async saveSettings(
    @Body() body: Readonly<Record<string, unknown>>,
    @Res() response: RenderingResponse,
  ): Promise<void> {
    let saved: HouseholdSettings;
    try {
      saved = await this.settings.update(body ?? {});
    } catch (error) {
      if (!(error instanceof InvalidSettingsError)) throw error;
      const shownSettings = { ...this.settings.readForEditing().settings, ...error.acceptedValues };
      response.status(400).render('settings', await this.buildPage(shownSettings, error.fieldErrors, false));
      return;
    }
    this.startLoadingInBackground(saved.modelName);
    response.writeHead(303, { location: '/manage/settings?saved=1' });
    response.end();
  }

  private startLoadingInBackground(modelName: string): void {
    this.modelLoader.ensureLoaded(modelName).catch((error: unknown) => {
      Logger.warn(`Could not load ${modelName} after saving settings: ${(error as Error).message}`, 'Settings');
    });
  }

  private async buildPage(
    settings: HouseholdSettings,
    fieldErrors: SettingsFieldErrors,
    isSaved: boolean,
  ): Promise<SettingsPageModel> {
    return buildSettingsPageModel({
      settings,
      installedModelNames: await this.listInstalledModelNames(),
      timeZones: this.settings.supportedTimeZones(),
      fieldErrors,
      isSaved,
    });
  }

  private async listInstalledModelNames(): Promise<readonly string[] | null> {
    try {
      return await this.modelCatalog.listInstalledModelNames();
    } catch (error) {
      if (error instanceof ModelUnavailableError) return null;
      throw error;
    }
  }
}

import { Body, Controller, Get, Inject, Post, Query, Render, Res } from '@nestjs/common';
import { MODEL_CATALOG, SETTINGS } from '../../constants';
import { ModelUnavailableError } from '../../core/model/errors/model-unavailable.error';
import type { ModelCatalogPort } from '../../core/model/interfaces/model-catalog-port.interface';
import { InvalidSettingsError } from '../../core/settings/errors/invalid-settings.error';
import type { HouseholdSettingsService } from '../../core/settings/household-settings.service';
import type { SettingsFieldErrors } from '../../core/settings/types/settings-field-errors.type';
import type { RenderingResponse } from './interfaces/rendering-response.interface';
import type { SettingsPageModel } from './interfaces/settings-page-model.interface';
import { buildSettingsPageModel } from './settings-page-model.builder';

@Controller()
export class SettingsPageController {
  constructor(
    @Inject(SETTINGS) private readonly settings: HouseholdSettingsService,
    @Inject(MODEL_CATALOG) private readonly modelCatalog: ModelCatalogPort,
  ) {}

  @Get('/manage/settings')
  @Render('settings')
  async showSettings(@Query('saved') saved: unknown): Promise<SettingsPageModel> {
    return this.buildPage({}, saved === '1');
  }

  @Post('/manage/settings')
  async saveSettings(
    @Body() body: Readonly<Record<string, unknown>>,
    @Res() response: RenderingResponse,
  ): Promise<void> {
    try {
      await this.settings.update(body ?? {});
    } catch (error) {
      if (!(error instanceof InvalidSettingsError)) throw error;
      response.status(400).render('settings', await this.buildPage(error.fieldErrors, false));
      return;
    }
    response.writeHead(303, { location: '/manage/settings?saved=1' });
    response.end();
  }

  private async buildPage(fieldErrors: SettingsFieldErrors, isSaved: boolean): Promise<SettingsPageModel> {
    const editable = this.settings.readForEditing();
    return buildSettingsPageModel({
      settings: editable.settings,
      installedModelNames: await this.listInstalledModelNames(),
      timeZones: this.settings.supportedTimeZones(),
      fieldErrors: { ...editable.fieldErrors, ...fieldErrors },
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

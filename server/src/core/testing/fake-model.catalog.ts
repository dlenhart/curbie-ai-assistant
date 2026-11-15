import type { ModelCatalogPort } from '../model/interfaces/model-catalog-port.interface';

export class FakeModelCatalog implements ModelCatalogPort {
  callCount = 0;

  constructor(private readonly outcome: readonly string[] | Error) {}

  async listInstalledModelNames(): Promise<readonly string[]> {
    this.callCount++;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

import { SCAN_PROBLEM_MESSAGES } from '../../constants';
import { ModelUnavailableError } from '../model/errors/model-unavailable.error';
import { OcrFailedError } from './errors/ocr-failed.error';
import { OcrUnavailableError } from './errors/ocr-unavailable.error';
import { groupInboxFiles } from './inbox-file.grouper';
import type { InboxGroup } from './interfaces/inbox-group.interface';
import type { InboxPhoto } from './interfaces/inbox-photo.interface';
import type { OcrLine } from './interfaces/ocr-line.interface';
import type { RecipeInboxScannerDependencies } from './interfaces/recipe-inbox-scanner-dependencies.interface';
import type { ScanProblem } from './interfaces/scan-problem.interface';
import type { ScanReport } from './interfaces/scan-report.interface';
import { assembleRecipeDraft } from './recipe-draft.assembler';
import { parseRecipeMarkdown } from './recipe-markdown.parser';
import type { ScanStart } from './types/scan-start.type';

export class RecipeInboxScanner {
  private isScanningNow = false;

  constructor(private readonly dependencies: RecipeInboxScannerDependencies) {}

  start(): ScanStart {
    if (this.isScanningNow) return { kind: 'already_running' };
    this.isScanningNow = true;
    const completion = this.scan().finally(() => {
      this.isScanningNow = false;
    });
    return { kind: 'started', completion };
  }

  isScanning(): boolean {
    return this.isScanningNow;
  }

  private async scan(): Promise<ScanReport> {
    const { files, repository, clock } = this.dependencies;
    const grouping = groupInboxFiles(files.listInboxFileNames());
    const problems: ScanProblem[] = [...grouping.problems];
    const hashesSeenInScan = new Set<string>();
    let importedCount = 0;

    try {
      for (const group of grouping.groups) {
        const outcome = await this.importGroup(group, hashesSeenInScan);
        if (outcome === 'imported') {
          importedCount += 1;
          continue;
        }
        problems.push(outcome);
      }
    } catch (error) {
      repository.saveScanReport({ finishedAt: clock.now().toISOString(), importedCount, problems });
      throw error;
    }

    const report: ScanReport = { finishedAt: clock.now().toISOString(), importedCount, problems };
    repository.saveScanReport(report);
    return report;
  }

  private async importGroup(group: InboxGroup, hashesSeenInScan: Set<string>): Promise<'imported' | ScanProblem> {
    const { files, ocr, labeller, repository, settings, generationQueue, clock, idGenerator } = this.dependencies;
    const photos: InboxPhoto[] = [];
    for (const fileName of group.fileNames) {
      photos.push(await files.readInboxPhoto(fileName));
    }
    const hashesInGroup = new Set<string>();
    const duplicate = photos.find((photo) => {
      const isDuplicate = this.isDuplicate(photo, hashesInGroup, hashesSeenInScan);
      hashesInGroup.add(photo.sha256);
      return isDuplicate;
    });
    if (duplicate) return { subject: duplicate.fileName, reason: SCAN_PROBLEM_MESSAGES.duplicatePhoto };

    const id = idGenerator.next('recipe');
    try {
      const lines: OcrLine[] = [];
      for (const [index, photo] of photos.entries()) {
        const pageNumber = index + 1;
        const recognized = await ocr.recognize(photo.absolutePath, files.workDisplayPath(id, pageNumber));
        lines.push(...recognized.map((line) => ({ text: line.text, confidence: line.confidence, pageNumber })));
      }
      if (lines.length === 0) {
        files.abandonWork(id);
        return { subject: group.name, reason: SCAN_PROBLEM_MESSAGES.noText };
      }
      const labels = await generationQueue.run(() => labeller.label(lines, settings.current().modelName));
      const draftMarkdown = assembleRecipeDraft(lines, labels, group.name);
      const title = parseRecipeMarkdown(draftMarkdown).recipe.title ?? group.name;
      const pages = files.commitPages(id, photos);
      try {
        repository.create({ id, title, draftMarkdown, ocrLines: lines, pages, createdAt: clock.now().toISOString() });
      } catch {
        return { subject: group.name, reason: SCAN_PROBLEM_MESSAGES.saveFailed };
      }
      photos.forEach((photo) => hashesSeenInScan.add(photo.sha256));
      return 'imported';
    } catch (error) {
      files.abandonWork(id);
      const reason = this.problemReasonFor(error);
      if (reason === null) throw error;
      return { subject: group.name, reason };
    }
  }

  private isDuplicate(photo: InboxPhoto, hashesInGroup: ReadonlySet<string>, hashesSeenInScan: ReadonlySet<string>): boolean {
    return (
      this.dependencies.repository.hasPhotoHash(photo.sha256) ||
      hashesSeenInScan.has(photo.sha256) ||
      hashesInGroup.has(photo.sha256)
    );
  }

  private problemReasonFor(error: unknown): string | null {
    if (error instanceof OcrUnavailableError) return SCAN_PROBLEM_MESSAGES.ocrUnavailable;
    if (error instanceof OcrFailedError) return SCAN_PROBLEM_MESSAGES.ocrFailed;
    if (error instanceof ModelUnavailableError) return SCAN_PROBLEM_MESSAGES.modelUnavailable;
    return null;
  }
}

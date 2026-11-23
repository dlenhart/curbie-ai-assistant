import {
  INBOX_NUMBERED_PAGE_PATTERN,
  RECIPE_PHOTO_EXTENSIONS,
  SCAN_PROBLEM_MESSAGES,
} from '../../constants';
import type { InboxGroup } from './interfaces/inbox-group.interface';
import type { InboxGrouping } from './interfaces/inbox-grouping.interface';
import type { InboxNamedFile } from './interfaces/inbox-named-file.interface';
import type { ScanProblem } from './interfaces/scan-problem.interface';

export function groupInboxFiles(fileNames: readonly string[]): InboxGrouping {
  const problems: ScanProblem[] = [];
  const filesByName = new Map<string, InboxNamedFile[]>();

  for (const fileName of fileNames) {
    if (fileName.startsWith('.')) continue;
    const stem = stripSupportedExtension(fileName);
    if (stem === null) {
      problems.push({ subject: fileName, reason: SCAN_PROBLEM_MESSAGES.unsupported });
      continue;
    }
    const numbered = INBOX_NUMBERED_PAGE_PATTERN.exec(stem);
    const name = numbered ? numbered[1] : stem;
    const pageNumber = numbered ? Number(numbered[2]) : null;
    filesByName.set(name, [...(filesByName.get(name) ?? []), { fileName, pageNumber }]);
  }

  const groups: InboxGroup[] = [];
  for (const [name, files] of filesByName) {
    const problemReason = findNumberingProblem(files);
    if (problemReason) {
      problems.push({ subject: name, reason: problemReason });
      continue;
    }
    const orderedFiles = [...files].sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
    groups.push({ name, fileNames: orderedFiles.map((file) => file.fileName) });
  }

  groups.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { groups, problems };
}

function stripSupportedExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return null;
  const extension = fileName.slice(dotIndex).toLowerCase();
  if (!RECIPE_PHOTO_EXTENSIONS.includes(extension)) return null;
  return fileName.slice(0, dotIndex);
}

function findNumberingProblem(files: readonly InboxNamedFile[]): string | null {
  const hasBare = files.some((file) => file.pageNumber === null);
  const hasNumbered = files.some((file) => file.pageNumber !== null);
  if (hasBare && hasNumbered) return SCAN_PROBLEM_MESSAGES.mixedNaming;
  if (hasBare) return files.length > 1 ? SCAN_PROBLEM_MESSAGES.duplicatePage : null;
  const pageNumbers = files.map((file) => file.pageNumber as number);
  if (new Set(pageNumbers).size !== pageNumbers.length) return SCAN_PROBLEM_MESSAGES.duplicatePage;
  const isContiguousFromOne = pageNumbers.every((_, index) => pageNumbers.includes(index + 1));
  return isContiguousFromOne ? null : SCAN_PROBLEM_MESSAGES.badNumbering;
}

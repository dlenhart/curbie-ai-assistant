import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DATA_DIRECTORY_MARKER } from '../../constants';
import { DataDirectoryUnavailableError } from './errors/data-directory-unavailable.error';

export function assertDataDirectoryUsable(dataDirectory: string): void {
  if (!isAbsolute(dataDirectory)) {
    throw new DataDirectoryUnavailableError(`The data directory must be an absolute path; got "${dataDirectory}".`);
  }

  let isDirectory: boolean;
  try {
    isDirectory = statSync(dataDirectory).isDirectory();
  } catch {
    throw new DataDirectoryUnavailableError(`Data directory ${dataDirectory} does not exist. Is the USB drive mounted?`);
  }
  if (!isDirectory) {
    throw new DataDirectoryUnavailableError(`Data directory ${dataDirectory} is not a directory.`);
  }

  const markerPath = join(dataDirectory, DATA_DIRECTORY_MARKER);
  if (!existsSync(markerPath)) {
    throw new DataDirectoryUnavailableError(
      `Data directory ${dataDirectory} has no ${DATA_DIRECTORY_MARKER} marker. ` +
        `If the USB drive should be mounted here, it isn't. ` +
        `If this is a brand-new data directory, create the marker with: touch "${markerPath}"`,
    );
  }

  try {
    accessSync(dataDirectory, constants.W_OK);
  } catch {
    throw new DataDirectoryUnavailableError(`Data directory ${dataDirectory} is not writable by this user.`);
  }
}

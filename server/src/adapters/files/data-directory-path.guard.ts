import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { PathOutsideDataDirectoryError } from './errors/path-outside-data-directory.error';

export function resolveInsideDataDirectory(dataDirectory: string, relativePath: string): string {
  const lexicalRoot = resolve(dataDirectory);
  const absolutePath = resolve(lexicalRoot, relativePath);
  if (!isInside(lexicalRoot, absolutePath)) {
    throw new PathOutsideDataDirectoryError(relativePath);
  }
  const realRoot = realpathSync(lexicalRoot);
  if (!isInside(realRoot, realPathOfDeepestAncestor(absolutePath, relativePath))) {
    throw new PathOutsideDataDirectoryError(relativePath);
  }
  return absolutePath;
}

function isInside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  if (relation === '') {
    return true;
  }
  return relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function realPathOfDeepestAncestor(path: string, relativePath: string): string {
  let current = path;
  while (!isPresentOnDisk(current)) {
    current = dirname(current);
  }
  try {
    return realpathSync(current);
  } catch {
    throw new PathOutsideDataDirectoryError(relativePath);
  }
}

function isPresentOnDisk(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

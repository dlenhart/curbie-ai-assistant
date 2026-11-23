import { SCAN_PROBLEM_MESSAGES } from '../../constants';
import { groupInboxFiles } from './inbox-file.grouper';

describe('groupInboxFiles', () => {
  it('makes a one-photo group from a bare name', () => {
    expect(groupInboxFiles(['cake.heic'])).toEqual({
      groups: [{ name: 'cake', fileNames: ['cake.heic'] }],
      problems: [],
    });
  });

  it('orders numbered pages by number', () => {
    const result = groupInboxFiles(['cake-2.heic', 'cake-1.heic']);
    expect(result.groups).toEqual([{ name: 'cake', fileNames: ['cake-1.heic', 'cake-2.heic'] }]);
    expect(result.problems).toEqual([]);
  });

  it('treats grandmas-cake-1950.heic as a one-photo recipe', () => {
    expect(groupInboxFiles(['grandmas-cake-1950.heic']).groups).toEqual([
      { name: 'grandmas-cake-1950', fileNames: ['grandmas-cake-1950.heic'] },
    ]);
  });

  it('accepts upper-case extensions such as IMG_1234.HEIC', () => {
    expect(groupInboxFiles(['IMG_1234.HEIC']).groups).toEqual([
      { name: 'IMG_1234', fileNames: ['IMG_1234.HEIC'] },
    ]);
  });

  it('ignores .DS_Store and ._ files without a problem', () => {
    expect(groupInboxFiles(['.DS_Store', '._cake.heic'])).toEqual({ groups: [], problems: [] });
  });

  it('reports an unsupported file and leaves no group', () => {
    expect(groupInboxFiles(['notes.pdf'])).toEqual({
      groups: [],
      problems: [{ subject: 'notes.pdf', reason: SCAN_PROBLEM_MESSAGES.unsupported }],
    });
  });

  it('sorts groups by name', () => {
    expect(groupInboxFiles(['b.png', 'a.png']).groups.map((group) => group.name)).toEqual(['a', 'b']);
  });

  it.each([
    ['a -2 with no -1', ['cake-2.heic'], 'badNumbering'],
    ['a gap', ['cake-1.heic', 'cake-3.heic'], 'badNumbering'],
    ['a duplicate page across extensions', ['cake-1.jpg', 'cake-1.heic'], 'duplicatePage'],
    ['a bare name plus a numbered one', ['cake.heic', 'cake-1.heic'], 'mixedNaming'],
  ] as const)('reports %s', (_label, fileNames, reasonKey) => {
    expect(groupInboxFiles(fileNames)).toEqual({
      groups: [],
      problems: [{ subject: 'cake', reason: SCAN_PROBLEM_MESSAGES[reasonKey] }],
    });
  });
});

import { MAX_MESSAGE_LENGTH } from '../../constants';
import { parseUserMessagePayload } from './user-message-payload.parser';

describe('parseUserMessagePayload', () => {
  it('accepts a valid payload and trims the text', () => {
    expect(parseUserMessagePayload({ conversationId: 'conv_abc-123', text: '  hi  ' })).toEqual({
      isValid: true,
      conversationId: 'conv_abc-123',
      text: 'hi',
    });
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['missing conversationId', { text: 'hi' }],
    ['conversationId with illegal characters', { conversationId: '../etc', text: 'hi' }],
    ['overlong conversationId', { conversationId: 'c'.repeat(101), text: 'hi' }],
    ['non-string text', { conversationId: 'conv_1', text: 5 }],
    ['blank text', { conversationId: 'conv_1', text: '   ' }],
    ['overlong text', { conversationId: 'conv_1', text: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }],
  ])('rejects %s', (_label, payload) => {
    expect(parseUserMessagePayload(payload).isValid).toBe(false);
  });
});

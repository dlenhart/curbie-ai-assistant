import 'reflect-metadata';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import WebSocket from 'ws';
import { DataDirectoryUnavailableError } from './adapters/persistence/errors/data-directory-unavailable.error';
import { configureApp } from './adapters/web/app.configurator';
import { AppModule } from './app.module';
import { CONFIG, DATA_DIRECTORY_MARKER, ID_GENERATOR, MODEL } from './constants';
import { ModelUnavailableError } from './core/model/errors/model-unavailable.error';
import type { ModelResponse } from './core/model/interfaces/model-response.interface';
import { answerResponse, ScriptedModel, textResponse, toolCallResponse } from './core/testing/scripted.model';
import { SequentialIdGenerator } from './core/testing/sequential-id.generator';
import { parseConfig } from './infrastructure/config/curbie-config.parser';
import type { ServerMessage } from './interfaces/server-message.interface';

const REPOSITORY_SKILLS_DIRECTORY = join(__dirname, '..', '..', 'skills');

describe('Curbie app (integration)', () => {
  let dataDirectory: string;
  let app: NestExpressApplication | undefined;
  let model: ScriptedModel;
  let serverAddress: string;

  function testingModule(directory: string) {
    return Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(
        parseConfig(
          { CURBIE_DATA_DIR: directory, CURBIE_SKILLS_DIR: REPOSITORY_SKILLS_DIRECTORY },
          { skillsDirectory: REPOSITORY_SKILLS_DIRECTORY },
        ),
      )
      .overrideProvider(MODEL)
      .useValue(model)
      .overrideProvider(ID_GENERATOR)
      .useValue(new SequentialIdGenerator());
  }

  async function startApp(responses: Array<ModelResponse | Error>): Promise<void> {
    model = new ScriptedModel(responses);
    const moduleRef = await testingModule(dataDirectory).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    serverAddress = `127.0.0.1:${port}`;
  }

  function sendOverWebSocket(payload: unknown): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${serverAddress}/ws`);
      socket.on('open', () => socket.send(JSON.stringify(payload)));
      socket.on('message', (raw) => {
        socket.close();
        resolve(JSON.parse(raw.toString()) as ServerMessage);
      });
      socket.on('error', reject);
    });
  }

  beforeEach(() => {
    dataDirectory = mkdtempSync(join(tmpdir(), 'curbie-it-'));
    writeFileSync(join(dataDirectory, DATA_DIRECTORY_MARKER), '');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  it('serves the chat page with a server-generated conversation id', async () => {
    await startApp([]);
    const response = await request(app!.getHttpServer()).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('data-conversation-id="conv_1"');
  });

  it('answers a calculator question end to end with a citation', async () => {
    await startApp([
      toolCallResponse('evaluate_expression', { expression: '0.15 * 340' }),
      textResponse(''),
      answerResponse({ category: 'cited', text: '15% of 340 is 51.', sourceIds: ['src_1'], quotes: [] }),
    ]);

    const reply = await sendOverWebSocket({
      event: 'user_message',
      data: { conversationId: 'conv_test', text: "What's 15% of 340?" },
    });

    expect(reply).toEqual({
      event: 'assistant_reply',
      data: {
        conversationId: 'conv_test',
        category: 'cited',
        text: '15% of 340 is 51.',
        citations: [{ sourceId: 'src_1', title: 'Calculator', skillName: 'calculator' }],
      },
    });
    const toolMessage = model.receivedRequests[1].messages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('0.15 * 340 = 51');
  });

  it("reports an unreachable model as a chat error instead of guessing", async () => {
    await startApp([new ModelUnavailableError('Could not reach Ollama at http://127.0.0.1:11434: ECONNREFUSED')]);
    const reply = await sendOverWebSocket({ event: 'user_message', data: { conversationId: 'conv_test', text: 'hi' } });
    expect(reply.event).toBe('chat_error');
    expect(String(reply.data.message)).toContain("The model isn't responding");
    expect(String(reply.data.message)).toContain('ECONNREFUSED');
  });

  it('rejects an invalid payload with a chat error', async () => {
    await startApp([]);
    const reply = await sendOverWebSocket({ event: 'user_message', data: { conversationId: '../bad', text: 'hi' } });
    expect(reply.event).toBe('chat_error');
    expect(model.receivedRequests).toHaveLength(0);
  });

  it('refuses to start when the data directory marker is missing', async () => {
    rmSync(join(dataDirectory, DATA_DIRECTORY_MARKER));
    model = new ScriptedModel([]);
    await expect(testingModule(dataDirectory).compile()).rejects.toThrow(DataDirectoryUnavailableError);
  });
});

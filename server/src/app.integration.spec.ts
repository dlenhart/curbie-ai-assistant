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
import { CONFIG, DATA_DIRECTORY_MARKER, ID_GENERATOR, MODEL, MODEL_CATALOG, SETTINGS_REPOSITORY } from './constants';
import type { SettingsRepository } from './core/settings/interfaces/settings-repository.interface';
import { ModelUnavailableError } from './core/model/errors/model-unavailable.error';
import type { ModelResponse } from './core/model/interfaces/model-response.interface';
import { answerResponse, ScriptedModel, textResponse, toolCallResponse } from './core/testing/scripted.model';
import { FakeModelCatalog } from './core/testing/fake-model.catalog';
import { SequentialIdGenerator } from './core/testing/sequential-id.generator';
import { parseConfig } from './infrastructure/config/curbie-config.parser';
import type { ServerMessage } from './interfaces/server-message.interface';

const REPOSITORY_SKILLS_DIRECTORY = join(__dirname, '..', '..', 'skills');

describe('Curbie app (integration)', () => {
  let dataDirectory: string;
  let app: NestExpressApplication | undefined;
  let model: ScriptedModel;
  let serverAddress: string;
  let modelCatalog: FakeModelCatalog;

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
      .useValue(new SequentialIdGenerator())
      .overrideProvider(MODEL_CATALOG)
      .useValue(modelCatalog);
  }

  async function startApp(
    responses: Array<ModelResponse | Error>,
    catalog: FakeModelCatalog = new FakeModelCatalog(['qwen3:4b-instruct', 'qwen3:8b']),
  ): Promise<void> {
    model = new ScriptedModel(responses);
    modelCatalog = catalog;
    const moduleRef = await testingModule(dataDirectory).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    serverAddress = `127.0.0.1:${port}`;
  }

  function sendOverWebSocket(payload: unknown, headers: Record<string, string> = {}): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${serverAddress}/ws`, { headers });
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

  it('serves the chat page inside the shared frame with a server-generated conversation id', async () => {
    await startApp([]);
    const response = await request(app!.getHttpServer()).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('class="nav"');
    expect(response.text).toContain('href="/" aria-current="page">CHAT</a>');
    expect(response.text).toContain('id="chat-log" data-conversation-id="conv_1"');
    expect(response.text).toContain('/static/curbie.css');
  });

  it('serves the Manage hub with a Settings tile', async () => {
    await startApp([]);
    const response = await request(app!.getHttpServer()).get('/manage');
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/manage/settings"');
    expect(response.text).toContain('href="/manage" aria-current="page">MANAGE</a>');
  });

  it('serves the stylesheet', async () => {
    await startApp([]);
    expect((await request(app!.getHttpServer()).get('/static/curbie.css')).status).toBe(200);
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

  it('answers a date question from the clock skill with a citation', async () => {
    await startApp([
      toolCallResponse('current_date_time', {}),
      textResponse(''),
      answerResponse({ category: 'cited', text: 'Today is Sunday.', sourceIds: ['src_1'], quotes: [] }),
    ]);

    const reply = await sendOverWebSocket({
      event: 'user_message',
      data: { conversationId: 'conv_test', text: "What's today's date?" },
    });

    expect(reply.event).toBe('assistant_reply');
    expect(reply.data.citations).toEqual([{ sourceId: 'src_1', title: 'Clock', skillName: 'clock' }]);
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

  it('refuses an HTTP request whose Host is a hostname', async () => {
    await startApp([]);
    const response = await request(app!.getHttpServer()).get('/').set('Host', 'curbie.example');
    expect(response.status).toBe(403);
  });

  it('refuses a WebSocket upgrade from another origin', async () => {
    await startApp([]);
    const statusCode = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`ws://${serverAddress}/ws`, { headers: { Origin: 'http://evil.example' } });
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
      socket.on('open', () => {
        socket.close();
        reject(new Error('The upgrade was accepted.'));
      });
      socket.on('error', () => undefined);
    });
    expect(statusCode).toBe(403);
  });

  it('accepts a WebSocket upgrade from its own origin', async () => {
    await startApp([
      textResponse(''),
      answerResponse({ category: 'conversational', text: 'Hello!', sourceIds: [], quotes: [] }),
    ]);
    const reply = await sendOverWebSocket(
      { event: 'user_message', data: { conversationId: 'conv_test', text: 'hi' } },
      { Origin: `http://${serverAddress}` },
    );
    expect(reply.event).toBe('assistant_reply');
  });

  describe('Settings page', () => {
    const VALID_FORM = { modelName: 'qwen3:8b', timeZone: 'America/Chicago', units: 'metric' };

    it('shows the current settings', async () => {
      await startApp([]);
      const response = await request(app!.getHttpServer()).get('/manage/settings');
      expect(response.status).toBe(200);
      expect(response.text).toContain('<option value="qwen3:4b-instruct" selected>');
      expect(response.text).toContain('<option value="qwen3:8b">');
      expect(response.text).toContain('value="imperial" checked');
      expect(response.text).toContain('href="/manage" aria-current="page">MANAGE</a>');
    });

    it('still renders when Ollama is down', async () => {
      await startApp([], new FakeModelCatalog(new ModelUnavailableError('ECONNREFUSED')));
      const response = await request(app!.getHttpServer()).get('/manage/settings');
      expect(response.status).toBe(200);
      expect(response.text).toContain("Couldn't reach Ollama");
      expect(response.text).toContain('<option value="qwen3:4b-instruct" selected>');
    });

    it('saves and redirects, and the next chat turn uses the new settings', async () => {
      await startApp([textResponse(''), answerResponse({ category: 'conversational', text: 'Hi.', sourceIds: [], quotes: [] })]);
      const saved = await request(app!.getHttpServer()).post('/manage/settings').type('form').send(VALID_FORM);
      expect(saved.status).toBe(303);
      expect(saved.headers.location).toBe('/manage/settings?saved=1');

      const page = await request(app!.getHttpServer()).get('/manage/settings?saved=1');
      expect(page.text).toContain('Settings saved.');
      expect(page.text).toContain('<option value="America/Chicago" selected>');

      await sendOverWebSocket({ event: 'user_message', data: { conversationId: 'conv_test', text: 'hi' } });
      expect(model.receivedRequests[0].modelName).toBe('qwen3:8b');
      expect(model.receivedRequests[0].messages[0].content).toContain('metric (');
    });

    it('answers 400 with the field error for an invalid time zone and saves nothing', async () => {
      await startApp([]);
      const response = await request(app!.getHttpServer())
        .post('/manage/settings')
        .type('form')
        .send({ ...VALID_FORM, timeZone: 'Mars/Olympus' });
      expect(response.status).toBe(400);
      expect(response.text).toContain('Choose a time zone from the list.');
      expect(response.text).not.toContain('Mars/Olympus');
      const page = await request(app!.getHttpServer()).get('/manage/settings');
      expect(page.text).toContain('<option value="qwen3:4b-instruct" selected>');
    });

    it('refuses a POST from another origin and saves nothing', async () => {
      await startApp([]);
      const response = await request(app!.getHttpServer())
        .post('/manage/settings')
        .set('Origin', 'http://evil.example')
        .type('form')
        .send(VALID_FORM);
      expect(response.status).toBe(403);
      const page = await request(app!.getHttpServer()).get('/manage/settings');
      expect(page.text).toContain('value="imperial" checked');
    });

    it('still renders and saves when a stored value is invalid', async () => {
      await startApp([]);
      app!.get<SettingsRepository>(SETTINGS_REPOSITORY).saveAll({ timeZone: 'Mars/Olympus' }, '2026-11-15T12:00:00.000Z');

      const page = await request(app!.getHttpServer()).get('/manage/settings');
      expect(page.status).toBe(200);
      expect(page.text).toContain('Choose a time zone from the list.');

      const saved = await request(app!.getHttpServer()).post('/manage/settings').type('form').send(VALID_FORM);
      expect(saved.status).toBe(303);
    });

    it('ignores extra form keys on save and on a failed save', async () => {
      await startApp([]);
      const saved = await request(app!.getHttpServer())
        .post('/manage/settings')
        .type('form')
        .send({ ...VALID_FORM, layout: 'chat', settings: 'x' });
      expect(saved.status).toBe(303);

      const failed = await request(app!.getHttpServer())
        .post('/manage/settings')
        .type('form')
        .send({ ...VALID_FORM, units: 'kelvin', layout: '../../package.json' });
      expect(failed.status).toBe(400);
      expect(failed.text).toContain('Choose imperial or metric.');
      expect(failed.text).not.toContain('curbie-server');
    });
  });

  it('refuses to start when the data directory marker is missing', async () => {
    rmSync(join(dataDirectory, DATA_DIRECTORY_MARKER));
    model = new ScriptedModel([]);
    modelCatalog = new FakeModelCatalog([]);
    await expect(testingModule(dataDirectory).compile()).rejects.toThrow(DataDirectoryUnavailableError);
  });
});

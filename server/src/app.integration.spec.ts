import 'reflect-metadata';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import WebSocket from 'ws';
import { ScriptedOcrInvoker } from './adapters/ocr/testing/scripted-ocr.invoker';
import { DataDirectoryUnavailableError } from './adapters/persistence/errors/data-directory-unavailable.error';
import { configureApp } from './adapters/web/app.configurator';
import { AppModule } from './app.module';
import {
  CONFIG,
  DATA_DIRECTORY_MARKER,
  ID_GENERATOR,
  MODEL,
  MODEL_CATALOG,
  MODEL_LOADER,
  OCR,
  RECIPE_PAGE_MESSAGES,
  RECIPE_PROBLEM_MESSAGES,
  RECIPE_SCANNER,
  SETTINGS_REPOSITORY,
} from './constants';
import type { RecognizedLine } from './core/recipes/interfaces/recognized-line.interface';
import type { RecipeInboxScanner } from './core/recipes/recipe-inbox.scanner';
import type { SettingsRepository } from './core/settings/interfaces/settings-repository.interface';
import { ModelUnavailableError } from './core/model/errors/model-unavailable.error';
import type { ModelResponse } from './core/model/interfaces/model-response.interface';
import { answerResponse, ScriptedModel, textResponse, toolCallResponse } from './core/testing/scripted.model';
import { FakeModelCatalog } from './core/testing/fake-model.catalog';
import { RecordingModelLoader } from './core/testing/recording-model.loader';
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
  let modelLoader: RecordingModelLoader;
  let ocrResponses: Map<string, readonly RecognizedLine[] | Error>;

  function testingModule(directory: string) {
    return Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(
        parseConfig(
          { CURBIE_DATA_DIR: directory, CURBIE_SKILLS_DIR: REPOSITORY_SKILLS_DIRECTORY },
          { skillsDirectory: REPOSITORY_SKILLS_DIRECTORY, ocrBinaryPath: '/nonexistent/curbie-ocr' },
        ),
      )
      .overrideProvider(MODEL)
      .useValue(model)
      .overrideProvider(ID_GENERATOR)
      .useValue(new SequentialIdGenerator())
      .overrideProvider(MODEL_CATALOG)
      .useValue(modelCatalog)
      .overrideProvider(MODEL_LOADER)
      .useValue(modelLoader)
      .overrideProvider(OCR)
      .useValue(new ScriptedOcrInvoker(ocrResponses));
  }

  async function startApp(
    responses: Array<ModelResponse | Error>,
    catalog: FakeModelCatalog = new FakeModelCatalog(['qwen3:4b-instruct', 'qwen3:8b']),
    loader: RecordingModelLoader = new RecordingModelLoader(),
  ): Promise<void> {
    model = new ScriptedModel(responses);
    modelCatalog = catalog;
    modelLoader = loader;
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
    ocrResponses = new Map();
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
        cards: [],
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

    it('starts loading the saved model in the background so the first reply does not wait for it', async () => {
      await startApp([]);
      const saved = await request(app!.getHttpServer()).post('/manage/settings').type('form').send(VALID_FORM);
      expect(saved.status).toBe(303);
      expect(modelLoader.requestedModelNames).toEqual(['qwen3:8b']);
    });

    it('still saves when loading the new model fails', async () => {
      await startApp([], undefined, new RecordingModelLoader(new ModelUnavailableError('ECONNREFUSED')));
      const saved = await request(app!.getHttpServer()).post('/manage/settings').type('form').send(VALID_FORM);
      expect(saved.status).toBe(303);
      const page = await request(app!.getHttpServer()).get('/manage/settings');
      expect(page.text).toContain('<option value="qwen3:8b" selected>');
    });

    it('loads nothing when a save fails', async () => {
      await startApp([]);
      await request(app!.getHttpServer()).post('/manage/settings').type('form').send({ ...VALID_FORM, units: 'kelvin' });
      expect(modelLoader.requestedModelNames).toEqual([]);
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

    it('keeps the valid fields of a failed save on the form', async () => {
      await startApp([]);
      const response = await request(app!.getHttpServer())
        .post('/manage/settings')
        .type('form')
        .send({ ...VALID_FORM, timeZone: 'Mars/Olympus' });
      expect(response.status).toBe(400);
      expect(response.text).toContain('<option value="qwen3:8b" selected>');
      expect(response.text).toContain('value="metric" checked');
    });

    it('drops the stored-value error for a field the failed save fixed', async () => {
      await startApp([]);
      app!.get<SettingsRepository>(SETTINGS_REPOSITORY).saveAll({ timeZone: 'Mars/Olympus' }, '2026-11-15T12:00:00.000Z');
      const response = await request(app!.getHttpServer())
        .post('/manage/settings')
        .type('form')
        .send({ ...VALID_FORM, units: 'kelvin' });
      expect(response.status).toBe(400);
      expect(response.text).toContain('<option value="America/Chicago" selected>');
      expect(response.text).not.toContain('Choose a time zone from the list.');
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

    it('refuses a cross-site POST that carries no Origin header and saves nothing', async () => {
      await startApp([]);
      const response = await request(app!.getHttpServer())
        .post('/manage/settings')
        .set('Sec-Fetch-Site', 'cross-site')
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

  describe('Recipes pages', () => {
    const SHEET_CAKE_LABELS = { title: [1], servings: 2, headings: [], ingredients: [3, 4], steps: [6, 7] };
    const CLEAN_MARKDOWN = [
      '# Sheet Cake',
      'Serves: 12',
      '',
      '## Ingredients',
      '- 2 cups flour',
      '- 1 cup sugar',
      '',
      '## Steps',
      '1. Mix everything.',
      '2. Bake 30 minutes.',
      '',
    ].join('\n');

    async function startWithScannedSheetCake(chatResponses: readonly ModelResponse[] = []): Promise<void> {
      ocrResponses.set('cake-1.jpg', [
        { text: 'Sheet Cake', confidence: 0.98 },
        { text: 'Serves 12', confidence: 0.95 },
        { text: '2 cups flour', confidence: 0.9 },
        { text: '1 cup sugar', confidence: 0.3 },
        { text: 'Grandma', confidence: 0.9 },
      ]);
      ocrResponses.set('cake-2.jpg', [
        { text: 'Mix everything.', confidence: 0.9 },
        { text: 'Bake 30 minutes.', confidence: 0.9 },
      ]);
      mkdirSync(join(dataDirectory, 'inbox'), { recursive: true });
      writeFileSync(join(dataDirectory, 'inbox', 'cake-1.jpg'), 'first page');
      writeFileSync(join(dataDirectory, 'inbox', 'cake-2.jpg'), 'second page');
      await startApp([answerResponse(SHEET_CAKE_LABELS), ...chatResponses]);
      const start = app!.get<RecipeInboxScanner>(RECIPE_SCANNER).start();
      if (start.kind !== 'started') throw new Error('The scan did not start.');
      await start.completion;
    }

    function post(path: string) {
      return request(app!.getHttpServer()).post(path).type('form');
    }

    function get(path: string) {
      return request(app!.getHttpServer()).get(path);
    }

    it('the chat page shows the review notice, and the Manage tile shows 1 need review', async () => {
      await startWithScannedSheetCake();
      const chat = await get('/');
      expect(chat.text).toContain('class="chat__notice" href="/manage/recipes"');
      expect(chat.text).toContain('▲ 1 new recipe ready to review');
      const manage = await get('/manage');
      expect(manage.text).toContain('href="/manage/recipes"');
      expect(manage.text).toContain('0 <small class="tile__unit">recipes</small>');
      expect(manage.text).toContain('▲ 1 need review');
      expect(manage.text.indexOf('RECIPES')).toBeLessThan(manage.text.indexOf('SETTINGS'));
    });

    it('the review page shows the draft, the OCR lines with a low-confidence mark, and Line N: Move or delete every line under Unsorted.', async () => {
      await startWithScannedSheetCake();
      const list = await get('/manage/recipes');
      expect(list.status).toBe(200);
      expect(list.text).toContain('href="/manage/recipes/recipe_1"');
      const review = await get('/manage/recipes/recipe_1');
      expect(review.status).toBe(200);
      expect(review.text).toContain('name="markdown"');
      expect(review.text).toContain('# Sheet Cake');
      expect(review.text).toContain('## Unsorted\nServes 12\nGrandma');
      expect(review.text).toMatch(/class="is-low-confidence">▲ 1 cup sugar</);
      expect(review.text).toMatch(new RegExp(`Line \\d+: ${RECIPE_PROBLEM_MESSAGES.unsortedPresent.replace('.', '\\.')}`));
      expect(review.text).toContain('href="/recipes/recipe_1/pages/2"');
    });

    it('approve is refused while Unsorted exists, and the draft is kept', async () => {
      await startWithScannedSheetCake();
      const draft = `${CLEAN_MARKDOWN}\n## Unsorted\nGrandma's note\n`;
      const response = await post('/manage/recipes/recipe_1/approve').send({ markdown: draft });
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe('/manage/recipes/recipe_1?status=notApproved');
      const review = await get(response.headers.location);
      expect(review.text).toContain(RECIPE_PAGE_MESSAGES.notApproved);
      expect(review.text).toContain('Grandma&#x27;s note');
      expect((await get('/recipes/recipe_1')).status).toBe(404);
    });

    it('save then approve a clean draft redirects to the list; the notice is gone; GET /recipes/:id shows the recipe; the page image is served as image/jpeg', async () => {
      await startWithScannedSheetCake();
      const saved = await post('/manage/recipes/recipe_1/save').send({ markdown: CLEAN_MARKDOWN });
      expect(saved.status).toBe(303);
      expect(saved.headers.location).toBe('/manage/recipes/recipe_1?status=saved');
      expect((await get(saved.headers.location)).text).toContain(RECIPE_PAGE_MESSAGES.saved);

      const approved = await post('/manage/recipes/recipe_1/approve').send({ markdown: CLEAN_MARKDOWN });
      expect(approved.status).toBe(303);
      expect(approved.headers.location).toBe('/manage/recipes?status=approved');
      expect((await get(approved.headers.location)).text).toContain(RECIPE_PAGE_MESSAGES.approved);

      expect((await get('/')).text).not.toContain('chat__notice');
      const view = await get('/recipes/recipe_1');
      expect(view.status).toBe(200);
      expect(view.text).toContain('<pre class="recipe-text"># Sheet Cake');
      expect(view.text).toContain('href="/" aria-current="page">CHAT</a>');
      const image = await get('/recipes/recipe_1/pages/1');
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toContain('image/jpeg');
      expect((await get('/recipes/recipe_1/pages/3')).status).toBe(404);
    });

    it('chat about an approved recipe returns a reply with the card built from the approved Markdown', async () => {
      const texasSheetCake = [
        '# Texas Sheet Cake',
        'Serves: 24',
        '',
        '## Ingredients',
        '- 2 cups flour',
        '- 1 T cocoa',
        '',
        '## Steps',
        '1. Bake at 350.',
        '',
      ].join('\n');
      await startWithScannedSheetCake([
        toolCallResponse('search_recipes', { query: 'Texas sheet cake' }),
        toolCallResponse('get_recipe', { recipe_id: 'recipe_1' }),
        textResponse(''),
        answerResponse({ category: 'cited', text: "Here's the Texas sheet cake.", sourceIds: ['src_2'], quotes: [] }),
      ]);
      expect((await post('/manage/recipes/recipe_1/approve').send({ markdown: texasSheetCake })).status).toBe(303);

      const reply = await sendOverWebSocket({
        event: 'user_message',
        data: { conversationId: 'conv_test', text: "What's the recipe for our Texas sheet cake?" },
      });

      expect(reply.event).toBe('assistant_reply');
      const data = reply.data as {
        text: string;
        cards: Array<{ heading: string; body: string; href: string }>;
        citations: Array<{ href?: string }>;
      };
      expect(data.text).toBe("Here's the Texas sheet cake.");
      expect(data.cards[0].body).toBe(texasSheetCake);
      expect(data.cards[0].body).toContain('1 T cocoa');
      expect(data.cards[0].heading).toBe('Texas Sheet Cake');
      expect(data.cards[0].href).toBe('/recipes/recipe_1');
      expect(data.citations[0].href).toBe('/recipes/recipe_1');
      const searchMessage = model.receivedRequests[2].messages.find((message) => message.role === 'tool');
      expect(searchMessage?.content).toContain('recipe_1 | Texas Sheet Cake');
    });

    it('POST with markdown as an array, or over the length limit, answers 400, renders the stored draft, and saves nothing', async () => {
      await startWithScannedSheetCake();
      const asArray = await post('/manage/recipes/recipe_1/save').send('markdown=%23%20Injected&markdown=second');
      expect(asArray.status).toBe(400);
      expect(asArray.text).toContain(RECIPE_PAGE_MESSAGES.invalidMarkdown);
      expect(asArray.text).toContain('## Unsorted\nServes 12\nGrandma');
      expect(asArray.text).not.toContain('Injected');

      const tooLong = await post('/manage/recipes/recipe_1/approve').send({ markdown: `# Long${'x'.repeat(20_000)}` });
      expect(tooLong.status).toBe(400);
      expect(tooLong.text).toContain(RECIPE_PAGE_MESSAGES.invalidMarkdown);
      expect(tooLong.text).not.toContain('# Long');

      const missing = await post('/manage/recipes/recipe_1/save').send({});
      expect(missing.status).toBe(400);

      const review = await get('/manage/recipes/recipe_1');
      expect(review.text).toContain('## Unsorted\nServes 12\nGrandma');
      expect(review.text).not.toContain('Injected');
    });

    it('POST with extra keys (layout, settings) saves normally', async () => {
      await startWithScannedSheetCake();
      const response = await post('/manage/recipes/recipe_1/save').send({
        markdown: CLEAN_MARKDOWN,
        layout: '../../package.json',
        settings: 'x',
      });
      expect(response.status).toBe(303);
      const review = await get('/manage/recipes/recipe_1');
      expect(review.text).not.toContain('## Unsorted');
      expect(review.text).not.toContain('curbie-server');
    });

    it('unknown or malformed ids answer 404; GET /recipes/:id for a draft answers 404', async () => {
      await startWithScannedSheetCake();
      expect((await get('/manage/recipes/recipe_99')).status).toBe(404);
      expect((await get('/manage/recipes/recipe_1..x')).status).toBe(404);
      expect((await get('/manage/recipes/notarecipe')).status).toBe(404);
      expect((await post('/manage/recipes/recipe_99/save').send({ markdown: CLEAN_MARKDOWN })).status).toBe(404);
      expect((await post('/manage/recipes/bad!id/approve').send({ markdown: CLEAN_MARKDOWN })).status).toBe(404);
      expect((await get('/recipes/recipe_1')).status).toBe(404);
      expect((await get('/recipes/recipe_99/pages/1')).status).toBe(404);
      expect((await get('/recipes/recipe_1/pages/abc')).status).toBe(404);
    });

    it('wrong-state actions answer 409 with a fixed message', async () => {
      await startWithScannedSheetCake();
      const discardEdit = await post('/manage/recipes/recipe_1/discard-edit').send({});
      expect(discardEdit.status).toBe(409);
      expect(discardEdit.text).toBe(RECIPE_PAGE_MESSAGES.wrongState);
      expect((await post('/manage/recipes/recipe_1/delete').send({})).status).toBe(409);

      await post('/manage/recipes/recipe_1/approve').send({ markdown: CLEAN_MARKDOWN });
      expect((await post('/manage/recipes/recipe_1/discard').send({})).status).toBe(409);
    });

    it('discard edit resets an approved draft, and delete removes the approved recipe', async () => {
      await startWithScannedSheetCake();
      await post('/manage/recipes/recipe_1/approve').send({ markdown: CLEAN_MARKDOWN });
      await post('/manage/recipes/recipe_1/save').send({ markdown: `${CLEAN_MARKDOWN}\n## Notes\n- Edited\n` });
      expect((await get('/manage/recipes')).text).toContain('edited');

      const discardEdit = await post('/manage/recipes/recipe_1/discard-edit').send({});
      expect(discardEdit.status).toBe(303);
      expect(discardEdit.headers.location).toBe('/manage/recipes/recipe_1');
      expect((await get('/manage/recipes/recipe_1')).text).not.toContain('Edited');

      const deleted = await post('/manage/recipes/recipe_1/delete').send({});
      expect(deleted.status).toBe(303);
      expect(deleted.headers.location).toBe('/manage/recipes');
      expect((await get('/recipes/recipe_1')).status).toBe(404);
      expect(existsSync(join(dataDirectory, 'discarded', 'recipe_1', 'page-1.jpg'))).toBe(true);
    });

    it('saving a new title on an approved recipe keeps the approved title everywhere until re-approved; discard edit keeps it', async () => {
      await startWithScannedSheetCake([
        toolCallResponse('get_recipe', { recipe_id: 'recipe_1' }),
        textResponse(''),
        answerResponse({ category: 'cited', text: "Here's the sheet cake.", sourceIds: ['src_1'], quotes: [] }),
      ]);
      await post('/manage/recipes/recipe_1/approve').send({ markdown: CLEAN_MARKDOWN });
      const renamed = CLEAN_MARKDOWN.replace('# Sheet Cake', '# Chocolate Sheet Cake');
      expect((await post('/manage/recipes/recipe_1/save').send({ markdown: renamed })).status).toBe(303);

      const list = await get('/manage/recipes');
      expect(list.text).toContain('Sheet Cake');
      expect(list.text).not.toContain('Chocolate');
      expect((await get('/recipes/recipe_1')).text).toContain('<h2 class="panel__heading">Sheet Cake</h2>');
      const reply = await sendOverWebSocket({
        event: 'user_message',
        data: { conversationId: 'conv_test', text: 'Show me the sheet cake.' },
      });
      expect((reply.data as { cards: Array<{ heading: string }> }).cards[0].heading).toBe('Sheet Cake');

      await post('/manage/recipes/recipe_1/discard-edit').send({});
      expect((await get('/manage/recipes/recipe_1')).text).toContain('<h2 class="panel__heading">Sheet Cake</h2>');
      expect((await get('/manage/recipes')).text).not.toContain('Chocolate');
    });

    it('the review page loads the script that confirms DISCARD and DELETE RECIPE', async () => {
      await startWithScannedSheetCake();
      const review = await get('/manage/recipes/recipe_1');
      expect(review.text).toContain('<script src="/static/recipe-review.js"></script>');
      const script = await get('/static/recipe-review.js');
      expect(script.status).toBe(200);
      expect(script.text).toContain('confirm(');
    });

    it('a cross-origin POST to approve is refused with 403', async () => {
      await startWithScannedSheetCake();
      const response = await post('/manage/recipes/recipe_1/approve')
        .set('Origin', 'http://evil.example')
        .send({ markdown: CLEAN_MARKDOWN });
      expect(response.status).toBe(403);
      expect((await get('/recipes/recipe_1')).status).toBe(404);
    });

    it('discard moves the photos to discarded/ and the recipe disappears', async () => {
      await startWithScannedSheetCake();
      const response = await post('/manage/recipes/recipe_1/discard').send({});
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe('/manage/recipes');
      expect(existsSync(join(dataDirectory, 'discarded', 'recipe_1', 'page-1.jpg'))).toBe(true);
      expect(existsSync(join(dataDirectory, 'discarded', 'recipe_1', 'page-2.display.jpg'))).toBe(true);
      expect((await get('/manage/recipes/recipe_1')).status).toBe(404);
      expect((await get('/manage/recipes')).text).not.toContain('recipe_1');
    });

    it('POST /manage/recipes/scan redirects with scanStarted', async () => {
      await startApp([]);
      const response = await post('/manage/recipes/scan').send({});
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe('/manage/recipes?status=scanStarted');
      const list = await get('/manage/recipes?status=scanStarted');
      expect(list.text).toContain(RECIPE_PAGE_MESSAGES.scanStarted);
      expect(list.text).toContain('SCAN INBOX');
      expect(list.text).toContain('id="recipe-filter"');
      expect(list.text.match(/<script src="\/static\/recipes\.js"><\/script>/g)).toHaveLength(1);
      expect(list.text.indexOf('<script src="/static/recipes.js">')).toBeGreaterThan(list.text.indexOf('</main>'));
    });

    it('the chat notice counts scan problems neutrally', async () => {
      mkdirSync(join(dataDirectory, 'inbox'), { recursive: true });
      writeFileSync(join(dataDirectory, 'inbox', 'notes.txt'), 'not a photo');
      await startApp([]);
      const start = app!.get<RecipeInboxScanner>(RECIPE_SCANNER).start();
      if (start.kind !== 'started') throw new Error('The scan did not start.');
      await start.completion;
      expect((await get('/')).text).toContain('▲ 1 scan problem → MANAGE');
    });

    it('ignores an unknown status flag', async () => {
      await startApp([]);
      const list = await get('/manage/recipes?status=%3Cscript%3E');
      expect(list.status).toBe(200);
      expect(list.text).not.toContain('script%3E');
      expect(list.text).not.toContain('&lt;script');
    });
  });

  it('refuses to start when the data directory marker is missing', async () => {
    rmSync(join(dataDirectory, DATA_DIRECTORY_MARKER));
    model = new ScriptedModel([]);
    modelCatalog = new FakeModelCatalog([]);
    modelLoader = new RecordingModelLoader();
    await expect(testingModule(dataDirectory).compile()).rejects.toThrow(DataDirectoryUnavailableError);
  });
});

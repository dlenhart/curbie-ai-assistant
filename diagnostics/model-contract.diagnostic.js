const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const distDirectory = path.join(repositoryRoot, 'server', 'dist');
const skillsDirectory = path.join(repositoryRoot, 'skills');

const { OllamaModelAdapter } = require(path.join(distDirectory, 'adapters/model/ollama-model.adapter'));
const { OllamaModelLoader } = require(path.join(distDirectory, 'adapters/model/ollama-model.loader'));
const { ModelLoadingDecorator } = require(path.join(distDirectory, 'core/model/model-loading.decorator'));
const { ConversationOrchestrator } = require(path.join(distDirectory, 'core/conversation/conversation.orchestrator'));
const { buildSystemPrompt } = require(path.join(distDirectory, 'core/conversation/system-prompt.builder'));
const { buildToolRegistry } = require(path.join(distDirectory, 'core/skills/tool-registry.factory'));
const { createSkillAdapters } = require(path.join(distDirectory, 'adapters/skills/skill-adapters.factory'));
const { loadSkillDocuments } = require(path.join(distDirectory, 'adapters/skills/skill-directory.loader'));

const USAGE = `Usage: node diagnostics/model-contract.diagnostic.js [model] [think] [repetitions]

Sends the Phase 1 contract questions through Curbie's real orchestrator and Ollama
adapter, and prints one JSON record per question with every model call's timing,
token counts, and thinking output.

  model         Ollama model tag (default: qwen3:4b-instruct)
  think         default | on | off. "default" sends no think field (default: default)
  repetitions   how many times to ask each question (default: 1)

Run "npm run build" in server/ first; this reads server/dist.`;

const QUESTIONS = [
  "What's 15% of 340?",
  'Convert 3/8 inch to mm',
  'Who won the 1987 World Series?',
  "What's today's date?",
];
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MILLISECONDS = 300_000;
const PREVIEW_LENGTH = 300;
const THINK_SETTINGS = new Set(['default', 'on', 'off']);

function parseArguments(argumentList) {
  if (argumentList.includes('-h') || argumentList.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
  }
  const [modelName = 'qwen3:4b-instruct', thinkSetting = 'default', repetitionText = '1'] = argumentList;
  const repetitions = Number(repetitionText);
  if (!THINK_SETTINGS.has(thinkSetting)) throw new Error(`think must be default, on, or off, not "${thinkSetting}".`);
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error(`repetitions must be a positive integer, not "${repetitionText}".`);
  return { modelName, thinkSetting, repetitions };
}

function createRecordingFetch(thinkSetting, callLog) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (thinkSetting !== 'default') body.think = thinkSetting === 'on';
    const phase = body.format ? 'finalize' : 'tools';
    const startedAt = Date.now();
    const response = await fetch(url, {
      ...init,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    const responseText = await response.text();
    const parsed = parseJsonOrEmpty(responseText);
    const message = parsed.message || {};
    callLog.push({
      phase,
      seconds: (Date.now() - startedAt) / 1000,
      status: response.status,
      promptTokens: parsed.prompt_eval_count,
      outputTokens: parsed.eval_count,
      doneReason: parsed.done_reason,
      thinkingCharacters: (message.thinking || '').length,
      toolCalls: (message.tool_calls || []).map((call) => call.function && call.function.name),
      contentPreview: (message.content || '').slice(0, PREVIEW_LENGTH),
      thinkingPreview: (message.thinking || '').slice(0, PREVIEW_LENGTH),
    });
    return new Response(responseText, { status: response.status, headers: response.headers });
  };
}

function parseJsonOrEmpty(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function createSettingsReader(modelName) {
  const settings = { modelName, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, units: 'imperial' };
  return { current: () => settings };
}

function createOrchestrator(modelName, fetchFunction) {
  let idCounter = 0;
  const idGenerator = { next: (prefix) => `${prefix}_${++idCounter}` };
  const settings = createSettingsReader(modelName);
  const skillAdapters = createSkillAdapters({
    clock: { now: () => new Date() },
    recipeRepository: { search: () => [], findById: () => undefined },
  });
  const toolRegistry = buildToolRegistry(loadSkillDocuments(skillsDirectory), skillAdapters, idGenerator);
  return new ConversationOrchestrator({
    model: new ModelLoadingDecorator(
      new OllamaModelLoader({
        baseUrl: OLLAMA_BASE_URL,
        getFunction: (url, init) => fetch(url, init),
        postFunction: (url, init) => fetch(url, init),
      }),
      new OllamaModelAdapter({
        baseUrl: OLLAMA_BASE_URL,
        fetchFunction,
        timeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
      }),
    ),
    toolRegistry,
    transcripts: { ensureConversation() {}, recentMessages: () => [], appendMessage() {} },
    clock: { now: () => new Date() },
    idGenerator,
    systemPrompt: buildSystemPrompt(toolRegistry.registeredSkills()),
    settings,
    historyMessageLimit: 10,
    maxToolRounds: 4,
  });
}

async function askQuestion(orchestrator, question, conversationId) {
  try {
    const reply = await orchestrator.handleUserMessage({ conversationId, userId: 'owner', text: question });
    return { category: reply.category, text: reply.text, citations: reply.citations.map((citation) => citation.sourceId) };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  const { modelName, thinkSetting, repetitions } = parseArguments(process.argv.slice(2));
  const callLog = [];
  const orchestrator = createOrchestrator(modelName, createRecordingFetch(thinkSetting, callLog));

  for (let repetition = 1; repetition <= repetitions; repetition++) {
    for (const [questionIndex, question] of QUESTIONS.entries()) {
      callLog.length = 0;
      const startedAt = Date.now();
      const outcome = await askQuestion(orchestrator, question, `diagnostic_${repetition}_${questionIndex}`);
      console.log(
        JSON.stringify(
          {
            model: modelName,
            think: thinkSetting,
            repetition,
            question,
            totalSeconds: (Date.now() - startedAt) / 1000,
            outcome,
            calls: [...callLog],
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

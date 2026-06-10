import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as gemini from "../src/sources/gemini.js";
import * as codex from "../src/sources/codex.js";
import * as cursor from "../src/sources/cursor.js";
import * as opencode from "../src/sources/opencode.js";
import { sqliteAvailable } from "../src/sources/sqlite.js";
import { collectUsage } from "../src/usage.js";

const execFileP = promisify(execFile);

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "pollution-src-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("gemini: parses chat sessions, unbundles cached/thought tokens, dedupes ids", async () => {
  await withTmp(async (dir) => {
    const chats = join(dir, "myproject", "chats");
    await mkdir(chats, { recursive: true });
    const msg = {
      id: "g1",
      type: "gemini",
      timestamp: "2026-06-01T10:00:00Z",
      model: "gemini-3-flash-preview",
      tokens: { input: 5000, output: 100, cached: 2000, thoughts: 300, tool: 50, total: 5450 },
    };
    const session = (...messages) => JSON.stringify({ sessionId: "s", messages });
    await writeFile(join(chats, "session-a.json"), session(
      { id: "u1", type: "user", content: [{ text: "hi" }] },
      msg
    ));
    await writeFile(join(chats, "session-b.json"), session(msg)); // checkpoint duplicate
    await writeFile(join(chats, "broken.json"), "{nope");

    const turns = await gemini.collect({ paths: { geminiDir: dir } });
    assert.equal(turns.length, 1);
    assert.deepEqual(turns[0].tokens, {
      input: 3050, // 5000 - 2000 cached + 50 tool
      output: 400, // 100 + 300 thoughts
      cacheRead: 2000,
      cacheWrite: 0,
    });
    assert.equal(turns[0].model, "gemini-3-flash-preview");
    assert.equal(turns[0].ts, Date.parse("2026-06-01T10:00:00Z"));
  });
});

test("codex: reads rollouts, tracks model from turn_context, splits cached input", async () => {
  await withTmp(async (dir) => {
    const day = join(dir, "2026", "06", "01");
    await mkdir(day, { recursive: true });
    const lines = [
      JSON.stringify({ type: "session_meta", payload: { id: "s" } }),
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.5" } }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-06-01T10:00:00Z",
        payload: { type: "token_count", info: null }, // rate-limit ping, no usage
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-06-01T10:00:01Z",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: {
              input_tokens: 22714,
              cached_input_tokens: 7040,
              output_tokens: 404,
              reasoning_output_tokens: 155,
              total_tokens: 23118,
            },
          },
        },
      }),
    ];
    await writeFile(join(day, "rollout-x.jsonl"), lines.join("\n") + "\n");

    const turns = await codex.collect({ paths: { codexDir: dir } });
    assert.equal(turns.length, 1);
    assert.equal(turns[0].model, "gpt-5.5");
    assert.deepEqual(turns[0].tokens, {
      input: 22714 - 7040,
      output: 404,
      cacheRead: 7040,
      cacheWrite: 0,
    });
  });
});

async function makeKvDb(path, rows) {
  const stmts = [
    "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB);",
    ...rows.map(
      ([k, v]) =>
        `INSERT INTO cursorDiskKV VALUES ('${k}', '${JSON.stringify(v).replaceAll("'", "''")}');`
    ),
  ];
  await execFileP("sqlite3", [path, stmts.join("\n")]);
}

test("cursor: joins bubble token counts with composer timestamps", async (t) => {
  if (!(await sqliteAvailable())) return t.skip("sqlite3 CLI not installed");
  await withTmp(async (dir) => {
    const db = join(dir, "state.vscdb");
    await makeKvDb(db, [
      ["composerData:c1", { composerId: "c1", createdAt: 1748772000000 }],
      ["bubbleId:c1:b1", { type: 2, tokenCount: { inputTokens: 1000, outputTokens: 200 } }],
      ["bubbleId:c1:b2", { type: 1, text: "user message, no tokens" }],
      ["bubbleId:c1:b3", { type: 2, tokenCount: { inputTokens: 0, outputTokens: 0 } }],
    ]);
    const turns = await cursor.collect({ paths: { cursorDb: db } });
    assert.equal(turns.length, 1);
    assert.equal(turns[0].ts, 1748772000000);
    assert.deepEqual(turns[0].tokens, { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 });
  });
});

test("opencode: reads assistant messages and trusts non-zero costs", async (t) => {
  if (!(await sqliteAvailable())) return t.skip("sqlite3 CLI not installed");
  await withTmp(async (dir) => {
    const db = join(dir, "opencode.db");
    const msg = (data) => JSON.stringify(data).replaceAll("'", "''");
    const rows = [
      msg({
        role: "assistant",
        modelID: "kimi-k2.6",
        time: { created: 1748772000000 },
        tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 400, write: 30 } },
        cost: 1.25,
      }),
      msg({ role: "user", time: { created: 1748772000000 } }),
      msg({
        role: "assistant",
        modelID: "big-pickle",
        time: { created: 1748772100000 },
        tokens: { input: 6, output: 116, reasoning: 0, cache: { read: 0, write: 11259 } },
        cost: 0,
      }),
    ];
    const stmts = [
      "CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);",
      ...rows.map((r, i) => `INSERT INTO message VALUES ('m${i}', 's', 0, 0, '${r}');`),
    ];
    await execFileP("sqlite3", [db, stmts.join("\n")]);

    const turns = await opencode.collect({ paths: { opencodeDb: db } });
    assert.equal(turns.length, 2);
    const kimi = turns.find((t2) => t2.model === "kimi-k2.6");
    assert.deepEqual(kimi.tokens, { input: 100, output: 60, cacheRead: 400, cacheWrite: 30 });
    assert.equal(kimi.usd, 1.25); // OpenCode's own cost wins
    const pickle = turns.find((t2) => t2.model === "big-pickle");
    assert.equal(pickle.usd, undefined); // zero cost → our estimate applies
  });
});

test("collectUsage merges multiple tools into byTool", async (t) => {
  await withTmp(async (dir) => {
    // Gemini fixture
    const chats = join(dir, "g", "p", "chats");
    await mkdir(chats, { recursive: true });
    await writeFile(
      join(chats, "session-a.json"),
      JSON.stringify({
        messages: [
          {
            id: "g1",
            type: "gemini",
            timestamp: "2026-06-01T10:00:00Z",
            model: "gemini-3-flash-preview",
            tokens: { input: 1000, output: 100, cached: 0, thoughts: 0, tool: 0 },
          },
        ],
      })
    );
    // Codex fixture
    const codexDay = join(dir, "c", "2026", "06", "01");
    await mkdir(codexDay, { recursive: true });
    await writeFile(
      join(codexDay, "rollout-x.jsonl"),
      [
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.5" } }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-06-01T11:00:00Z",
          payload: {
            type: "token_count",
            info: { last_token_usage: { input_tokens: 500, cached_input_tokens: 0, output_tokens: 50 } },
          },
        }),
      ].join("\n") + "\n"
    );

    const agg = await collectUsage({
      tools: ["gemini", "codex"],
      paths: { geminiDir: join(dir, "g"), codexDir: join(dir, "c") },
    });
    assert.equal(agg.entries, 2);
    assert.equal(agg.byTool.size, 2);
    assert.equal(agg.byTool.get("gemini").entries, 1);
    assert.equal(agg.byTool.get("codex").entries, 1);
    assert.ok(agg.usd > 0);
    assert.ok(agg.waterL > 0);
  });
});

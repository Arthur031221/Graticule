// Runs fixed prompts through real agent sessions, with and without the skill,
// and keeps condensed transcripts and the files each agent produced.
//
//   node eval/run.mjs <claude|codex> <skill|bare> <prompt-id> [repetition]
//
// Needs the claude or codex command line program, logged in. Each run happens
// in a fresh folder under .tmp/agent so nothing leaks between runs.
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Runs a program with no input and collects its output. Codex waits for end of input if stdin stays open. */
function run(command, args, { cwd, timeout }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout });
      else
        reject(
          Object.assign(new Error(signal ? `killed by ${signal} after ${timeout / 1000}s` : `exit ${code}`), {
            stdout,
          }),
        );
    });
  });
}
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const [agent, condition, promptId, repetition = "1"] = process.argv.slice(2);
const prompts = JSON.parse(await readFile(join(root, "eval/prompts.json"), "utf8"));
const prompt = prompts.find((p) => p.id === promptId);
if (!["claude", "codex"].includes(agent) || !["skill", "bare"].includes(condition) || !prompt)
  throw new Error("usage: run.mjs <claude|codex> <skill|bare> <prompt-id> [repetition]");

const name = `${agent}-${condition}-${promptId}-${repetition}`;
// A folder far from this repository, so a bare agent cannot find the skill by walking up the tree.
const dir = join(process.env.TMPDIR ?? "/tmp", "graticule-eval", name);
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
for (const file of prompt.files) await cp(join(root, "eval", file), join(dir, file));
if (condition === "skill") {
  const target = agent === "claude" ? ".claude/skills/graticule" : ".agents/skills/graticule";
  await mkdir(join(dir, target, ".."), { recursive: true });
  await cp(join(root, "skills/graticule"), join(dir, target), { recursive: true });
}

const started = Date.now();
let transcript = "";
try {
  if (agent === "claude") {
    const { stdout } = await run(
      "claude",
      [
        "-p",
        prompt.prompt,
        "--model",
        "claude-sonnet-5-5",
        "--dangerously-skip-permissions",
        "--setting-sources",
        "project",
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "40",
        "--no-session-persistence",
      ],
      { cwd: dir, timeout: 900_000 },
    );
    transcript = stdout;
  } else {
    const { stdout } = await run(
      "codex",
      [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "--cd",
        dir,
        prompt.prompt,
      ],
      { cwd: dir, timeout: 900_000 },
    );
    transcript = stdout;
  }
} catch (error) {
  transcript = error.stdout ?? "";
  console.error(`${name}: ${error.message.split("\n")[0]}`);
}

/** Condenses a transcript into the steps a reader needs: what the agent said, ran and saw. */
function condense(text) {
  const steps = [];
  const clip = (value, n) =>
    String(value ?? "")
      .replace(/\s+$/g, "")
      .slice(0, n);
  for (const line of text.split("\n").filter(Boolean)) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "assistant") {
      for (const part of e.message?.content ?? []) {
        if (part.type === "text") steps.push({ role: "assistant", text: clip(part.text, 3000) });
        if (part.type === "tool_use")
          steps.push({ role: "tool_call", tool: part.name, input: clip(JSON.stringify(part.input), 1500) });
      }
    } else if (e.type === "user") {
      for (const part of e.message?.content ?? [])
        if (part.type === "tool_result")
          steps.push({
            role: "tool_result",
            output: clip(typeof part.content === "string" ? part.content : JSON.stringify(part.content), 800),
          });
    } else if (e.type === "result")
      steps.push({ role: "result", turns: e.num_turns, cost_usd: e.total_cost_usd, text: clip(e.result, 4000) });
    else if (e.item) {
      const item = e.item;
      if (item.type === "agent_message") steps.push({ role: "assistant", text: clip(item.text, 3000) });
      else if (item.type === "command_execution" && e.type === "item.completed")
        steps.push({
          role: "tool_call",
          tool: "shell",
          input: clip(item.command, 1500),
          output: clip(item.aggregated_output, 800),
        });
    }
  }
  return steps;
}

const out = join(root, "eval/runs", name);
await mkdir(out, { recursive: true });
const steps = condense(transcript);
await writeFile(join(out, "transcript.jsonl"), steps.map((s) => JSON.stringify(s)).join("\n") + "\n");
const written = (await readdir(dir)).filter((f) => /\.(png|svg|pdf|html|jpg)$/i.test(f));
// Only images are kept, the HTML and SVG an agent writes can be several megabytes.
const produced = written.filter((f) => f.endsWith(".png"));
for (const file of produced) await cp(join(dir, file), join(out, file));
await writeFile(
  join(out, "meta.json"),
  JSON.stringify(
    {
      agent,
      condition,
      prompt: prompt.prompt,
      repetition: Number(repetition),
      seconds: Math.round((Date.now() - started) / 1000),
      steps: steps.length,
      produced,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${name}: ${Math.round((Date.now() - started) / 1000)}s, ${steps.length} steps, produced ${produced.join(", ") || "nothing"}`,
);

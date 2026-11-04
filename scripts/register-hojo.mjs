#!/usr/bin/env node
// 補助bot を TimePersona に登録する。iQi が自分のターミナルで一度だけ実行する。人物はバインドしない。
//
// キーは一度しか表示されず、再発行もできない。この画面にだけ表示するので、そのまま Claude Code の環境 ais-hojo の
// network secrets に貼る。ファイル、ログ、チャットには書かない。このスクリプトもキーを保存しない。
//
// 使い方：node scripts/register-hojo.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const brainRoot = path.resolve(here, '..');
const opsRoot = path.resolve(brainRoot, '../ai-security-hantei-ops');
const files = [path.join(brainRoot, 'config/agents.json'), path.join(opsRoot, 'config/agents.json')];
const BASE = (process.env.TP_API_BASE || 'https://api-timepersona.jp.ai/v1').replace(/\/$/, '');
const dryRun = process.argv.includes('--dry-run');

function loadEntry(file) {
  const entry = JSON.parse(fs.readFileSync(file, 'utf8')).find((a) => a.key === 'hojo');
  if (!entry) throw new Error(`${file} に hojo がありません。`);
  return entry;
}

function writeEns(file, ens) {
  const text = fs.readFileSync(file, 'utf8');
  const next = text.replace(/(\{"key":"hojo"[^\n]*?"ens":)(null|"[^"]*")/, `$1"${ens}"`);
  if (next === text) throw new Error(`${file} の ENS を書き換えられませんでした。手で ${ens} を記入してください。`);
  JSON.parse(next);
  fs.writeFileSync(file, next);
}

async function main() {
  // 表示したキーがパイプやログに残らないよう、人が見ている画面でだけ動かす
  if (!dryRun && !process.stdout.isTTY) throw new Error('キーを表示するので、ターミナルで直接実行してください（パイプやリダイレクトはできません）。');
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`${f} がありません。`);
  const entry = loadEntry(files[0]);
  if (entry.ens) throw new Error(`すでに登録されています（${entry.ens}）。もう一度登録すると、二人になります。`);
  const body = { name: entry.name, description: entry.description, primary_sector: entry.primary_sector, model: entry.model };
  console.log(`登録先：${BASE}/agents/register`);
  console.log(`内容：${JSON.stringify(body)}`);
  if (dryRun) { console.log('dry-run なので、登録しません。'); return; }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('キーは一度しか表示されません。network secrets の画面を開いてから進めてください。登録しますか？ [y/N] ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') { console.log('やめました。'); return; }

  const res = await fetch(`${BASE}/agents/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ens || !data.api_key) throw new Error(`登録できませんでした（HTTP ${res.status}）：${data.error ?? data.message ?? '応答に ens か api_key がありません'}`);

  for (const f of files) writeEns(f, data.ens);
  console.log(`\nENS：${data.ens}（両方の config/agents.json に記入しました）`);
  console.log('\n---- ここから API キー。network secrets に貼ったら、この画面を閉じてください。チャットには貼らないでください ----');
  console.log(data.api_key);
  console.log('---- ここまで ----\n');
}

main().catch((err) => { console.error(`エラー：${err.message}`); process.exitCode = 1; });

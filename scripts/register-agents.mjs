#!/usr/bin/env node
// register-agents.mjs
//
// Registers the AIセキュリティ判定 agents on TimePersona, stores each agent's
// TimePersona API key in its own Claude Managed Agents vault, and binds the persona.
//
// Security rules:
//   - TimePersona API keys are held in memory only. They are never printed,
//     logged, or written to disk (not even to .env).
//   - Only ENS, vault IDs, and credential IDs are shown.
//   - Run this in your own terminal, NOT inside Claude Code (keeps keys out of transcripts).
//
// Double registration:
//   - The vault is the proof of registration. A vault whose metadata.agent_key matches and which
//     already holds TIMEPERSONA_API_KEY means "registered", even if the state file was lost.
//   - If the vaults cannot be listed, the script stops rather than risk registering twice.
//
// Usage (Node 20.6+), from the repository root:
//   node --env-file=.env scripts/register-agents.mjs --dry-run all
//   node --env-file=.env scripts/register-agents.mjs nobunaga
//   node --env-file=.env scripts/register-agents.mjs all
//
// .env (sensitive, never commit):
//   ANTHROPIC_API_KEY=sk-ant-...
//   TP_API_BASE=https://api-timepersona.jp.ai/v1        (optional)
//   TP_ALLOWED_HOST=api-timepersona.jp.ai               (optional; host the agents will call)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const TP_API_BASE = (process.env.TP_API_BASE || 'https://api-timepersona.jp.ai/v1').replace(/\/$/, '');
const TP_ALLOWED_HOST = process.env.TP_ALLOWED_HOST || 'api-timepersona.jp.ai';
const STATE_FILE = process.env.REGISTER_STATE_FILE || 'register-state.json';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const MANAGED_AGENTS_BETA = 'managed-agents-2026-04-01';
const SECRET_NAME = 'TIMEPERSONA_API_KEY';

const AGENTS = [
  { key: 'nobunaga', name: '信長Claude', character_id: 'nobunaga', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の判定役。織田信長の視点で、新しい出来事を一次出典で確かめ、判定カードを出す。Claude で動く AI Agent。' },
  { key: 'shingen', name: '信玄Claude', character_id: 'shingen', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の技術分析役。武田信玄の視点で、備えと情報から原因と守りを分析する。Claude で動く AI Agent。' },
  { key: 'mitsuhide', name: '光秀Claude', character_id: 'mitsuhide', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の反論役。明智光秀の視点で、皆の前提と根拠を問い直す。Claude で動く AI Agent。' },
  { key: 'kenshin', name: '謙信Claude', character_id: 'kenshin', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の目付。上杉謙信の視点で、事実を確かめ、誤りを正す。Claude で動く AI Agent。' },
  { key: 'hideyoshi', name: '秀吉Claude', character_id: 'hideyoshi', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の商いの守り。豊臣秀吉の視点で、中小企業の現場で回る対策を示す。Claude で動く AI Agent。' },
  { key: 'chacha', name: '茶々Claude', character_id: 'chacha', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の民の守り。茶々の視点で、被害を受ける個人がすぐできることを示す。Claude で動く AI Agent。' },
  { key: 'ieyasu', name: '家康Claude', character_id: 'ieyasu', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の制度・再発防止役、反省会の議長。徳川家康の視点で、長く続く仕組みを考える。Claude で動く AI Agent。' },
  { key: 'nene', name: '寧々Claude', character_id: 'nene', model: 'claude-opus-5-5',
    description: 'AIセキュリティ判定 Room の総括役。寧々の視点で、議論を整理し、良い働きを称える。Claude で動く AI Agent。' },
  { key: 'kanbei', name: '官兵衛Claude', character_id: 'kanbei', model: 'claude-sonnet-5-5',
    description: 'AIセキュリティ判定 Room の攻め手の読み。黒田官兵衛の視点で、攻め手の型を読み、先回りの守りを示す。Claude で動く AI Agent。' },
  { key: 'hyojo', name: '評定Claude', character_id: null, model: 'claude-opus-5-5',
    description: 'AIセキュリティ判定 Room の評定役。議論には加わらず、毎晩その日の全投稿を一次出典で点検し、評価と翌日の指示を公開する。Claude で動く AI Agent。' },
];

// ---------- secret redaction ----------
const secrets = new Set([ANTHROPIC_API_KEY].filter(Boolean));
function redact(text) {
  let t = String(text ?? '');
  for (const s of secrets) if (s) t = t.split(s).join('***');
  return t;
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function anthropicHeaders() {
  return {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': MANAGED_AGENTS_BETA,
    'content-type': 'application/json',
  };
}

async function call(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, json, text };
}

function errMsg(r) {
  const j = r.json;
  const m = j?.error?.message ?? j?.message ?? j?.error ?? (r.text || '').slice(0, 300);
  return redact(`${r.status} ${typeof m === 'string' ? m : JSON.stringify(m)}`);
}

async function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  return JSON.parse(await readFile(STATE_FILE, 'utf8'));
}

async function saveState(state) {
  // State holds no secrets: ENS, vault IDs, credential IDs, bind status only.
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

function copyToClipboard(value) {
  const r = spawnSync('pbcopy', { input: value });
  return r.status === 0;
}

function clearClipboard() {
  spawnSync('pbcopy', { input: '' });
}

// ---------- preflight ----------
async function preflight() {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY がありません。.env を確認し、node --env-file=.env で実行してください。');
    process.exit(1);
  }
  const v = await call(`${ANTHROPIC_BASE}/vaults?limit=1`, { headers: anthropicHeaders() });
  if (!v.ok) {
    console.error(`Anthropic API（vault）に接続できません: ${errMsg(v)}`);
    process.exit(1);
  }
  const h = await call(`${TP_API_BASE}/health`);
  if (!h.ok) console.warn(`注意: TimePersona の /health が ${h.status} を返しました。続行します。`);
  console.log('事前確認 OK（Anthropic API と TimePersona API に接続できます）\n');
}

// ---------- registered vaults ----------
async function listAll(pathname) {
  const items = [];
  let page = null;
  do {
    const query = new URLSearchParams({ limit: '100', ...(page ? { page } : {}) });
    const r = await call(`${ANTHROPIC_BASE}${pathname}?${query}`, { headers: anthropicHeaders() });
    if (!r.ok) throw new Error(`一覧を取得できません（${pathname}）: ${errMsg(r)}`);
    items.push(...(r.json?.data ?? []));
    page = r.json?.next_page ?? null;
  } while (page);
  return items;
}

/** Map of agent_key -> { vaultId, credentialId } (credentialId is null for a vault without the key). */
async function loadVaultIndex() {
  const index = new Map();
  for (const v of await listAll('/vaults')) {
    const key = v.metadata?.agent_key;
    if (!key) continue;
    const creds = await listAll(`/vaults/${v.id}/credentials`);
    const cred = creds.find((c) => c.auth?.secret_name === SECRET_NAME && !c.archived_at);
    const known = index.get(key);
    if (!known || (!known.credentialId && cred)) index.set(key, { vaultId: v.id, credentialId: cred?.id ?? null });
  }
  return index;
}

// ---------- one agent ----------
async function registerOne(a, state, rl, dryRun, vaults) {
  const st = (state[a.key] ||= {});
  console.log(`■ ${a.name}（key: ${a.key}）`);

  const known = vaults.get(a.key);
  if (known?.credentialId) {
    console.log(`  登録済みです（vault ${known.vaultId} にキーが入っています）。スキップします。`);
    if (!dryRun && (st.vault_id !== known.vaultId || st.credential_id !== known.credentialId)) {
      st.vault_id = known.vaultId;
      st.credential_id = known.credentialId;
      await saveState(state);
    }
    return;
  }
  if (known && !st.vault_id) {
    // キーの入っていない vault は、前回の途中で止まった分。作り直さずに使う。
    console.log(`  キーの入っていない vault があるので使います（${known.vaultId}）。`);
    st.vault_id = known.vaultId;
  }

  if (st.ens) {
    console.log(`  すでに登録済みです（${st.ens}）。スキップします。`);
    if (!st.credential_id) {
      console.warn('  警告: 登録済みですが、vault への書き込みが記録されていません。キーは失われています。');
      console.warn(`  新しく登録し直す場合は、${STATE_FILE} からこの人の項目を消して再実行してください。`);
    }
    return;
  }

  if (dryRun) {
    console.log(`  [dry-run] vault 作成 → TimePersona 登録 → vault に TIMEPERSONA_API_KEY（${TP_ALLOWED_HOST} のヘッダーのみ）→ ` +
      (a.character_id ? `人物バインド（${a.character_id}）` : 'バインドなし'));
    return;
  }

  // 1. Vault first: if this fails, nothing is registered and no key can be lost.
  if (!st.vault_id) {
    const r = await call(`${ANTHROPIC_BASE}/vaults`, {
      method: 'POST',
      headers: anthropicHeaders(),
      body: { display_name: a.name, metadata: { agent_key: a.key } },
    });
    if (!r.ok) throw new Error(`vault の作成に失敗しました: ${errMsg(r)}`);
    st.vault_id = r.json.id;
    await saveState(state);
  }
  console.log(`  vault: ${st.vault_id}`);

  // 2. Register on TimePersona. The key lives only in this variable.
  let r = await call(`${TP_API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { name: a.name, description: a.description, primary_sector: 'ai', model: a.model },
  });
  if (!r.ok) throw new Error(`TimePersona への登録に失敗しました: ${errMsg(r)}`);
  let key = r.json?.api_key ?? null;
  const ens = r.json?.ens ?? null;
  if (key) secrets.add(key);
  if (!ens || !key) throw new Error('登録の応答に ens または api_key がありません。TimePersona 側を確認してください。');
  st.ens = ens;
  st.registered_at = new Date().toISOString();
  await saveState(state);
  console.log(`  ENS: ${ens}`);

  // 3. Sanity check: the key works for this agent.
  r = await call(`${TP_API_BASE}/agents/me`, { headers: { 'X-API-Key': key } });
  if (!r.ok) console.warn(`  注意: /agents/me の確認に失敗しました（${errMsg(r)}）。続行します。`);

  // 4. Store the key in the vault (header-only, limited to the TimePersona host). Retry up to 3 times.
  let credentialId = null;
  let lastErr = '';
  for (let i = 1; i <= 3 && !credentialId; i++) {
    r = await call(`${ANTHROPIC_BASE}/vaults/${st.vault_id}/credentials`, {
      method: 'POST',
      headers: anthropicHeaders(),
      body: {
        display_name: 'TimePersona API key',
        auth: {
          type: 'environment_variable',
          secret_name: SECRET_NAME,
          secret_value: key,
          networking: { type: 'limited', allowed_hosts: [TP_ALLOWED_HOST] },
          injection_location: { header: true },
        },
      },
    });
    if (r.ok) credentialId = r.json?.id ?? 'created';
    else { lastErr = errMsg(r); await sleep(1500 * i); }
  }

  if (credentialId) {
    st.credential_id = credentialId;
    console.log(`  credential: ${credentialId}`);
  } else {
    console.error(`  vault への書き込みに 3 回失敗しました: ${lastErr}`);
    if (copyToClipboard(key)) {
      console.error('  キーをクリップボードに入れました（画面には表示しません）。');
      console.error(`  Claude Console のボールト「${a.name}」に、環境変数 TIMEPERSONA_API_KEY として貼り付けてください。`);
      console.error(`  許可するホストは ${TP_ALLOWED_HOST}、差し込み先はヘッダーのみにしてください。`);
      await rl.question('  貼り付けが終わったら Enter を押してください（クリップボードを消します）: ');
      clearClipboard();
      st.credential_id = 'manual';
    } else {
      st.credential_id = null;
      console.error('  クリップボードにも入れられませんでした。このエージェントのキーは失われます。');
    }
  }
  await saveState(state);

  // 5. Persona bind (irreversible). Confirm character_id by typing it.
  if (a.character_id) {
    const typed = (await rl.question(
      `  人物をバインドします（取り消せません）。確認のため character_id を入力してください [${a.character_id}]: `,
    )).trim();
    if (typed === a.character_id) {
      r = await call(`${TP_API_BASE}/agent/persona/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: { character_id: a.character_id, era_id: 'sengoku' },
      });
      if (r.ok) {
        st.bound = a.character_id;
        console.log(`  バインド完了: ${r.json?.character_name ?? a.character_id}`);
      } else if (r.status === 409) {
        st.bound = a.character_id;
        console.log('  すでにバインド済みです。');
      } else {
        console.warn(`  バインドに失敗しました: ${errMsg(r)}`);
        console.warn('  あとで、この Agent のセッションの中から $TIMEPERSONA_API_KEY を使ってバインドできます。');
      }
    } else {
      console.log('  一致しないため、バインドしませんでした（あとでセッションの中からバインドできます）。');
    }
    await saveState(state);
  }

  key = null; // drop the only in-memory reference
  console.log('');
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const keys = args.filter((x) => x !== '--dry-run');

  if (keys.length === 0) {
    console.log('使い方: node --env-file=.env scripts/register-agents.mjs [--dry-run] <key...|all>');
    console.log('key: ' + AGENTS.map((a) => a.key).join(', '));
    process.exit(0);
  }

  const targets = keys.includes('all')
    ? AGENTS
    : keys.map((k) => {
        const a = AGENTS.find((x) => x.key === k);
        if (!a) { console.error(`不明な key です: ${k}`); process.exit(1); }
        return a;
      });

  if (!dryRun) await preflight();

  // 登録済みかどうかは vault で確かめる。確かめられないときは、二重登録を避けるために止める。
  let vaults = new Map();
  if (ANTHROPIC_API_KEY) {
    try {
      vaults = await loadVaultIndex();
    } catch (e) {
      if (!dryRun) {
        console.error(`${redact(e.message)}\n二重登録を防ぐため、中止します。`);
        process.exit(1);
      }
      console.warn(`注意: vault を確かめられませんでした。${redact(e.message)}`);
    }
  } else {
    console.warn('注意: ANTHROPIC_API_KEY がないので、vault の確認を飛ばします（dry-run のみ）。');
  }

  const state = await loadState();
  const rl = readline.createInterface({ input, output });
  try {
    for (const a of targets) {
      try {
        await registerOne(a, state, rl, dryRun, vaults);
      } catch (e) {
        console.error(`  ${redact(e.message)}`);
        console.error('  この人の処理を中止し、次へ進みます。\n');
      }
    }
  } finally {
    rl.close();
  }

  console.log('===== 結果 =====');
  for (const a of targets) {
    const st = state[a.key] || {};
    console.log(`${a.name.padEnd(8)}  ENS: ${st.ens ?? '-'}  vault: ${st.vault_id ?? '-'}  credential: ${st.credential_id ?? '-'}  bind: ${st.bound ?? (a.character_id ? '未' : '不要')}`);
  }
  console.log(`\n記録ファイル: ${STATE_FILE}（キーは含みません）。ENS を config/agents.json に書き写してください。`);
}

main().catch((e) => {
  console.error(redact(e?.message ?? e));
  process.exit(1);
});

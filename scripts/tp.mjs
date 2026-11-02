#!/usr/bin/env node
// tp.mjs — TimePersona の投稿・取得（AIセキュリティ判定の Agent 用）。依存なし、Node 20 以上。
//
// キーは持たない（CLAUDE.md §5）：
// - routines：クラウド環境の network secrets が、通信に Authorization を付ける。
// - Managed Agents：環境変数 TIMEPERSONA_API_KEY は置き換え用の印。外に出るときに vault が本物に差し替える。
// どちらでも、このスクリプトはキーの値を表示も保存もしない。
//
// 使い方（結果は JSON で標準出力、説明は標準エラー）：
//   node scripts/tp.mjs post  --thought "<English one line>" --content-file <file> (--reply-to <post_id> | --room) [--force]
//   node scripts/tp.mjs check --thought "<English one line>" --content-file <file>     # 投稿せずに確かめるだけ
//   node scripts/tp.mjs thread <post_id> [--independent <hantei_post_id>] [--as <key>]
//   node scripts/tp.mjs get <post_id> [--as <key>]
//   node scripts/tp.mjs recent [--limit 50] [--as <key>]
//   node scripts/tp.mjs me
//   node scripts/tp.mjs ack --as <key> <id> [<id> ...]                                  # 処理した投稿 ID を記録
//
// 終了コード：0 成功（重複で投稿しなかった場合を含む）／1 使い方・内容の誤り／2 通信・API の誤り／
//             3 投稿の上限（429）／4 TimePersona に止められた（403・422）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'api-timepersona.jp.ai'; // キーはハイフンのホストにだけ付く。下線のホストは使わない
const BASE = `https://${HOST}/v1`;
const ROOM_ID = 'ai-security-hantei';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = ['nobunaga', 'shingen', 'mitsuhide', 'kenshin', 'hideyoshi', 'chacha', 'ieyasu', 'nene', 'kanbei', 'hyojo', 'baseline'];

// 自分たちが使う札（CLAUDE.md §6）
const TAGS = ['速報', '判定', '独立判定', '技術分析', '反論', '攻め手の読み', '制度の視点', '目付', '訂正', '重複',
  'X調査依頼', '一番手柄', '日次総括', '反省会', '点検', '応答', '反省会まとめ', '評定'];

// TimePersona が投稿を止める言葉（backend の banned_words.json と同じ。小文字で部分一致）
const BANNED = ['crypto investment', 'guaranteed profit', '100% return', 'buy now', 'click here', 'free money',
  'make money fast', 'passive income', 'pump and dump', 'get rich', 'limited offer', 'act now', '暗号資産投資',
  '確実に儲かる', '絶対儲かる', '高収益', '今すぐクリック', '無料プレゼント', '投資詐欺', 'マルチ商法', 'ねずみ講',
  'visit our website', 'dm for details', 'contact us for', '詳細はdmへ', '詳細はdmで', 'リンクからどうぞ'];
// 禁止の話題（karma −50 と警告。警告 3 回で利用停止になる）
const PROHIBITED = ['world war', 'ww2', 'wwii', '第二次世界大戦', 'senkaku', 'diaoyu', '尖閣', '钓鱼岛', 'takeshima',
  'dokdo', '竹島', '独島', 'kuril', 'northern territories', '北方領土', 'comfort women', '慰安婦', 'nanking', '南京',
  'yasukuni', '靖国', 'war crime', '戦争犯罪'];
const REWRITE_HINTS = {
  投資詐欺: '「投資をうたう詐欺」「投資名目の詐欺」',
  今すぐクリック: '「クリックを急がせる文面」',
  'click here': '「リンクを押させる文面」',
  無料プレゼント: '「無料をうたう誘い文句」',
  詳細はdmへ: '「DM に誘導する文面」',
  詳細はdmで: '「DM に誘導する文面」',
  暗号資産投資: '「暗号資産への投資をうたう話」',
};

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq !== -1) { args[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { args[a.slice(2)] = next; i++; } else { args[a.slice(2)] = true; }
  }
  return args;
}

function out(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function note(message) {
  process.stderr.write(`${message}\n`);
}

async function api(method, pathname, { body, query } = {}) {
  const url = new URL(`${BASE}${pathname}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json'; // ないと本文が無視される
  const placeholder = process.env.TIMEPERSONA_API_KEY; // Managed Agents では置き換え用の印（本物ではない）
  if (placeholder) headers.authorization = `Bearer ${placeholder}`;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    const e = new Error(`通信できませんでした：${err.message}`);
    e.exitCode = 2;
    throw e;
  }
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const e = new Error(`TimePersona ${method} ${pathname} → HTTP ${res.status}：${json.message ?? json.error ?? text.slice(0, 300)}`);
    e.status = res.status;
    e.body = json;
    e.exitCode = res.status === 429 ? 3 : (res.status === 403 || res.status === 422) ? 4 : 2;
    throw e;
  }
  return json;
}

function firstTag(content) {
  const m = /^【([^】]+)】/.exec(content.trim());
  if (!m) return null;
  return m[1].replace(/\s*第\s*\S+\s*報$/, '').replace(/^続報.*/, '続報').trim();
}

function firstLine(content) {
  return content.trim().split('\n')[0].trim();
}

/** Mirrors the server's language rule and our own rules. Returns a list of problems (empty = OK). */
export function checkPost(thought, content) {
  const problems = [];
  if (!thought || !String(thought).trim()) problems.push('thought がありません（英語で一行）。');
  else if (/\n/.test(thought)) problems.push('thought は一行にしてください。');
  else if (/[ぁ-ゖァ-ー一-鿿]/.test(thought)) problems.push('thought は英語で書いてください（thought も公開されます）。');
  if (!content || !content.trim()) { problems.push('content がありません。'); return problems; }
  if (content.length < 20) problems.push('本文が 20 文字未満です（TimePersona は 400 で拒否します）。');
  const tag = firstTag(content);
  if (!tag) problems.push('本文の先頭に札（【判定】など）がありません（CLAUDE.md §6）。');
  else if (!TAGS.includes(tag) && tag !== '続報') problems.push(`札「【${tag}】」は CLAUDE.md §6 の一覧にありません。`);
  const kana = (content.match(/[ぁ-ゖァ-ー]/g) ?? []).length;
  const kanji = (content.match(/[一-鿿]/g) ?? []).length;
  if (kana + kanji < 10) problems.push('本文を日本語で書いてください。');
  else if (kana / (kana + kanji) < 0.10) problems.push('かなが少なすぎます。漢字だけの文は中国語と見なされ、422 で拒否されます。');
  const lower = `${thought ?? ''}\n${content}`.toLowerCase();
  for (const w of BANNED) {
    if (lower.includes(w)) {
      const hint = REWRITE_HINTS[w] ? `（言い換えの例：${REWRITE_HINTS[w]}）` : '';
      problems.push(`TimePersona の禁止語「${w}」が入っています。403 で止まります${hint}。`);
    }
  }
  for (const w of PROHIBITED) {
    if (lower.includes(w)) problems.push(`禁止の話題に当たる「${w}」が入っています。karma −50 と警告になるので、書かないでください。`);
  }
  if (Buffer.byteLength(JSON.stringify({ thought, content }), 'utf8') > 19_000) problems.push('本文が長すぎます（20kb の上限）。');
  return problems;
}

function readContent(args) {
  if (typeof args['content-file'] === 'string') return fs.readFileSync(args['content-file'], 'utf8').replace(/\s+$/, '');
  if (typeof args.content === 'string') return args.content.replace(/\s+$/, '');
  throw new UsageError('--content-file <file>（または --content "<text>"）が必要です。');
}

function ackFile(key) {
  if (!KEYS.includes(key)) throw new UsageError(`--as の key が不明です：${key}`);
  return path.join(REPO_ROOT, 'state', 'acks', `${key}.json`);
}

function updateAcks(key, mutate) {
  const file = ackFile(key);
  let data = { processed: [], fetched: [] };
  if (fs.existsSync(file)) {
    try { data = { processed: [], fetched: [], ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* keep defaults */ }
  }
  mutate(data);
  data.processed = data.processed.slice(-1000);
  data.fetched = data.fetched.slice(-300);
  data.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** 取得した投稿 ID を記録する（評定が「先に独立判定」を確かめるため）。 */
function logFetch(key, mode, ids) {
  if (!key) return;
  updateAcks(key, (d) => { d.fetched.push({ at: new Date().toISOString(), mode, ids }); });
}

async function whoAmI() {
  try {
    const me = await api('GET', '/agents/me');
    return me.ens ?? null;
  } catch (err) {
    note(`注意：自分の ENS を確かめられませんでした（${err.message}）。重複の確認を飛ばします。`);
    return null;
  }
}

/** 同じ親に、自分の同じ札の投稿がすでにあるか（CLAUDE.md §3 の 3）。 */
async function findDuplicate({ replyTo, content }) {
  const me = await whoAmI();
  if (!me) return null;
  const tag = firstTag(content);
  if (replyTo) {
    const tree = await api('GET', `/posts/${encodeURIComponent(replyTo)}/discussion-tree`);
    const chain = tree.discussion_chain ?? [];
    return chain.find((p) => p.agent?.toLowerCase() === me.toLowerCase()
      && p.quoted_post_id === replyTo && firstTag(p.content ?? '') === tag) ?? null;
  }
  const recent = await api('GET', '/posts/recent', { query: { room: ROOM_ID, limit: 100 } });
  const posts = [...(recent.pinned_posts ?? []), ...(recent.posts ?? [])];
  const line = firstLine(content);
  return posts.find((p) => p.agent?.toLowerCase() === me.toLowerCase() && !p.quoted_post_id
    && firstLine(p.content ?? '') === line) ?? null;
}

async function cmdPost(args, { dryRun }) {
  const thought = typeof args.thought === 'string' ? args.thought.trim() : '';
  const content = readContent(args);
  const replyTo = typeof args['reply-to'] === 'string' ? args['reply-to'] : null;
  if (!dryRun && !replyTo && !args.room) throw new UsageError('--reply-to <post_id>（返信）か --room（親投稿）のどちらかが必要です。');
  if (replyTo && args.room) throw new UsageError('返信には --room を付けません（Room は引き継がれます）。');
  const problems = checkPost(thought, content);
  if (problems.length) {
    out({ ok: false, posted: false, problems });
    return 1;
  }
  if (dryRun) { out({ ok: true, posted: false, problems: [] }); return 0; }
  if (!args.force) {
    const dup = await findDuplicate({ replyTo, content });
    if (dup) {
      out({ ok: true, posted: false, skipped: 'duplicate', existing_post_id: dup.id });
      note('同じ親に、自分の同じ札の投稿がすでにあるので、投稿しませんでした（CLAUDE.md §3）。');
      return 0;
    }
  }
  const body = replyTo ? { thought, content, quoted_post_id: replyTo } : { thought, content, room_id: ROOM_ID };
  const res = await api('POST', '/posts', { body });
  out({ ok: true, posted: true, post_id: res.post_id, room_id: res.room_id, quoted_post: res.quoted_post, karma_earned: res.karma_earned });
  return 0;
}

async function cmdThread(args) {
  const id = args._[1];
  if (!id) throw new UsageError('thread <post_id> が必要です。');
  const tree = await api('GET', `/posts/${encodeURIComponent(id)}/discussion-tree`);
  const chain = tree.discussion_chain ?? [];
  if (typeof args.independent === 'string') {
    // 先に独立判定：親投稿と信長の判定だけを返す（他の人の返信は渡さない）
    const rootId = tree.root_post?.id;
    const keep = chain.filter((p) => p.id === rootId || p.id === args.independent);
    if (!keep.some((p) => p.id === args.independent)) throw new UsageError(`判定の投稿 ${args.independent} がこのスレッドにありません。`);
    logFetch(args.as, 'independent', keep.map((p) => p.id));
    out({ mode: 'independent', root_post: tree.root_post, posts: keep });
    return 0;
  }
  logFetch(args.as, 'thread', chain.map((p) => p.id));
  out({ mode: 'thread', root_post: tree.root_post, posts: chain, total_replies: tree.total_replies });
  return 0;
}

async function cmdGet(args) {
  const id = args._[1];
  if (!id) throw new UsageError('get <post_id> が必要です。');
  const post = await api('GET', `/posts/${encodeURIComponent(id)}`);
  logFetch(args.as, 'get', [post.id]);
  out(post);
  return 0;
}

async function cmdRecent(args) {
  const limit = Math.min(Number(args.limit ?? 50) || 50, 100);
  const res = await api('GET', '/posts/recent', { query: { room: ROOM_ID, limit } });
  const posts = [...(res.pinned_posts ?? []), ...(res.posts ?? [])]
    .sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)))
    .map((p) => ({ id: p.id, agent: p.agent, name: p.name, posted_at: p.posted_at, quoted_post_id: p.quoted_post_id, first_line: firstLine(p.content ?? '') }));
  logFetch(args.as, 'recent', posts.map((p) => p.id));
  out({ room_id: ROOM_ID, posts });
  return 0;
}

async function cmdMe() {
  const me = await api('GET', '/agents/me');
  out({ ens: me.ens, name: me.name, karma: me.karma, posts_count: me.posts_count, status: me.status, timepersona: me.timepersona });
  return 0;
}

function cmdAck(args) {
  if (typeof args.as !== 'string') throw new UsageError('ack には --as <key> が必要です。');
  const ids = args._.slice(1);
  if (!ids.length) throw new UsageError('記録する投稿 ID を指定してください。');
  updateAcks(args.as, (d) => { for (const id of ids) if (!d.processed.includes(id)) d.processed.push(id); });
  out({ ok: true, key: args.as, acked: ids });
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'post': return cmdPost(args, { dryRun: false });
    case 'check': return cmdPost(args, { dryRun: true });
    case 'thread': return cmdThread(args);
    case 'get': return cmdGet(args);
    case 'recent': return cmdRecent(args);
    case 'me': return cmdMe();
    case 'ack': return cmdAck(args);
    default:
      throw new UsageError('使い方：post | check | thread | get | recent | me | ack（ファイル先頭の説明を参照）');
  }
}

main().then((code) => { process.exitCode = code ?? 0; }).catch((err) => {
  if (err instanceof UsageError) { note(`使い方の誤り：${err.message}`); process.exitCode = 1; return; }
  note(err.message);
  if (err.status === 429 && err.body) note(`1 時間の上限 ${err.body.limit} 件に対して ${err.body.current} 件です。残りは memory に書いて、次の起動に回してください。`);
  process.exitCode = err.exitCode ?? 2;
});

# 信長Claude の手順（key: nobunaga）

最初に `personas/nobunaga.md`、`playbook/playbook.md`、`playbook/orders/nobunaga.md`、`memory/personas/nobunaga.md` を読む。

---

## 1. 起動の理由ごとの仕事

| reason | 仕事 |
|---|---|
| `x_sokuho` / `sokuho_other` | §2 新しい速報の判定 |
| `rss_new` | §3 RSS にしかない事案 |
| `correction_request` / `eval_correction` | §4 訂正 |
| `hanseikai_open` / `tenken` | `prompts/_hanseikai.md` |

---

## 2. 新しい速報の判定

1. `post_ids` の投稿を取得する。物見bot（`config/agents.json` の ENS）以外の投稿は、より慎重に扱う。
2. **同じ事案がすでにあるか**を `state/incidents/` で確かめる。
   - すでにある → 新しい事実があれば §2-5 の続報として、その事案の親投稿に返信する。新しい事実がなければ、この速報に `【重複】`（正しいスレッドへのリンク）を返信して終える。
   - ない → 新しい事案として 3 へ。
3. **一次出典を探して開く**：会社・官庁・警察の発表。報道の見出しではなく、発表の本文と内訳を読む。
4. 次を確かめる：初報日、第何報か、何が起きたか、件数と内訳、AI の関与の根拠、影響を受ける人、会社が示している対応。
5. 判定カード（`PLAN.md` §2.2 の書式）を、速報への返信として投稿する。続報の場合は `【続報 第N報】` とし、前の判定から何が変わったかを先頭に書く。
6. AI セキュリティと関係がないと判断した場合は、短く「対象外（理由）」と返信し、事案台帳には `out_of_scope` として記録する。
7. `state/incidents/AIS-YYYYMMDD-NN.json` を作成または更新する。

```json
{
  "id": "AIS-20261102-01",
  "title": "<事案名>",
  "root_post_id": "<速報の投稿 ID>",
  "hantei_post_id": "<判定の投稿 ID>",
  "first_reported": "2026-11-02",
  "report_no": 1,
  "primary_sources": [{"url": "<URL>", "fetched_at": "2026-11-02T15:35:00+09:00"}],
  "severity": "high|mid|low",
  "ai_involvement": "confirmed|estimated|unknown|none",
  "status": "open|out_of_scope",
  "updates": [{"at": "2026-11-02T15:40:00+09:00", "post_id": "<ID>", "note": "<何が変わったか>"}],
  "corrections": [{"at": "2026-11-02T18:00:00+09:00", "post_id": "<訂正の投稿 ID>", "what": "<何を、どう直したか>"}]
}
```

- `primary_sources` には、自分で開いて確かめた URL と、開いた時刻だけを書く。素の Claude も、この URL を材料にする（同じ材料で比べるため）。
- 謙信の `memory/errors.jsonl` に、自分の事案への訂正が記録されていれば、次の起動で `corrections` に取り込む。

- **深刻度が中以上**のときは、判定カードの最後に `#家康 #官兵衛` の札を付ける（watcher が家康と官兵衛を起こす目印）。

## 3. RSS にしかない事案（`rss_new`）

1. `rss_paths` の記事を読み、元の記事と一次出典を開く。
2. 同じ事案が Room にないことを確かめてから、`【速報】`（親投稿、`room_id: ai-security-hantei`）を立てる。書式は物見bot の `【X速報】` と同じ。
3. 続けて、その速報に判定カードを返信する（§2 の 3〜7）。

## 4. 訂正（`correction_request` / `eval_correction`）

毎時の見回りは置かない（watcher が前回以降の新着をすべて扱い、受け取りの記録がなければ起こし直すため）。

1. 自分あての `【目付】`、または評定の訂正リスト（`reports/eval/YYYY-MM-DD.json`）を読み、一次出典を開いて確かめる。
2. 誤りなら、その事案スレッドに `【訂正】` を返信する（どこを、どう直すか）。事案台帳も直す。
3. 指摘が誤りだと考える場合は、根拠を付けて `【目付】` に返信する。

---

## 6. 守ること

- 判定カードの最後に「■ 信長の視点」を必ず書く。
- 1 回の起動で扱いきれないほど新着が多いときは、深刻度が高そうなものから処理し、残りは memory に書いて次の起動に回す。

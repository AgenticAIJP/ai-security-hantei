# 評定Claude の手順（key: hyojo、定時 23:40）

最初に `roles/hyojo.md`、`CLAUDE.md`、`playbook/playbook.md`、`playbook/CHANGELOG.md`、`eval/memory.md` を読む。**`memory/personas/` は読まない。**

**評定の日付は最初に一度だけ取る**：`TZ=Asia/Tokyo date +%F` を作業の最初に実行し、途中で 0 時を過ぎても、その日付を以下の `YYYY-MM-DD` に使う（寧々が翌朝、前日の日付のファイルを読むため）。

---

## 手順

1. **対象を集める**：前回の評定で処理した最後の投稿 ID（`eval/memory.md`）より後の、Room の全投稿を取得する（反省会のスレッドを含む）。時刻で区切らない（起動の遅れで漏れや重複が出るため）。取得は `node scripts/tp.mjs recent --full --limit 1000 --after <最後の投稿 ID> --as hyojo` で行う（最初の評定は `--after` の代わりに `--since 2026-11-02T12:00:00+09:00`）。結果の `truncated` が true なら読み切れていないので、評定にそう書く。`state/incidents/`、`memory/errors.jsonl`、今日の `data/rss/`、今日の `baseline/`、今日の `reports/blind/` も読む。最後に処理した投稿 ID を `eval/memory.md` に書き直す。
2. **事実の点検**：各事案の判定カードと続報を、一次出典と照らし合わせる。物見bot の速報も対象。**素の Claude の文章（今日の `baseline/`）も、同じ手順で点検する**（H3 の比較のため）。見つけた誤りは、謙信が指摘したもの／見落としたもの／謙信の誤指摘に分けて記録する。
3. **議論の点検**：同調、独立判定、まとめの公平さ。
4. **役割の点検**：各人の働きと、物見bot の漏れ（RSS にあって物見bot になかった事案）。信長の「記録のみ」「対象外」の振り分けも点検する（謙信は起こされないので、評定だけが見る。議論すべき事案を落としていないか）。
5. **反省会の点検**：点検の中身、反論の根拠、前日に受け入れた改善の実行。
6. **人物の視点の点検**：各投稿の「◯◯の視点」が結論に効いていたか。効いていた例と、飾りだった例を 1〜2 件ずつ挙げる。
7. **素の Claude との比較**：`roles/baseline.md` の「評定による比較」の手順で行う。盲検の採点（`reports/blind/YYYY-MM-DD.md`）を使う。
8. **指標の集計**：`PLAN.md` §10 の指標を数える。
9. **一番手柄**を 1 件選ぶ（該当なしも可）。
10. **翌日の調整**
    - `playbook/playbook.md` を最小限の差分で改訂する。一番手柄の良かった点を「手本」の欄に加える。
    - `playbook/orders/<key>.md` を 9 人分書く（指示がない人は「今日のまま続ける」と書く）。物見bot への指示は `playbook/orders/monomi.md` に書く（iQi が Grok に伝える）。
    - `playbook/CHANGELOG.md` に、何を、なぜ変えたかを書く。
    - 前日に出した指示が効いたかを確かめ、`eval/memory.md` に書く。
11. **全文を保存**：`reports/eval/YYYY-MM-DD.md`（下の書式）。訂正が必要な投稿は `reports/eval/YYYY-MM-DD.json` にも書く（watcher が本人を起こす）。
    ```json
    {"corrections":[{"author":"nobunaga","post_id":"<ID>","issue":"<何が誤りか>","source":"<一次出典の URL>"}]}
    ```
12. commit し、main に push する。
13. **Room に `【評定】` を投稿する**（親投稿、`room_id: ai-security-hantei`）。

---

## `reports/eval/YYYY-MM-DD.md` の書式

```
# 評定 YYYY/MM/DD（Day N）

## 3 行の要約
## 一番手柄（または該当なし）と理由
## 指標
## 事実の点検（誤りの一覧：誰が・何を・一次出典・謙信の指摘の有無・訂正の有無）
## 議論の点検
## 役割の点検（物見bot を含む）
## 反省会の点検
## 人物の視点（効いていた例／飾りだった例）
## 素の Claude との比較
## 翌日の指示（全員へ／一人ひとりへ／物見bot へ）
## 前日の指示の効果
## iQi への提案（ガードレールなど、評定が変えられないもの）
```

## `【評定】` の書式（Room）

```
【評定】YYYY/MM/DD（Day N）
■ 3 行の要約
■ 一番手柄：<名前> ― <投稿リンク> ― <どこが、なぜ良かったか>
■ 正確さ：事実誤り N 件（謙信が指摘 N／見落とし N）、訂正 N 件
■ 人物の視点：効いていた例／飾りだった例
■ 明日の指示：<全員へ>／<一人ひとりへ、各 1〜2 行>
■ 全文：https://github.com/AgenticAIJP/ai-security-hantei/blob/main/reports/eval/YYYY-MM-DD.md
```

- 指摘は具体的に、投稿リンク付きで書く。人を貶める言葉は使わない。

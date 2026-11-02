# 家康Claude の手順（key: ieyasu）

最初に `personas/ieyasu.md`、`playbook/playbook.md`、`playbook/orders/ieyasu.md`、`memory/personas/ieyasu.md` を読む。

## 仕事ごとの手順

| 仕事・reason | 手順 |
|---|---|
| `hantei`（深刻度が中以上） | `prompts/analyst-common.md` の「先に独立判定」に従い、下の `【制度の視点】` を書く |
| 定時「反省会の開会」（21:20） | §2 |
| `hanseikai_open` | 自分も点検する（`prompts/_hanseikai.md` の A） |
| `tenken` | `prompts/_hanseikai.md` の B |
| 定時「反省会まとめ」（23:00） | §3 |
| `correction_request` / `eval_correction` / `x_answer` | `prompts/analyst-common.md` の表 |

## 1. `【制度の視点】`

```
【制度の視点】<事案名>
■ 再発防止の制度（3 点まで）：<ルール・体制・点検の仕組み>
■ 委託先との約束で確かめること：<置き場所、再委託、消す期限、点検の権利など>
■ 続けるための役割分担：<担当が替わっても続く形>
■ 出典：<一次出典の URL、公的な指針>
■ 家康の視点：<…>
```

## 2. 反省会の開会（定時 21:20。Day 2 から）

1. 今日の Day 番号を求める（2026-11-02 が Day 1）。`config/rotation.json` から今日の組み合わせを読む。
2. 今日（前日 23:40 以降）の事案スレッドを `state/incidents/` と Room から一覧にする。
3. 親投稿として出す（`room_id: ai-security-hantei`）。
   ```
   【反省会】YYYY/MM/DD（Day N）
   本日の事案：
   - <事案名>（<スレッドへのリンク>）
   本日の点検の組み合わせ：
   - 信長 → <相手>
   - …（9 人分）
   進め方：点検は 22:15 まで、応答は 22:50 まで。点検の書式は prompts/_hanseikai.md のとおり。
   ```
4. 自分も点検する側なので、続けて `prompts/_hanseikai.md` の A を行う。

## 3. 反省会まとめ（定時 23:00）

1. `【反省会】` スレッドのすべての `【点検】` と `【応答】` を読む。
2. `【反省会】` に返信する。
   ```
   【反省会まとめ】YYYY/MM/DD
   ■ 受け入れられた改善：<誰が、何を、明日どう直すか>
   ■ まだ争っている点：<双方の言い分と根拠を公平に>
   ■ 応答がなかった点検：<あれば>
   ■ 明日に持ち越す問い：<…>
   ```
- 議長として、どちらかの肩を持たない。無理に一つにまとめない。

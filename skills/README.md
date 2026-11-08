# 汎用スキル

AIセキュリティ判定の 1 週間（2026-11-02〜11-07、81 事案）で確かめた方法を、だれでも Claude Code で使える形にしたものです。Managed Agents や TimePersona がなくても、Claude Code だけで動きます。

| スキル | 何をするか |
|---|---|
| [security-incident-consult](security-incident-consult/SKILL.md) | 情報漏えいやセキュリティ事案の公式の発表から、読む人（個人、企業、中小企業・個人事業主、開発者）がそのまま動ける【最新版】1 枚を作る。役割を分けたサブエージェントが独立に分析し、事情を知らない点検役が一次出典と照らす |
| [consult-team-design](consult-team-design/SKILL.md) | ほかの社会の問題（詐欺、製品の事故、制度の変更など）で、同じ方法のチーム（読む人、役割と問い、一次出典、入口、点検と見直し、守り）を設計する |

## 試した例

- [ロート製薬（2026/11/06 付の発表）](security-incident-consult/examples/rohto-2026-11-06.md)：4 つの役が独立に書き、点検役が原文と一語ずつ照らした。点検役は、通話音声の期間が 3 つの区間に分かれていること、電話していない顧客台帳の対象者（約 280 万人）が置き去りになりやすいこと、個別の案内は送付済みであることなど、読む人の行動を誤らせる 6 点を見つけ、まとめに反映した。

## 入れ方

自分の Claude Code に、スキルのフォルダをコピーします。

```bash
git clone https://github.com/AgenticAIJP/ai-security-hantei.git
mkdir -p ~/.claude/skills
cp -R ai-security-hantei/skills/security-incident-consult ~/.claude/skills/
cp -R ai-security-hantei/skills/consult-team-design ~/.claude/skills/
```

特定のプロジェクトだけで使うときは、`~/.claude/skills/` の代わりに、そのプロジェクトの `.claude/skills/` にコピーします。

## 使い方

Claude Code に、発表の URL を渡して頼むだけです。

```
この発表を見て、自分が対象か、今夜何をすればよいか教えて。
https://www.example.co.jp/news/2026/xxxx
```

スキルの名前で呼ぶこともできます（`/security-incident-consult`）。

## 気をつけること

- 結果は、AI が書き AI が点検したものです。発表は続報で変わります。最後は、会社の公式の窓口で確かめてください。
- 攻撃者のサイトや、公開された漏えい情報そのものは開きません。攻撃の手順や悪用できる設定値も書きません。
- 弱点を調べる提案は、自社のシステムと、許可を得た範囲に限ります。
- 4 つの役と点検役でサブエージェントを 5 つ使うので、ふつうの質問より時間と使用量がかかります。

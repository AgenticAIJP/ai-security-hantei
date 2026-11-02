# 素の Claude の手順（key: baseline）

`roles/baseline.md` を読み、その「手順」に従う。

- 起動通知（`baseline_case`）で起こされたときは、通知にある事案だけを、すぐに書く。定時 22:30 は、起こし損ねた分の補い。

- Room には投稿しない（この環境には投稿用のキーがない）。
- Git に書くのは、チームの中で素の Claude だけ。比較の文章を Room に置くと武将たちに見えてしまうため。終わったら、処理した事案 ID を `node scripts/tp.mjs ack --as baseline incident:<事案ID>` で記録し、`baseline/` と `state/acks/baseline.json` だけを commit して main に push する。
- 武将たちの返信は読まない。読むのは、事案の親投稿（速報）と一次出典だけ。
- 人物の口調や比喩は使わない。
- 今日の事案が 0 件なら、`baseline/YYYY-MM-DD.md` に「対象なし」と書いて終える。

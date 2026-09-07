# 採用ファネル日次レポート（自動同期用ブランチ）

このブランチ（`reports/funnel-data`）は、`scripts/daily-funnel-report.js` の実行結果（集計値のみ・個人情報なし）を
毎朝、ユーザーのローカルPC（Windowsタスクスケジューラ）から自動push するための**専用ブランチ**です。

- 通常の開発ブランチ（`claude/seo-recruitment-platform-mvp-LBKz5` 等）や `main` とは**一切マージしません**。
- このブランチにはコード変更を含めません。`reports/funnel/YYYY-MM-DD.txt` の追加のみが行われます。
- クラウド側の日次分析ルーティン（「採用ファネル日次分析」）は、このブランチから当日分のファイルだけを
  `git fetch` + `git checkout <ref> -- <path>` で取得します（ブランチの切り替えは行いません）。
- push元は `scripts/sync-funnel-report-to-git.js`（`run-daily-funnel-report.bat` から自動実行）で、
  ユーザーのメイン作業ディレクトリとは別の git worktree（`%USERPROFILE%\portfolio-funnel-sync`）内で
  完結するため、メインの作業ブランチには一切影響しません。

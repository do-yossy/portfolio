# ai-bijika-system

「AI商品化実践システム」購入者向けWebアプリ（MVP・依存ゼロ）。

## これは何か

これまで docx/xlsx の束として提供していた「AI商品化実践システム」（90日間・GATE1〜10・AIプロンプト29本）を、
購入者がブラウザだけで進捗管理とプロンプト実行までできるWebアプリにした最初のバージョンです。

## 設計方針

- **依存ゼロ**：`node:http` / `node:sqlite` / `node:crypto` のみ。npm install 不要。
- **AI利用料は購入者負担**：購入者自身のAPIキー（OpenAI/Anthropic）をブラウザに保存し、実行のたびにサーバーへ中継するだけ。
  **キーはディスク・DB・ログのいずれにも保存しない**（`lib/aiproxy.js`）。中継先は既知のAPIエンドポイントに限定し、オープンプロキシ化を防いでいる。
- 他サービス（sales-platform 等）と同じ規約に合わせ、`node:sqlite`・自作 `loadEnv()`・素の `http` ルーティングを採用。

## 起動

```bash
cd ai-bijika-system
cp .env.example .env
npm start          # --experimental-sqlite --env-file=.env
# http://localhost:3300
```

## 現状の範囲（MVP）と未対応事項

実装済み：アカウント作成/ログイン、GATE1〜10の進捗更新、DAY1〜90チェックリスト、
プロンプト一覧・詳細・実行（購入者のAPIキーで中継）、実行履歴の保存。

**未対応・今後の課題**：
- 決済・購入者証明との連携（誰が「購入者」かの認証は今はメール登録のみ）
- パスワードリセット・メール確認
- レート制限（`/api/run-prompt` の連打対策）
- 本番デプロイ設定（Fly.io の `fly.toml` ・GitHub Actions のデプロイワークフローは未作成）
- 自動テスト

そのため、このまま本番公開するのではなく、レビュー後に決済導線・デプロイ設定を追加してから公開することを想定しています。

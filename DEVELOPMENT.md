# 開発環境セットアップメモ

## 前提
- Node.js 20.x 以上（Vite 5 系に対応）
- PHP 8.4 以上 / Composer 2 以上
- Python 3.12 以上（`mcp` CLI 利用）

## 初回セットアップ
```bash
# Laravel 側
cd backend
cp .env.example .env
composer install
php artisan key:generate

# React 側
cd ../frontend
npm install
npm run build
```

## MCP 開発サーバーの起動
`ai_shift_app` ルートで以下を実行してください。
```bash
# mcp[cli] が未導入の場合
pip install --user 'mcp[cli]'

# フロントエンドをブラウザで確認
~/Library/Python/3.12/bin/mcp dev scripts/dev_server.py:server
```

コマンド実行後、ターミナルに表示される Inspector URL をブラウザで開くと、`/app/` 配下でビルド済み React UI を確認できます。

## 補足
- React 側は Tailwind CSS が組み込まれています。開発中は `npm run dev -- --host 0.0.0.0 --port 5173` 等でホットリロードも可能です。
- Laravel 側はまだ雛形状態です。`php artisan serve` と MySQL 接続設定を整えることで API 実装を進められます。
- フロントエンドから API を叩く際は `frontend/.env.example` を参考に `VITE_API_BASE_URL` を設定し、`php artisan serve`（デフォルト: http://localhost:8000）を起動した状態でアクセスしてください。
- シードデータには `admin@example.com` / `password` の管理者ユーザーが含まれています。ログイン後はダッシュボードからユニットのシフト一覧・新規作成が可能です。

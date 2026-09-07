# エッヂ落ちスレ検索 MVP

R2に取り込んだログを、タイトル・本文・期間・レス数で検索するWebアプリです。ローカル起動時は `data/threads.json` のサンプルで動作します。

## Cloudflareへの接続

`wrangler.jsonc` はR2バケット `edge-thread-finder-archive` を `ARCHIVE` としてWorkerへバインドします。Workerの `GET /api/archive?date=YYYY-MM-DD` はR2のJSONLを検索画面用JSONへ変換して返します。フロントはこのAPIが使える環境では `2026-09-06` のR2ログを、ローカルではサンプルを表示します。

デプロイはWorkerを新規作成・更新する外部操作になるため、認証設定後に明示的に実行します。

## 起動

Node.js 20以降で以下を実行します。

```powershell
npm start
```

`http://localhost:4173` を開いてください。

## ログ投入

`data/threads.json` に次の項目を持つ配列を追加すると、そのまま検索対象になります。

```json
{ "id": "...", "title": "スレタイ", "body": "本文の抽出", "createdAt": "2025-08-22T13:34:00+09:00", "responses": 120, "url": "https://..." }
```

現在の同梱データはUI動作確認用のサンプルです。実運用では公開ログを収集・正規化して、この形式へ投入してください。

## タグ付けのMVP方針

タグは検索の絞り込みと関連スレ推薦のため、スレッド単位で付与します。`tags` は `[分類, 値]` の配列です。

収集済みの `【NHKBS】WSH@LAD★3` には、`種別: 実況`、`競技: 野球`、`リーグ: MLB`、`球団: ドジャース / ナショナルズ`、`選手: 大谷翔平` を付与しています。略称（WSH、LAD）だけでなく本文に十分な出現がある固有名詞を正規化する想定です。

## AI精密判定

`POST /api/analyze-tags` は、まず `lib/tagging.js` の辞書で候補を抽出し、その候補と本文を `gpt-5.6-luna` に渡して採否・追加候補・確信度をJSONで返します。Lunaには分類以外をさせず、タグの根拠を返すよう制約しています。Structured Outputsを使うため、レスポンスは指定スキーマに固定されます。

APIキーを設定しない状態でも、アプリは起動できます。精密判定だけが無効になり、辞書候補は利用可能です。

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:TAGGING_MODEL = "gpt-5.6-luna" # 任意
npm start
```

キーは `.env` やGitに置かないでください。Cloudflare Workersへ移行する場合も、`OPENAI_API_KEY` をSecretとして登録します。

## 日次アーカイブ取得

公開ミラーの過去ログ一覧から、スレッドID（作成UNIX時刻）でJSTの日付範囲を絞り込みます。本文を含む可搬なJSON Lines形式で `data/archive/YYYY-MM-DD.jsonl` に保存し、同時に件数などのmanifestを作ります。SQLite/D1へ移行する際も、このJSONLをそのまま投入できます。

```powershell
node scripts/import-day.js 2026-09-06 --dry-run
node scripts/import-day.js 2026-09-06
```

公開ミラーへ当該日の過去ログが反映される前は、処理を中断して保存しません。部分的な収集結果を「1日分」と誤認させないためです。

ミラー側が日付の途中からしか公開していない場合も同様に保存を止めます。意図して部分ログだけ保存する場合に限り、`--allow-partial` を明示してください。

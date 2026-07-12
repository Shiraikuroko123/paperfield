# Paperfield

<p align="center">
  <strong>Language / 言語 / 语言:</strong>
  <a href="../../README.md">中文</a> |
  <a href="README.en.md">English</a> |
  <a href="README.ja.md">日本語</a>
</p>

Paperfield は、具身知能、大規模言語モデル、マルチモーダル研究、オープンソースプロジェクト追跡のためのローカル優先研究ワークスペースです。論文と GitHub プロジェクトを集約し、週次選定に必要な合法的な公開 PDF を事前に探し、精読、翻訳、質問応答、ソースコード解説、閲覧履歴を一つの継続的な画面にまとめます。

これは日本語のプロジェクト説明です。中国語の正式説明はルートの `README.md`、英語版は同じ `docs/i18n/` フォルダにあります。過去のロードマップ、重複した説明、バックアップ文書は維持しません。

## 主な機能

- arXiv、OpenAlex、Crossref、PMLR、CVF Open Access、DBLP などの公開ソースを集約し、具身 AI、ロボティクス、視覚、マルチモーダル、大規模言語モデル、エージェントを対象にします。
- 調整可能な五つの重みにより週次論文を順位付けし、合法的な公開 PDF が確認済みの項目を優先します。
- リーダー内で PDF、精読、数式、翻訳、原文に基づく対話履歴を並べて表示します。
- 毎週少数の関連 GitHub プロジェクトを推薦し、README、主要な入口、依存関係、ソースコード読解経路を整理します。
- ローカル保存、Cloudflare R2、その他の S3 互換オブジェクトストレージに対応し、精読と質問応答を共有クラウドへ同期できます。
- ログイン保護された内測共有に対応します。一般ユーザーは自分の OpenAI 互換 API を設定でき、キーとモデル一覧はユーザー間で共有されません。

## 正式なディレクトリ構成

```text
paper-scout/
├─ README.md                         中国語の主説明
├─ src/
│  └─ paperfield/                    アプリケーションのソースパッケージ
│     ├─ __init__.py                 Python パッケージマーカー
│     ├─ app.py                      HTTP、収集、推薦、PDF、AI、保存、アカウントの処理
│     ├─ catalog/                    公開可能な分野カタログと収集方針
│     │  ├─ config.json              トピック、クエリ、推薦方針
│     │  ├─ venues.json              会議・ジャーナルと出版ソースの知識ベース
│     │  └─ institutions.json        大学・研究機関マーカーのカタログ
│     └─ static/                     ブラウザクライアント
│        ├─ index.html               メインワークスペース
│        ├─ app.js                   論文、プロジェクト、リーダー、設定の操作
│        ├─ styles.css               清華紫テーマとレスポンシブ UI
│        ├─ login.html               内測ログイン画面
│        ├─ login.js                 ログイン操作
│        ├─ login.css                ログイン画面のスタイル
│        └─ vendor/                  固定版 PDF.js と KaTeX のフロントエンド資産
├─ deploy/                           デプロイ設定
│  ├─ .env.example                  秘密情報を含まない環境変数例
│  ├─ requirements.txt              Python 実行時依存関係
│  ├─ compose.yaml                  Docker Compose サービス定義
│  └─ docker/
│     ├─ Dockerfile                 コンテナビルドファイル
│     └─ Dockerfile.dockerignore    Docker ビルドコンテキストの除外規則
├─ scripts/                          Windows 実行、検査、更新、共有、パッケージ化スクリプト
│  ├─ run.cmd / run.ps1             ローカルワークスペースを起動
│  ├─ refresh.cmd / refresh.ps1     論文とプロジェクトのソースを手動更新
│  ├─ check.cmd / check.ps1         単体テストと JavaScript 構文検査を実行
│  ├─ manage-beta-users.py          内測アカウントの作成、再設定、無効化
│  ├─ start-beta-*.ps1              保護された ngrok 共有サービスを開始
│  ├─ stop-beta-share.ps1           共有サービスを停止
│  ├─ install-beta-*.ps1            デスクトップショートカットまたは自動起動を作成
│  └─ build-release.py              個人データを含まない Windows リリースパッケージを作成
├─ tests/
│  └─ test_core.py                  バックエンド動作の回帰テスト
├─ docs/i18n/                       英語と日本語の説明
│  ├─ README.en.md                  English guide
│  └─ README.ja.md                  この日本語ガイド
├─ .github/                         CI、正式リリースワークフロー、Issue テンプレート
├─ .gitignore                       個人データ、キャッシュ、秘密情報、ビルド成果物を除外
├─ .gitattributes                   Git テキスト属性
├─ local/                           Git に入らないローカルの私有実行データ
├─ data/                            Git に入らない旧版互換データ
└─ dist/                            Git に入らないローカル生成リリースアーカイブ
```

`local/`、`data/`、`dist/` は実行時ディレクトリであり、公開ソースコードではありません。ローカルのプロジェクトルートに表示されても GitHub には送られません。これらを `src/` に移動したり、Git にコミットしたりしないでください。

## ローカル利用

### 初回起動

```powershell
cd G:\ps\paper-scout
python -m pip install -r deploy\requirements.txt
python src\paperfield\app.py
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) を開いてください。初回起動ではローカルデータベースとキャッシュを初期化します。その後は UI から手動で更新するか、設定した周期でバックグラウンド更新を利用できます。

よく使うコマンド：

```powershell
.\scripts\run.cmd
.\scripts\refresh.cmd
.\scripts\check.cmd
```

## 個人データと AI 設定

データベース、PDF、解析済み全文、プロジェクトキャッシュ、精読、対話履歴、アカウント、ローカル秘密情報は、既定では `local/data/` に保存されます。既存の旧版 `data/` は互換性のため読み取り可能なままであり、移行時にデータを失いません。

実際の値を入力する前に、環境変数の例を私有の場所へコピーします。

```powershell
Copy-Item deploy\.env.example local\.env
```

`local/.env` で `PAPERFIELD_OPENAI_API_KEY`、`PAPERFIELD_OPENAI_BASE_URL`、`PAPERFIELD_OPENAI_MODEL`、推論強度を設定できます。明示的な設定がない場合、Paperfield はローカル CC Switch が提供する OpenAI 互換設定を利用しようとします。CC Switch の API を変更すると、新規の精読と対話には影響しますが、保存済みの精読と履歴は変わりません。

一般ユーザーが Web 設定で API を接続した場合、そのユーザー自身のキーで利用可能なモデルだけが表示されます。内測アカウントはサーバー側の設定と利用枠を使用します。`local/.env`、`deploy/.env`、データベース、PDF を GitHub にコミットしないでください。

## クラウドと共有

Cloudflare R2 とその他の S3 互換ストレージは、PDF、精読、質問応答履歴の同期に使用できます。設定は `deploy/.env.example` の `PAPERFIELD_S3_*`、`PAPERFIELD_CLOUD_PREFIX`、`PAPERFIELD_SHARED_STORAGE_MAX_MB` に記載されています。共有ライブラリの容量は `PAPERFIELD_SHARED_STORAGE_MAX_MB` で管理され、アプリは使用量と操作統計を表示します。

ブラウザで友人と共有するには、内測アカウントを作成し、デスクトップショートカットを導入します。

```powershell
python scripts\manage-beta-users.py add <username> --role beta
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

デスクトップの `Paperfield Share` はローカルサービスと ngrok トンネルを開始し、URL をコピーします。`Stop Paperfield Share` は共有を停止します。共有中は元のコンピューターをオンラインかつ起動した状態に保つ必要があります。予約済みの ngrok ドメインを使う場合は `local/.env` に `PAPERFIELD_NGROK_URL` を設定してください。

## Docker デプロイ

Docker は専用のデプロイディレクトリを使用しますが、ビルドコンテキストはリポジトリルートです。

```powershell
Copy-Item deploy\.env.example deploy\.env
docker compose --env-file deploy\.env -f deploy\compose.yaml up --build -d
```

サービスの停止：

```powershell
docker compose --env-file deploy\.env -f deploy\compose.yaml down
```

コンテナはデータ用の名前付きボリュームを使用します。本番では `.env` とボリュームを管理された場所へバックアップしてください。

## 開発と検証

```powershell
python -m py_compile src\paperfield\app.py
node --check src\paperfield\static\app.js
node --check src\paperfield\static\login.js
python -m unittest discover -s tests -p test_core.py
python scripts\build-release.py
docker build -f deploy\docker\Dockerfile -t paperfield:test .
docker compose -f deploy\compose.yaml config --quiet
```

`scripts/build-release.py` は Git で追跡されている公開ファイルだけをパッケージし、空の `local/.env.example` を追加します。データベース、ログ、秘密情報、`local/`、`data/` をリリースパッケージへ入れることは拒否します。

## 正式リリース方針

`v0.12.7` は唯一保持する正式リリースタグであり、GitHub Release のタイトルは `Paperfield 首个发布版本` です。今後の変更は `main` へ統合し、完全な検証後にこの一つの正式リリースを更新します。古いタグ、過去の Release、バックアップ文書、一時的なデザイン成果物は保持しません。

# Paperfield

[中文](../../README.md) | [English](README.en.md) | [日本語](README.ja.md)

Paperfield は、具身知能、大規模言語モデル、オープンソースプロジェクトを追跡するためのデスクトップ研究ワークステーションです。幅広い候補から毎週読むべき論文を選び、合法的に公開されている PDF を探し、論文・ソースコード・解説・質問履歴を一つの流れで管理します。

## 主な機能

- 研究分野ごとに毎週最大 5 本の論文を、説明可能なスコアとともに推薦します。
- 毎週の推薦では確認済みの合法的な公開 PDF と公開版の手掛かりを優先し、取得できない候補は有料版で埋めずに同分野の準備済み候補へ置き換えます。
- 5 分割のスコアリングリングで、学術品質、方向適合度、鮮度、証拠の完全性、影響・再現性の比率を調整し、論文一覧と週間推薦を再ランキングできます。
- バックグラウンドで今週の公開 PDF を事前取得し、優先論文の全文解説を生成します。次の自然週に対象を自動更新します。
- トップ会議、主要ジャーナル、プレプリント、公開学術メタデータを収集し、正式発表と未確認プレプリントを区別します。
- 左側に PDF、右側に全文解説、ページ翻訳、原文に基づく質問機能を表示します。
- 論文、README、ソースコードの読解順序を関連付けた GitHub プロジェクトを毎週最大 4 件推薦し、同じ週の間は内容を維持します。大規模リポジトリはバックグラウンドで準備し、完全な ZIP を取得できない場合は README、設定、入口、主要なテキストソースへ安全に縮小します。
- ローカル、Cloudflare R2、またはハイブリッドの PDF 保存と、解説・会話履歴のバックアップに対応します。
- 最大 4 名の信頼できるテスター向けに、パスワード保護された共有モードを提供します。

## ローカル実行

```powershell
cd G:\ps\paper-scout
python app.py
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) を開きます。

データベース、PDF、コードキャッシュ、解説、チャット、秘密情報は、Git 対象外の `local/` に保存されます。詳細は [公開ソースとローカルファイル](PUBLIC_AND_LOCAL.ja.md) を参照してください。テスターは通常 GitHub Releases のクリーンな圧縮ファイルを利用します。

`PAPERFIELD_OPENAI_API_KEY` を明示設定していない場合、CC Switch の変更は以後の全文解説と質問に反映されます。保存済みの解説、チャット、ノートは変わりません。`local/.env` の明示的な Paperfield API 設定が CC Switch より優先されます。

アプリ内の **Storage and models** では、現在のインスタンスの API で利用可能なモデルを確認し、Paperfield 専用のモデルを選択できます。モデル一覧と選択はそのインスタンスだけに保存され、他の利用者のモデル名や認証情報を表示・送信しません。互換プロバイダーが `Chat Completions` または `Responses` の片方だけを実装している場合、空応答や非互換応答の後にもう一方を自動で試します。

## テスターとの共有

[ベータ共有ガイド](../BETA_SHARING.md) に従って ngrok とアカウントを設定します。Windows ではデスクトップショートカットを一度だけインストールできます。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

**Paperfield Share** でバックグラウンド共有を開始し、**Stop Paperfield Share** で停止します。テスター側はブラウザだけで利用できます。

Windows サインイン後に共有を自動起動するには、`powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-autostart.ps1` を一度実行します。固定 URL には `local/.env` の `PAPERFIELD_NGROK_URL` を設定します。

## ドキュメント

- [ドキュメント一覧](../README.md)
- [アーキテクチャ](../ARCHITECTURE.md)
- [デプロイ](../DEPLOYMENT.md)
- [公開ソースとローカルファイル](PUBLIC_AND_LOCAL.ja.md)
- [ロードマップ](../ROADMAP.md)
- [変更履歴](../CHANGELOG.md)
- [コントリビューション](../../.github/CONTRIBUTING.md)
- [セキュリティ](../../.github/SECURITY.md)

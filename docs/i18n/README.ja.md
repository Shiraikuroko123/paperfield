# Paperfield

[中文](../../README.md) | [English](README.en.md) | [日本語](README.ja.md)

Paperfield は、具身知能、大規模言語モデル、オープンソースプロジェクトを追跡するためのデスクトップ研究ワークステーションです。幅広い候補から毎週読むべき論文を選び、合法的に公開されている PDF を探し、論文・ソースコード・解説・質問履歴を一つの流れで管理します。

## 主な機能

- 研究分野ごとに毎週最大 5 本の論文を、説明可能なスコアとともに推薦します。
- トップ会議、主要ジャーナル、プレプリント、公開学術メタデータを収集し、正式発表と未確認プレプリントを区別します。
- 左側に PDF、右側に全文解説、ページ翻訳、原文に基づく質問機能を表示します。
- 論文、README、ソースコードの読解順序を関連付けた GitHub プロジェクトを毎週最大 4 件推薦し、同じ週の間は内容を維持します。
- ローカル、Cloudflare R2、またはハイブリッドの PDF 保存と、解説・会話履歴のバックアップに対応します。
- 最大 4 名の信頼できるテスター向けに、パスワード保護された共有モードを提供します。

## Markdown の三言語表示

Paperfield 自体の README は、次の三つの静的ファイルとして管理されています。

- 中国語：[README.md](../../README.md)
- 英語：[README.en.md](README.en.md)
- 日本語：[README.ja.md](README.ja.md)

Paperfield の GitHub プロジェクトリーダーでは、すべての `.md` ファイルに `中/英/日` の印が付きます。英語表示はリポジトリの原文を使用し、中国語と日本語は初回クリック時に無料翻訳エンドポイントで生成されます。GPT Token は使用せず、結果はローカルと任意の R2 にキャッシュされます。

その他の保守文書を、人工翻訳済みであるかのようには表示しません。配置と言語状態は [ドキュメント一覧](../README.md) にまとめています。

## ローカル実行

```powershell
cd G:\ps\paper-scout
python app.py
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) を開きます。

## テスターとの共有

[ベータ共有ガイド](../BETA_SHARING.md) に従って ngrok とアカウントを設定します。Windows ではデスクトップショートカットを一度だけインストールできます。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

**Paperfield Share** でバックグラウンド共有を開始し、**Stop Paperfield Share** で停止します。テスター側はブラウザだけで利用できます。

## ドキュメント

- [ドキュメント一覧](../README.md)
- [アーキテクチャ](../ARCHITECTURE.md)
- [デプロイ](../DEPLOYMENT.md)
- [ロードマップ](../ROADMAP.md)
- [変更履歴](../CHANGELOG.md)
- [コントリビューション](../../.github/CONTRIBUTING.md)
- [セキュリティ](../../.github/SECURITY.md)

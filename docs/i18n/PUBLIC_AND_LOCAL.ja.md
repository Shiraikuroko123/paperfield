# 公開ソースとローカルファイル

[中文](../PUBLIC_AND_LOCAL.md) | [English](PUBLIC_AND_LOCAL.en.md)

Paperfield は、GitHub で公開できるソースコードと、このコンピューターだけに保存するデータを分離します。

## GitHub で公開する内容

- `app.py` と `static/`: アプリケーションと画面のコード。
- `config.json`、`venues.json`、`institutions.json`: 秘密情報を含まない公開設定。
- `scripts/`: 起動、検証、共有、Release 作成用の再利用可能なツール。
- `docs/`、`README.md`、Docker ファイル、GitHub 自動化設定。

## ローカル専用の内容

新しいインストールでは、非公開データを Git 対象外の `local/` に保存します。

```text
local/
  .env                 API、翻訳、オブジェクトストレージの認証情報
  data/                DB、PDF、全文、コードキャッシュ、解説、チャット
    profiles/beta/     ベータアカウントと共有環境のデータ
  logs/                ローカル実行ログ
```

従来のルート `.env` と `data/` も引き続き利用できます。これらのパス、データベース、PDF、ログを Git に強制追加しないでください。

## Releases と Packages

`APP_VERSION` と一致するタグ（例: `v0.10.4`）を push すると、テスト後に個人データを含まない Windows Release が作成されます。GitHub Packages は将来 Docker イメージを配布するために利用できますが、論文や個人データの保存場所ではありません。

# Claude Code bypass モード 安全運用環境

[Zenn の記事](https://zenn.dev/yamato_snow/articles/a8fd6f4e0fa39c)に沿って、
Claude Code を `--dangerously-skip-permissions`(bypass モード)で
**安全に無人実行**するための環境一式です。

> ⚠️ `dangerously` の名のとおり、何も考えずに使うと事故ります。
> 必ず下記の隔離環境内でのみ使ってください。

## 構成

| ファイル | 役割 | 対応する記事ポイント |
|---|---|---|
| `devcontainer.json` | 隔離環境(Dev Container)の定義 | ① 隔離環境での実行 |
| `Dockerfile` | non-root `node` ユーザー + ツール一式 | ① 隔離環境での実行 |
| `init-firewall.sh` | iptables/ipset で許可ドメインのみ通信許可 | ④ ネットワーク制限 |
| `../.gitignore` | `.env`/鍵/認証情報をコミット対象外に | ② 秘匿情報の隔離 |
| `../.github/workflows/claude-headless.yml` | CI での headless 無人実行 | ⑤ 使い捨て実験 |

## 使い方(ローカル / Dev Container)

1. VS Code + Dev Containers 拡張をインストール
2. このリポジトリを開き、コマンドパレットから
   **Dev Containers: Reopen in Container** を実行
3. 初回起動時に `postCreateCommand` でファイアウォールが自動設定される
   (`NET_ADMIN`/`NET_RAW` capability が必要なので `runArgs` で付与済み)
4. コンテナ内ターミナルでログイン:
   ```bash
   claude          # 初回は /login で認証(設定はボリュームに永続化)
   ```
5. bypass モードで起動:
   ```bash
   claude --dangerously-skip-permissions
   ```

### ファイアウォールの動作確認

```bash
# 許可外は遮断される(タイムアウト or 失敗すれば正常)
curl https://example.com

# 許可ドメインは到達できる
curl https://api.anthropic.com
```

許可ドメインを追加したい場合は `init-firewall.sh` の `ALLOWED_DOMAINS`
配列に足して、`sudo /usr/local/bin/init-firewall.sh` を再実行してください。

## 使い方(CI / 無人実行)

GitHub の **Settings > Secrets and variables > Actions** で
`ANTHROPIC_API_KEY` を登録してから:

- **手動実行**: Actions タブ → "Claude Code (headless)" → Run workflow →
  指示文を入力
- **定期実行**: 毎日 JST 03:00 に自動実行(不要なら workflow の
  `schedule` ブロックを削除)

実行結果は `claude/headless-<run_id>` ブランチへ push され、PR が作られます。
**マージ前に必ず人間がレビュー**してください(記事ポイント③⑤)。

## やってはいけないこと(記事ポイント⑤)

- ホスト OS で直接 bypass モードを使う(隔離環境の外で使わない)
- 本番系の認証情報を作業ディレクトリに置く
- 他人と共有しているセッション/サーバーで使う

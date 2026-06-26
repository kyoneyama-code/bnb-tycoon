#!/bin/bash
# =============================================================================
# init-firewall.sh
# ネットワーク・書き込み範囲制限(記事ポイント④)
#
# ホワイトリスト方式で外部通信を許可ドメインのみに制限する。
# プロンプトインジェクションで「外部へ情報を送信」「不審なURLを取得」
# しようとしても、許可ドメイン以外には到達できない。
#
# postCreateCommand から `sudo /usr/local/bin/init-firewall.sh` で実行される。
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# --- 既存ルールをクリア ---
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# --- DNS と localhost と SSH(git)は先に許可 ---
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT  -p tcp --sport 53 -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT  -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

# --- 許可ドメイン用 ipset を作成 ---
ipset create allowed-domains hash:net

# GitHub の公開メタ(IP レンジ)を取得して許可
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -n "$gh_ranges" ] && echo "$gh_ranges" | jq -e '.web' >/dev/null 2>&1; then
    echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q | while read -r cidr; do
        [ -n "$cidr" ] && ipset add allowed-domains "$cidr" 2>/dev/null || true
    done
fi

# --- 許可ドメイン(ホスト名 → IP 解決して追加) ---
ALLOWED_DOMAINS=(
    "api.anthropic.com"        # Claude API
    "statsig.anthropic.com"
    "sentry.io"
    "registry.npmjs.org"       # npm
    "pypi.org"                 # PyPI
    "files.pythonhosted.org"
    "github.com"
    "api.github.com"
    "raw.githubusercontent.com"
    "objects.githubusercontent.com"
    "codeload.github.com"
)

for domain in "${ALLOWED_DOMAINS[@]}"; do
    echo "Resolving $domain..."
    ips=$(dig +short A "$domain" 2>/dev/null || true)
    for ip in $ips; do
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            ipset add allowed-domains "$ip" 2>/dev/null || true
        fi
    done
done

# --- ホストネットワーク(devcontainer のゲートウェイ)を許可 ---
HOST_IP=$(ip route | awk '/default/ {print $3; exit}')
if [ -n "${HOST_IP:-}" ]; then
    HOST_NET=$(echo "$HOST_IP" | sed 's/\.[0-9]*$/.0\/24/')
    iptables -A INPUT  -s "$HOST_NET" -j ACCEPT
    iptables -A OUTPUT -d "$HOST_NET" -j ACCEPT
fi

# --- 確立済み接続は許可 ---
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# --- 許可 ipset 宛のみ OUTPUT を許可 ---
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# --- デフォルトポリシー: それ以外はすべて遮断 ---
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

echo "Firewall configured. Verifying..."

# --- 検証: 許可外(example.com)が遮断され、許可内(api.anthropic.com)が通ること ---
if curl --connect-timeout 5 -s https://example.com >/dev/null 2>&1; then
    echo "ERROR: example.com に到達できてしまいました(遮断失敗)" >&2
    exit 1
else
    echo "OK: 許可外ドメイン(example.com)は遮断されています"
fi

if curl --connect-timeout 5 -s https://api.anthropic.com >/dev/null 2>&1; then
    echo "OK: api.anthropic.com に到達できます"
else
    echo "WARN: api.anthropic.com に到達できません(DNS 解決を確認してください)" >&2
fi

echo "init-firewall.sh done."

FROM node:20-bookworm

ARG TZ
ENV TZ="$TZ"

# --- 基本ツール + ファイアウォール用ツール(記事ポイント④) ---
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    apt-get -y install --no-install-recommends \
        less \
        git \
        procps \
        sudo \
        fzf \
        zsh \
        man-db \
        unzip \
        gnupg2 \
        gh \
        iptables \
        ipset \
        iproute2 \
        dnsutils \
        aggregate \
        jq \
        ca-certificates \
        curl && \
    rm -rf /var/lib/apt/lists/*

# bash 履歴を永続化(コンテナ作り直しても残す)
RUN mkdir /commandhistory && \
    touch /commandhistory/.bash_history && \
    chown -R node /commandhistory

ENV DEVCONTAINER=true

# Claude 設定ディレクトリ(ボリュームでマウントされる)
RUN mkdir -p /home/node/.claude && \
    chown -R node:node /home/node/.claude

WORKDIR /workspace

# --- non-root の node ユーザーに、ファイアウォール初期化のみ sudo を許可 ---
# bypassモードは非root前提(記事ポイント①)。
# init-firewall.sh だけパスワード無し sudo を許可する。
COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh && \
    echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
    chmod 0440 /etc/sudoers.d/node-firewall

USER node

ENV SHELL=/bin/zsh

# Claude Code CLI をグローバルインストール
RUN npm install -g @anthropic-ai/claude-code

# zsh の最低限セットアップ
RUN echo 'export PROMPT_COMMAND="history -a"' >> /home/node/.zshrc && \
    echo 'export HISTFILE=/commandhistory/.bash_history' >> /home/node/.zshrc

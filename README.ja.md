# Dice Roguelife — スタンドアロンと API キー対応

Claude のサブスクリプションなしで通常のブラウザーから遊べる変更版です。
Node.js 20.19+、22.13+、または24+をインストールし、このフォルダーで実行してください。

```sh
npm ci
npm start
```

http://localhost:3000 を開き、**設定 → AI 接続**でプロバイダー、API キー、モデル ID を入力して保存します。
ローカルモデルではキーが不要です。接続テストは API を1回呼び出します。

OpenAI、Anthropic API、Gemini、Azure OpenAI、Perplexity Sonar、および OpenRouter、Groq、DeepSeek、Mistral、
xAI、Together、Fireworks、DeepInfra、Cerebras、NVIDIA NIM、Hugging Face の設定を用意しています。
Ollama、LM Studio、llama.cpp、vLLM、カスタム互換エンドポイントにも対応します。
Azure はリソースのベース URL とデプロイ名を使用します。Bedrock/Vertex IAM は未対応です。
モデル ID は自由に入力できます。JSON モードやストリーミングの対応はモデルごとに異なります。

API 料金はプロバイダーの API アカウントに請求されます。再試行は初期設定で0回です。要約と人生の振り返りは別の呼び出しです。
任意の要約モデルは高速設定にも使用します。標準と深いは物語モデルを使用します。
キーは通常メモリーのみで保持し、再読み込み後は再入力が必要です。端末への保存は任意で、暗号化されません。
キーはゲームのセーブやエクスポートには含まれません。

セーブ、設定、画像はブラウザーの IndexedDB に保存されます。同じブラウザー、ホスト名、ポートを使ってください。
ブラウザーデータの削除はゲームデータも削除します。自動クラウド同期はありません。
セーブタブでファイルを書き出し、別の環境で読み込めます。既存の Claude セーブも読み込めます。
画像タブで画像とタグを移動できます。HTML の物語には画像を埋め込みます。
ビジョンモデルで画像分析を有効にすると自動分類を使用できます（画像ごとに最大8 MB）。
AI による肖像選択は追加呼び出しのため初期設定で無効です。

更新前にバックアップを作成してください。サーバーを止め、上流の変更を確認・マージし、npm ci と npm start を実行します。
この変更版を上流の Claude 専用 HTML で上書きしないでください。
元の Claude アーティファクトアダプターは任意で利用できます。

詳しい設定と制限は [English README](README.md)、構造は [STANDALONE.md](STANDALONE.md) を参照してください。
[MIT ライセンス](LICENSE)。

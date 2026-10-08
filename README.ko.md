# Dice Roguelife — 독립 실행 및 API 키 지원

Claude 구독 없이 일반 브라우저에서 플레이할 수 있는 수정 버전입니다.
Node.js 20.19+, 22.13+ 또는 24+를 설치하고 이 폴더에서 실행하세요.

```sh
npm ci
npm start
```

http://localhost:3000 을 열고 **설정 → AI 연결**에서 제공업체, API 키와 모델 ID를 입력하고 연결을 저장하세요.
로컬 모델은 키 없이 사용할 수 있습니다. 연결 테스트는 API를 한 번 호출합니다.

OpenAI, Anthropic API, Gemini, Azure OpenAI, Perplexity Sonar와 OpenRouter, Groq, DeepSeek, Mistral, xAI,
Together, Fireworks, DeepInfra, Cerebras, NVIDIA NIM, Hugging Face 프리셋을 제공합니다.
Ollama, LM Studio, llama.cpp, vLLM 및 사용자 지정 호환 엔드포인트도 지원합니다.
Azure는 리소스 기본 URL과 배포 이름을 사용합니다. Bedrock/Vertex IAM은 지원하지 않습니다.
모델 ID는 직접 입력합니다. 모든 모델이 JSON 모드나 스트리밍을 지원하지는 않습니다.

API 요금은 해당 제공업체의 API 계정에 청구됩니다. 재시도 기본값은 0회이며 요약과 인생 결산은 별도 호출입니다.
선택한 요약 모델은 빠름 등급에도 사용됩니다. 표준과 심층은 이야기 모델을 사용합니다.
키는 기본적으로 메모리에만 있으며 새로고침 후 다시 입력해야 합니다. 기기에 기억하기는 선택 사항이며 암호화되지 않습니다.
키는 게임 저장과 내보내기에 포함되지 않습니다.

저장, 설정, 이미지가 브라우저 IndexedDB에 유지됩니다. 같은 브라우저, 호스트 이름, 포트를 사용하세요.
브라우저 데이터를 삭제하면 게임 데이터도 사라지며 자동 클라우드 동기화는 없습니다.
저장 탭에서 저장 파일을 내보내고 가져올 수 있습니다. 기존 Claude 저장 파일도 가져올 수 있습니다.
이미지 탭에서는 이미지와 태그를 내보내고 가져올 수 있습니다. HTML 이야기에는 이미지가 포함됩니다.
비전 모델을 사용하는 경우 이미지 분석을 켜서 AI 자동 분류를 사용할 수 있습니다 (이미지당 최대 8 MB).
AI 초상화 선택은 추가 호출 때문에 기본적으로 꺼져 있습니다.

업데이트 전에 백업을 내보내세요. 서버를 종료하고 업스트림 변경을 검토/병합한 뒤 npm ci와 npm start를 실행하세요.
수정된 체크아웃을 업스트림의 Claude 전용 HTML로 덮어쓰지 마세요.
기존 Claude 아티팩트 어댑터는 선택적으로 유지됩니다.

자세한 설정과 제한은 [English README](README.md), 구조는 [STANDALONE.md](STANDALONE.md)를 참고하세요.
[MIT 라이선스](LICENSE).

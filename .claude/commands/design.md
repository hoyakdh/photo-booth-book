사용자가 선택한 사이트의 DESIGN.md 파일을 프로젝트 루트에 적용하는 스킬입니다.

## 사용 가능한 디자인 시스템 (58개)

### AI & Machine Learning
claude, cohere, elevenlabs, minimax, mistral.ai, ollama, opencode.ai, replicate, runwayml, together.ai, voltagent, x.ai

### Developer Tools & Platforms
cursor, expo, linear.app, lovable, mintlify, posthog, raycast, resend, sentry, supabase, superhuman, vercel, warp, zapier

### Infrastructure & Cloud
clickhouse, composio, hashicorp, mongodb, sanity, stripe

### Design & Productivity
airtable, cal, clay, figma, framer, intercom, miro, notion, pinterest, webflow

### Fintech & Crypto
coinbase, kraken, revolut, wise

### Enterprise & Consumer
airbnb, apple, ibm, nvidia, spacex, spotify, uber

### Car Brands
bmw, ferrari, lamborghini, renault, tesla

---

## 실행 방법

1. 사용자에게 위 목록에서 원하는 사이트를 선택하게 합니다.
2. 선택된 사이트의 DESIGN.md를 다음 URL에서 가져옵니다:
   `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/{사이트명}/DESIGN.md`
3. 가져온 내용을 프로젝트 루트에 `DESIGN.md` 파일로 저장합니다.
4. 저장 완료 후 해당 디자인 시스템의 핵심 요약(색상, 타이포그래피, 주요 컴포넌트 스타일)을 간략히 알려줍니다.

## 인자

$ARGUMENTS

인자가 주어지면 해당 사이트명으로 바로 DESIGN.md를 가져옵니다.
인자가 없으면 사용자에게 목록을 보여주고 선택하게 합니다.

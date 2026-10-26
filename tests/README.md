# 검증 범위

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`로 검사한다. 빌드는 `next/font/google`의 폰트를 다운로드하므로 네트워크가 필요할 수 있다.

- `contract/network-summary.contract.test.ts`: 합성 HTTP 응답과 공개 node_info fixture를 fetch 경계에 주입한다. 실제 클라이언트·서비스·handler의 변환, 0, 부분 실패, HTTP/JSON 오류 및 상위 네트워크 timeout 거절을 실행한다. 실제 10초 timeout·취소·backoff 회귀는 query-result 및 polling-runtime 검사에서 별도로 실행한다.
- `contract/denoms-metadata.contract.test.ts`: 공개 bank metadata 응답, 합성 cursor/실패를 사용해 실제 정규화·페이지 요청을 실행한다. 부분 페이지 보존과 cursor 상한·순환 회귀를 실행한다.
- `ui/network-summary.ui.test.tsx`: jsdom에서 실제 컴포넌트·서비스를 실행한다. DOM 표시 검증이며 브라우저 CORS, 접근성 audit 또는 실제 지갑 검증이 아니다. jsdom 28.1.0의 cssstyle→css-color CJS/ESM 로딩 실패(Node 24.16.0) 때문에 테스트 런타임은 26.1.0으로 고정했다.
- `fixtures/tgxn-2026-10-20`: 출처·관찰시각·높이를 담은 공개 읽기 표본. `network-summary.synthetic.json`은 합성 데이터다.

기존 `integration`의 chain-selector, header-wallet-menu, action-confirmation, staking-validators, staking-validator-detail, governance-components는 export 존재 검사다. 실제 DOM/사용자 여정 성공으로 해석하지 않는다. 가상 Faucet/WS/서버 세션 성공 검사는 W12에서 미사용 코드와 함께 제거했다. `ui/search-conflict`는 classifier 검사다. 이전 `accessibility.audit`는 접근성을 검사하지 않아 `unit/sanitize.unit.test.ts`로 이름과 위치를 바로잡았다.

제품 소스의 `NODE_ENV=test` 가상 성공 분기는 없다. HTTP·지갑 경계 모킹으로 제품 변환/DOM을 실행한다. 합성 HTTP 통과는 실체인·브라우저 CORS·실제 서명 성공의 증거가 아니다. `server/handlers` 검사는 내부 함수 호출이며 공개 앱 HTTP route 시험이 아니다.

기존 coverage 설정은 일부 handler/store/services만 포함한다. 임계값 85% 설정 또는 기본 테스트 통과를 전체 제품 커버리지 85%로 보고하지 않는다. W01 검증 결과와 AC 판정 원본은 Paperclip GURA-36의 report 문서다.

## W10 모바일·키보드 회귀

- `ui/accessibility.ui.test.tsx`: 검색의 이름·후보 Tab 선택·오류 Escape 복귀, 검증자 native link와 독립 원본 버튼, 조회 상태 이름, 실제 IBC route의 HTTP 대기→오류·조회 전용 UI를 검사한다.
- `integration/staking-transaction.integration.test.tsx`: Chrome에서 비활성 호출 버튼이 초점을 잃는 상황을 재현하며 4종 행위의 Tab/Shift+Tab·Escape/취소 후 호출 버튼 복귀와 signer/broadcast 0회를 검사한다.
- `browser/mobile-accessibility.browser.mjs`: 격리 production 빌드에서 desktop Chrome 360/768/1280px, 홈·Dashboard·IBC·검증자 목록/상세·긴 문자열·부분 실패·메뉴·지갑 차단 상태를 실측한다. 키보드로 지원 검색→Staking 목록→상세→합성 Keplr→거래 확인 취소까지 실행한다. `PLAYWRIGHT_MODULE`, `BROWSER_ORIGIN`, `BROWSER_OUTPUT`, 유효 Bech32의 `BROWSER_ACCOUNT`/`BROWSER_VALIDATOR`와 합성 체인 설정이 필요하다. 공개 설정과 실행 runner·화면·실패 이력은 Paperclip [W10 보고](/GURA/issues/GURA-47#document-report) 첨부 증거에 있다.

이 시험은 실제 모바일 기기나 스크린리더 관찰, 실체인 CORS·지갑 서명 지원 판정이 아니다. 실제 환경 확인 절차와 미검증 범위는 같은 보고서의 CP4 항목을 따른다.


## W12 모듈 계약·미사용 기능 정리

- `contract/module-contracts.contract.test.ts`: 실제 HTTP client와 서비스의 IBC 정확 enum/unknown, capability off HTTP0, 404/500/실제10초 timeout, 빈/손상/부분 응답, 상세 partial 객체, percent/percentage 원문·큰 수·nonce0·미확인 단위·출처/높이·개별 token 추정 방지를 검사한다.
- `integration/module-views.integration.test.tsx`: 실제 Next page 컴포넌트·서비스·DOM에서 목록/상세 직접 URL 차단, 오류→재시도, stale·체인 전환·늦은 응답 폐기와 원문 표시를 실행한다.
- `browser/modules.browser.mjs`: 격리 production의 실제 Chrome 360/768/1280, 메뉴/6개 직접 URL, 404/500/timeout/empty/malformed/partial, 긴 문자열·표 스크롤·Tab/Enter를 검사한다. 환경 변수 `PLAYWRIGHT_MODULE`, `BROWSER_ORIGIN`, `BROWSER_OUTPUT`, `SOURCE_SHA`로 실행 맥락을 남긴다. 설정은 `on`/`off` 및 `https://on.example`/`https://off.example`의 공개 합성 체인이며 모든 HTTP를 가로챈다. 실제 체인·배포 origin CORS·물리 모바일·스크린리더·signer 검증과 구별한다.
- Faucet/WS/재위임/서버 세션의 미사용 모의 성공 코드와 대응 가상 성공 검사는 제거했다. 실제 polling·wallet lifecycle·staking/거버넌스·F1 보관 결과 검사는 유지한다.

모듈 browser runner는 긴 숫자·소수·헤더의 실제 텍스트 줄 수(1줄), 긴 설명 셀의 최소 240px 폭, 360px의 내부 overflow, Tab 진입·ArrowRight 이동·마지막 열 노출을 검사한다. BEX 3종 수수료 표, Oracle Reports/History, FeePolicy 목록/상세를 포함하며 3개 목록의 링크 Enter 후 chain 유지도 확인한다. 문서 가로 넘침만으로 표 가독성 통과를 판정하지 않는다.

## 조회 버튼 공통 레이아웃 회귀 (GURA-66)

- `integration/send-transaction.integration.test.tsx`: 실제 SendForm을 native form에 넣고 영한 키보드 재조회가 metadata HTTP만 실행하며 submit·서명·broadcast를 유발하지 않는지 확인한다.
- `browser/query-refresh.browser.mjs`: 실제 production Chrome의 360/768/1440px × en/ko에서 단일 조회·다중 조회·폼 내부 조회·`/wallet`의 버튼 폭, 44px 터치 높이, 줄바꿈, 상단 배치, 키보드 포커스 및 error/Retry-After/busy/success/stale/partial을 검증하고 PNG와 측정 JSON을 저장한다. HTTP와 주입 지갑만 합성 경계이며 실제 서명/거래·물리 모바일 검증이 아니다.
- 실행: `node tests/browser/wallet-page-server.mjs --production`으로 합성 체인 production 서버를 시작한 후 `PLAYWRIGHT_MODULE=<playwright index.mjs 경로> node tests/browser/query-refresh.browser.mjs`. 선택 환경 변수는 `BROWSER_ORIGIN`(기본 3265 포트), `BROWSER_OUTPUT`, `SOURCE_SHA`다. 빌드와 전체 테스트는 동시에 실행하지 않는다.

## 환경 파일과 Next 경계 (GURA-74)

- `vitest.config.ts`는 worker의 앱 import 전에 `NODE_ENV=test`로 `@next/env`를 초기화합니다. Vite `envDir: false`로 중복 dotenv 로딩을 끄며 `test.env`로 설정을 덮어쓰지 않습니다. `.env.test` 기본값, `.env.test.local` 개인 override, process 최우선 정책을 사용합니다.
- `contract/env-loading.contract.test.ts`: 임시 디렉터리·새 Node 프로세스에서 3개 모드의 변수별 우선순위, test의 `.env.local` 제외, 빈/WC-only 상위 파일, process-only 설정, 빈/손상 설정, JSON 우선순위, TGXN 명시값/evidence 보존·누락 유지, 누락 endpoint HTTP 0회를 확인합니다. 별도 Vitest 실행으로 실제 threads worker의 기본값/파일/process override·env 복원도 검증합니다.
- 기존 `dev-chain-server`, `dev-chain-config`, `send-transaction`은 명시적 TGXN 설정에서 실제 선택·클라이언트·UI·서명 차단 회귀를 유지합니다.
- `browser/env-config.browser.mjs`: 추적/비제외 소스만 임시 프로젝트에 복사하고 `node_modules`를 링크합니다. 개인 env·공유 `.next`는 복사하지 않습니다. `env.example`의 TRPC 블록과 명시 TGXN 주석 대안·최소 TGXN JSON을 각각 `.env.development.local`/`.env.production.local`로 준비하여 Next dev 및 `npm run build`/start를 실행합니다. 빈 포트와 새 Chrome context를 사용하고 종료 시 자체 서버를 정리합니다.
- 임시 프로젝트에만 생성하는 `env-verification` route는 실제 env·chain selection·URL helper를 SSR/브라우저 양쪽에서 실행하여 값을 비교합니다. 명시 TGXN은 모든 metadata/evidence를 예시와 비교하고, 최소 TGXN은 양쪽 모두 metadata/RPC/evidence가 없는지 검사합니다. 실제 HTTP client 호출과 제품 홈·Dashboard도 검사합니다. 최소 TGXN과 LCD-only에서 RPC/EVM 누락 오류와 HTTP 차단, 빈 설정에서 구성 오류를 확인합니다. HTTP 경계만 모킹하며 실제 체인 가용성·CORS·서명 지원을 검증하지 않습니다.
- 실행: `PLAYWRIGHT_MODULE=<playwright/index.mjs 경로> node tests/browser/env-config.browser.mjs`. 선택 runner 변수 `BROWSER_OUTPUT`(기본 `/tmp/gura74-browser`)은 앱 설정이 아닙니다. 결과 JSON에 origin/build ID/source SHA/dirty 여부/체인/요청/시각/Chrome 버전을 남기고 PNG·build/server 로그를 저장합니다. source SHA가 clean일 때 최종 커밋 검증으로 해석하세요. 빌드와 전체 테스트는 동시에 실행하지 않습니다. Next 폰트 다운로드 네트워크와 Chrome 실행 권한이 필요합니다.

- GURA-79 회귀: 최소 TGXN의 공급량은 실제 서비스와 NetworkSummaryPanel에서 부분 오류/미확인으로 남고 supply HTTP를 보내지 않습니다. 최소/명시 조회 metadata만 있는 TGXN은 실제 거래 준비·UI에서 차단되며 signer/broadcast 0회를 검사합니다. 과거 TGXN fixture의 관찰 기록은 변경하지 않습니다.

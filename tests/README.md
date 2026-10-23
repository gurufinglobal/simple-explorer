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

# 검증 범위

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`로 검사한다. 빌드는 `next/font/google`의 폰트를 다운로드하므로 네트워크가 필요할 수 있다.

- `contract/network-summary.contract.test.ts`: 합성 HTTP 응답과 공개 node_info fixture를 fetch 경계에 주입한다. 실제 클라이언트·서비스·handler의 변환, 0, 부분 실패, HTTP/JSON 오류 및 상위 네트워크 timeout 거절을 실행한다. 클라이언트 자체 timeout 타이머는 아직 없으므로 timeout 정책 통과를 의미하지 않는다.
- `contract/denoms-metadata.contract.test.ts`: 공개 bank metadata 응답, 합성 cursor/실패를 사용해 실제 정규화·페이지 요청을 실행한다. 기존 오류→빈 배열, 부분 페이지 폐기는 W02에서 바꿀 동작을 기록한 회귀 기준이다.
- `ui/network-summary.ui.test.tsx`: jsdom에서 실제 컴포넌트·서비스를 실행한다. DOM 표시 검증이며 브라우저 CORS, 접근성 audit 또는 실제 지갑 검증이 아니다. jsdom 28.1.0의 cssstyle→css-color CJS/ESM 로딩 실패(Node 24.16.0) 때문에 테스트 런타임은 26.1.0으로 고정했다.
- `fixtures/tgxn-2026-10-20`: 출처·관찰시각·높이를 담은 공개 읽기 표본. `network-summary.synthetic.json`은 합성 데이터다.

기존 `integration`의 chain-selector, header-wallet-menu, action-confirmation, staking-validators, staking-validator-detail, governance-components는 export 존재 검사다. 실제 DOM/사용자 여정 성공으로 해석하지 않는다. `ui/faucet-rate-limit`은 handler 검사이고 `ui/search-conflict`는 classifier 검사다. 이전 `accessibility.audit`는 접근성을 검사하지 않아 `unit/sanitize.unit.test.ts`로 이름과 위치를 바로잡았다.

`NODE_ENV=test` 반환은 network-summary 서비스 전체 및 getDenomsMetadata에서 제거했다. token 단건, blocks/transactions/staking/governance/IBC/특화 모듈, wallet 연결 등의 기존 분기는 아직 남아 있다. 이 분기를 지나는 테스트의 통과는 제품 응답 변환/실체인/서명 성공의 증거가 아니다. 각 후속 WBS에서 경계 모킹으로 이관한다.

기존 coverage 설정은 일부 handler/store/services만 포함한다. 임계값 85% 설정 또는 기본 테스트 통과를 전체 제품 커버리지 85%로 보고하지 않는다. W01 검증 결과와 AC 판정 원본은 Paperclip GURA-36의 report 문서다.

## W10 모바일·키보드 회귀

- `ui/accessibility.ui.test.tsx`: 검색의 이름·후보 Tab 선택·오류 Escape 복귀, 검증자 native link와 독립 원본 버튼, 조회 상태 이름, 실제 IBC route의 HTTP 대기→오류·조회 전용 UI를 검사한다.
- `integration/staking-transaction.integration.test.tsx`: Chrome에서 비활성 호출 버튼이 초점을 잃는 상황을 재현하며 4종 행위의 Tab/Shift+Tab·Escape/취소 후 호출 버튼 복귀와 signer/broadcast 0회를 검사한다.
- `browser/mobile-accessibility.browser.mjs`: 격리 production 빌드에서 desktop Chrome 360/768/1280px, 홈·Dashboard·IBC·검증자 목록/상세·긴 문자열·부분 실패·메뉴·지갑 차단 상태를 실측한다. 키보드로 지원 검색→Staking 목록→상세→합성 Keplr→거래 확인 취소까지 실행한다. `PLAYWRIGHT_MODULE`, `BROWSER_ORIGIN`, `BROWSER_OUTPUT`, 유효 Bech32의 `BROWSER_ACCOUNT`/`BROWSER_VALIDATOR`와 합성 체인 설정이 필요하다. 공개 설정과 실행 runner·화면·실패 이력은 Paperclip [W10 보고](/GURA/issues/GURA-47#document-report) 첨부 증거에 있다.

이 시험은 실제 모바일 기기나 스크린리더 관찰, 실체인 CORS·지갑 서명 지원 판정이 아니다. 실제 환경 확인 절차와 미검증 범위는 같은 보고서의 CP4 항목을 따른다.

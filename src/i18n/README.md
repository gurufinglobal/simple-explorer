# 언어와 메시지

Next.js App Router의 경로는 유지한다. `request.ts`가 `explorer-locale` 쿠키, 가중치가 적용된 `Accept-Language`, 영어 기본값 순서로 언어를 선택한다. `gf_chain` 쿠키와 분리한다. Root layout은 같은 요청의 locale/messages/now와 UTC를 서버·클라이언트에 제공한다. 언어 변경 Server Action은 언어 쿠키만 저장하고 클라이언트가 현재 경로를 refresh한다.

- 앱 화면 문구는 `messages/en.json`, `messages/ko.json`의 common/navigation/wallet/transaction/query/explorer/staking/governance/modules namespace에 함께 추가한다. 향후 contract 화면도 같은 구조를 따른다.
- 컴포넌트는 `useTranslations`, async 서버 컴포넌트는 `getTranslations`를 사용한다. `types.d.ts`가 키를 검사한다. ICU 값 이름과 타입은 두 언어에서 같아야 한다.
- 서비스는 locale에 의존하지 않는다. 오류는 `ServiceError`, 직렬화 메시지는 `serviceMessage`의 안정적 code/params를 사용한다. `serviceText`는 기존 string 반환 계약과 저장된 거래 결과의 원문 호환용이다. 기존 코드의 의미를 변경하지 말고 새 의미에 새 코드를 추가한다.
- `ServiceErrorText`는 알려진 코드의 번역을 표시한다. 알 수 없는 오류는 번역 요약과 원문 상세를 함께 표시한다. 기존 저장 결과는 전체 앱 메시지 템플릿으로만 식별하며 원문을 부분 치환하지 않는다.
- `useServiceText`는 앱 소유 상태·경고 필드에만 쓴다. 주소, hash, denom, 온체인 제목·본문·memo, raw JSON, 서명 데이터에는 사용하지 않는다. 모듈 누락 필드는 언어 독립적인 `—`이며 실제 문자열은 그대로 보존한다.
- 거래 입력은 기존 문자열/BigInt 변환을 사용한다. 지역별 표시값을 거래 원본으로 재파싱하지 않는다. 시간은 요청 clock과 명시적 locale을 사용하고 절대 시각은 UTC로 표시한다.

검증: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. i18n 단위/DOM 테스트는 실제 번역 provider/ICU parser/서비스를 사용한다. `tests/browser/i18n.browser.mjs`는 합성 HTTP·Keplr 경계와 production 서버에서 언어·경로·체인·원문·화면 폭을 검사한다. 합성 시험은 실체인 서명 지원의 근거가 아니다.

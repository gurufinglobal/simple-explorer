# Simple-Explorer Frontend

## 로컬 개발과 CP2 화면 확인

```bash
npm install
npm run dev
```

터미널에 표시된 앱 주소(기본 `http://localhost:3000`)를 엽니다. 별도 체인 환경 설정과 저장된 선택 쿠키가 없는 경우 **TGXN**이 선택됩니다. `https://tgxn.gurufin.io`는 개발 앱 주소가 아니라 외부 체인 API 호스트입니다.

| 개발 기본값 | 값 |
| --- | --- |
| 선택 key / 표시 이름 | `tgxn` / `TGXN` |
| LCD | `https://tgxn.gurufin.io:1317` |
| Tendermint RPC | `https://tgxn.gurufin.io:26657` |
| 관찰된 chain ID | `guru_631-1` |
| native / bond denom | `agxn` / `agxn` |

TGXN 프리셋은 `NODE_ENV=development`에서만 적용합니다. 별도 설정 없는 `npm run build` / `npm start`는 기존 `default` 체인과 `trpc.gurufin.io` 기본값을 유지합니다. 개발용 `.env.local`을 직접 작성하면 production 빌드에도 로드되므로 개발 전용 override는 `.env.development.local`에 넣으세요.

1. 왼쪽 **Select Chain**이 `TGXN`인지 확인합니다.
2. 브라우저 개발자 도구 → **Network**를 연 뒤 `/dashboard`로 이동하거나 새로고침합니다. `tgxn.gurufin.io`로 필터링하고 Fetch/XHR 요청의 **Request URL**을 확인합니다. LCD 조회는 `:1317/cosmos/...`, RPC 조회(해당 화면에서 발생하는 경우)는 `:26657/...`를 사용해야 합니다. 모든 화면이 RPC를 호출하는 것은 아닙니다.
3. 성공한 조회에서는 네트워크 ID `guru_631-1`, 블록·공급량 등 응답 기반 값이 보입니다. denom은 `agxn`이며 검증된 decimals가 없으면 원본 단위로 표시될 수 있습니다. HTTP/CORS/timeout 실패는 오류·재시도 상태로 표시되어야 하며 정상 잔액 0이나 성공으로 해석하지 않습니다.
4. 기존 CP2 화면별 점검은 Paperclip의 [CP2 확인 가이드](/GURA/issues/GURA-35#document-checkpoint-cp2)를 참고합니다(링크는 Paperclip 앱 기준).

이 설정은 공개 조회용입니다. 기존 W01의 터미널 관찰을 재사용하며 브라우저 CORS·EVM RPC·WebSocket·지갑 서명 성공을 보장하지 않습니다. TGXN 프리셋에는 미확인 prefix, fee denom, decimals, signing, rpcAccess, EVM/WS endpoint를 추가하지 않습니다. 지갑 쓰기 기능은 기존 검증 조건에 따라 차단됩니다.

## 환경 설정 우선순위

Next.js는 변수마다 `process.env` → `.env.$NODE_ENV.local` → `.env.local` → `.env.$NODE_ENV` → `.env` 순서로 처음 발견한 값을 사용합니다(`test`에서는 `.env.local` 제외). `NEXT_PUBLIC_*`는 클라이언트 번들에 포함되므로 비밀값을 넣지 마세요. 환경 수정 후 개발 서버를 재시작하고 페이지를 새로고침하세요. production 공개 설정 변경은 재빌드가 필요합니다. [Next.js 15 환경 변수 문서](https://nextjs.org/docs/15/app/guides/environment-variables)

앱의 체인 설정은 다음 순서로 결정됩니다.

1. `NEXT_PUBLIC_CHAINS`가 있으면 그 JSON 목록을 사용합니다. 기본 선택은 `NEXT_PUBLIC_DEFAULT_CHAIN_KEY`, 생략하면 목록 첫 체인입니다.
2. JSON 목록이 없고 아래 단일 체인 변수 중 하나라도 있으면 기존 `default` / `Default` 설정 경로를 사용합니다. 지정한 값은 유지하고 생략한 endpoint는 기존 `trpc.gurufin.io` 기본값을 사용합니다. 서로 다른 체인을 섞지 않도록 LCD와 RPC를 함께 지정하세요.
   `NEXT_PUBLIC_LCD_URL`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_EVM_RPC_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_EVM_CHAIN_ID`, `NEXT_PUBLIC_BECH32_PREFIX`.
3. 둘 다 없으면 개발에서 TGXN 프리셋을 사용합니다. WalletConnect project/relay 설정만으로는 프리셋이 바뀌지 않습니다.

예를 들어 개발용 JSON override를 `.env.development.local`에 저장하면:

```env
NEXT_PUBLIC_DEFAULT_CHAIN_KEY=tgxn
NEXT_PUBLIC_CHAINS=[{"key":"tgxn","name":"TGXN","lcdUrl":"https://tgxn.gurufin.io:1317","rpcUrl":"https://tgxn.gurufin.io:26657"}]
```

단일 endpoint 방식의 예시(선택 key는 `default`; TGXN 관찰 metadata 자동 보강은 JSON의 `tgxn` key + 해당 LCD 조합에 적용):

```bash
NEXT_PUBLIC_LCD_URL=https://tgxn.gurufin.io:1317 \
NEXT_PUBLIC_RPC_URL=https://tgxn.gurufin.io:26657 npm run dev
```

기존 `NEXT_PUBLIC_CHAINS`가 있다면 위 단일 endpoint 명령보다 JSON 목록이 우선합니다. 유효하지 않은 JSON/URL, 빈 목록, 중복 key, 목록에 없는 기본 key는 설정 오류입니다. 오류를 TGXN으로 조용히 대체하지 않습니다.

JSON의 `key`, `name`, `lcdUrl`은 필수입니다. `rpcUrl`, `evmRpcUrl`, `wsUrl`, `evmChainId`, `bech32Prefix` 등은 선택 필드이며 확인한 값만 지정하세요. JSON 체인에서 RPC/EVM URL이 빠지면 해당 요청은 구성 오류가 됩니다(TGXN key와 LCD가 일치할 때의 기존 RPC 보강 예외).

## 저장된 체인 선택 복구

브라우저의 `gf_chain` 쿠키는 기본 선택보다 우선합니다. 등록된 다른 체인이 저장되어 있으면 그 선택을 유지하고, 예전 `default` 등 현재 목록에 없는 key 또는 손상된 쿠키는 재선택 오류를 표시합니다. 자동으로 쿠키를 지우지 않습니다.

- 왼쪽 **Select Chain**에서 `TGXN`을 선택하면 쿠키를 갱신하고 조회를 전환합니다.
- 수동 초기화가 필요하면 개발자 도구 → Application/Storage → Cookies → 현재 앱 호스트에서 **`gf_chain`만 삭제**한 뒤 새로고침합니다. 시크릿 창으로 확인할 수도 있습니다. 쿠키는 포트별로 구분되지 않아 같은 localhost의 다른 포트와 공유될 수 있습니다.
- 목록 자체가 잘못된 경우 환경 설정을 수정하고 서버를 재시작해야 합니다.

쿠키가 없는 서버·클라이언트는 동일한 프리셋을 사용합니다. 서버는 브라우저 쿠키를 직접 읽지 않으며, 클라이언트는 마운트 후 저장된 선택을 반영합니다.

## 검증

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

환경·쿠키·요청 대상 회귀 검사는 `tests/integration/dev-chain-config.integration.test.tsx`와 `tests/contract/dev-chain-server.contract.test.ts`에 있습니다. 네트워크 경계 모킹 검사이며 실제 브라우저 CORS나 지갑 브로드캐스트 검증을 의미하지 않습니다.

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

### 송금 확인·수수료·결과 (W05)

Dashboard의 **SEND → Send Tx**는 잔액·주소·정밀 수량·수수료를 조회한 뒤 앱 확인 창을 엽니다. 전체 송신/수신 주소, 체인 key/ID, 표시/최소 단위 수량, 예상 수수료와 근거를 확인한 후 **확인하고 지갑 서명**을 누릅니다. 확인 창의 취소 또는 Escape는 지갑 서명·전송을 실행하지 않습니다. 입력·체인·계정 변경 또는 2분 경과 시 새 확인이 필요합니다.

`NEXT_PUBLIC_CHAINS`의 체인별 `sendFeePolicy`는 **MsgSend에만** 적용됩니다. 종전 송금의 `NEXT_PUBLIC_GAS_PRICE`/`0.001agxn` fallback과 고정 gas 220000은 제거했습니다. 실제 근거가 없는 정책을 임의로 추가하지 마세요. 기존 체인·signing·RPC origin 검증도 모두 충족해야 하며, TGXN 개발 프리셋은 계속 조회 전용입니다.

| 정책 | 필수 필드 | 동작 |
| --- | --- | --- |
| `mode: "simulate"` | `gasPrice`, `gasMultiplierBps` (10000~100000 정수), `evidence` | 서명 요청 없이 공개키로 simulate 후 gas를 정수 올림 계산 |
| simulate의 선택 `fallback` | `gas` (양의 안전 정수), `evidence` | simulate 실패 시에만 해당 체인에서 검증한 고정 gas 사용, 실패 이유와 한계 표시 |
| `mode: "fixed"` | `gasPrice`, `gas`, `evidence`, `limitation` | simulate를 사용할 수 없는 체인의 검증된 정책과 한계 표시 |

`gasPrice`의 denom은 검증된 `feeDenom`과 같아야 하며 가격은 양수여야 합니다. 송금 자산과 수수료 자산을 각각 조회하고, 같으면 합산 잔액을 확인합니다. 확인 창을 연 뒤에도 서명 직전 잔액을 다시 조회합니다. 수수료 정책은 다른 위임/거버넌스 작업을 변경하지 않습니다.

전송 시 서명 bytes의 해시를 먼저 보관합니다. timeout·전송 응답 불명확은 **확인 중**으로 남기고 자동 재전송하지 않습니다. Dashboard의 **보관된 거래 결과**는 지갑 재연결 없이 사용할 수 있으며 최근 20개 결과를 브라우저 localStorage에 저장합니다(서명 bytes·지갑 세션·비밀값 제외). 저장소를 삭제하면 이 목록도 지워지므로 필요한 거래 링크를 별도로 보관하세요.

거래 결과의 `/tx/<hash>?chain=<key>` 링크는 쿠키의 체인과 달라도 링크 체인으로 조회하며 지갑 체인을 자동 변경하지 않습니다. **거래 상태·관련 조회 다시 읽기**는 전송 없이 체인 상태, 실제 수수료 원문, 송신자 잔액과 주소 거래를 다시 읽습니다. 실제 fee 미조회/예상과 불일치 및 거래 성공 후 화면 갱신 실패를 각각 표시합니다. 이 체인 파라미터 지원은 거래 결과 링크 범위이며 전체 검색·공유 링크 개편은 W08 범위입니다.

합성 HTTP/RPC/지갑 경계에서 실제 컴포넌트·서비스를 실행하는 검사는 `tests/integration/send-transaction.integration.test.tsx`에 있습니다. 실체인 서명·자금 전송을 수행하는 테스트가 아닙니다.

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

환경·쿠키·요청 대상 회귀 검사는 `tests/integration/dev-chain-config.integration.test.tsx`와 `tests/contract/dev-chain-server.contract.test.ts`에 있습니다. 네트워크 경계 모킹 검사이며 실제 브라우저 CORS나 지갑 브로드캐스트 검증을 의미하지 않습니다.

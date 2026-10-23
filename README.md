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

JSON의 `key`, `name`, `lcdUrl`은 필수입니다. `rpcUrl`, `evmRpcUrl`, `wsUrl`, `evmChainId`, `bech32Prefix` 등은 선택 필드이며 확인한 값만 지정하세요. LCD만으로 가능한 공개 조회에는 RPC가 필요 없습니다. RPC/EVM URL이 빠지면 해당 endpoint가 필요한 조회·쓰기만 구성 오류/차단으로 표시됩니다(TGXN key와 LCD가 일치할 때의 기존 RPC 보강 예외). 지갑 쓰기는 URL 존재 외에도 chain ID·지갑/서명 방식·origin POST/OPTIONS·메시지별 수수료 검증이 필요합니다.

## 저장된 체인 선택 복구

명시적 URL `?chain=`이 최우선이고, 그다음 `gf_chain` 쿠키, 마지막으로 기본 선택을 사용합니다. URL의 unknown/빈 chain은 쿠키로 대체하지 않고 차단합니다. 브라우저의 `gf_chain` 쿠키는 기본 선택보다 우선합니다. 등록된 다른 체인이 저장되어 있으면 그 선택을 유지하고, 예전 `default` 등 현재 목록에 없는 key 또는 손상된 쿠키는 재선택 오류를 표시합니다. 자동으로 쿠키를 지우지 않습니다.

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

## 개발자 탐색 안내

홈은 사용자 탐색 안내를 제공한다. 개발 시 `/dashboard` → `/blocks` → `/transactions` → `/tx/[hash]` 흐름과 `src/components/layout/explorer-shell.tsx`를 먼저 확인한다.

조회 로직은 `src/services/guru`와 query client에 두고 화면은 `src/app` route와 `src/components`에 구성한다. 예를 들어 블록 목록은 `getLatestBlocks`, 거래 목록은 `getRecentTransactions`를 해당 서비스에서 제공한다. 체인 문맥을 포함하는 클라이언트와 현재 함수 인자를 확인한 뒤 연결한다.

```ts
import { getLatestBlocks } from "@/services/guru/blocks.service";
import { getRecentTransactions } from "@/services/guru/transactions.service";
```

내부 탐색은 `ChainLink`로 URL의 체인을 보존한다. 지갑 세션/포트폴리오는 Zustand store, 조회 상태는 `useQuery`/`usePagedQuery`가 관리한다. 네트워크·지갑 경계에 fixture를 주입하고 실제 route/component/service 흐름을 실행하는 테스트를 추가한다.


## 특화 모듈과 검색 범위

BEX·Oracle·FeePolicy는 체인의 `features.bex/oracle/feepolicy: true`가 있어야 메뉴와 직접 URL에서 조회됩니다. false 또는 생략은 설정상 미지원이며 HTTP를 보내지 않습니다. true는 조회 허용 설정이지 live 계약 검증 완료를 뜻하지 않습니다. HTTP 404는 endpoint/계약 미확인, timeout·500은 조회 오류, 정상 빈 배열은 빈 결과, 손상된 일부 행은 부분 실패로 표시합니다. 지갑 연결은 공개 조회 조건이 아닙니다.

BEX fee/limit, FeePolicy discount_type/amount, Oracle nonce·결과 시각·report는 원문을 보존합니다. 미확정 비율·단위·우선순위·nonce=0의 최신 의미·서명 검증 여부를 추정하지 않습니다. `percent`와 합성 fixture의 `percentage`는 별개 원문입니다. 각 성공한 클라이언트 조회는 endpoint·관찰시각·응답 헤더 높이를 보관하며 높이가 노출되지 않으면 미확인입니다. 서로 다른 요청을 동일 snapshot으로 해석하지 마세요.

상단 검색은 양의 정수 블록 높이, Cosmos tx hash, 설정 prefix/checksum에 맞는 계정 주소를 지원합니다. 64자리 숫자는 높이/hash 후보 선택을 요구합니다. 이 상단 검색에서 EVM hash·블록 hash·validator/token 검색은 미지원이며 입력 오류 안내 후 HTTP를 보내지 않습니다. 중복 GlobalSearchBar와 미사용 검색 store는 제거했습니다.

## 구현 경계

`src/server/handlers`는 내부 함수입니다. Next route handler 등록 없이 공개 HTTP API라고 해석하지 않습니다. Faucet 지급·WebSocket 연결·재위임 제출·서버 지갑 세션의 미사용 모의 성공 경로는 제거했습니다. 실제 조회 갱신은 HTTP polling, 지갑 상태는 클라이언트 wallet lifecycle/store, 구현된 staking 행위는 실제 signer guard를 사용합니다. Faucet·WS·재위임을 향후 제품에 연결하려면 별도 범위와 수용 기준이 필요합니다.

개별 token metadata는 bank metadata/IBC trace 응답만 사용합니다. 응답 없는 symbol·name·decimals는 추정하지 않으며 이 Cosmos token 조회에서는 EVM token metadata를 제공하지 않습니다. EVM ERC20 metadata는 별도 Send 화면에서 조회합니다. IBC trace의 base denom만으로 원체인 symbol·name을 확정하지 않습니다.

## EVM 조회·전송 설정과 경계

EVM 전송은 헤더에서 탐색된 **MetaMask provider를 직접 선택**하거나 **WalletConnect · EVM**으로 연결한 뒤, 대시보드 **Send**에서 사용합니다. 조회는 지정 public RPC, 서명·방송 요청은 선택한 지갑으로 보냅니다. Cosmos 전송·staking·governance 권한과 EVM 주소 변환 제한은 별도로 유지합니다.

`NEXT_PUBLIC_CHAINS` 항목에 다음 EVM 필드가 모두 필요합니다. 예시는 합성 값이며 배포 체인 지원 근거가 아닙니다. 기존 TGXN 프리셋에 EVM 지원을 자동으로 추가하지 않습니다.

```json
{
  "evmChainId": "631",
  "evmRpcUrl": "https://verified-evm.example.invalid",
  "evm": {
    "nativeCurrency": { "name": "Example", "symbol": "EX", "decimals": 18 },
    "feeMode": "legacy",
    "evidence": "검증한 체인 버전·RPC·통화·수수료 근거를 기재"
  }
}
```

- `evmChainId`는 선행 0 없는 양의 십진 문자열이며 JS safe integer 범위입니다. RPC `eth_chainId`와 지갑 체인을 확인합니다. MetaMask 네트워크 전환에서 4902가 반환되면 검증된 설정으로 추가한 뒤 전환·체인 ID를 다시 확인합니다.
- `evm.nativeCurrency.decimals`는 Cosmos denom의 decimals와 별개입니다. EIP-1559 지원이 확인된 체인만 `feeMode: "eip1559"`를 사용합니다. legacy gasPrice와 EIP-1559 필드를 혼합하지 않습니다.
- ERC20은 사용자가 입력한 contract 주소의 code·decimals·symbol·balanceOf를 검증하고 transfer simulation의 성공을 요구합니다. metadata는 토큰의 진위를 보증하지 않습니다. 비표준 반환값·metadata 실패는 전송을 차단합니다.
- 확인창은 수신자·자산/contract·정밀 수량·nonce·gas·최대 수수료를 고정합니다. 2분 뒤에는 다시 확인해야 합니다. 서명 직전 계정·체인·nonce·잔액·토큰 단위를 다시 검사합니다.
- 방송 후 계정/체인 변경으로 거래가 취소되었다고 표시하지 않습니다. 60초 지갑 응답 지연·hash 없는 모호한 결과는 `unknown`이며 자동 재서명·재전송하지 않습니다. 지갑 응답이 남아 있으면 중복 제출을 잠그고, 늦게 도착한 hash도 보존합니다.
- 영수증은 최초 1회 조회하고 pending 상태에서 **영수증 재조회**로 다시 확인합니다. RPC timeout·미포함은 성공/실패 확정이 아닙니다. 실제 네트워크 수수료는 receipt의 gasUsed × effectiveGasPrice입니다.
- 앱 제출 결과 최근 20건을 `explorer:evm-results:v1`에 공개 요청·결과 metadata만 저장합니다. 지갑 provider·WC topic·서명 데이터는 저장하지 않습니다. 새로고침 중 응답 대기 요청은 unknown으로 복원하며 저장한 요청은 재서명할 수 없습니다. 브라우저 저장소 실패는 화면에 표시합니다. 전체 주소 거래/내부 trace 이력은 제공하지 않습니다.

현재 실기기·실지갑·실거래 검증과 운영 EVM 설정 변경은 미실행입니다. 실제 테스트는 체인·공개 계정·자산·금액/수수료 상한·기간·허용 작업 승인 후 수행합니다. 구현 회귀 테스트는 `tests/integration/evm-transfer.integration.test.tsx`, `metamask-provider.integration.test.tsx`, `walletconnect-evm-transfer.integration.test.tsx`에서 실제 서비스·UI를 실행하고 지갑/JSON-RPC 경계만 mock합니다.


## EVM 컨트랙트 및 hash 조회

대시보드 **EVM 컨트랙트 및 hash 조회** 영역에서 사용합니다. 기존 검증된 EVM 설정이 필요하며 운영 체인 설정을 자동으로 추가하지 않습니다.

- 컨트랙트 주소와 JSON ABI 배열(최대 64 KiB, 256개 항목)을 입력하고 전체 signature로 함수를 선택합니다. overload는 별개 항목이며 중복 signature는 차단합니다. 함수 ABI에는 inputs/outputs/stateMutability가 필요합니다.
- 인자는 순서대로 JSON 배열(최대 32 KiB)로 입력합니다. 큰 정수의 반올림을 막기 위해 모든 정수는 문자열로 입력합니다: `["42", true]`. tuple과 배열은 중첩 배열을 사용하며 타입·길이·범위를 검사합니다. 배열당 최대 1,024개 원소, tuple ABI 깊이 12, 인자 중첩 깊이 24, 인코딩한 calldata 최대 64 KiB입니다.
- `view`/`pure`는 공개 RPC의 `eth_call`로 조회하고 서명하지 않습니다. 선택 체인에 연결된 EVM 주소가 있으면 caller로 사용하며, 없으면 RPC 기본 caller를 사용합니다. `nonpayable`/`payable`은 code 확인 → simulation(`eth_call`) → estimate → 앱 확인 → 지갑 요청 → receipt 흐름입니다. `payable`만 네이티브 value를 허용합니다. 배포·fallback/receive·raw calldata 전용 UI는 제공하지 않습니다.
- 확인창은 체인·전체 주소·signature·디코딩된 인자·value·nonce·gas·최대 수수료를 표시합니다. 서명 직전 계정·체인·generation·nonce·잔액·code·simulation을 다시 확인합니다. 자동 재서명/재전송은 없으며 timeout/늦은 hash는 원래 요청으로 보존합니다. simulation 성공은 실제 실행 성공을 보장하지 않습니다.
- EVM hash는 `0x`가 포함된 32바이트를 입력합니다. 선택 체인에서 거래와 영수증을 조회하고 legacy/EIP-2930/EIP-1559 등 RPC 거래 타입, pending/unknown/success/revert를 구분합니다. Cosmos hash는 상단의 별도 Cosmos 검색을 사용합니다. 확인한 영수증은 동일 체인·hash·from/to의 앱 제출 결과에도 반영합니다.
- 최근 20건 앱 제출 기록만 이 브라우저에 보관합니다. 전체 주소 과거 이력·내부 trace·재조직/최종성 감시는 제공하지 않습니다. hash 조회 오류가 이미 확인된 결과를 실패로 덮어쓰지 않습니다.

`tests/integration/evm-contract.integration.test.tsx`는 실제 서비스·상태·UI를 실행하고 RPC/지갑 경계만 mock합니다. 합성 contract의 read/write receipt는 배포 TGXN·실지갑·실거래 지원 증명이 아닙니다. 실제 거래 검증은 허용된 체인·계정·contract/함수·금액/수수료 상한·기간 확정 후 별도로 수행합니다.

# W01 공개 체인 관찰 fixture

2026-10-20 04:43:48 UTC, Origin `https://exp.gurufin.io`를 명시한 터미널 curl 관찰이다. 각 JSON은 URL, method, 관찰시각, HTTP 상태, 응답 헤더, 응답 높이와 본문을 담는다. `lcd-block*`, `rpc-*`, `node-info`는 관련 공개 필드만 추출했고 나머지는 원본 JSON 구조다. OPTIONS는 HTML endpoint 목록이므로 요약만 보존했다. OPTIONS는 높이를 제공하지 않아 `blockHeight: null`이다. 각 응답은 동일 snapshot으로 고정한 것이 아니다.

모든 요청은 공개 GET 또는 JSON-RPC `status`, OPTIONS다. POST 본문은 `{"jsonrpc":"2.0","id":1,"method":"status","params":{}}`, OPTIONS는 `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: content-type`을 사용했다. 서명/브로드캐스트 없음. curl exit 0/HTTP 200은 브라우저 CORS나 signer 성공을 뜻하지 않는다.

`metadata.json` 첫 페이지는 10개 제한이며 전체 metadata 집합이 아니다. 회귀 테스트는 여기서 응답을 읽고 페이지네이션/실패 변형은 명시적으로 합성한다. 네트워크 지표 테스트의 공급/풀/인플레이션 값은 별도 synthetic fixture이며 실제 관찰값이 아니다. 지원 판정과 검증 보고 원본은 Paperclip GURA-36 report 문서다.

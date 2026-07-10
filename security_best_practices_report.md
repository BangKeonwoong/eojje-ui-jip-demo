# 보안 점검 보고서

점검일: 2026-07-10  
범위: `index.html`, `admin.html`, `accessibility.js`, 배포 설정  
기준: 브라우저 JavaScript 보안 베스트 프랙티스, DOM XSS·저장소·CSP·외부 리소스 점검

## 요약

현재 산출물은 **개인정보나 결제를 처리하지 않는 공개 데모**로는 배포할 수 있다. CSP, 안전 헤더 설정, 관리자 `noindex`, 세션 단위 고객 정보 저장, 손상된 저장값 검증을 적용했다.

다만 관리자 인증·서버·실제 주문 전송이 없고, 템플릿 런타임이 `unsafe-eval`에 의존한다. 따라서 **현재 상태를 실제 상점이나 운영 관리자로 사용하는 것은 차단**해야 한다.

## 남은 발견 사항

### SEC-01 — 관리자 인증·서버 권한 검사 부재

- Rule ID: AUTHZ-001
- Severity: Critical for production / Informational for the current demo
- Location: `admin.html:2041`, `admin.html:2426-2428`, `admin.html:2538`, `README.md:3`, `README.md:33`
- Evidence: 역할은 `<select>`로 누구나 바꾸고, 기본값은 `role:'owner'`이며, 제한은 `S.role==='staff'` 같은 클라이언트 조건문이다.
- Impact: 향후 실제 API나 고객 데이터를 연결하면 사용자가 임의로 대표 권한을 선택해 조회·변경·삭제할 수 있다.
- Fix: 서버 로그인, `HttpOnly` 세션 쿠키, 서버 측 RBAC, 모든 조회·변경 요청에서의 권한 재검증을 구현한다.
- Mitigation: `admin.html:8`의 `noindex`, `admin.html:2049`의 데모 경고, `_headers:12-14`의 검색 차단·`no-store`를 적용했다.
- False positive notes: 현재는 서버가 없어 공격자가 자신의 브라우저 데모 상태만 바꾸므로 서버 권한 상승은 아니다.

### SEC-02 — 주문·매입·문의가 실제 서버로 전송되지 않음

- Rule ID: DATA-001
- Severity: High if presented as a live store / Informational for a labeled demo
- Location: `index.html:2057`, `index.html:2851-2855`, `admin.html:2477-2485`, `README.md:3`, `README.md:35`
- Evidence: 주문은 React 상태와 현재 탭의 `sessionStorage`에만 추가되고, 관리자도 같은 브라우저 세션을 읽는다.
- Impact: 사용자가 주문이 실제로 접수된 것으로 오인하면 거래·고객 대응 문제가 발생한다.
- Fix: 인증된 API와 서버 DB를 두고, 요청 ID·멱등성·재고 잠금·실패 재시도를 설계한다.
- Mitigation: 전 화면 데모 배너과 README 경고를 추가했다.
- False positive notes: 데모 사이트로만 운영하고 실제 접수를 약속하지 않으면 보안 취약점이 아니다.

### SEC-03 — 동적 코드 평가로 인한 `unsafe-eval` 의존

- Rule ID: JS-XSS-003 / JS-CSP-002
- Severity: Medium
- Location: `index.html:1063`, `index.html:1412`, `admin.html:1060`, `admin.html:1409`, `index.html:10`, `admin.html:11`
- Evidence: 런타임이 `new Function(...)`으로 템플릿 로직을 평가하므로 CSP `script-src`에 `'unsafe-eval'`이 필요하다.
- Impact: 미래에 신뢰할 수 없는 템플릿·CMS·편집기 입력이 코드 평가 경로에 도달하면 동일 출처에서 스크립트가 실행될 수 있다.
- Fix: 운영 빌드에서 템플릿과 로직을 사전 컴파일하고, 편집기 브리지·`new Function`·외부 런타임 로더를 제거한다.
- Mitigation: 실행 가능한 인라인 스크립트를 SHA-256 해시로 고정했고 외부 스크립트 출처는 허용하지 않았다.
- False positive notes: 현재 사용자 입력이 `new Function`으로 흐르는 경로는 발견되지 않았다.

### SEC-04 — 편집기 브리지의 wildcard `postMessage`

- Rule ID: JS-MSG-001
- Severity: Low
- Location: `index.html:1581`, `index.html:1601`, `index.html:1954`, `admin.html:1578`, `admin.html:1598`, `admin.html:1951`
- Evidence: 일부 메시지가 `targetOrigin "*"`로 전송되고, 수신 핸들러에서 `event.origin` 허용 목록을 검사하지 않는다.
- Impact: 상위 프레임이 데모 테마를 바꾸거나 편집기 메타데이터를 받을 수 있다.
- Fix: 운영 배포에서 편집기 브리지를 제거하거나 정확한 origin 허용 목록, `event.source === window.parent`, 메시지 스키마 검증을 적용한다.
- Mitigation: `_headers:2-4`에 `frame-ancestors 'none'`과 `X-Frame-Options: DENY`를 설정했다.
- False positive notes: 현재 주고받는 값은 테마·루트 메타데이터 정도로 민감 정보나 위험 동작은 확인되지 않았다.

### SEC-05 — 외부 폰트·상품 이미지 의존

- Rule ID: JS-SUPPLY-001 / JS-SRI-001
- Severity: Low
- Location: `index.html:2015`, `admin.html:2012`, `index.html:2082`, `index.html:2648-2667`
- Evidence: Google Fonts와 `dasakorea.co.kr` 이미지를 외부에서 불러온다.
- Impact: 외부 정책·장애·URL 변경에 따라 표시가 깨지고, 방문 정보가 외부 호스트에 노출될 수 있다.
- Fix: 사용 권리를 확인한 자산과 폰트를 자체 호스팅하고 파일명·출처·라이선스를 관리한다.
- Mitigation: 도메인 CSP 허용 목록, `Referrer-Policy: no-referrer`, 이미지 오류 대체 UI를 적용했다.
- False positive notes: 외부 자산 의존 자체가 즉시 취약점은 아니다. 배포 전 사용 권리와 안정성을 별도로 확인해야 한다.

## 이번에 적용한 보안 조치

1. `index.html:2702-2739` — 저장 값의 타입·ID·길이를 검증하고, 이름·연락처·주문을 `sessionStorage`로 이동했다.
2. `index.html:2823-2873` — 연락처 검증, 충돌 가능성이 낮은 요청 ID, 주문 직전 재고 재검증, 입력 길이 제한을 적용했다.
3. `index.html:10`, `admin.html:11`, `_headers:1-14` — 해시 기반 CSP, `nosniff`, 클릭재킹 차단, Referrer·Permissions Policy, 관리자 `no-store`를 설정했다.
4. `admin.html:8`, `admin.html:2049`, `admin.html:2440-2457` — 관리자 검색 노출 차단, 데모 경고, 명백한 합성 전화번호를 적용했다.
5. `accessibility.js:34-145` — 키보드 활성화, 대화상자 포커스 트랩·복원, 배경 `inert`, 외부 이미지 referrer 제한과 오류 대체를 추가했다.
6. DOM XSS 조사에서 현재 사용자 입력→`innerHTML`/`new Function` 경로, 비밀키·토큰·JWT, `target="_blank"` 사용은 발견되지 않았다.

## 배포 주의

GitHub Pages는 `_headers`를 적용하지 않는다. 해당 배포에서도 HTML CSP·`noindex`는 작동하지만 `frame-ancestors`, `X-Content-Type-Options`, `Permissions-Policy` 같은 HTTP 응답 헤더는 제공되지 않는다. 실서비스 전환 시에는 해당 헤더를 지원하는 호스팅과 사전 컴파일 런타임으로 이전해야 한다.

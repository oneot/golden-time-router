# 골든타임 라우터 · Golden Time Router

장소와 환자 상황을 보내면 Copilot Studio 에이전트가 주변 응급실 10곳의 실시간 병상·수용 제한·도로 이동 시간을 비교해 상위 3곳을 추천합니다. 이 페이지는 그 결과를 홀로그램 지도와 순위판으로 보여 줍니다.

- 웹앱: https://oneot.github.io/golden-time-router/
- 샘플 시연(에이전트 연결 없이 기록 데이터 재생): https://oneot.github.io/golden-time-router/?demo=1
- 구성: `index.html` 한 파일 · Bot Framework Web Chat 4.18.0 · [agent-seal](https://oneot.github.io/agent-seal/) 봉인 + Direct Line

## 내 에이전트로 바꾸기

1. Copilot Studio에서 에이전트의 **설정 → 안전 및 액세스**가 **인증 없음**인지 확인하고, **웹 채널 보안**의 암호1을 복사합니다.
2. [agent-seal](https://oneot.github.io/agent-seal/)에 암호1과 내 GitHub 아이디를 넣고, 만들어진 코드의 `const SEALED = "…";` 줄로 이 파일의 같은 줄을 바꿉니다. `BROKER_URL` 줄과 연결 흐름은 바꾸지 않습니다.
3. 에이전트 지침 끝에 아래 **웹앱용 데이터** 규칙을 붙이고 게시합니다.
4. 저장소 **Settings → Pages**에서 `main` / `/ (root)`로 배포합니다. 에이전트 연결은 내 `https://아이디.github.io` 주소에서만 됩니다.

## 웹앱용 데이터 (에이전트 지침에 추가)

웹앱은 에이전트 답 끝의 ```json 블록으로 지도와 순위판을 그리고, 채팅에는 블록을 뺀 글만 보여 줍니다.

```text
웹앱용 데이터
- 워크플로를 호출한 답변의 맨 끝에는 웹앱이 지도와 순위판을 그릴 데이터를 ```json 코드 블록 하나로 붙인다. 되묻는 답변에는 붙이지 않는다.
- 병원정보의 후보를 하나도 빼지 않고 모두 넣는다. status는 추천(1~3순위), 대안(조건은 맞지만 3순위 밖), 보류, 제외 중 하나다. rank는 추천만 1~3이고 나머지는 0이다.
- 값은 데이터에서 그대로 옮긴다. lat·lng는 이동시간 응답 summary의 y(위도)·x(경도)이고 기준 장소는 origin, 병원은 destination에서 가져온다. km는 직선거리, road는 distance÷1000(소수 첫째 자리), min은 duration÷60 반올림, beds는 hvec, time은 hvidate의 시:분, tel은 dutyTel3이다. 없는 값은 null로 둔다.
- note에는 순위나 보류·제외의 근거를 20자 안팎으로 쓴다.
- 형식(한 줄 예시): {"origin":{"name":"장소명","address":"주소","lat":37.49,"lng":126.92},"need":"필요한 치료 한 줄","hospitals":[{"rank":1,"status":"추천","name":"병원명","lat":37.49,"lng":126.90,"km":1.05,"road":1.6,"min":4,"beds":8,"time":"20:41","tel":"02-000-0000","note":"제한 없음, 가장 빠름"}]}
```

> 연구용 시뮬레이션입니다. 실제 이송 판단에 쓰지 않습니다. 병상과 메시지는 병원이 입력한 값이라 실제와 다를 수 있습니다.

데이터: 국립중앙의료원 응급의료정보(공공데이터포털) · 카카오 로컬 · 카카오모빌리티 길찾기 · 지구본 육지 윤곽: Natural Earth

# 🚨 골든타임 라우터 · Golden Time Router

장소와 환자 상황을 한 줄로 보내면 Copilot Studio 에이전트가 주변 응급실 10곳의 실시간 병상·수용 제한·도로 이동 시간을 비교해 상위 3곳을 추천합니다. 이 웹앱은 그 결과를 홀로그램 지도와 순위판으로 보여 줍니다.

- 웹앱: https://oneot.github.io/golden-time-router/
- 샘플 시연(에이전트 연결 없이 기록한 답 재생): https://oneot.github.io/golden-time-router/?demo=1

## 내 웹앱 만들기

준비: Copilot Studio에 게시한 '골든타임 라우터' 에이전트 (인증 없음, 지침 끝에 아래 '웹앱용 데이터' 포함)

1. 이 페이지 위쪽 **Use this template → Create a new repository**를 누르고, 저장소 이름(예: `golden-time-router`)과 **Public**을 고른 뒤 **Create repository**를 누릅니다.
2. Copilot Studio 에이전트의 **설정 → 안전 및 액세스 → 웹 채널 보안**에서 암호1을 복사합니다.
3. [agent-seal](https://oneot.github.io/agent-seal/?file=config)에 암호1과 내 GitHub 아이디를 넣고, **config.js**를 고른 상태에서 **복사**를 누릅니다.
4. 내 저장소의 `config.js`를 열고 ✏️ → 전체 선택 → 붙여 넣기 → **Commit changes**.
5. **Settings → Pages**에서 Branch `main`, 폴더 `/ (root)`를 고르고 **Save**. 몇 분 뒤 `https://내-아이디.github.io/저장소-이름/`을 엽니다.

- 바꾸는 파일은 `config.js` 하나입니다. 다른 파일은 그대로 둡니다.
- SEALED는 `https://내-아이디.github.io`에만 묶여 있어 저장소 이름은 자유입니다.

## 웹앱용 데이터 (에이전트 지침 끝에 추가)

웹앱은 답변 끝의 데이터 한 줄로 지도를 그리고, 브리핑에서는 그 줄을 숨깁니다. 이 줄이 없으면 '요약 모드'로 상위 3곳과 보류·제외만 보여 줍니다.

````text
웹앱용 데이터
- 워크플로를 호출한 답변의 맨 끝에 웹앱 지도용 데이터를 ```json 코드 블록 한 줄로 붙인다. 되묻는 답변에는 붙이지 않는다.
- 형식: {"o":[위도,경도],"h":[["병원명","판정",위도,경도,소요초,병상],…]}
- o는 기준 장소, h에는 병원정보의 후보를 하나도 빼지 않고 넣는다. 판정은 "1"·"2"·"3"(추천 순위), "대안", "보류", "제외" 중 하나다.
- 위도·경도는 이동시간 응답 summary의 y·x(기준 장소는 origin, 병원은 destination)를 소수 넷째 자리까지 쓴다. 소요초는 duration, 병상은 hvec 값을 그대로 쓴다. 없는 값은 null이다.
- 예: {"o":[37.4933,126.9205],"h":[["한림대학교 강남성심병원","1",37.4932,126.9087,268,8],["강남힐병원","제외",37.4816,126.9116,null,null]]}
````

## 연결 안내가 뜰 때

| 화면 안내 | 해결 |
|---|---|
| 내 github.io 주소에서만 연결돼요 | 내 컴퓨터·미리보기에서는 정상입니다. Pages 주소에서 여세요. |
| 이 SEALED는 다른 GitHub 주소용이에요 | agent-seal에서 **내** 암호1과 **내** 아이디로 봉인해 `config.js`를 바꾸세요. |
| SEALED 값이 잘렸거나 바뀌었어요 | agent-seal에서 두 줄을 다시 복사해 `config.js` 전체를 바꾸세요. |
| config.js 내용이 올바르지 않아요 | `config.js`에 agent-seal의 두 줄만 남기세요. |
| 연결은 됐지만 에이전트가 답하지 않아요 | 에이전트를 게시했는지, 인증이 '인증 없음'인지 확인하세요. |
| 요약 모드 | 지침 끝에 '웹앱용 데이터'를 넣고 다시 게시하세요. |

고친 뒤에도 그대로면 강력 새로고침(`⌘/Ctrl + Shift + R`)을 하세요.

## 파일 구성

```
index.html         화면 뼈대
config.js          ✏️ 학생이 바꾸는 유일한 파일 (BROKER_URL · SEALED)
css/style.css      화면 디자인
js/utils.js        공통 함수 · 에이전트 답 읽기
js/background.js   배경 데이터 흐름
js/holo-map.js     지구본 · 레이더 지도
js/panels.js       분석 단계 · 순위판 · 하단 티커
js/app.js          화면 흐름 · 샘플 시연 · 연결 안내
js/chat.js         agent-seal 연결 (config.js를 매번 새로 불러와 Direct Line으로 연결)
data/demo.js       샘플 시연 기록
data/land.js       지구본 육지 점
```

> 연구용 시뮬레이션입니다. 실제 이송 판단에 쓰지 않습니다. 병상과 메시지는 병원이 입력한 값이라 실제와 다를 수 있습니다.

데이터: 국립중앙의료원 응급의료정보(공공데이터포털) · 카카오 로컬 · 카카오모빌리티 길찾기 · 지구본 윤곽: Natural Earth · v1.0

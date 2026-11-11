# 🚨 골든타임 라우터 · Golden Time Router

장소와 환자 상황을 한 줄로 보내면 Copilot Studio 에이전트가 주변 응급실 10곳의 실시간 병상·수용 제한·도로 이동 시간을 비교해 상위 3곳을 추천합니다. 이 웹앱은 기다리는 동안 지구본에서 한반도 응급실 530곳으로, 다시 출발지 주변 후보 10곳으로 날아들고, 답이 오면 에이전트가 판단한 순서(① 치료 가능 여부 → ② 병상·수용 제한 → ③ 실제 도착 시간 → ④ 순위)대로 지도에 보여 줍니다.

- 웹앱: https://oneot.github.io/golden-time-router/

## 내 웹앱 만들기

준비: Copilot Studio에 게시한 '골든타임 라우터' 에이전트 (인증 없음, 지침 끝에 아래 '웹앱용 데이터' 포함)

1. 이 페이지 위쪽 **Use this template → Create a new repository**를 누르고, 저장소 이름(예: `golden-time-router`)과 **Public**을 고른 뒤 **Create repository**를 누릅니다.
2. Copilot Studio 에이전트의 **설정 → 안전 및 액세스 → 웹 채널 보안**에서 암호1을 복사합니다.
3. [agent-seal](https://oneot.github.io/agent-seal/?file=config)에 암호1과 내 GitHub 아이디를 넣고, **config.js**를 고른 상태에서 **복사**를 누릅니다.
4. 내 저장소의 `config.js`를 열고 ✏️ → 전체 선택 → 붙여 넣기 → **Commit changes**.
5. **Settings → Pages**에서 Branch `main`, 폴더 `/ (root)`를 고르고 **Save**. 몇 분 뒤 `https://내-아이디.github.io/저장소-이름/`을 엽니다.

- 바꾸는 파일은 `config.js` 하나입니다. 다른 파일은 그대로 둡니다.
- SEALED는 `https://내-아이디.github.io`에만 묶여 있어 저장소 이름은 자유입니다.

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
js/geo.js          위치 찾기 (OpenStreetMap) · 가까운 응급실 10곳
js/holo-gl.js      지도 그래픽 (WebGL 셰이더 · 지구본·한반도·출발지 주변의 점 만들기)
js/holo-map.js     실시간 지도 (지구본 → 한반도 → 출발지 · 판단 순서 연출 · 라벨)
js/panels.js       분석 단계 · 추천 순위
js/app.js          화면 흐름 · 샘플 시연 · 연결 안내
js/chat.js         agent-seal 연결 (config.js를 매번 새로 불러와 Direct Line으로 연결)
data/demo.js       샘플 시연 기록 4건 (실데이터로 에이전트가 답한 기록)
data/er.js         전국 응급실 530곳 위치 (국립중앙의료원, 2026-11-11)
data/korea.js      한반도 점 지도 (Natural Earth 10m)
data/land.js       지구본 육지 (0.25도 격자)
```

- 기다리는 동안 지도를 실제 출발지로 옮기려고, 질문 중 **장소 이름만** OpenStreetMap에 보내 좌표를 찾습니다(환자 상황은 보내지 않음). 찾은 장소는 브라우저에 30일 저장합니다. 못 찾으면 한반도 화면에서 답을 기다렸다가, 답에 담긴 출발지로 날아갑니다.
- 샘플 시연은 누를 때마다 기록 4건(강남역 · 보라매공원 · 잠실 · 광화문)을 차례로 재생합니다. 주소 끝에 `?demo=1`~`?demo=4`를 붙이면 바로 그 기록을 재생합니다.

WebGL을 쓸 수 없는 브라우저에서는 지도를 2D로 줄여 그리고, '동작 줄이기' 설정이 켜져 있으면 애니메이션 없이 결과만 보여 줍니다.

> 연구용 시뮬레이션입니다. 실제 이송 판단에 쓰지 않습니다. 병상과 메시지는 병원이 입력한 값이라 실제와 다를 수 있습니다.

데이터: 국립중앙의료원 응급의료정보(공공데이터포털) · 카카오 로컬 · 카카오모빌리티 길찾기 · 위치 찾기: © OpenStreetMap 기여자(Nominatim) · 지도: Natural Earth · 글꼴: Pretendard, Geist Mono · v2.1

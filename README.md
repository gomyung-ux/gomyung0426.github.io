# 민지 생일 선물 펀딩 (Netlify 버전)

로그인 없이 누구나 열람, 펀딩 등록, 축하글 작성이 가능한 버전이에요.

## 폴더 구성
- public/index.html : 화면
- public/poster.jpg : 상단 포스터 (같은 이름으로 바꿔 끼우면 교체)
- netlify/functions/api.mjs : 저장과 조회를 맡는 서버 함수 (Netlify Blobs에 저장)
- netlify.toml, package.json : 설정

## 배포 방법 (GitHub 연결, 가장 쉬움)
1. 이 폴더 전체를 GitHub 새 저장소에 올려요 (node_modules 폴더는 제외).
2. Netlify > Add new site > Import an existing project > 그 저장소 선택.
3. 빌드 설정은 그대로 두고 Deploy.
4. 배포 후 Site configuration > Environment variables 에서 `ADMIN_PASSWORD` 를 추가해요. 값이 관리자 비밀번호예요.
5. Deploys > Trigger deploy > Deploy site 로 한 번 더 배포하면 비밀번호가 적용돼요.
6. 페이지 맨 아래 "관리자 모드"에서 비밀번호로 들어가 내역 확인, 삭제, 목표 금액, 카카오페이 링크를 설정해요.

## 배포 방법 (CLI)
```
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```
드래그 앤 드롭 배포는 서버 함수가 빠질 수 있어서 추천하지 않아요.

## 비밀번호 바꾸기
Environment variables 의 `ADMIN_PASSWORD` 값을 바꾸고 다시 배포하면 돼요.

## 참고
- 친구들은 약 8초마다 자동으로 최신 상태를 받아와요.
- "내가 등록한 내역"과 직접 삭제 권한은 등록한 브라우저 기준이에요. 기기나 브라우저가 바뀌면 민지님이 관리자 모드에서 지워주면 돼요.
- 금액은 친구들에게 보이지 않고 달성률(%)만 보여요. 연락처와 비밀 축하글은 서버가 민지님에게만 내려줘요.

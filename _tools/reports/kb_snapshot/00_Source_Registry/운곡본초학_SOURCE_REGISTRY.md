\---  
title: "운곡본초학 SOURCE REGISTRY"  
type: source-registry  
status: PARTIAL\_ACCESS  
version: 0.2  
last\_reviewed: 2026-09-09  
\---  
  
\# 운곡본초학 SOURCE REGISTRY  
  
\#\# 원본  
\#\#\# 상권  
\- 파일명: \`운곡 본초학 \_상\_.pdf\`  
\- Google Drive file ID: \`1iRgMkq2mrJS14HUwiBLBOzM84vh0yQPD\`  
\- 크기: 588,630,476 bytes  
\- 상태: 현재 연결도구의 대용량 파일 제한으로 전체/페이지 접근 실패  
\- 처리: 원본 유지. 현재 연결 경로의 raw download 상한 때문에 서버측 물리분할은 직접 수행되지 않음. 논리 페이지 분할과 페이지 단위 추출로 ingestion을 계속 진행한다.  
  
\#\#\# 하권  
\- 파일명: \`운곡 본초학 \_하\_.pdf\`  
\- Google Drive file ID: \`1gOzpouzkpx79GO9S-F1ZRsdDB2GQTXCY\`  
\- 크기: 517,171,775 bytes  
\- 페이지: 845  
\- 상태: 페이지 단위 접근 및 텍스트 추출 성공. 대용량 때문에 간헐적 provider error 존재.  
\- 검수: 저자 약력의 한글/한자 텍스트가 읽혔고, 본초 항목 페이지에서 성미·귀경·효능주치·임상응용·사용량·수치·주의 및 다음 약재의 기원/성상 등이 구조적으로 추출됨.  
  
\#\# 현재 ingestion 방식  
\- 목적은 원본 변경이 아니라 AI retrieval 안정화다.  
\- 물리 PDF 분할보다 \`논리 페이지 범위 → 본초 항목 경계 → 본초별 MD\`를 우선한다.  
\- 원본 PDF는 Drive에 그대로 보존한다.  
\- 물리분할이 가능해지면 100\~200MB 내외 조각을 추가할 수 있으나, 임상 지식베이스의 정본은 약재별 MD와 provenance다.  
\- 처리 큐는 \[\[운곡본초학\_논리분할\_MANIFEST\]\] 참조.  
  
\#\# 파생 노트의 provenance 규칙  
각 약재 파일에 반드시 기록:  
\- \`source\_book\`  
\- \`source\_volume\`  
\- \`source\_pdf\_page\_start\`  
\- \`source\_pdf\_page\_end\`  
\- \`printed\_page\` (확인 가능할 때)  
\- \`extraction\_status\`  
\- \`ocr\_uncertain\`  
  
원문을 장문 복제하기보다 항목별 사실을 구조화하고, 필요한 경우 페이지 위치로 원문을 재확인한다.  

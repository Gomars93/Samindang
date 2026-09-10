\---  
title: "운곡본초학 SOURCE REGISTRY"  
type: source-registry  
status: PARTIAL\_ACCESS  
version: 0.1  
last\_reviewed: 2026-09-09  
\---  
  
\# 운곡본초학 SOURCE REGISTRY  
  
\#\# 원본  
\#\#\# 상권  
\- 파일명: \`운곡 본초학 \_상\_.pdf\`  
\- Google Drive file ID: \`1iRgMkq2mrJS14HUwiBLBOzM84vh0yQPD\`  
\- 크기: 588,630,476 bytes  
\- 상태: 현재 연결도구의 대용량 파일 제한으로 전체/페이지 접근 실패  
\- 처리: 원본 유지. 200 MB 이하의 비손실 PDF 조각으로 분할 후 ingestion 권장.  
  
\#\#\# 하권  
\- 파일명: \`운곡 본초학 \_하\_.pdf\`  
\- Google Drive file ID: \`1gOzpouzkpx79GO9S-F1ZRsdDB2GQTXCY\`  
\- 크기: 517,171,775 bytes  
\- 페이지: 845  
\- 상태: 페이지 단위 접근 및 텍스트 추출 성공. 대용량 때문에 간헐적 provider error 존재.  
\- 검수: 저자 약력의 한글/한자 텍스트가 읽혔고, 본초 항목 페이지에서 성미·귀경·효능주치·임상응용·사용량·수치·주의 및 다음 약재의 기원/성상 등이 구조적으로 추출됨.  
  
\#\# 권장 분할 규격  
\- 목적은 원본 변경이 아니라 AI ingestion용 접근 안정화다.  
\- 각 조각: 권장 150\~200 MB 이하  
\- 페이지 기준으로는 우선 약 200\~250쪽 단위 권장.  
\- PDFsam Basic / qpdf 등 페이지 추출 방식 사용.  
\- \`인쇄 → PDF\` 방식은 텍스트 레이어·페이지 품질이 달라질 수 있어 비추천.  
  
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

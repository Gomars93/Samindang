\---  
title: "운곡본초학 논리분할 및 ingestion manifest"  
type: source-ingestion-manifest  
status: ACTIVE  
version: 0.1  
last\_reviewed: 2026-09-09  
\---  
  
\# 운곡본초학 논리분할 MANIFEST  
  
\#\# 목적  
Google Drive에 보존된 500MB급 원본 PDF를 변경하지 않고, AI가 안정적으로 처리할 수 있도록 페이지 범위를 작업 단위로 나눈다.  
  
\#\# 원칙  
\- 원본 PDF는 유일 원본으로 보존한다.  
\- 파생 지식은 PDF 조각 자체보다 \`본초별 MD + 정확한 페이지 provenance\`를 정본으로 사용한다.  
\- 물리적 PDF 분할이 가능해지면 아래 논리구간과 동일한 명명규칙으로 생성한다.  
\- 본초 항목이 구간 경계를 넘으면 \*\*본초 항목을 우선\*\*하여 앞뒤 페이지를 함께 읽는다.  
  
\#\# 하권  
전체 845 PDF pages.  
  
| logical\_chunk | PDF pages | 상태 |  
|---|---:|---|  
| H-01 | 1-100 | PENDING |  
| H-02 | 101-200 | IN\_PROGRESS |  
| H-03 | 201-300 | PENDING |  
| H-04 | 301-400 | PENDING |  
| H-05 | 401-500 | PENDING |  
| H-06 | 501-600 | PENDING |  
| H-07 | 601-700 | PENDING |  
| H-08 | 701-800 | PENDING |  
| H-09 | 801-845 | PENDING |  
  
\#\#\# 확보된 검수 포인트  
\- PDF p180: 제11장 지혈약, 이전 본초 항목 말미 및 사용량/수치/주의가 읽힘.  
\- PDF p181: 제4절 온성 지혈약 시작, 艾葉 항목 시작 확인.  
  
\#\# 상권  
\- 원본 크기: 588,630,476 bytes.  
\- 현재 raw-download/provider 제한으로 페이지 수 자동 확인이 아직 되지 않음.  
\- 원본 ID와 링크는 \`\[\[운곡본초학\_SOURCE\_REGISTRY\]\]\`에 유지.  
\- 접근이 열리면 100-page logical chunk로 동일하게 등록한다.  
  
\#\# 물리 분할 상태  
\- 현재 연결 경로의 raw download 상한(256MB) 때문에 서버측 원본 바이트 분할은 수행되지 않음.  
\- \*\*임상지식베이스 구축은 물리분할을 기다리지 않고 논리분할/페이지 추출 방식으로 계속 진행한다.\*\*  

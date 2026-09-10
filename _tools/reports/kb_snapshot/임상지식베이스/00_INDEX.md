\---  
title: "삼인당 임상지식베이스 INDEX"  
type: clinical-knowledge-base  
status: SSOT  
version: 1.1  
last\_reviewed: 2026-09-09  
topic: "index"  
evidence\_model: "navigation"  
source\_documents: ""  
use: "internal\_clinical\_decision\_support"  
\---  
  
\# 삼인당 임상지식베이스  
  
\> \*\*목적:\*\* 과거 딥리서치와 임상매뉴얼을 다른 AI가 안전하고 일관되게 재사용할 수 있도록 정본화한 폴더.  
  
\#\# AI가 읽는 순서  
1\. \[\[근거등급-판단원칙\]\]  
2\. 질문과 가장 가까운 \`\*-SSOT.md\`  
3\. 해당 질환 \`QUICKREF\`  
4\. 처방 가감/약재 질문이면 \`\[\[00\_본초\_INDEX\]\]\`와 관련 본초 노트  
5\. 필요할 때 \`Case\_Library\`  
  
\*\*PENDING 문서는 일반화 근거로 사용 금지.\*\*  
  
\# 정본 지도  
| 영역 | 정본 | 상태 | 핵심 용도 |  
|---|---|---|---|  
| 공통 안전 | \[\[간기능-HILI-한약안전성\]\] | SSOT / 2026-09-09 재구성 | 간수치 이상, HILI, FIB-4, 잠재 간독성 약재 |  
| 비뇨 | \[\[BPH-야간뇨-배뇨곤란-SSOT\]\] | SSOT | LUTS/BPH, 야간뇨, PVR/Qmax, 한약 CPG |  
| 여성 공통 | \[\[여성질환-공통프레임-SSOT\]\] | SSOT | Safety Gate, phenotype, PMS/월경통/PCOS |  
| 갱년기 | \[\[갱년기-불면-SSOT\]\] | SSOT | 중간각성, VMS, M1\~M4, 2/4주 재평가 |  
| PCOS | \[\[PCOS-월경불순-QUICKREF\]\] | QUICKREF | 장기관리 프레임, 대사·자궁내막 보호 |  
| PMS | \[\[PMS-PMDD-QUICKREF\]\] | QUICKREF | DRSP, PMDD 안전, 특정 RCT 범위 제한 |  
| 월경통 | \[\[난치성-월경통-QUICKREF\]\] | QUICKREF | 이차성 감별, cycle outcome |  
| 난임/유산/IVF | \[\[난임-IVF-유산-RPL-생식전환기-SSOT\]\] | SSOT | 유산 후, RPL, IVF 실패 후 준비, 과잉 add-on 방지 |  
| 수유/산후 | \[\[수유중-산후한약-안전성-SSOT\]\] | SSOT | 방약합편 + LactMed/현대 안전성, 산모·영아 모니터링 |  
| 산후 구조 | \[\[산후보약-구조회복-근거경계\]\] | REVIEWED | 한약과 골반저/복직근 구조회복 근거 분리 |  
| 보약 | \[\[공진단-경옥고-녹용관절고-근거-SSOT\]\] | SSOT | 사람근거, 제품별 포지션, 녹용관절고=활맥모과주 베이스 관계 |  
| 보약 선별 | \[\[공진단-경옥고-환자선별-전후평가\]\] | REVIEWED | 피로 원인배제, 선별·전후평가 |  
| 본초 | \[\[00\_본초\_INDEX\]\] | BUILDING | 운곡본초학 기반 약재별 기원·성미·귀경·효능·배오·주의·provenance |  
  
\# 핵심 잠금 규칙  
\- \*\*Safety 먼저, 처방 나중.\*\*  
\- Biomedical phenotype과 KM pattern은 분리 기록.  
\- 특정 제제 근거를 처방군 전체로 확대하지 않기.  
\- 사람 임상근거와 전임상 기전을 분리.  
\- 수치/반응률을 지어내지 않기.  
\- 한약이 구조 자체를 직접 회복시킨다는 표현 금지(직접 근거 없을 때).  
\- 수유 안전성은 ‘처방 전체가 안전’으로 일반화 금지.  
\- 녹용관절고는 \*\*활맥모과주 베이스\*\*이나 PG201/레일라 임상결과를 그대로 동일 제제로 취급하지 않는다.  
  
\# 현재 미완성/누락  
\#\# 1. 간수치 딥리서치 원본  
2026-09-05 완성 원본 파일은 검색에서 확인되지 않았다. 따라서 \`간기능-HILI-한약안전성.md\`는 2026-09-09에 주요 권고를 다시 검증하여 재구성했다.  
  
\#\# 2. PCOS 20F case-based deep research  
의뢰는 확인되었으나 최종 연구결과가 아직 이 지식베이스에 들어오지 않았다. \`90\_Case\_Library/PENDING\`에서 잠금.  
  
\# 유지보수 규칙  
\- 새 딥리서치가 완성되면 먼저 기존 SSOT와 충돌 여부를 검수한다.  
\- 더 최신 guideline이 기존 결론을 바꾸면 \`last\_reviewed\`와 변경로그를 갱신한다.  
\- 환자 개별 케이스는 Case Library에 넣고 일반 질환 SSOT에 바로 합치지 않는다.  
\- 약재 단위 판단은 \`07\_본초\_Library\`를 참조하되, 원서 전통효능과 현대 임상근거를 분리한다.  

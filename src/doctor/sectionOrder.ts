/**
 * DoctorView가 렌더링하는 섹션의 의도된 순서 (id 목록). 안전 배너/약물·병력이
 * 명리 검토보다 항상 먼저 나와야 한다는 규칙을 node 테스트에서 검증하기
 * 위해 별도 파일로 분리했다 (DoctorView.tsx는 React/CSS import가 있어
 * node에서 그대로 번들하기 번거롭다). 이 배열은 실제 JSX의 섹션 순서와
 * 반드시 일치시킬 것 — DoctorView.tsx가 이 배열을 그대로 import해서 쓴다.
 */
export const DOCTOR_SECTION_ORDER = [
  'ten_second_summary',
  'safety_banner',
  'safety_glance',
  'patient_basic',
  'chief_complaint',
  'secondary_concerns',
  'primary_module_detail',
  'constitution_herb',
  'medication_history',
  'women_safety',
  'tests_free_text',
  'myungri_review',
  'judgment_record',
] as const

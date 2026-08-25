from pathlib import Path
p=Path('tests/integration.spec.mjs')
s=p.read_text()
old="""        'BOWEL_03',
        'ELBOW_02',"""
new="""        'AF_02',
        'AF_06',
        'BOWEL_03',
        'ELBOW_02',"""
assert old in s and s.count(old)==1
s=s.replace(old,new,1)
old_label="I1: STAFF_CHECK_TRIGGERS keys are exactly SAFETY_01, GI_03, BOWEL_03, LBP_04, NECK_02, NECK_02A, NECK_03B, NECK_04, SH02, SH04, SH05, KNEE_02, KNEE_02A, KNEE_06B, KNEE_07, ELBOW_02, ELBOW_02A, ELBOW_07, ELBOW_08, ELBOW_11, WH_02, WH_07, WH_07A"
new_label="I1: STAFF_CHECK_TRIGGERS keys include ANKLE_FOOT urgent AF_02/AF_06 plus all existing frozen triggers"
assert old_label in s
s=s.replace(old_label,new_label,1)
p.write_text(s)

/**
 * 한약 상담 중단 사유 (red flag) — 레인1 안전 확인 (PR-B2, 2026-09-21).
 *
 * ## 왜 레인2가 아니라 레인1인가
 * 이 세 소견은 설진·복진 중에 눈·손에 걸리지만, 의미가 "변증 참고"가 아니라
 * **"한약 상담을 멈추고 보내야 함"**이다. 레인2의 체크리스트는 아무것도
 * 기록되지 않았을 때 한 줄로 접히고 `＋ 전체` 서랍까지 갖고 있는데,
 * **접히는 자리에 안전장치를 넣는 것은 안전장치를 넣지 않은 것과 같다.**
 * 그래서 같은 타입·직렬화를 쓰되 렌더 위치를 안전 확인 레인으로 분리했다.
 *
 * ## 환자 설문지와 무관하다
 * PO 확인 질문("안전확인으로 올리면 설문지에 체크되는거야?")에 대한 답:
 * **아니다.** 환자는 자기 혀가 돌아갔는지, 복벽이 반사적으로 굳는지 스스로
 * 답할 수 없다. 이 항목은 전적으로 원장이 진찰 후 직접 체크하는 값이고,
 * 태블릿 문진 스펙(`src/spec/`)은 이 배치에서 한 줄도 바뀌지 않았다.
 *
 * ## 이 컴포넌트가 하지 않는 것
 * 체크를 근거로 **어떤 잠금도 걸지 않고, 어떤 진단도 제시하지 않는다.**
 * 기존 안전 잠금(부위별 flag 계산)은 문진 응답에서 파생되는 별도 경로이고,
 * 이 카드는 거기에 개입하지 않는다 -- 원장이 본 것을 그대로 기록하고,
 * 기록된 것을 눈에 띄게 보여주고, EMR 맨 앞에 싣는 것까지가 전부다.
 * 무엇을 할지는 원장이 정한다.
 *
 * ## 미체크는 "이상 없음"이 아니다
 * 이 카드에는 `특이없음` 버튼이 없다. 레인2의 설맥복과 달리 여기서는
 * "봤는데 정상"을 별도로 기록할 실익이 없고(정상이 압도적 다수), 버튼을 두면
 * 안전 항목에 매번 탭을 요구하게 된다. 대신 **미체크를 "이상 없음"으로
 * 읽지 않는다** -- EMR에도 아무 라벨을 내지 않는다(없는 것을 "없음"으로
 * 기록하지 않는다는 저장소 전체 규칙).
 */
import { RED_FLAG_OPTIONS, formatObservationValue, parseObservationValue, toggleObservationChip } from './observationOptions'
import { ObservationTooltip } from './ObservationTooltip'
import type { ClinicianObservationItem } from './clinicianObservation'

export function HerbalSafetyRedFlagCard({
  value,
  onChange,
}: {
  value: ClinicianObservationItem
  onChange: (next: ClinicianObservationItem) => void
}) {
  const { selected, freeText } = parseObservationValue(value.value, RED_FLAG_OPTIONS)
  const anyFlagged = selected.length > 0

  const write = (nextSelected: string[]) => {
    const next = formatObservationValue({ selected: nextSelected, freeText, noFinding: false })
    onChange({
      ...value,
      value: next,
      checked: next.trim() !== '',
      recordedAt: next.trim() !== '' ? new Date().toISOString() : null,
    })
  }

  return (
    /*
     * **한 줄 구성.** 처음에는 제목 / 안내문 / 칩을 각자 줄에 뒀는데, 이
     * 카드는 레인1에 **항상 보이므로** 그 비용이 기본 화면에 그대로 얹힌다 --
     * 실측에서 기본 화면이 871px → 996px(+125px)로 늘었고, PR-A가 한약 화면을
     * 한 화면 안에 넣은 성과를 바로 깎아먹었다. 제목·칩·안내를 한 wrap 줄로
     * 합쳐 그 비용을 줄인다. 좁아지면 flex-wrap이 알아서 줄을 나눈다.
     */
    <section
      className={`workspace__block workspace__redFlag${anyFlagged ? ' workspace__redFlag--on' : ''}`}
      aria-label="한약 상담 중단 사유"
    >
      <div className="workspace__redFlag__row">
        <h3 className="workspace__redFlag__head">한약 상담 중단 사유</h3>
        {anyFlagged && (
          <span className="workspace__redFlag__badge" role="alert">
            확인됨 — 상담 전 의뢰 검토
          </span>
        )}
        <div className="workspace__obsChips" role="group" aria-label="한약 상담 중단 사유 체크 항목">
          {RED_FLAG_OPTIONS.map((o) => (
            <ObservationTooltip key={o.label} text={o.tooltip}>
              <button
                type="button"
                aria-pressed={selected.includes(o.label)}
                className={`workspace__obsChip workspace__obsChip--danger${selected.includes(o.label) ? ' workspace__obsChip--on' : ''}`}
                onClick={() => write(toggleObservationChip(selected, o.label, RED_FLAG_OPTIONS))}
              >
                {o.label}
              </button>
            </ObservationTooltip>
          ))}
        </div>
        <span className="workspace__redFlag__hint">원장 직접 체크 · 환자 문진에는 포함되지 않습니다</span>
      </div>
    </section>
  )
}

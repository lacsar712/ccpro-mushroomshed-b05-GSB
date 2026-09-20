import { createSignal, onMount } from 'solid-js'
import { For } from 'solid-js'
import { api } from '../api/client'
import type { FlushHarvest, HarvestGrade, LabelDye, LabelSlip, Room } from '../types'

const grades: HarvestGrade[] = ['A', 'B', 'C']

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const empty = {
  roomId: '',
  harvestedAt: toLocalInput(),
  flushNo: '1',
  weightKg: '',
  grade: 'A' as HarvestGrade,
  operatorName: '',
}

// 每个潮次一行的开单草稿：copies（1-4）与 dye（dark|light），缺省 1 张 light
type SlipDraft = { copies: string; dye: LabelDye }
const defaultDraft: SlipDraft = { copies: '1', dye: 'light' }

export default function FlushHarvests() {
  const [rows, setRows] = createSignal<FlushHarvest[]>([])
  const [rooms, setRooms] = createSignal<Room[]>([])
  const [slips, setSlips] = createSignal<LabelSlip[]>([])
  const [drafts, setDrafts] = createSignal<Record<number, SlipDraft>>({})
  const [form, setForm] = createSignal({ ...empty })
  const [error, setError] = createSignal('')

  async function load() {
    const [harvests, roomList, slipList] = await Promise.all([
      api<FlushHarvest[]>('/api/flush-harvests'),
      api<Room[]>('/api/rooms'),
      api<LabelSlip[]>('/api/label-slips'),
    ])
    setRows(harvests)
    setRooms(roomList)
    setSlips(slipList)
  }

  onMount(() => {
    load().catch((e) => setError(e.message))
  })

  async function onSubmit(e: Event) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/flush-harvests', {
        method: 'POST',
        body: JSON.stringify({
          roomId: Number(form().roomId),
          harvestedAt: new Date(form().harvestedAt).toISOString(),
          flushNo: Number(form().flushNo),
          weightKg: Number(form().weightKg),
          grade: form().grade,
          operatorName: form().operatorName,
        }),
      })
      setForm({ ...empty, harvestedAt: toLocalInput() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function remove(id: number) {
    if (!confirm('确认删除该采收记录？')) return
    try {
      await api(`/api/flush-harvests/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  function openSlip(harvestId: number) {
    return slips().find((s) => s.harvestId === harvestId && !s.voidedAt)
  }

  function voidedCount(harvestId: number) {
    return slips().filter((s) => s.harvestId === harvestId && s.voidedAt).length
  }

  function draftFor(harvestId: number): SlipDraft {
    return drafts()[harvestId] ?? defaultDraft
  }

  function updateDraft(harvestId: number, patch: Partial<SlipDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [harvestId]: { ...draftFor(harvestId), ...patch },
    }))
  }

  async function openLabelSlip(harvestId: number) {
    setError('')
    const d = draftFor(harvestId)
    const copies = Number(d.copies)
    if (!Number.isInteger(copies) || copies < 1 || copies > 4) {
      setError('copies 只接受 1 至 4')
      return
    }
    try {
      await api('/api/label-slips', {
        method: 'POST',
        body: JSON.stringify({ harvestId, copies, dye: d.dye }),
      })
      await load()
    } catch (err) {
      // 失败时把接口原文摆出来
      setError(err instanceof Error ? err.message : '开单失败')
    }
  }

  async function voidLabelSlip(slip: LabelSlip) {
    setError('')
    const reason = window.prompt(`void 贴标单 #${slip.id}，请填写原因（不能为空）`)
    if (reason === null) return
    if (!reason.trim()) {
      setError('void 原因不能空白')
      return
    }
    try {
      await api(`/api/label-slips/${slip.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'void 失败')
    }
  }

  return (
    <div>
      <header class="page-header">
        <h1>采收记录</h1>
        <p class="muted">
          潮次、等级与重量；weightKg 须 &gt; 0。贴标单 copies 上限 4，weightKg 低于 0.3 的潮次不能开单
        </p>
      </header>
      {error() && <div class="error">{error()}</div>}

      <form class="panel form-grid" onSubmit={onSubmit}>
        <label>
          出菇室
          <select
            value={form().roomId}
            onChange={(e) => setForm({ ...form(), roomId: e.currentTarget.value })}
            required
          >
            <option value="">选择出菇室</option>
            <For each={rooms()}>
              {(r) => (
                <option value={String(r.id)}>
                  {r.roomCode} · {r.species}
                </option>
              )}
            </For>
          </select>
        </label>
        <label>
          采收时间
          <input
            type="datetime-local"
            value={form().harvestedAt}
            onInput={(e) => setForm({ ...form(), harvestedAt: e.currentTarget.value })}
            required
          />
        </label>
        <label>
          潮次
          <input
            type="number"
            min="1"
            value={form().flushNo}
            onInput={(e) => setForm({ ...form(), flushNo: e.currentTarget.value })}
            required
          />
        </label>
        <label>
          重量 (kg)
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form().weightKg}
            onInput={(e) => setForm({ ...form(), weightKg: e.currentTarget.value })}
            required
          />
        </label>
        <label>
          等级
          <select
            value={form().grade}
            onChange={(e) =>
              setForm({ ...form(), grade: e.currentTarget.value as HarvestGrade })
            }
          >
            <For each={grades}>{(g) => <option value={g}>{g}</option>}</For>
          </select>
        </label>
        <label>
          操作人
          <input
            value={form().operatorName}
            onInput={(e) => setForm({ ...form(), operatorName: e.currentTarget.value })}
            required
          />
        </label>
        <button type="submit" class="btn primary">
          新增采收
        </button>
      </form>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>室 ID</th>
              <th>时间</th>
              <th>潮次</th>
              <th>重量</th>
              <th>等级</th>
              <th>操作人</th>
              <th>贴标单</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(r) => {
                const slip = openSlip(r.id)
                const d = draftFor(r.id)
                return (
                  <tr>
                    <td>{r.id}</td>
                    <td>{r.roomId}</td>
                    <td>{new Date(r.harvestedAt).toLocaleString()}</td>
                    <td>{r.flushNo}</td>
                    <td>{r.weightKg}</td>
                    <td>
                      <span class={`badge grade-${r.grade.toLowerCase()}`}>{r.grade}</span>
                    </td>
                    <td>{r.operatorName}</td>
                    <td>
                      {slip ? (
                        <div class="slip-cell">
                          <span class="badge slip-open">
                            #{slip.id} · {slip.roomCode} · 第{slip.flushNo}潮 · ×{slip.copies} ·{' '}
                            {slip.dye}
                          </span>
                          <button
                            type="button"
                            class="btn ghost btn-sm"
                            onClick={() => voidLabelSlip(slip)}
                          >
                            void
                          </button>
                        </div>
                      ) : (
                        <div class="slip-cell">
                          <input
                            type="number"
                            min="1"
                            max="4"
                            step="1"
                            class="slip-copies"
                            value={d.copies}
                            onInput={(e) => updateDraft(r.id, { copies: e.currentTarget.value })}
                            aria-label="copies"
                          />
                          <select
                            class="slip-dye"
                            value={d.dye}
                            onChange={(e) =>
                              updateDraft(r.id, { dye: e.currentTarget.value as LabelDye })
                            }
                            aria-label="dye"
                          >
                            <option value="light">light</option>
                            <option value="dark">dark</option>
                          </select>
                          <button
                            type="button"
                            class="btn primary btn-sm"
                            onClick={() => openLabelSlip(r.id)}
                          >
                            开单
                          </button>
                          {voidedCount(r.id) > 0 && (
                            <span class="muted">已 void {voidedCount(r.id)} 张</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <button type="button" class="btn ghost" onClick={() => remove(r.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                )
              }}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  )
}

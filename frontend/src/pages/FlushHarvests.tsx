import { createSignal, onMount } from 'solid-js'
import { For, Show } from 'solid-js'
import { api, ApiError } from '../api/client'
import type { FlushHarvest, HarvestGrade, LabelDye, LabelSlip, Room } from '../types'

const grades: HarvestGrade[] = ['A', 'B', 'C']
const dyes: LabelDye[] = ['light', 'dark']

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function rawOf(err: unknown): string {
  if (err instanceof ApiError) return err.raw || err.message
  return err instanceof Error ? err.message : String(err)
}

const empty = {
  roomId: '',
  harvestedAt: toLocalInput(),
  flushNo: '1',
  weightKg: '',
  grade: 'A' as HarvestGrade,
  operatorName: '',
}

export default function FlushHarvests() {
  const [rows, setRows] = createSignal<FlushHarvest[]>([])
  const [rooms, setRooms] = createSignal<Room[]>([])
  const [slips, setSlips] = createSignal<LabelSlip[]>([])
  const [form, setForm] = createSignal({ ...empty })
  const [error, setError] = createSignal('')
  const [slipError, setSlipError] = createSignal('')
  const [slipForm, setSlipForm] = createSignal<{
    harvestId: number | null
    copies: string
    dye: LabelDye
  }>({ harvestId: null, copies: '1', dye: 'light' })
  const [voidForm, setVoidForm] = createSignal<{ slipId: number | null; reason: string }>({
    slipId: null,
    reason: '',
  })

  const openSlipFor = (harvestId: number) =>
    slips().find((s) => s.harvestId === harvestId && !s.voidedAt)
  const openSlipCount = () => slips().filter((s) => !s.voidedAt).length

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

  async function createSlip(e: Event) {
    e.preventDefault()
    setSlipError('')
    const f = slipForm()
    if (f.harvestId === null) return
    try {
      await api('/api/label-slips', {
        method: 'POST',
        body: JSON.stringify({
          harvestId: f.harvestId,
          copies: Number(f.copies),
          dye: f.dye,
        }),
      })
      setSlipForm({ harvestId: null, copies: '1', dye: 'light' })
      await load()
    } catch (err) {
      setSlipError(rawOf(err))
    }
  }

  async function voidSlip(e: Event) {
    e.preventDefault()
    setSlipError('')
    const f = voidForm()
    if (f.slipId === null) return
    try {
      await api(`/api/label-slips/${f.slipId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: f.reason }),
      })
      setVoidForm({ slipId: null, reason: '' })
      await load()
    } catch (err) {
      setSlipError(rawOf(err))
    }
  }

  return (
    <div>
      <header class="page-header">
        <h1>采收记录</h1>
        <p class="muted">
          潮次、等级与重量；weightKg 须 &gt; 0 · 未作废贴标单：{openSlipCount()} 张
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

      <Show when={slipError()}>
        <pre class="error slip-raw">{slipError()}</pre>
      </Show>

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
                const openSlip = () => openSlipFor(r.id)
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
                      <Show
                        when={openSlip()}
                        fallback={
                          <Show
                            when={slipForm().harvestId === r.id}
                            fallback={
                              <button
                                type="button"
                                class="btn ghost"
                                onClick={() =>
                                  setSlipForm({ harvestId: r.id, copies: '1', dye: 'light' })
                                }
                              >
                                开贴标单
                              </button>
                            }
                          >
                            <form class="slip-inline" onSubmit={createSlip}>
                              <input
                                type="number"
                                min="1"
                                max="4"
                                title="copies 1-4"
                                value={slipForm().copies}
                                onInput={(e) =>
                                  setSlipForm({ ...slipForm(), copies: e.currentTarget.value })
                                }
                                required
                              />
                              <select
                                value={slipForm().dye}
                                onChange={(e) =>
                                  setSlipForm({
                                    ...slipForm(),
                                    dye: e.currentTarget.value as LabelDye,
                                  })
                                }
                              >
                                <For each={dyes}>{(d) => <option value={d}>{d}</option>}</For>
                              </select>
                              <button type="submit" class="btn primary">
                                开单
                              </button>
                              <button
                                type="button"
                                class="btn ghost"
                                onClick={() =>
                                  setSlipForm({ harvestId: null, copies: '1', dye: 'light' })
                                }
                              >
                                取消
                              </button>
                            </form>
                          </Show>
                        }
                      >
                        {(slip) => (
                          <Show
                            when={voidForm().slipId === slip().id}
                            fallback={
                              <span class="slip-open">
                                <span class="badge">
                                  #{slip().id} · {slip().copies} 张 · {slip().dye}
                                </span>
                                <button
                                  type="button"
                                  class="btn ghost"
                                  onClick={() => setVoidForm({ slipId: slip().id, reason: '' })}
                                >
                                  作废
                                </button>
                              </span>
                            }
                          >
                            <form class="slip-inline" onSubmit={voidSlip}>
                              <input
                                placeholder="作废原因（必填）"
                                value={voidForm().reason}
                                onInput={(e) =>
                                  setVoidForm({ ...voidForm(), reason: e.currentTarget.value })
                                }
                                required
                              />
                              <button type="submit" class="btn primary">
                                确认作废
                              </button>
                              <button
                                type="button"
                                class="btn ghost"
                                onClick={() => setVoidForm({ slipId: null, reason: '' })}
                              >
                                取消
                              </button>
                            </form>
                          </Show>
                        )}
                      </Show>
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

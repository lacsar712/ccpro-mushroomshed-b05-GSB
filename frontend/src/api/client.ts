const TOKEN_KEY = 'ms_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...options, headers })
  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text }
  }

  if (!res.ok) {
    let message = `请求失败 (${res.status})`
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>
      if ('detail' in obj) {
        message = String(obj.detail)
        // 409 等响应还带 slipId / harvestId，把接口原文里的其余字段一并摆出
        const extra = Object.fromEntries(
          Object.entries(obj).filter(([k]) => k !== 'detail'),
        )
        if (Object.keys(extra).length > 0) {
          message += `\n响应原文: ${JSON.stringify(data)}`
        }
      } else if (text) {
        message = text
      }
    } else if (text) {
      message = text
    }
    throw new Error(message)
  }
  return data as T
}

export async function login(username: string, password: string) {
  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', password)
  return api<{
    access_token: string
    token_type: string
    user: {
      id: number
      username: string
      role: string
      displayName: string
    }
  }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

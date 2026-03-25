import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('sessions', () => {
  const sessions = ref([])
  const shells = ref([])
  const current = ref(null)
  let ws = null
  let reconnectTimer = null
  let reconnectDelay = 1000

  // Track last interaction time per session for sorting
  const lastActive = ref({})

  async function fetchSessions() {
    const res = await fetch('/api/sessions')
    const data = await res.json()
    // Sort by last active time (most recent first), then by creation time
    sessions.value = data.sessions.sort((a, b) => {
      const aTime = lastActive.value[a.name] || new Date(a.createdAt).getTime()
      const bTime = lastActive.value[b.name] || new Date(b.createdAt).getTime()
      return bTime - aTime
    })
  }

  async function fetchShells() {
    const res = await fetch('/api/sessions/shells')
    const data = await res.json()
    shells.value = data.shells
  }

  async function createSession(name, shell) {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, shell })
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    const session = await res.json()
    current.value = session.name
    lastActive.value[session.name] = Date.now()
    await fetchSessions()
  }

  async function stopSession(name) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(name)}/stop`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    await fetchSessions()
  }

  async function restartSession(name) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(name)}/restart`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    lastActive.value[name] = Date.now()
    await fetchSessions()
  }

  async function removeSession(name) {
    // Find the next session to select before deleting
    let nextSession = null
    if (current.value === name) {
      const idx = sessions.value.findIndex(s => s.name === name)
      if (idx >= 0) {
        // Prefer next, then previous
        if (idx + 1 < sessions.value.length) {
          nextSession = sessions.value[idx + 1].name
        } else if (idx - 1 >= 0) {
          nextSession = sessions.value[idx - 1].name
        }
      }
    }

    const res = await fetch(`/api/sessions/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    current.value = nextSession
    await fetchSessions()
  }

  function select(name) {
    current.value = name
    lastActive.value[name] = Date.now()
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)

    ws.onmessage = () => {
      fetchSessions()
    }

    ws.onopen = () => {
      reconnectDelay = 1000
    }

    ws.onclose = () => {
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectWs()
      reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    }, reconnectDelay)
  }

  function init() {
    fetchSessions()
    fetchShells()
    connectWs()
  }

  async function create({ command, name }) {
    return createSession(name || null, command || null)
  }

  return {
    sessions,
    shells,
    current,
    init,
    fetchSessions,
    createSession,
    create,
    stopSession,
    restartSession,
    removeSession,
    select
  }
})

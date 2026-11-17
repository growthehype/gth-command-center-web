// The Command Center as a Claude connector (MCP, Streamable HTTP, stateless).
// Add https://app.growthehype.ca/api/mcp in Claude under Settings > Connectors.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { origin, userForAccessToken } from './agent/_lib/oauth-store'
import { TOOLS, callTool, ToolError, SERVER_INSTRUCTIONS } from './agent/_lib/crm-tools'

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version')
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const base = origin(req)
  const auth = String(req.headers.authorization || '')
  const userId = auth.startsWith('Bearer ') ? await userForAccessToken(auth.slice(7).trim()) : null
  if (!userId) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="crm"`)
    return res.status(401).json({ error: 'unauthorized', error_description: 'Connect Claude to the Command Center first.' })
  }
  if (req.method === 'GET') return res.status(405).setHeader('Allow', 'POST').json({ error: 'Use POST' })
  if (req.method === 'DELETE') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  let payload: any = req.body
  if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch { return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) } }
  const batch = Array.isArray(payload)
  const msgs = batch ? payload : [payload]

  const out: any[] = []
  for (const m of msgs) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { out.push({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } }); continue }
    if (m.id === undefined || m.id === null) continue // notification: no reply
    try {
      out.push({ jsonrpc: '2.0', id: m.id, result: await handle(userId, m.method, m.params || {}) })
    } catch (e: any) {
      out.push({ jsonrpc: '2.0', id: m.id, error: { code: e?.code || -32603, message: String(e?.message || e).slice(0, 500) } })
    }
  }
  if (!out.length) return res.status(202).end()
  res.setHeader('Content-Type', 'application/json')
  return res.status(200).send(JSON.stringify(batch ? out : out[0]))
}

async function handle(userId: string, method: string, params: any) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'command-center', title: 'Command Center', version: '1.0.0' },
        instructions: SERVER_INSTRUCTIONS,
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call': {
      const name = String(params.name || '')
      try {
        const result = await callTool(userId, name, params.arguments || {})
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] }
      } catch (e: any) {
        // Tool problems go back to Claude as readable errors it can act on
        const msg = e instanceof ToolError ? e.message : `Something went wrong: ${String(e?.message || e).slice(0, 300)}`
        return { content: [{ type: 'text', text: msg }], isError: true }
      }
    }
    case 'resources/list': return { resources: [] }
    case 'prompts/list': return { prompts: [] }
    default: {
      const err: any = new Error(`Method not found: ${method}`); err.code = -32601; throw err
    }
  }
}

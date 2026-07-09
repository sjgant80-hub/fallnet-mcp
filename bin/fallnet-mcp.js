#!/usr/bin/env node
/*!
 * @ai-native-solutions/fallnet-mcp v1.0.0
 * MCP server exposing fallnet P2P mesh over stdio.
 * MIT · AI Native Solutions
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import fallnet from '@ai-native-solutions/fallnet-sdk';

// Node needs a WebRTC polyfill for real datachannel work. We soft-load;
// tools still document the flow even if the polyfill is missing.
let hasWRTC = false;
try {
  const wrtc = await import('wrtc').catch(() => import('node-datachannel/polyfill').catch(() => null));
  if (wrtc) {
    const RTC = wrtc.default?.RTCPeerConnection || wrtc.RTCPeerConnection;
    if (RTC) { fallnet.configure({ RTCPeerConnection: RTC }); hasWRTC = true; }
  }
} catch { /* polyfill unavailable — offer/answer tools will return diagnostic */ }

// Track a message log so LLM can inspect what came in over the mesh
const RECV_LOG = [];
fallnet.onMessage(m => {
  RECV_LOG.push({ ts: Date.now(), msg: m });
  if (RECV_LOG.length > 200) RECV_LOG.shift();
});

const server = new Server(
  { name: 'fallnet-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// ─── Tools ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'fallnet_create_offer',
    description: 'Peer A: create a WebRTC offer blob. Hand the base64 blob to Peer B via any channel (chat, email, paper QR). Returns { peerId, sdp }.',
    inputSchema: {
      type: 'object',
      properties: {
        seedName: { type: 'string', description: 'Human-readable name for this node' }
      }
    }
  },
  {
    name: 'fallnet_accept_offer',
    description: 'Peer B: accept Peer A\'s offer blob and produce an answer blob. Send the answer back to Peer A.',
    inputSchema: {
      type: 'object',
      properties: {
        offer: { type: 'string', description: 'Base64 offer blob from Peer A' },
        seedName: { type: 'string' }
      },
      required: ['offer']
    }
  },
  {
    name: 'fallnet_complete_offer',
    description: 'Peer A: finalize the handshake with Peer B\'s answer blob. Datachannel opens after this.',
    inputSchema: {
      type: 'object',
      properties: {
        peerId: { type: 'string', description: 'peerId returned from fallnet_create_offer' },
        answer: { type: 'string', description: 'Base64 answer blob from Peer B' }
      },
      required: ['peerId', 'answer']
    }
  },
  {
    name: 'fallnet_send',
    description: 'Send a message to a connected peer over the datachannel.',
    inputSchema: {
      type: 'object',
      properties: {
        peerId: { type: 'string' },
        message: { type: 'string', description: 'String or JSON-stringified payload' }
      },
      required: ['peerId', 'message']
    }
  },
  {
    name: 'fallnet_list_peers',
    description: 'List all connected/connecting peers with their state.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'fallnet_inbox',
    description: 'Read the recent inbox of messages received across all peers (up to 200 most recent).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 20)' }
      }
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case 'fallnet_create_offer': {
        if (!hasWRTC) return diag('WebRTC polyfill not installed. Install `wrtc` or `node-datachannel` to use offer/answer flow from Node.');
        const r = await fallnet.createOffer({ seedName: args.seedName || 'mcp-node' });
        return ok({ peerId: r.peerId, sdp: r.sdp });
      }
      case 'fallnet_accept_offer': {
        if (!hasWRTC) return diag('WebRTC polyfill not installed.');
        const r = await fallnet.acceptOffer(args.offer, { seedName: args.seedName || 'mcp-node' });
        return ok({ peerId: r.peerId, sdp: r.sdp });
      }
      case 'fallnet_complete_offer': {
        if (!hasWRTC) return diag('WebRTC polyfill not installed.');
        const r = await fallnet.completeOffer(args.peerId, args.answer);
        return ok({ peerId: r.peerId, status: 'handshake complete' });
      }
      case 'fallnet_send': {
        const sent = fallnet.send(args.peerId, args.message);
        return ok({ sent, peerId: args.peerId });
      }
      case 'fallnet_list_peers': {
        return ok({ peers: fallnet.peers() });
      }
      case 'fallnet_inbox': {
        const lim = Math.max(1, Math.min(200, args.limit || 20));
        return ok({ inbox: RECV_LOG.slice(-lim) });
      }
      default:
        return err('unknown tool: ' + name);
    }
  } catch (e) {
    return err(e.message || String(e));
  }
});

// ─── Resources ─────────────────────────────────────────────────────
const RESOURCES = [
  {
    uri: 'fallnet://info',
    name: 'fallnet info',
    description: 'SDK version, mesh channel, STUN servers, runtime status',
    mimeType: 'application/json'
  },
  {
    uri: 'fallnet://inbox',
    name: 'fallnet inbox',
    description: 'Recent messages received from peers',
    mimeType: 'application/json'
  }
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  if (uri === 'fallnet://info') {
    return {
      contents: [{
        uri, mimeType: 'application/json',
        text: JSON.stringify({
          sdk: fallnet.VERSION,
          channel: fallnet.CHANNEL,
          stun: fallnet.STUN,
          webrtc_polyfill_loaded: hasWRTC,
          peers: fallnet.peers().length
        }, null, 2)
      }]
    };
  }
  if (uri === 'fallnet://inbox') {
    return {
      contents: [{
        uri, mimeType: 'application/json',
        text: JSON.stringify({ inbox: RECV_LOG.slice(-50) }, null, 2)
      }]
    };
  }
  throw new Error('unknown resource: ' + uri);
});

// ─── Helpers ───────────────────────────────────────────────────────
function ok(obj)  { return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] }; }
function err(msg) { return { content: [{ type: 'text', text: JSON.stringify({ error: msg }) }], isError: true }; }
function diag(msg){ return { content: [{ type: 'text', text: JSON.stringify({ diagnostic: msg }) }] }; }

// ─── Boot ──────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('fallnet-mcp v1.0.0 ready · webrtc=' + hasWRTC);

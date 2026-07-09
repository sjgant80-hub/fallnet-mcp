# @ai-native-solutions/fallnet-mcp

**MCP server for fallnet.** Exposes a sovereign peer-to-peer mesh (WebRTC + BroadcastChannel) to any MCP client over stdio.

## Install

```bash
npm install -g @ai-native-solutions/fallnet-mcp
# optional Node WebRTC polyfill for offer/answer flow:
npm install -g wrtc
```

## Register with Claude Code

```bash
claude mcp add fallnet npx @ai-native-solutions/fallnet-mcp
```

Or add to `.mcp.json` / `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fallnet": {
      "command": "npx",
      "args": ["-y", "@ai-native-solutions/fallnet-mcp"]
    }
  }
}
```

## Tools

| Tool | Purpose |
|---|---|
| `fallnet_create_offer` | Peer A creates a WebRTC offer blob |
| `fallnet_accept_offer` | Peer B accepts an offer and returns an answer blob |
| `fallnet_complete_offer` | Peer A completes the handshake |
| `fallnet_send` | Send a message to a connected peer |
| `fallnet_list_peers` | List all peers with their state |
| `fallnet_inbox` | Read recent messages received across peers |

## Resources

- `fallnet://info` — SDK version, mesh channel, STUN servers, runtime status
- `fallnet://inbox` — most recent 50 messages received from peers

## Note on Node WebRTC

Node has no native WebRTC. Install `wrtc` or `node-datachannel` to enable the offer/answer tools. Without the polyfill, the tools return a diagnostic message. `fallnet_list_peers` and `fallnet_inbox` work either way.

## License

MIT · part of [AI Native Solutions](https://ai-nativesolutions.com)

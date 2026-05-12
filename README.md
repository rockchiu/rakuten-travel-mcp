# rakuten-travel-mcp

MCP server for Rakuten Travel hotel search, built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk).

Supports both **stdio** and **HTTP Streaming** transports.

## Tools

| Tool | Description |
|------|-------------|
| `search_vacant_hotels` | Search hotels with available rooms by date, location, and price range |
| `search_hotels` | Search hotels by location or keyword (no availability filter) |
| `get_area_class` | Fetch Japan area classification codes for region-based filtering |
| `get_hotel_detail` | Get detailed hotel info (facilities, policies, etc.) by hotel number |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

Copy `.env.example` to `.env` and fill in your [Rakuten API](https://webservice.rakuten.co.jp/) credentials:

```bash
cp .env.example .env
```

```env
RAKUTEN_APP_ID=your_app_id_here
RAKUTEN_ACCESS_KEY=your_access_key_here
RAKUTEN_AFFILIATE_ID=your_affiliate_id_here
```

### 3. Build

```bash
npm run build
```

## Transports

### stdio (default)

Used when running as a local MCP process. Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rakuten-travel": {
      "command": "node",
      "args": ["/path/to/rakuten-travel-mcp/dist/index.js"],
      "env": {
        "RAKUTEN_APP_ID": "your_app_id_here",
        "RAKUTEN_ACCESS_KEY": "your_access_key_here",
        "RAKUTEN_AFFILIATE_ID": "your_affiliate_id_here"
      }
    }
  }
}
```

### HTTP Streaming

Set `MCP_TRANSPORT=http` to start an HTTP server instead. The server listens on `/mcp` and implements the [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).

```bash
MCP_TRANSPORT=http PORT=3000 node dist/index.js
```

| Env var | Default | Description |
|---------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | `3000` | HTTP port (only used when `MCP_TRANSPORT=http`) |

Add to your MCP client config:

```json
{
  "mcpServers": {
    "rakuten-travel": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Prompt Examples

**依地區搜尋空房：**
> 幫我找 2026 年 7 月 18 日入住、7 月 20 日退房，2 名大人在北海道的可訂飯店。

**依座標搜尋：**
> 搜尋 2026 年 8 月 10 日、新千歲機場（緯度 42.7752、經度 141.6922）1 公里內有空房的飯店。

**依關鍵字搜尋飯店：**
> 搜尋名稱包含「溫泉」的飯店，只看設施名稱，依價格由低到高排列。

**依預算篩選：**
> 找 2026 年 9 月 5 日入住東京、每晚 15,000 日圓以下、1 名大人的飯店。

**依價格排序：**
> 搜尋 2026 年 10 月 1 日起、大阪 2 晚的飯店，從最便宜的開始排列。

**先查地區代碼再搜尋：**
> 京都的地區代碼是什麼？然後幫我找 2026 年 11 月 3 日、2 名大人可入住的飯店。

**搜尋後查詢飯店詳情：**
> 搜尋新宿站附近的飯店，再顯示前 3 間的詳細設施與服務資訊。

## Development

```bash
npm run dev                          # stdio mode (no build step)
MCP_TRANSPORT=http npm run dev       # HTTP streaming mode
npm run build                        # compile TypeScript to dist/
```

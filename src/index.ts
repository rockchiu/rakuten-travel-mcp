import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosError } from "axios";

const APP_ID = process.env.RAKUTEN_APP_ID ?? "";
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY ?? "";
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID ?? "";
const BASE_URL = "https://openapi.rakuten.co.jp/engine/api/Travel";

const server = new Server(
  { name: "rakuten-travel-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_vacant_hotels",
      description:
        "搜尋有空房的飯店，回傳房型、空房狀態與價格。支援以地區代碼或經緯度搜尋。" +
        "例如：尋找2026年7月18日北海道千歲機場附近的酒店",
      inputSchema: {
        type: "object",
        properties: {
          checkinDate: {
            type: "string",
            description: "入住日期，格式：YYYY-MM-DD",
          },
          checkoutDate: {
            type: "string",
            description: "退房日期，格式：YYYY-MM-DD（預設為入住日期+1天）",
          },
          latitude: {
            type: "number",
            description: "緯度（WGS84 十進位度數），與 longitude 一起使用",
          },
          longitude: {
            type: "number",
            description: "經度（WGS84 十進位度數），與 latitude 一起使用",
          },
          searchRadius: {
            type: "number",
            description: "搜尋半徑（公里，0.1-3.0），預設：3.0",
          },
          largeClassCode: {
            type: "string",
            description: "大區域代碼，例如 'japan'",
          },
          middleClassCode: {
            type: "string",
            description: "中區域代碼（都道府縣），例如 'hokkaido'、'tokyo'",
          },
          smallClassCode: {
            type: "string",
            description: "小區域代碼（市區町村）",
          },
          detailClassCode: {
            type: "string",
            description: "詳細區域代碼（車站周邊等）",
          },
          adultNum: {
            type: "integer",
            description: "成人人數（1-10），預設：1",
          },
          roomNum: {
            type: "integer",
            description: "房間數（1-10），預設：1",
          },
          minCharge: {
            type: "integer",
            description: "每晚最低價格（日圓）",
          },
          maxCharge: {
            type: "integer",
            description: "每晚最高價格（日圓）",
          },
          hits: {
            type: "integer",
            description: "每頁結果數（1-30），預設：30",
          },
          sort: {
            type: "string",
            enum: ["standard", "+roomCharge", "-roomCharge"],
            description: "排序方式：standard（預設）、+roomCharge（價格低到高）、-roomCharge（價格高到低）",
          },
        },
        required: ["checkinDate"],
      },
    },
    {
      name: "search_hotels",
      description:
        "依關鍵字或地點搜尋飯店基本資訊（不含空房過濾）。可用地區代碼或經緯度搜尋。" +
        "適合用來取得飯店編號再進行空房查詢。",
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "關鍵字搜尋（最少2個字元，空格分隔為AND搜尋）",
          },
          searchField: {
            type: "integer",
            enum: [0, 1],
            description: "搜尋範圍：0=設施/計畫/房型名稱（預設）、1=僅設施名稱",
          },
          latitude: {
            type: "number",
            description: "緯度（WGS84 十進位度數）",
          },
          longitude: {
            type: "number",
            description: "經度（WGS84 十進位度數）",
          },
          searchRadius: {
            type: "number",
            description: "搜尋半徑（公里，0.1-3.0），預設：3.0",
          },
          largeClassCode: {
            type: "string",
            description: "大區域代碼，例如 'japan'",
          },
          middleClassCode: {
            type: "string",
            description: "中區域代碼（都道府縣），例如 'hokkaido'",
          },
          smallClassCode: {
            type: "string",
            description: "小區域代碼",
          },
          detailClassCode: {
            type: "string",
            description: "詳細區域代碼",
          },
          hotelChainCode: {
            type: "string",
            description: "飯店連鎖代碼（最多5個，逗號分隔）",
          },
          responseType: {
            type: "string",
            enum: ["small", "middle", "large"],
            description: "回傳資訊詳細程度：small、middle（預設）、large",
          },
          sort: {
            type: "string",
            enum: ["standard", "+roomCharge", "-roomCharge"],
            description: "排序：standard（預設）、+roomCharge（價格低到高）、-roomCharge（價格高到低）",
          },
          hits: {
            type: "integer",
            description: "每頁結果數（1-30），預設：30",
          },
          page: {
            type: "integer",
            description: "頁碼（1-100），預設：1",
          },
        },
      },
    },
    {
      name: "get_area_class",
      description:
        "取得日本地區分類代碼（都道府縣、市區町村等），用於飯店搜尋的地區篩選。",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_hotel_detail",
      description: "依飯店編號取得飯店詳細資訊（設施、服務、政策等）。",
      inputSchema: {
        type: "object",
        properties: {
          hotelNo: {
            type: "array",
            items: { type: "integer" },
            description: "飯店編號列表（最多15個）",
          },
        },
        required: ["hotelNo"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const safeArgs = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "search_vacant_hotels":
        return await searchVacantHotels(safeArgs);
      case "search_hotels":
        return await searchHotels(safeArgs);
      case "get_area_class":
        return await getAreaClass();
      case "get_hotel_detail":
        return await getHotelDetail(safeArgs);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message =
      err instanceof AxiosError
        ? `API Error ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
        : err instanceof Error
        ? err.message
        : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── helpers ────────────────────────────────────────────────────────────────

function baseParams(extra: Record<string, unknown> = {}) {
  return {
    applicationId: APP_ID,
    accessKey: ACCESS_KEY,
    affiliateId: AFFILIATE_ID,
    format: "json",
    formatVersion: 2,
    ...extra,
  };
}

function applyLocation(
  params: Record<string, unknown>,
  args: Record<string, unknown>
) {
  if (args.latitude != null && args.longitude != null) {
    params.latitude = args.latitude;
    params.longitude = args.longitude;
    params.datumType = 1; // WGS84 decimal degrees
    params.searchRadius = args.searchRadius ?? 3.0;
  } else {
    if (args.largeClassCode) params.largeClassCode = args.largeClassCode;
    if (args.middleClassCode) params.middleClassCode = args.middleClassCode;
    if (args.smallClassCode) params.smallClassCode = args.smallClassCode;
    if (args.detailClassCode) params.detailClassCode = args.detailClassCode;
  }
}

async function get(endpoint: string, params: Record<string, unknown>) {
  const response = await axios.get(`${BASE_URL}/${endpoint}`, { params });
  return response.data;
}

// ── tool implementations ───────────────────────────────────────────────────

async function searchVacantHotels(args: Record<string, unknown>) {
  const checkinDate = args.checkinDate as string;

  // Default checkout = checkin + 1 day
  let checkoutDate = args.checkoutDate as string | undefined;
  if (!checkoutDate) {
    const d = new Date(checkinDate);
    d.setDate(d.getDate() + 1);
    checkoutDate = d.toISOString().slice(0, 10);
  }

  const params: Record<string, unknown> = baseParams({
    checkinDate,
    checkoutDate,
    adultNum: args.adultNum ?? 1,
    roomNum: args.roomNum ?? 1,
    responseType: "large",
    hits: args.hits ?? 30,
  });

  applyLocation(params, args);
  if (args.minCharge != null) params.minCharge = args.minCharge;
  if (args.maxCharge != null) params.maxCharge = args.maxCharge;
  if (args.sort) params.sort = args.sort;

  const data = await get("VacantHotelSearch/20170426", params);

  const pagingInfo = data.pagingInfo ?? {};
  const hotels: HotelEntry[] = (data.hotels ?? []).map(formatHotelEntry);

  const summary = {
    checkinDate,
    checkoutDate,
    totalResults: pagingInfo.recordCount ?? 0,
    page: pagingInfo.page ?? 1,
    hotels,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
  };
}

interface RoomPlan {
  roomClass: string;
  roomName: string;
  planName: string;
  withBreakfast: boolean;
  withDinner: boolean;
  chargePerPerson: number | null;
  chargePerRoom: number | null;
  totalCharge: number | null;
  chargeUnit: string;
  reserveUrl: string;
}

interface HotelEntry {
  hotelNo: number;
  hotelName: string;
  address: string;
  nearestStation: string;
  minCharge: number;
  reviewAverage: number;
  reviewCount: number;
  planListUrl: string;
  roomPlans: RoomPlan[];
}

function formatHotelEntry(hotelWrapper: unknown): HotelEntry {
  // formatVersion=2 may return each hotel as a direct array or as {hotel: [...]}
  let hotelArr: unknown[];
  if (Array.isArray(hotelWrapper)) {
    hotelArr = hotelWrapper;
  } else {
    hotelArr = ((hotelWrapper as Record<string, unknown>).hotel as unknown[]) ?? [];
  }

  const basicInfo =
    ((hotelArr[0] as Record<string, unknown>)?.hotelBasicInfo as Record<
      string,
      unknown
    >) ?? {};
  const ratingInfo =
    ((hotelArr[1] as Record<string, unknown>)?.hotelRatingInfo as Record<
      string,
      unknown
    >) ?? {};

  // Plans start from index 2
  const roomPlans: RoomPlan[] = [];
  for (let i = 2; i < hotelArr.length; i++) {
    const roomWrapper = hotelArr[i] as Record<string, unknown>;
    const roomInfoArr = (roomWrapper.roomInfo as unknown[]) ?? [];
    const roomBasic =
      ((roomInfoArr[0] as Record<string, unknown>)?.roomBasicInfo as Record<
        string,
        unknown
      >) ?? {};
    const dailyCharge =
      ((roomInfoArr[1] as Record<string, unknown>)?.dailyCharge as Record<
        string,
        unknown
      >) ?? {};

    const chargeFlag = dailyCharge.chargeFlag as number | undefined;
    roomPlans.push({
      roomClass: String(roomBasic.roomClass ?? ""),
      roomName: String(roomBasic.roomName ?? ""),
      planName: String(roomBasic.planName ?? ""),
      withBreakfast: roomBasic.withBreakfastFlag === 1,
      withDinner: roomBasic.withDinnerFlag === 1,
      chargePerPerson: chargeFlag === 0 ? (dailyCharge.rakutenCharge as number) : null,
      chargePerRoom: chargeFlag === 1 ? (dailyCharge.rakutenCharge as number) : null,
      totalCharge: (dailyCharge.total as number) ?? null,
      chargeUnit: chargeFlag === 0 ? "per person" : "per room",
      reserveUrl: String(roomBasic.reserveUrl ?? ""),
    });
  }

  return {
    hotelNo: basicInfo.hotelNo as number,
    hotelName: String(basicInfo.hotelName ?? ""),
    address: `${basicInfo.address1 ?? ""}${basicInfo.address2 ?? ""}`,
    nearestStation: String(basicInfo.nearestStation ?? ""),
    minCharge: basicInfo.hotelMinCharge as number,
    reviewAverage: ratingInfo.serviceAverage as number,
    reviewCount: basicInfo.reviewCount as number,
    planListUrl: String(basicInfo.planListUrl ?? ""),
    roomPlans,
  };
}

async function searchHotels(args: Record<string, unknown>) {
  const params: Record<string, unknown> = baseParams({
    responseType: args.responseType ?? "middle",
    hits: args.hits ?? 30,
    page: args.page ?? 1,
  });

  applyLocation(params, args);
  if (args.keyword) params.keyword = args.keyword;
  if (args.searchField != null) params.searchField = args.searchField;
  if (args.hotelChainCode) params.hotelChainCode = args.hotelChainCode;
  if (args.sort) params.sort = args.sort;

  const data = await get("KeywordHotelSearch/20170426", params);

  const pagingInfo = data.pagingInfo ?? {};
  const hotels = (data.hotels ?? []).map((hotelWrapper: unknown) => {
    let hotelArr: unknown[];
    if (Array.isArray(hotelWrapper)) {
      hotelArr = hotelWrapper;
    } else {
      hotelArr = ((hotelWrapper as Record<string, unknown>).hotel as unknown[]) ?? [];
    }
    const basicInfo =
      ((hotelArr[0] as Record<string, unknown>)?.hotelBasicInfo as Record<string, unknown>) ?? {};
    const ratingInfo =
      ((hotelArr[1] as Record<string, unknown>)?.hotelRatingInfo as Record<string, unknown>) ?? {};
    return {
      hotelNo: basicInfo.hotelNo,
      hotelName: basicInfo.hotelName,
      address: `${basicInfo.address1 ?? ""}${basicInfo.address2 ?? ""}`,
      nearestStation: basicInfo.nearestStation,
      minCharge: basicInfo.hotelMinCharge,
      reviewAverage: ratingInfo.serviceAverage,
      reviewCount: basicInfo.reviewCount,
      planListUrl: basicInfo.planListUrl,
    };
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            totalResults: pagingInfo.recordCount ?? 0,
            page: pagingInfo.page ?? 1,
            pageCount: pagingInfo.pageCount ?? 1,
            hotels,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function getAreaClass() {
  const data = await get("GetAreaClass/20140210", baseParams());
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

async function getHotelDetail(args: Record<string, unknown>) {
  const hotelNos = (args.hotelNo as number[]).slice(0, 15).join(",");
  const params = baseParams({ hotelNo: hotelNos, responseType: "large" });
  const data = await get("HotelDetailSearch/20170426", params);
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// ── entry point ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Rakuten Travel MCP Server running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});

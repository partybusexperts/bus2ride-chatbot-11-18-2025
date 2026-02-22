import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokensAsync } from "@/lib/ringcentral-tokens";

export async function GET(request: NextRequest) {
  const tokens = await getStoredTokensAsync();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  // Extension-level call log — return FULL raw record (no stripping)
  const extUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/extension/~/call-log`);
  extUrl.searchParams.set("direction", "Inbound");
  extUrl.searchParams.set("perPage", "1");
  extUrl.searchParams.set("view", "Detailed");
  extUrl.searchParams.set("dateFrom", twoHoursAgo.toISOString());

  // Account-level call log
  const acctUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/call-log`);
  acctUrl.searchParams.set("direction", "Inbound");
  acctUrl.searchParams.set("perPage", "3");
  acctUrl.searchParams.set("view", "Detailed");
  acctUrl.searchParams.set("dateFrom", twoHoursAgo.toISOString());

  // List of phone numbers on the account
  const phoneNumUrl = `${baseUrl}/restapi/v1.0/account/~/phone-number?perPage=100`;

  // List extensions on the account
  const extListUrl = `${baseUrl}/restapi/v1.0/account/~/extension?perPage=100`;

  // Try to get a telephony session for the most recent call
  const extRes = await fetch(extUrl.toString(), { headers }).catch(() => null);
  const extData = extRes?.ok ? await extRes.json() : null;
  const latestCall = extData?.records?.[0];

  let sessionData: any = null;
  if (latestCall?.sessionId) {
    const sessionUrl = `${baseUrl}/restapi/v1.0/account/~/telephony/sessions/${latestCall.sessionId}`;
    const sessionRes = await fetch(sessionUrl, { headers }).catch(() => null);
    sessionData = sessionRes?.ok
      ? await sessionRes.json()
      : { error: sessionRes ? `${sessionRes.status} ${await sessionRes.text().catch(() => "")}` : "failed" };
  }

  const [acctRes, phoneRes, extListRes] = await Promise.all([
    fetch(acctUrl.toString(), { headers }).catch(() => null),
    fetch(phoneNumUrl, { headers }).catch(() => null),
    fetch(extListUrl, { headers }).catch(() => null),
  ]);

  const acctData = acctRes?.ok ? await acctRes.json() : { error: acctRes ? `${acctRes.status}` : "failed" };
  const phoneData = phoneRes?.ok ? await phoneRes.json() : { error: phoneRes ? `${phoneRes.status}` : "failed" };
  const extListData = extListRes?.ok ? await extListRes.json() : { error: extListRes ? `${extListRes.status}` : "failed" };

  return NextResponse.json({
    latestCallFullRaw: latestCall || null,
    telephonySession: sessionData,
    accountLevelCalls: acctData.records || acctData,
    accountPhoneNumbers: phoneData.records
      ? phoneData.records.map((p: any) => ({ phoneNumber: p.phoneNumber, usageType: p.usageType, label: p.label, extension: p.extension }))
      : phoneData,
    accountExtensions: extListData.records
      ? extListData.records.map((e: any) => ({ id: e.id, name: e.name, extensionNumber: e.extensionNumber, type: e.type, status: e.status }))
      : extListData,
  });
}

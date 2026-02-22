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

  // Try ACCOUNT-level call log (might show original DIDs)
  const acctUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/call-log`);
  acctUrl.searchParams.set("direction", "Inbound");
  acctUrl.searchParams.set("perPage", "3");
  acctUrl.searchParams.set("view", "Detailed");
  acctUrl.searchParams.set("dateFrom", twoHoursAgo.toISOString());

  // Try extension-level call log for comparison
  const extUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/extension/~/call-log`);
  extUrl.searchParams.set("direction", "Inbound");
  extUrl.searchParams.set("perPage", "3");
  extUrl.searchParams.set("view", "Detailed");
  extUrl.searchParams.set("dateFrom", twoHoursAgo.toISOString());

  // Also get the list of phone numbers on the account
  const phoneNumUrl = `${baseUrl}/restapi/v1.0/account/~/phone-number?perPage=100`;

  const [acctRes, extRes, phoneRes] = await Promise.all([
    fetch(acctUrl.toString(), { headers }).catch(() => null),
    fetch(extUrl.toString(), { headers }).catch(() => null),
    fetch(phoneNumUrl, { headers }).catch(() => null),
  ]);

  const strip = (r: any) => ({
    id: r.id, direction: r.direction, result: r.result,
    from: r.from, to: r.to, startTime: r.startTime,
    legs: r.legs?.map((l: any) => ({ direction: l.direction, legType: l.legType, from: l.from, to: l.to })),
  });

  const acctData = acctRes?.ok ? await acctRes.json() : { error: acctRes ? `${acctRes.status}` : "failed" };
  const extData = extRes?.ok ? await extRes.json() : { error: extRes ? `${extRes.status}` : "failed" };
  const phoneData = phoneRes?.ok ? await phoneRes.json() : { error: phoneRes ? `${phoneRes.status}` : "failed" };

  return NextResponse.json({
    accountLevelCalls: acctData.records ? acctData.records.map(strip) : acctData,
    extensionLevelCalls: extData.records ? extData.records.map(strip) : extData,
    accountPhoneNumbers: phoneData.records
      ? phoneData.records.map((p: any) => ({ phoneNumber: p.phoneNumber, usageType: p.usageType, label: p.label }))
      : phoneData,
  });
}

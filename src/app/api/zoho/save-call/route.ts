import { NextRequest, NextResponse } from "next/server";
import { getZohoAccessToken } from "../auth/route";

interface SaveCallRequest {
  mode: "create" | "update";
  leadId?: string;
  data: {
    callerName?: string;
    phone?: string;
    email?: string;
    cityOrZip?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    date?: string;
    pickupTime?: string;
    passengers?: string;
    hours?: string;
    eventType?: string;
    tripNotes?: string;
    quotedVehicles?: Array<{ name: string; price: number }>;
    totalQuoted?: number;
    deposit?: number;
    balance?: number;
    leadStatus?: string;
    agent?: string;
  };
}

function buildZohoLeadData(data: SaveCallRequest["data"]) {
  const nameParts = (data.callerName || "Unknown").trim().split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "Lead";

  const quotedSummary = data.quotedVehicles?.length
    ? data.quotedVehicles.map((v) => `${v.name}: $${v.price}`).join("\n")
    : "";

  const description = [
    data.tripNotes || "",
    quotedSummary ? `\n--- Quoted Vehicles ---\n${quotedSummary}` : "",
    data.totalQuoted ? `\nTotal: $${data.totalQuoted}` : "",
    data.deposit ? `\nDeposit: $${data.deposit}` : "",
    data.balance ? `\nBalance: $${data.balance}` : "",
    data.agent ? `\nAgent: ${data.agent}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    First_Name: firstName,
    Last_Name: lastName,
    Email: data.email || undefined,
    Phone: data.phone || undefined,
    City: data.cityOrZip || undefined,
    Street: data.pickupAddress || undefined,
    Description: description || undefined,
    Lead_Status: mapLeadStatus(data.leadStatus),
  };
}

function mapLeadStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    new: "New",
    not_quoted: "Not Quoted",
    quoted: "Quoted",
    booked: "Booked",
    closed: "Closed",
    cancelled: "Cancelled",
  };
  return statusMap[status || "new"] || "New";
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveCallRequest = await request.json();
    const { mode, leadId, data } = body;

    if (!data) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    const accessToken = await getZohoAccessToken();
    const leadData = buildZohoLeadData(data);

    const filteredLeadData = Object.fromEntries(
      Object.entries(leadData).filter(([, v]) => v !== undefined && v !== "")
    );

    if (mode === "update" && leadId) {
      const response = await fetch(
        `https://www.zohoapis.com/crm/v2/Leads/${leadId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: [filteredLeadData] }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Zoho update failed:", errorText);
        return NextResponse.json(
          { error: `Failed to update lead: ${response.status}` },
          { status: 500 }
        );
      }

      const result = await response.json();
      return NextResponse.json({
        success: true,
        mode: "updated",
        leadId,
        result: result.data?.[0],
      });
    } else {
      const response = await fetch("https://www.zohoapis.com/crm/v2/Leads", {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [filteredLeadData] }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Zoho create failed:", errorText);
        return NextResponse.json(
          { error: `Failed to create lead: ${response.status}` },
          { status: 500 }
        );
      }

      const result = await response.json();
      const newLeadId = result.data?.[0]?.details?.id;

      return NextResponse.json({
        success: true,
        mode: "created",
        leadId: newLeadId,
        result: result.data?.[0],
      });
    }
  } catch (error) {
    console.error("Zoho save-call error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save lead" },
      { status: 500 }
    );
  }
}

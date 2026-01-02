import { NextRequest, NextResponse } from "next/server";
import { getZohoAccessToken } from "../auth/route";

interface SaveCallRequest {
  mode: "create" | "update";
  leadId?: string;
  fieldsToUpdate?: string[];
  data: {
    callerName?: string;
    phone?: string;
    email?: string;
    cityOrZip?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    date?: string;
    day?: string;
    pickupTime?: string;
    dropoffTime?: string;
    passengers?: string;
    hours?: string;
    eventType?: string;
    tripNotes?: string;
    quotedVehicles?: Array<{ name: string; price: number; hours?: number }>;
    totalQuoted?: number;
    deposit?: number;
    balance?: number;
    leadStatus?: string;
    agent?: string;
    tipIncluded?: boolean;
    paidByCard?: boolean;
    paidByCash?: boolean;
  };
}

function getDayOfWeek(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()] || "";
  } catch {
    return "";
  }
}

function calculateDropOffTime(pickupTime?: string, hours?: string): string | undefined {
  if (!pickupTime || !hours) return undefined;
  
  try {
    // Parse pickup time like "5:00 PM" or "17:00"
    const timeMatch = pickupTime.match(/^(\d{1,2}):?(\d{2})?\s*([AP]M?)?$/i);
    if (!timeMatch) return undefined;
    
    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2] || '0', 10);
    const meridiem = timeMatch[3]?.toUpperCase();
    
    // Convert to 24-hour format
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    
    // Add hours
    const hoursNum = parseInt(hours, 10);
    if (isNaN(hoursNum)) return undefined;
    
    let dropHour = hour + hoursNum;
    const dropMinute = minute;
    
    // Handle day overflow
    while (dropHour >= 24) dropHour -= 24;
    
    // Format back
    const dropMeridiem = dropHour >= 12 ? 'PM' : 'AM';
    const displayHour = dropHour > 12 ? dropHour - 12 : (dropHour === 0 ? 12 : dropHour);
    
    return `${displayHour}:${dropMinute.toString().padStart(2, '0')} ${dropMeridiem}`;
  } catch {
    return undefined;
  }
}

function buildZohoLeadData(data: SaveCallRequest["data"], fieldsToUpdate?: string[]) {
  const nameParts = (data.callerName || "Unknown").trim().split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "Lead";

  const quotedVehiclesSummary = data.quotedVehicles?.length
    ? data.quotedVehicles.map((v) => `${v.name}: $${v.price}${v.hours ? ` (${v.hours}hr)` : ""}`).join("\n")
    : "";

  const cleanPhone = data.phone ? data.phone.replace(/\D/g, "").slice(-10) : undefined;

  const day = data.day || getDayOfWeek(data.date);
  
  // Parse hours as number for Amount_Of_Hours field
  const hoursNum = data.hours ? parseInt(data.hours, 10) : undefined;
  
  // Calculate drop off time from pickup time + hours
  const dropOffTime = calculateDropOffTime(data.pickupTime, data.hours);

  // Based on actual Zoho CRM API field names:
  const allFields: Record<string, unknown> = {
    // Standard Zoho fields
    First_Name: firstName,
    Last_Name: lastName,
    Email: data.email || undefined,
    Phone: cleanPhone || undefined,
    City: data.cityOrZip || undefined,
    
    // Custom fields with correct API names
    Pick_Up_Address: data.pickupAddress || undefined,
    Drop_Off_Address: data.dropoffAddress || undefined,
    Party_Sizes: data.passengers || undefined,
    Amount_Of_Hours: hoursNum || undefined,
    Event_Types: data.eventType || undefined,
    Date_Of_Events: data.date || undefined,
    Day_of_Week: day || undefined,
    Pick_Up_Time: data.pickupTime || undefined,
    Drop_Off_Time: dropOffTime || undefined,
    Where_Are_They_Going: data.tripNotes || undefined,
    Vehicles_Quoted_and_Pricing: quotedVehiclesSummary || undefined,
    Status: mapLeadStatus(data.leadStatus),
    Agent: data.agent ? [data.agent] : undefined,
    Tip_Included: data.tipIncluded ? "Yes" : undefined,
    Balance_Paid_Via: data.paidByCard ? "Card" : (data.paidByCash ? "Cash" : undefined),
  };

  if (fieldsToUpdate && fieldsToUpdate.length > 0) {
    const fieldMapping: Record<string, string> = {
      callerName: "First_Name",
      callerNameLast: "Last_Name",
      phone: "Phone",
      email: "Email",
      cityOrZip: "City",
      pickupAddress: "Pick_Up_Address",
      dropoffAddress: "Drop_Off_Address",
      passengers: "Party_Sizes",
      hours: "Amount_Of_Hours",
      eventType: "Event_Types",
      date: "Date_Of_Events",
      day: "Day_of_Week",
      pickupTime: "Pick_Up_Time",
      tripNotes: "Where_Are_They_Going",
      quotedVehicles: "Vehicles_Quoted_and_Pricing",
      leadStatus: "Status",
      agent: "Agent",
    };

    const filteredFields: Record<string, unknown> = {};
    for (const field of fieldsToUpdate) {
      const zohoField = fieldMapping[field];
      if (zohoField && allFields[zohoField] !== undefined) {
        filteredFields[zohoField] = allFields[zohoField];
        if (field === "callerName") {
          filteredFields["Last_Name"] = lastName;
        }
      }
    }
    return filteredFields;
  }

  return allFields;
}

function mapLeadStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    quoted: "Quoted",
    not_quoted: "Not Quoted",
    spam: "Spam",
    not_interested: "Not Interested",
    pending_closed: "Pending Closed",
    closed: "Closed",
    cancellation: "Cancellation",
  };
  return statusMap[status?.toLowerCase() || "quoted"] || "Quoted";
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveCallRequest = await request.json();
    const { mode, leadId, fieldsToUpdate, data } = body;

    if (!data) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    const accessToken = await getZohoAccessToken();
    const leadData = buildZohoLeadData(data, fieldsToUpdate);

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
        leadUrl: `https://crm.zoho.com/crm/tab/Leads/${leadId}`,
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
      console.log("Zoho create result:", JSON.stringify(result, null, 2));

      return NextResponse.json({
        success: true,
        mode: "created",
        leadId: newLeadId,
        leadUrl: newLeadId ? `https://crm.zoho.com/crm/tab/Leads/${newLeadId}` : null,
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

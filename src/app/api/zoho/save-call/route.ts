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
    vehicleType?: string;
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
    leadSource?: string;
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

function formatTo12Hour(time24?: string): string | undefined {
  if (!time24) return undefined;
  
  // Handle already 12-hour format
  if (/[ap]m/i.test(time24)) {
    const match = time24.match(/^(\d{1,2}):?(\d{2})?\s*([AP]M?)$/i);
    if (match) {
      const hour = parseInt(match[1], 10);
      const minute = match[2] || '00';
      const meridiem = match[3].toUpperCase().replace('M', '') + 'M';
      return `${hour}:${minute} ${meridiem}`;
    }
    return time24;
  }
  
  // Handle 24-hour format like "17:00"
  const match24 = time24.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    let hour = parseInt(match24[1], 10);
    const minute = match24[2];
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${meridiem}`;
  }
  
  return time24;
}

function calculateDropOffTime(pickupTime?: string, hours?: string): string | undefined {
  if (!pickupTime || !hours) return undefined;
  
  try {
    // Parse pickup time - handle both 24-hour (17:00) and 12-hour (5:00 PM) formats
    let hour: number;
    let minute: number;
    
    // Try 24-hour format first (from HTML input)
    const match24 = pickupTime.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      hour = parseInt(match24[1], 10);
      minute = parseInt(match24[2], 10);
    } else {
      // Try 12-hour format
      const match12 = pickupTime.match(/^(\d{1,2}):?(\d{2})?\s*([AP]M?)$/i);
      if (!match12) return undefined;
      
      hour = parseInt(match12[1], 10);
      minute = parseInt(match12[2] || '0', 10);
      const meridiem = match12[3]?.toUpperCase();
      
      if (meridiem?.startsWith('P') && hour < 12) hour += 12;
      if (meridiem?.startsWith('A') && hour === 12) hour = 0;
    }
    
    // Add hours
    const hoursNum = parseInt(hours, 10);
    if (isNaN(hoursNum)) return undefined;
    
    let dropHour = hour + hoursNum;
    const dropMinute = minute;
    
    // Handle day overflow
    while (dropHour >= 24) dropHour -= 24;
    
    // Format to 12-hour
    const dropMeridiem = dropHour >= 12 ? 'PM' : 'AM';
    let displayHour = dropHour > 12 ? dropHour - 12 : dropHour;
    if (displayHour === 0) displayHour = 12;
    
    return `${displayHour}:${dropMinute.toString().padStart(2, '0')} ${dropMeridiem}`;
  } catch {
    return undefined;
  }
}

function buildZohoLeadData(data: SaveCallRequest["data"], fieldsToUpdate?: string[]) {
  // Put the full name in Last_Name field
  const fullName = (data.callerName || "").trim() || "Unknown";

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
    // Put full name in Last_Name only
    Last_Name: fullName,
    Email: data.email || undefined,
    Phone: cleanPhone || undefined,
    City: data.cityOrZip || undefined,
    
    // Custom fields with correct API names
    Pick_Up_Address: data.pickupAddress || undefined,
    Drop_Off_Address: data.dropoffAddress || undefined,
    Party_Sizes: data.passengers || undefined,
    Amount_Of_Hours: hoursNum || undefined,
    Event_Types: data.eventType || undefined,
    Vehicle_Requested: data.vehicleType || undefined,
    Date_Of_Events: data.date || undefined,
    Day_of_Week: day || undefined,
    Pick_Up_Time: formatTo12Hour(data.pickupTime) || undefined,
    Drop_Off_Time: dropOffTime || undefined,
    Where_Are_They_Going: data.tripNotes || undefined,
    Vehicles_Quoted_and_Pricing: quotedVehiclesSummary || undefined,
    Trip_Cost: data.totalQuoted !== undefined ? String(data.totalQuoted) : undefined,
    Deposit: data.deposit !== undefined ? String(data.deposit) : undefined,
    Balance_Due: data.balance !== undefined ? String(data.balance) : undefined,
    Lead_Source: data.leadSource || undefined,
    Status: mapLeadStatus(data.leadStatus),
    Agent: data.agent ? [data.agent] : undefined,
    Tip_Included: data.tipIncluded ? "Yes" : undefined,
    Balance_Paid_Via: data.paidByCard ? "Card" : (data.paidByCash ? "Cash" : undefined),
  };

  if (fieldsToUpdate && fieldsToUpdate.length > 0) {
    const fieldMapping: Record<string, string> = {
      callerName: "Last_Name",
      phone: "Phone",
      email: "Email",
      cityOrZip: "City",
      pickupAddress: "Pick_Up_Address",
      dropoffAddress: "Drop_Off_Address",
      passengers: "Party_Sizes",
      hours: "Amount_Of_Hours",
      eventType: "Event_Types",
      vehicleType: "Vehicle_Requested",
      date: "Date_Of_Events",
      day: "Day_of_Week",
      pickupTime: "Pick_Up_Time",
      tripNotes: "Where_Are_They_Going",
      quotedVehicles: "Vehicles_Quoted_and_Pricing",
      totalQuoted: "Trip_Cost",
      deposit: "Deposit",
      balance: "Balance_Due",
      leadSource: "Lead_Source",
      leadStatus: "Status",
      agent: "Agent",
    };

    const filteredFields: Record<string, unknown> = {};
    for (const field of fieldsToUpdate) {
      const zohoField = fieldMapping[field];
      if (zohoField && allFields[zohoField] !== undefined) {
        filteredFields[zohoField] = allFields[zohoField];
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
      console.log("Zoho create result:", JSON.stringify(result, null, 2));
      
      // Check for Zoho API errors in the response body
      const firstResult = result.data?.[0];
      
      // Handle duplicate data - automatically update the existing lead
      if (firstResult?.code === "DUPLICATE_DATA") {
        const duplicateId = firstResult.details?.id;
        console.log("Duplicate detected, attempting to update existing lead:", duplicateId);
        
        if (duplicateId) {
          // Update the existing lead instead
          const updateResponse = await fetch(
            `https://www.zohoapis.com/crm/v2/Leads/${duplicateId}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ data: [filteredLeadData] }),
            }
          );
          
          if (updateResponse.ok) {
            const updateResult = await updateResponse.json();
            return NextResponse.json({
              success: true,
              mode: "updated",
              leadId: duplicateId,
              leadUrl: `https://crm.zoho.com/crm/tab/Leads/${duplicateId}`,
              result: updateResult.data?.[0],
              note: "Updated existing lead (duplicate phone detected)",
            });
          }
        }
        
        // If auto-update failed, return a friendly error
        return NextResponse.json({
          success: false,
          error: "A lead with this phone number already exists. Please search for the existing lead to update it.",
          duplicateId: duplicateId,
        }, { status: 400 });
      }
      
      if (firstResult?.code === "INVALID_DATA" || firstResult?.status === "error") {
        const errorDetails = firstResult.details || {};
        const errorMessage = `Zoho error: ${firstResult.message} - Field: ${errorDetails.api_name || 'unknown'}, Expected: ${errorDetails.expected_data_type || 'unknown'}`;
        console.error("Zoho validation error:", errorMessage);
        return NextResponse.json({
          success: false,
          error: errorMessage,
          details: firstResult,
        }, { status: 400 });
      }
      
      const newLeadId = firstResult?.details?.id;

      return NextResponse.json({
        success: true,
        mode: "created",
        leadId: newLeadId,
        leadUrl: newLeadId ? `https://crm.zoho.com/crm/tab/Leads/${newLeadId}` : null,
        result: firstResult,
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

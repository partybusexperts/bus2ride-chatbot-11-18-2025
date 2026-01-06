import { NextRequest, NextResponse } from "next/server";
import { getZohoAccessToken } from "../auth/route";

interface ZohoLead {
  id: string;
  Full_Name?: string;
  First_Name?: string;
  Last_Name?: string;
  Email?: string;
  Phone?: string;
  Mobile?: string;
  City?: string;
  State?: string;
  Zip_Code?: string;
  Street?: string;
  Description?: string;
  Status?: string;
  Vehicle_Size?: number;
  Amount_Of_Hours?: number;
  Event_Types?: string;
  Date_Of_Events?: string;
  Day_of_Week?: string;
  Drop_Off_Address?: string;
  Where_Are_They_Going?: string;
  Vehicles_Quoted_and_Pricing?: string;
  Agent?: string;
  Deposit?: number;
  Balance_Due?: string;
  Trip_Cost?: number;
  [key: string]: unknown;
}

async function searchLeads(accessToken: string, criteria: string): Promise<ZohoLead[]> {
  const url = `https://www.zohoapis.com/crm/v2/Leads/search?criteria=${encodeURIComponent(criteria)}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (response.status === 204) {
    return [];
  }

  const data = await response.json();
  
  if (data.code === "INVALID_QUERY" || !response.ok) {
    console.error("Zoho search failed:", JSON.stringify(data));
    return [];
  }

  return data.data || [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, email } = body;

    if (!phone && !email) {
      return NextResponse.json(
        { error: "Phone or email required" },
        { status: 400 }
      );
    }

    const accessToken = await getZohoAccessToken();

    let leads: ZohoLead[] = [];

    if (phone) {
      const cleanPhone = phone.replace(/\D/g, "");
      const last10 = cleanPhone.slice(-10);
      
      console.log(`[find-lead] Searching for phone: ${phone}, cleaned: ${last10}`);
      
      if (last10.length === 10) {
        // Try exact 10-digit match
        try {
          const phoneResults = await searchLeads(accessToken, `(Phone:equals:${last10})`);
          console.log(`[find-lead] Exact phone search found: ${phoneResults.length} leads`);
          leads = [...leads, ...phoneResults];
        } catch (e) {
          console.log("Phone search failed");
        }
        
        // Try Mobile field
        if (leads.length === 0) {
          try {
            const mobileResults = await searchLeads(accessToken, `(Mobile:equals:${last10})`);
            console.log(`[find-lead] Mobile search found: ${mobileResults.length} leads`);
            leads = [...leads, ...mobileResults];
          } catch (e) {
            console.log("Mobile search failed");
          }
        }

        // Try formatted xxx-xxx-xxxx
        if (leads.length === 0) {
          const formatted = `${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`;
          try {
            const phoneResults = await searchLeads(accessToken, `(Phone:equals:${formatted})`);
            console.log(`[find-lead] Formatted phone search found: ${phoneResults.length} leads`);
            leads = [...leads, ...phoneResults];
          } catch (e) {
            console.log("Formatted phone search failed");
          }
        }
      }
    }

    if (email && leads.length === 0) {
      console.log(`[find-lead] Searching for email: ${email}`);
      try {
        const emailResults = await searchLeads(accessToken, `(Email:equals:${email})`);
        console.log(`[find-lead] Email search found: ${emailResults.length} leads`);
        leads = [...leads, ...emailResults];
      } catch (e) {
        console.log("Email search failed");
      }
    }

    // Filter to only include leads that actually match phone or email
    const cleanPhoneForFilter = phone ? phone.replace(/\D/g, "").slice(-10) : "";
    const cleanEmailForFilter = email ? email.trim().toLowerCase() : "";
    
    console.log(`[find-lead] Verification criteria - phone: "${cleanPhoneForFilter}", email: "${cleanEmailForFilter}"`);
    
    const verifiedLeads = leads.filter((lead) => {
      const leadPhone = (lead.Phone || "").replace(/\D/g, "").slice(-10);
      const leadMobile = (lead.Mobile || "").replace(/\D/g, "").slice(-10);
      const leadEmail = (lead.Email || "").trim().toLowerCase();
      
      // Phone must match exactly (both must have 10 digits)
      const phoneMatch = cleanPhoneForFilter.length === 10 && (
        (leadPhone.length === 10 && leadPhone === cleanPhoneForFilter) || 
        (leadMobile.length === 10 && leadMobile === cleanPhoneForFilter)
      );
      
      // Email must match exactly (both must be non-empty)
      const emailMatch = cleanEmailForFilter.length > 0 && 
        leadEmail.length > 0 && 
        leadEmail === cleanEmailForFilter;
      
      console.log(`[find-lead] Verifying lead ${lead.id} (${lead.Last_Name}): leadPhone="${leadPhone}", leadMobile="${leadMobile}", leadEmail="${leadEmail}", phoneMatch=${phoneMatch}, emailMatch=${emailMatch}`);
      
      return phoneMatch || emailMatch;
    });
    
    console.log(`[find-lead] After verification: ${verifiedLeads.length} of ${leads.length} leads confirmed`);

    const uniqueLeads = verifiedLeads.reduce((acc: ZohoLead[], lead) => {
      if (!acc.find((l) => l.id === lead.id)) {
        acc.push(lead);
      }
      return acc;
    }, []);

    return NextResponse.json({
      found: uniqueLeads.length > 0,
      leads: uniqueLeads,
      count: uniqueLeads.length,
    });
  } catch (error) {
    console.error("Zoho find-lead error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search leads" },
      { status: 500 }
    );
  }
}

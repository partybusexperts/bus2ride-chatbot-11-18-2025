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
      
      if (last10.length === 10) {
        try {
          const phoneResults = await searchLeads(accessToken, `(Phone:equals:${last10})`);
          leads = [...leads, ...phoneResults];
        } catch (e) {
          console.log("Phone search failed");
        }
        
        if (leads.length === 0) {
          try {
            const mobileResults = await searchLeads(accessToken, `(Mobile:equals:${last10})`);
            leads = [...leads, ...mobileResults];
          } catch (e) {
            console.log("Mobile search failed");
          }
        }

        if (leads.length === 0) {
          const formatted = `${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`;
          try {
            const phoneResults = await searchLeads(accessToken, `(Phone:equals:${formatted})`);
            leads = [...leads, ...phoneResults];
          } catch (e) {
            console.log("Formatted phone search failed");
          }
        }

        if (leads.length === 0) {
          try {
            const phoneResults = await searchLeads(accessToken, `(Phone:contains:${last10.slice(-7)})`);
            leads = [...leads, ...phoneResults];
          } catch (e) {
            console.log("Partial phone search failed");
          }
        }
      }
    }

    if (email && leads.length === 0) {
      try {
        const emailResults = await searchLeads(accessToken, `(Email:equals:${email})`);
        leads = [...leads, ...emailResults];
      } catch (e) {
        console.log("Email search failed");
      }
    }

    const uniqueLeads = leads.reduce((acc: ZohoLead[], lead) => {
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

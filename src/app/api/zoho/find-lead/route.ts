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
  Lead_Status?: string;
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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Zoho search failed:", errorText);
    throw new Error(`Zoho search failed: ${response.status}`);
  }

  const data = await response.json();
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
      const phonePatterns = [
        cleanPhone,
        cleanPhone.slice(-10),
        `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`,
        `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`,
      ];

      for (const pattern of phonePatterns) {
        if (leads.length === 0) {
          try {
            const phoneResults = await searchLeads(accessToken, `(Phone:equals:${pattern})`);
            leads = [...leads, ...phoneResults];
          } catch (e) {
            console.log("Phone search pattern failed:", pattern);
          }
        }
        if (leads.length === 0) {
          try {
            const mobileResults = await searchLeads(accessToken, `(Mobile:equals:${pattern})`);
            leads = [...leads, ...mobileResults];
          } catch (e) {
            console.log("Mobile search pattern failed:", pattern);
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

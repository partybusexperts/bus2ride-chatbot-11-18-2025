import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokens } from "@/lib/ringcentral-tokens";
import { setSubscriptionInfo, getSubscriptionInfo, clearSubscription } from "@/lib/ringcentral-calls-store";

function getWebhookUrl(): string {
  const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
  if (replitDomain) {
    return `https://${replitDomain}/api/ringcentral/webhook`;
  }
  return 'https://newchatbot.replit.app/api/ringcentral/webhook';
}

export async function POST(request: NextRequest) {
  try {
    const tokens = getStoredTokens();
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: "Not connected to RingCentral. Please connect first.",
        needsAuth: true,
      });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: "RingCentral session expired. Please reconnect.",
        needsAuth: true,
      });
    }

    const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
    const webhookUrl = getWebhookUrl();

    const subscriptionBody = {
      eventFilters: [
        "/restapi/v1.0/account/~/extension/~/telephony/sessions"
      ],
      deliveryMode: {
        transportType: "WebHook",
        address: webhookUrl
      },
      expiresIn: 604800
    };

    console.log("Creating RingCentral subscription with webhook:", webhookUrl);

    const response = await fetch(`${baseUrl}/restapi/v1.0/subscription`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(subscriptionBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Subscription creation failed:", response.status, errorText);
      
      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: "RingCentral session expired. Please reconnect.",
          needsAuth: true,
        });
      }
      
      return NextResponse.json({
        success: false,
        error: `Failed to create subscription: ${response.status}`,
      }, { status: 500 });
    }

    const data = await response.json();
    
    setSubscriptionInfo(data.id, data.expiresIn || 604800);
    
    console.log("RingCentral subscription created:", data.id);

    return NextResponse.json({
      success: true,
      subscriptionId: data.id,
      expiresIn: data.expiresIn,
      webhookUrl: webhookUrl,
    });

  } catch (error) {
    console.error("Subscription error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const subscriptionInfo = getSubscriptionInfo();
  return NextResponse.json({
    ...subscriptionInfo,
    success: true,
  });
}

export async function DELETE(request: NextRequest) {
  try {
    const subscriptionInfo = getSubscriptionInfo();
    
    if (!subscriptionInfo.id) {
      return NextResponse.json({
        success: true,
        message: "No active subscription to delete",
      });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      clearSubscription();
      return NextResponse.json({
        success: true,
        message: "Subscription cleared locally (no valid token)",
      });
    }

    const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

    const response = await fetch(`${baseUrl}/restapi/v1.0/subscription/${subscriptionInfo.id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    clearSubscription();

    if (!response.ok && response.status !== 404) {
      console.error("Failed to delete subscription:", response.status);
    }

    return NextResponse.json({
      success: true,
      message: "Subscription deleted",
    });

  } catch (error) {
    console.error("Delete subscription error:", error);
    clearSubscription();
    return NextResponse.json({
      success: true,
      message: "Subscription cleared locally",
    });
  }
}

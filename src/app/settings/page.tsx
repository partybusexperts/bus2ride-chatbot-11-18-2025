"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const checkCredentials = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/zoho/test-auth");
      const data = await res.json();
      setStatus(data);
      if (data.success) {
        setTestResult("Connection successful!");
      } else {
        setTestResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setTestResult(`Failed to test: ${err}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: "30px" }}>Zoho CRM Settings</h1>
      
      <div style={{ background: "#f5f5f5", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2 style={{ marginTop: 0 }}>Current Configuration</h2>
        <p style={{ color: "#666" }}>
          These credentials are stored in Replit Secrets. To update them, go to the Secrets tab in the Tools panel.
        </p>
        
        <div style={{ marginTop: "20px" }}>
          <button 
            onClick={checkCredentials}
            disabled={loading}
            style={{
              background: "#3b82f6",
              color: "white",
              padding: "12px 24px",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? "Testing..." : "Test Zoho Connection"}
          </button>
        </div>

        {status && (
          <div style={{ marginTop: "20px", padding: "15px", background: "white", borderRadius: "6px" }}>
            <h3 style={{ marginTop: 0 }}>Credential Details:</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee", fontWeight: "bold" }}>Client ID</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {status.credentials?.clientIdPrefix}... ({status.credentials?.clientIdLength} chars)
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {status.credentials?.clientIdLength === 35 ? "✅ Correct length" : "⚠️ Wrong length (should be 35)"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee", fontWeight: "bold" }}>Client Secret</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {status.credentials?.clientSecretPrefix}... ({status.credentials?.clientSecretLength} chars)
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {status.credentials?.clientSecretPrefix?.startsWith("sb_") 
                      ? "❌ WRONG - This is from Zoho Sites/Publishing, not API Console!" 
                      : "✅ Looks correct"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "8px", fontWeight: "bold" }}>Refresh Token</td>
                  <td style={{ padding: "8px" }}>
                    {status.credentials?.refreshTokenPrefix}... ({status.credentials?.refreshTokenLength} chars)
                  </td>
                  <td style={{ padding: "8px" }}>
                    {status.credentials?.refreshTokenLength >= 60 ? "✅ Has token" : "⚠️ Missing or short"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {testResult && (
          <div style={{ 
            marginTop: "20px", 
            padding: "15px", 
            background: testResult.includes("successful") ? "#d4edda" : "#f8d7da",
            color: testResult.includes("successful") ? "#155724" : "#721c24",
            borderRadius: "6px"
          }}>
            {testResult}
          </div>
        )}
      </div>

      <div style={{ background: "#fff3cd", padding: "20px", borderRadius: "8px", border: "1px solid #ffc107" }}>
        <h3 style={{ marginTop: 0, color: "#856404" }}>⚠️ How to Get the Correct Credentials</h3>
        <ol style={{ color: "#856404", lineHeight: "1.8" }}>
          <li>Go to <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer">https://api-console.zoho.com/</a></li>
          <li>Click <strong>Add Client</strong> → Choose <strong>Self Client</strong></li>
          <li>Copy the <strong>Client ID</strong> (starts with 1000.)</li>
          <li>Copy the <strong>Client Secret</strong> (should be a random string, NOT starting with "sb_")</li>
          <li>Click <strong>Generate Code</strong> tab, enter scope: <code>ZohoCRM.modules.ALL,ZohoCRM.settings.ALL</code></li>
          <li>Click Generate → Copy the code</li>
          <li>Use this curl command to get refresh token:
            <pre style={{ background: "#fff", padding: "10px", borderRadius: "4px", overflow: "auto", fontSize: "12px" }}>
{`curl -X POST "https://accounts.zoho.com/oauth/v2/token" \\
  -d "grant_type=authorization_code" \\
  -d "client_id=YOUR_CLIENT_ID" \\
  -d "client_secret=YOUR_CLIENT_SECRET" \\
  -d "code=YOUR_GENERATED_CODE"`}
            </pre>
          </li>
          <li>The response will have a <strong>refresh_token</strong> - save that!</li>
        </ol>
      </div>

      <div style={{ marginTop: "20px" }}>
        <a href="/" style={{ color: "#3b82f6" }}>← Back to Call Pad</a>
      </div>
    </div>
  );
}

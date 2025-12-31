'use client';

import { useState, useEffect } from "react";

type QuotedVehicle = {
  id: string;
  name: string;
  capacity?: string;
  priceDisplay: string;
  hours?: number;
};

type LeadSummary = {
  id: string;
  name: string;
  status?: string;
};

const initialForm = {
  agentName: "",
  callerName: "",
  phone: "",
  email: "",
  cityOrZip: "",
  passengers: "",
  hours: "",
  eventType: "",
  date: "",
  pickupTime: "",
  notes: "",
};

export default function CallPad() {
  const [form, setForm] = useState(initialForm);
  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [leadMessage, setLeadMessage] = useState<string>("");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [quotedVehicles, setQuotedVehicles] = useState<QuotedVehicle[]>([]);
  const [loadingLead, setLoadingLead] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (!phone && !email) {
      setLead(null);
      setLeadMessage("");
      return;
    }

    const timeout = setTimeout(async () => {
      setLoadingLead(true);
      setLeadMessage("Checking Zoho for existing customer...");

      try {
        const res = await fetch("/api/zoho/find-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, email }),
        });

        if (!res.ok) throw new Error("Zoho lookup failed");
        const data = await res.json();

        if (data.lead) {
          setLead(data.lead);
          setLeadMessage(
            `Existing customer: ${data.lead.name}${
              data.lead.status ? " (" + data.lead.status + ")" : ""
            }`
          );
          if (!form.callerName) {
            setForm((prev) => ({ ...prev, callerName: data.lead.name }));
          }
        } else {
          setLead(null);
          setLeadMessage("New caller (no matching lead in Zoho).");
        }
      } catch (err) {
        console.error(err);
        setLead(null);
        setLeadMessage("Error checking Zoho");
      } finally {
        setLoadingLead(false);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [form.phone, form.email]);

  async function handleGetVehicles() {
    setLoadingVehicles(true);
    setMessage("");

    try {
      const res = await fetch("/api/get-vehicles-for-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityOrZip: form.cityOrZip,
          passengers: Number(form.passengers) || null,
          hours: Number(form.hours) || null,
        }),
      });

      const data = await res.json();
      setVehicles(data.vehicles || []);
      setMessage(data.message || "");
      setQuotedVehicles([]);
    } catch (err) {
      console.error(err);
      setMessage("Error getting vehicles");
    } finally {
      setLoadingVehicles(false);
    }
  }

  function toggleQuoted(vehicle: any) {
    setQuotedVehicles((prev) => {
      const exists = prev.find((v) => v.id === vehicle.id);
      if (exists) {
        return prev.filter((v) => v.id !== vehicle.id);
      }
      const qv: QuotedVehicle = {
        id: vehicle.id,
        name: vehicle.name,
        capacity: vehicle.capacity,
        priceDisplay: vehicle.priceDisplay,
        hours: vehicle.hours,
      };
      return [...prev, qv];
    });
  }

  function isQuoted(id: string) {
    return quotedVehicles.some((v) => v.id === id);
  }

  async function handleSaveToZoho() {
    setSaving(true);
    setMessage("");

    const snapshot = {
      ...form,
      passengers: form.passengers ? Number(form.passengers) : null,
      hours: form.hours ? Number(form.hours) : null,
      leadId: lead?.id || null,
      quotedVehicles,
    };

    try {
      const res = await fetch("/api/zoho/save-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      if (!res.ok) throw new Error("Zoho error");
      const data = await res.json();
      setMessage("Saved to Zoho");
      if (data.lead) {
        setLead(data.lead);
      }
    } catch (err) {
      console.error(err);
      setMessage("Error saving to Zoho");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '14px',
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#111827' }}>Call Pad</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            style={inputStyle}
            placeholder="Agent Name"
            value={form.agentName}
            onChange={(e) => updateField("agentName", e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Caller Name"
            value={form.callerName}
            onChange={(e) => updateField("callerName", e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
          />
          {loadingLead ? (
            <div style={{ fontSize: '14px', color: '#6b7280' }}>Checking Zoho...</div>
          ) : (
            leadMessage && (
              <div style={{ fontSize: '14px', color: '#374151', padding: '8px', background: '#f3f4f6', borderRadius: '4px' }}>{leadMessage}</div>
            )
          )}

          <input
            style={inputStyle}
            placeholder="City / ZIP / Area"
            value={form.cityOrZip}
            onChange={(e) => updateField("cityOrZip", e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <input
              style={inputStyle}
              placeholder="# Passengers"
              value={form.passengers}
              onChange={(e) => updateField("passengers", e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="Hours"
              value={form.hours}
              onChange={(e) => updateField("hours", e.target.value)}
            />
          </div>
          <input
            style={inputStyle}
            placeholder="Event Type (Prom, Wedding, etc.)"
            value={form.eventType}
            onChange={(e) => updateField("eventType", e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <input
              style={inputStyle}
              placeholder="Date (YYYY-MM-DD)"
              value={form.date}
              onChange={(e) => updateField("date", e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="Pickup Time"
              value={form.pickupTime}
              onChange={(e) => updateField("pickupTime", e.target.value)}
            />
          </div>

          <textarea
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            placeholder="Notes (anything unusual: multiple stops, drinks, etc.)"
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <button
            style={{ ...buttonStyle, background: '#3b82f6', color: '#fff' }}
            onClick={handleGetVehicles}
            disabled={loadingVehicles}
          >
            {loadingVehicles ? "Loading vehicles..." : "Get Vehicles"}
          </button>
          <button
            style={{ ...buttonStyle, background: '#10b981', color: '#fff' }}
            onClick={handleSaveToZoho}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save to Zoho"}
          </button>
        </div>

        {message && <div style={{ marginTop: '12px', fontSize: '14px', padding: '8px', background: message.includes('Error') ? '#fef2f2' : '#f0fdf4', color: message.includes('Error') ? '#dc2626' : '#16a34a', borderRadius: '4px' }}>{message}</div>}
      </div>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#111827' }}>Vehicles & Quotes</h2>

        {vehicles.length === 0 && (
          <div style={{ fontSize: '14px', color: '#6b7280', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
            No vehicles yet. Enter city/zip, passengers, hours, then click
            "Get Vehicles".
          </div>
        )}

        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {vehicles.map((v) => (
            <li
              key={v.id}
              style={{ border: '1px solid #e5e7eb', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ fontWeight: 600, color: '#111827' }}>{v.name}</div>
                {v.capacity && (
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>{v.capacity}</div>
                )}
                <div style={{ fontSize: '14px', color: '#374151' }}>{v.priceDisplay}</div>
              </div>
              <button
                onClick={() => toggleQuoted(v)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  background: isQuoted(v.id) ? '#16a34a' : '#e5e7eb',
                  color: isQuoted(v.id) ? '#fff' : '#374151',
                }}
              >
                {isQuoted(v.id) ? "Quoted" : "Mark as Quoted"}
              </button>
            </li>
          ))}
        </ul>

        <h3 style={{ fontWeight: 600, marginBottom: '8px', color: '#111827' }}>Quoted this call:</h3>
        {quotedVehicles.length === 0 ? (
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            Click "Mark as Quoted" next to each vehicle you tell them a price
            for.
          </div>
        ) : (
          <ul style={{ fontSize: '14px', paddingLeft: '20px', color: '#374151' }}>
            {quotedVehicles.map((v) => (
              <li key={v.id} style={{ marginBottom: '4px' }}>
                {v.name} – {v.priceDisplay}
                {v.capacity ? ` (${v.capacity})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

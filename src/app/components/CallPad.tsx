'use client';

import { useState, useEffect, useMemo } from "react";

type QuotedVehicle = {
  id: string;
  name: string;
  capacity?: string;
  priceDisplay: string;
  price: number;
  hours?: number;
};

type LeadSummary = {
  id: string;
  name: string;
  status?: string;
};

type LeadStatus = 'new' | 'not_quoted' | 'quoted' | 'booked' | 'closed' | 'cancelled';

const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'not_quoted', label: 'Not Quoted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

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
  dropoffTime: "",
  pickupAddress: "",
  dropoffAddress: "",
  destination: "",
  websiteUrl: "",
  tripNotes: "",
  leadSource: "",
  tipIncluded: false,
  paidByCard: false,
  paidByCash: false,
};

type FormState = typeof initialForm;

function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } catch {
    return "";
  }
}

function calculateDropoffTime(pickupTime: string, hours: number): string {
  if (!pickupTime || !hours) return "";
  try {
    const [h, m] = pickupTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return "";
    const totalMinutes = h * 60 + m + hours * 60;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  } catch {
    return "";
  }
}

function calculateDaysUntilEvent(dateStr: string): number {
  if (!dateStr) return Infinity;
  try {
    const eventDate = new Date(dateStr + "T12:00:00");
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diff = eventDate.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return Infinity;
  }
}

interface CallPadProps {
  onVehicleSearch?: (cityOrZip: string, passengers: number | null, hours: number | null) => void;
  availableVehicles?: any[];
  loadingVehicles?: boolean;
}

export default function CallPad({ onVehicleSearch, availableVehicles = [], loadingVehicles = false }: CallPadProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [leadMessage, setLeadMessage] = useState<string>("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [quotedVehicles, setQuotedVehicles] = useState<QuotedVehicle[]>([]);
  const [loadingLead, setLoadingLead] = useState(false);
  const [internalLoadingVehicles, setInternalLoadingVehicles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isLoadingVehicles = loadingVehicles || internalLoadingVehicles;

  useEffect(() => {
    setVehicles(availableVehicles || []);
    setQuotedVehicles([]);
    setMessage(availableVehicles && availableVehicles.length > 0 
      ? `Found ${availableVehicles.length} vehicle(s)` 
      : "");
  }, [availableVehicles]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const dayOfWeek = useMemo(() => getDayOfWeek(form.date), [form.date]);
  
  const calculatedDropoffTime = useMemo(() => {
    const hours = Number(form.hours) || 0;
    return calculateDropoffTime(form.pickupTime, hours);
  }, [form.pickupTime, form.hours]);

  const daysUntilEvent = useMemo(() => calculateDaysUntilEvent(form.date), [form.date]);

  const totalQuotedPrice = useMemo(() => {
    return quotedVehicles.reduce((sum, v) => sum + (v.price || 0), 0);
  }, [quotedVehicles]);

  const depositAmount = useMemo(() => {
    if (totalQuotedPrice === 0) return 0;
    return daysUntilEvent <= 7 ? totalQuotedPrice : Math.round(totalQuotedPrice * 0.5);
  }, [totalQuotedPrice, daysUntilEvent]);

  const depositPercentage = useMemo(() => {
    return daysUntilEvent <= 7 ? 100 : 50;
  }, [daysUntilEvent]);

  const balanceDue = useMemo(() => {
    return totalQuotedPrice - depositAmount;
  }, [totalQuotedPrice, depositAmount]);

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
    setQuotedVehicles([]);
    
    if (onVehicleSearch) {
      onVehicleSearch(
        form.cityOrZip,
        Number(form.passengers) || null,
        Number(form.hours) || null
      );
      return;
    }

    setInternalLoadingVehicles(true);
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
      setInternalLoadingVehicles(false);
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
        price: vehicle.price || 0,
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

    const finalLeadStatus: LeadStatus = quotedVehicles.length > 0 ? 'quoted' : leadStatus;

    const snapshot = {
      ...form,
      passengers: form.passengers ? Number(form.passengers) : null,
      hours: form.hours ? Number(form.hours) : null,
      leadId: lead?.id || null,
      leadStatus: finalLeadStatus,
      dayOfWeek,
      calculatedDropoffTime,
      quotedVehicles,
      totalQuotedPrice,
      depositAmount,
      depositPercentage,
      balanceDue,
      daysUntilEvent: daysUntilEvent === Infinity ? null : daysUntilEvent,
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
      setLeadStatus(finalLeadStatus);
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
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: '4px',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    padding: '16px',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    marginBottom: '16px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    cursor: 'pointer',
  };

  return (
    <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '12px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#111827' }}>
        Agent Call Pad
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <div>
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>Caller Details</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Agent Name</label>
                  <input style={inputStyle} placeholder="Your name" value={form.agentName} onChange={(e) => updateField("agentName", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Caller Name</label>
                  <input style={inputStyle} placeholder="Customer name" value={form.callerName} onChange={(e) => updateField("callerName", e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} placeholder="Phone number" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} placeholder="Email address" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
                </div>
              </div>
              {loadingLead ? (
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Checking Zoho...</div>
              ) : (
                leadMessage && (
                  <div style={{ fontSize: '12px', color: '#374151', padding: '6px 10px', background: '#e5e7eb', borderRadius: '4px' }}>{leadMessage}</div>
                )
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Website URL (came from)</label>
                  <input style={inputStyle} placeholder="e.g. partybusquotes.com" value={form.websiteUrl} onChange={(e) => updateField("websiteUrl", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Lead Source</label>
                  <input style={inputStyle} placeholder="e.g. Google, Referral" value={form.leadSource} onChange={(e) => updateField("leadSource", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>Trip & Schedule</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>City / ZIP / Area</label>
                  <input style={inputStyle} placeholder="Service area" value={form.cityOrZip} onChange={(e) => updateField("cityOrZip", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Event Type</label>
                  <input style={inputStyle} placeholder="Prom, Wedding, etc." value={form.eventType} onChange={(e) => updateField("eventType", e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}># Passengers</label>
                  <input style={inputStyle} type="number" placeholder="How many?" value={form.passengers} onChange={(e) => updateField("passengers", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Hours Needed</label>
                  <input style={inputStyle} type="number" placeholder="Duration" value={form.hours} onChange={(e) => updateField("hours", e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Event Date</label>
                  <input style={inputStyle} type="date" value={form.date} onChange={(e) => updateField("date", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Day of Week</label>
                  <input style={{ ...inputStyle, background: '#f9fafb' }} value={dayOfWeek} readOnly placeholder="Auto-calculated" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Pickup Time</label>
                  <input style={inputStyle} type="time" value={form.pickupTime} onChange={(e) => updateField("pickupTime", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Drop-off Time (calculated)</label>
                  <input style={{ ...inputStyle, background: '#f9fafb' }} value={calculatedDropoffTime} readOnly placeholder="Based on hours" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Pickup Address</label>
                <input style={inputStyle} placeholder="Full pickup address" value={form.pickupAddress} onChange={(e) => updateField("pickupAddress", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Destination / Where Going</label>
                <input style={inputStyle} placeholder="Event venue, location" value={form.destination} onChange={(e) => updateField("destination", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Drop-off Address</label>
                <input style={inputStyle} placeholder="Final drop-off address" value={form.dropoffAddress} onChange={(e) => updateField("dropoffAddress", e.target.value)} />
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>Trip Notes</h3>
            <textarea
              style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
              placeholder="Red carpet treatment, multiple stops, drinks needed, etc."
              value={form.tripNotes}
              onChange={(e) => updateField("tripNotes", e.target.value)}
            />
          </div>
        </div>

        <div>
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>Vehicles & Quotes</h3>
            
            <button
              style={{ ...buttonStyle, background: '#3b82f6', color: '#fff', marginBottom: '12px', width: '100%' }}
              onClick={handleGetVehicles}
              disabled={isLoadingVehicles}
            >
              {isLoadingVehicles ? "Loading vehicles..." : "Get Vehicles"}
            </button>

            {vehicles.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#6b7280', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
                Enter city/zip, passengers, hours, then click "Get Vehicles".
              </div>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {vehicles.map((v) => (
                  <li
                    key={v.id}
                    style={{ border: '1px solid #e5e7eb', padding: '10px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isQuoted(v.id) ? '#f0fdf4' : '#fff' }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827', fontSize: '13px' }}>{v.name}</div>
                      {v.capacity && <div style={{ fontSize: '12px', color: '#6b7280' }}>{v.capacity}</div>}
                      <div style={{ fontSize: '12px', color: '#374151' }}>{v.priceDisplay}</div>
                    </div>
                    <button
                      onClick={() => toggleQuoted(v)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: isQuoted(v.id) ? '#16a34a' : '#e5e7eb',
                        color: isQuoted(v.id) ? '#fff' : '#374151',
                      }}
                    >
                      {isQuoted(v.id) ? "Quoted" : "Quote"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {quotedVehicles.length > 0 && (
              <div style={{ marginTop: '12px', padding: '10px', background: '#ecfdf5', borderRadius: '6px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#065f46' }}>Quoted this call:</h4>
                <ul style={{ fontSize: '12px', paddingLeft: '16px', color: '#047857' }}>
                  {quotedVehicles.map((v) => (
                    <li key={v.id}>{v.name} – {v.priceDisplay}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>Pricing & Payment</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Total Quoted</label>
                  <input style={{ ...inputStyle, background: '#f9fafb', fontWeight: 600 }} value={totalQuotedPrice > 0 ? `$${totalQuotedPrice.toLocaleString()}` : '$0'} readOnly />
                </div>
                <div>
                  <label style={labelStyle}>Deposit ({depositPercentage}%){daysUntilEvent <= 7 && daysUntilEvent !== Infinity ? ' - within 7 days' : ''}</label>
                  <input style={{ ...inputStyle, background: '#fef3c7', fontWeight: 600 }} value={depositAmount > 0 ? `$${depositAmount.toLocaleString()}` : '$0'} readOnly />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Balance Due</label>
                <input style={{ ...inputStyle, background: '#f9fafb' }} value={balanceDue > 0 ? `$${balanceDue.toLocaleString()}` : '$0'} readOnly />
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={checkboxLabelStyle}>
                  <input type="checkbox" checked={form.tipIncluded} onChange={(e) => updateField("tipIncluded", e.target.checked)} />
                  Tip Included
                </label>
                <label style={checkboxLabelStyle}>
                  <input type="checkbox" checked={form.paidByCard} onChange={(e) => updateField("paidByCard", e.target.checked)} />
                  Paid by Card
                </label>
                <label style={checkboxLabelStyle}>
                  <input type="checkbox" checked={form.paidByCash} onChange={(e) => updateField("paidByCash", e.target.checked)} />
                  Paid by Cash
                </label>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>Lead Status</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <select
                style={inputStyle}
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
              >
                {LEAD_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {quotedVehicles.length > 0 && leadStatus !== 'quoted' && (
                <div style={{ fontSize: '11px', color: '#d97706', background: '#fef3c7', padding: '6px 10px', borderRadius: '4px' }}>
                  Status will auto-change to "Quoted" on save since you have quoted vehicles.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{ ...buttonStyle, background: '#10b981', color: '#fff', flex: 1 }}
              onClick={handleSaveToZoho}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save to Zoho"}
            </button>
          </div>

          {message && (
            <div style={{ 
              marginTop: '12px', 
              fontSize: '13px', 
              padding: '10px', 
              background: message.includes('Error') ? '#fef2f2' : '#f0fdf4', 
              color: message.includes('Error') ? '#dc2626' : '#16a34a', 
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

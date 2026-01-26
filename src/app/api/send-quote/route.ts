import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_MAIL_USER,
    pass: process.env.ZOHO_MAIL_PASSWORD,
  },
});

type QuotedVehicle = {
  name: string;
  capacity: number;
  price: number;
  hours: number;
  image?: string;
};

type QuoteRequest = {
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  tripDate?: string;
  tripTime?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  eventType?: string;
  passengers?: number;
  vehicles: QuotedVehicle[];
  agentName?: string;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function generateEmailHtml(data: QuoteRequest): string {
  const totalPrice = data.vehicles.reduce((sum, v) => sum + v.price, 0);
  const deposit = Math.round(totalPrice * 0.25);

  const vehicleRows = data.vehicles.map(v => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
        <strong>${v.name}</strong><br>
        <span style="color: #666; font-size: 14px;">${v.capacity} passengers</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${v.hours} hrs</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: bold;">${formatCurrency(v.price)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">Your Vehicle Quote</h1>
      <p style="color: #a0a0a0; margin: 10px 0 0 0;">Limo Bus Reservations</p>
    </div>
    
    <div style="background: #fff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      ${data.customerName ? `<p style="font-size: 18px; margin-bottom: 20px;">Hi <strong>${data.customerName}</strong>,</p>` : ''}
      
      <p style="color: #333; line-height: 1.6;">Thank you for your interest! Below is your personalized quote for your upcoming trip.</p>
      
      ${(data.tripDate || data.eventType || data.pickupLocation) ? `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">Trip Details</h3>
        ${data.tripDate ? `<p style="margin: 5px 0; color: #555;"><strong>Date:</strong> ${data.tripDate}${data.tripTime ? ` at ${data.tripTime}` : ''}</p>` : ''}
        ${data.eventType ? `<p style="margin: 5px 0; color: #555;"><strong>Event:</strong> ${data.eventType}</p>` : ''}
        ${data.passengers ? `<p style="margin: 5px 0; color: #555;"><strong>Passengers:</strong> ${data.passengers}</p>` : ''}
        ${data.pickupLocation ? `<p style="margin: 5px 0; color: #555;"><strong>Pickup:</strong> ${data.pickupLocation}</p>` : ''}
        ${data.dropoffLocation ? `<p style="margin: 5px 0; color: #555;"><strong>Dropoff:</strong> ${data.dropoffLocation}</p>` : ''}
      </div>
      ` : ''}
      
      <h3 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">Quoted Vehicles</h3>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 12px; text-align: left; font-weight: 600;">Vehicle</th>
            <th style="padding: 12px; text-align: center; font-weight: 600;">Duration</th>
            <th style="padding: 12px; text-align: right; font-weight: 600;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${vehicleRows}
        </tbody>
        <tfoot>
          <tr style="background: #f8f9fa;">
            <td colspan="2" style="padding: 12px; font-weight: bold;">Total</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px; color: #007bff;">${formatCurrency(totalPrice)}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 12px; color: #666;">Deposit to Reserve (25%)</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #28a745;">${formatCurrency(deposit)}</td>
          </tr>
        </tfoot>
      </table>
      
      <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
        <p style="color: #fff; margin: 0 0 10px 0; font-size: 16px;">Ready to book?</p>
        <a href="tel:8666050218" style="display: inline-block; background: #fff; color: #28a745; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; font-size: 16px;">Call 866-605-0218</a>
      </div>
      
      <p style="color: #666; font-size: 14px; line-height: 1.6;">
        This quote is valid for 7 days. Prices may vary based on availability and date changes. 
        Gratuity for your driver is not included.
      </p>
      
      ${data.agentName ? `<p style="color: #333; margin-top: 20px;">Best regards,<br><strong>${data.agentName}</strong><br>Limo Bus Reservations</p>` : ''}
    </div>
    
    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
      <p>Limo Bus Reservations | 866-605-0218 | info@limobusreservations.com</p>
    </div>
  </div>
</body>
</html>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const data: QuoteRequest = await request.json();

    if (!data.customerEmail) {
      return NextResponse.json({ error: 'Customer email is required' }, { status: 400 });
    }

    if (!data.vehicles || data.vehicles.length === 0) {
      return NextResponse.json({ error: 'At least one vehicle is required' }, { status: 400 });
    }

    const totalPrice = data.vehicles.reduce((sum, v) => sum + v.price, 0);

    const mailOptions = {
      from: `"Limo Bus Reservations" <${process.env.ZOHO_MAIL_USER}>`,
      to: data.customerEmail,
      subject: `Your Vehicle Quote - ${formatCurrency(totalPrice)}`,
      html: generateEmailHtml(data),
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ 
      success: true, 
      message: `Quote sent to ${data.customerEmail}` 
    });

  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { error: 'Failed to send email', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
